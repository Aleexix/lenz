//! Servidor IPC: named pipe en Windows y socket Unix en macOS (ver `lenz_protocol::paths::endpoint`).
//! Lee frames de `lenz-protocol`, responde `Request`s y reenvía la salida de las sesiones suscritas.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use lenz_protocol::{
    frame, ClientMessage, Event, Request, Response, ServerMessage, SessionId, PROTOCOL_VERSION,
};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    sync::{
        broadcast::error::{RecvError, TryRecvError},
        mpsc, watch,
    },
    task::JoinHandle,
};

use crate::session::{CreateSpec, Session, SessionManager, SessionOutput};

/// Sin clientes ni sesiones durante este tiempo, el daemon se apaga solo.
const IDLE_SHUTDOWN: Duration = Duration::from_secs(10 * 60);
/// Tope de bytes por evento `Output` al agrupar salida.
const MAX_BATCH: usize = 256 * 1024;

pub struct Daemon {
    pub sessions: SessionManager,
    build_id: String,
    clients: AtomicUsize,
    idle_since: Mutex<Instant>,
    shutdown: watch::Sender<bool>,
}

impl Daemon {
    pub fn new(build_id: String) -> Arc<Self> {
        Arc::new(Self {
            sessions: SessionManager::default(),
            build_id,
            clients: AtomicUsize::new(0),
            idle_since: Mutex::new(Instant::now()),
            shutdown: watch::Sender::new(false),
        })
    }

    fn request_shutdown(&self) {
        self.shutdown.send_replace(true);
    }

    fn client_connected(&self) {
        self.clients.fetch_add(1, Ordering::SeqCst);
    }

    fn client_disconnected(&self) {
        if self.clients.fetch_sub(1, Ordering::SeqCst) == 1 {
            *self.idle_since.lock().unwrap() = Instant::now();
        }
    }
}

pub async fn serve(daemon: Arc<Daemon>) -> anyhow::Result<()> {
    tokio::spawn(idle_watchdog(daemon.clone()));
    platform::serve(daemon).await
}

async fn idle_watchdog(daemon: Arc<Daemon>) {
    let mut tick = tokio::time::interval(Duration::from_secs(30));
    loop {
        tick.tick().await;
        let idle = daemon.clients.load(Ordering::SeqCst) == 0
            && daemon.sessions.is_empty()
            && daemon.idle_since.lock().unwrap().elapsed() >= IDLE_SHUTDOWN;
        if idle {
            tracing::info!("sin clientes ni sesiones: apagando por inactividad");
            daemon.request_shutdown();
            return;
        }
    }
}

#[cfg(windows)]
mod platform {
    use std::sync::Arc;

    use anyhow::Context;
    use tokio::net::windows::named_pipe::ServerOptions;

    use super::{handle_client, Daemon};

    pub async fn serve(daemon: Arc<Daemon>) -> anyhow::Result<()> {
        let name = lenz_protocol::paths::endpoint();
        let mut server = ServerOptions::new()
            .first_pipe_instance(true)
            .create(&name)
            .with_context(|| format!("no se pudo crear {name} (¿ya hay un daemon corriendo?)"))?;
        let mut shutdown = daemon.shutdown.subscribe();
        tracing::info!(%name, "escuchando");

        loop {
            tokio::select! {
                res = server.connect() => {
                    res?;
                    let next = ServerOptions::new().create(&name)?;
                    let client = std::mem::replace(&mut server, next);
                    tokio::spawn(handle_client(daemon.clone(), client));
                }
                _ = shutdown.changed() => return Ok(()),
            }
        }
    }
}

#[cfg(unix)]
mod platform {
    use std::{os::unix::fs::PermissionsExt, path::PathBuf, sync::Arc};

    use tokio::net::{UnixListener, UnixStream};

    use super::{handle_client, Daemon};

    pub async fn serve(daemon: Arc<Daemon>) -> anyhow::Result<()> {
        let path = PathBuf::from(lenz_protocol::paths::endpoint());
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        if path.exists() {
            if UnixStream::connect(&path).await.is_ok() {
                anyhow::bail!("ya hay un daemon corriendo en {}", path.display());
            }
            std::fs::remove_file(&path)?;
        }
        let listener = UnixListener::bind(&path)?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
        let mut shutdown = daemon.shutdown.subscribe();
        tracing::info!(path = %path.display(), "escuchando");

        let result = loop {
            tokio::select! {
                res = listener.accept() => match res {
                    Ok((stream, _)) => { tokio::spawn(handle_client(daemon.clone(), stream)); }
                    Err(e) => break Err(e.into()),
                },
                _ = shutdown.changed() => break Ok(()),
            }
        };
        let _ = std::fs::remove_file(&path);
        result
    }
}

async fn handle_client<S>(daemon: Arc<Daemon>, stream: S)
where
    S: AsyncRead + AsyncWrite + Send + 'static,
{
    let (mut rd, mut wr) = tokio::io::split(stream);
    let (out_tx, mut out_rx) = mpsc::channel::<ServerMessage>(256);
    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if let Err(e) = frame::write_frame(&mut wr, &msg).await {
                tracing::debug!(error = %e, "no se pudo escribir al cliente");
                break;
            }
        }
    });

    daemon.client_connected();
    tracing::debug!("cliente conectado");
    let mut subs: HashMap<SessionId, JoinHandle<()>> = HashMap::new();

    loop {
        let msg: ClientMessage = match frame::read_frame(&mut rd).await {
            Ok(Some(msg)) => msg,
            Ok(None) => break,
            Err(e) => {
                tracing::warn!(error = %e, "frame inválido; cerrando conexión");
                break;
            }
        };
        let is_shutdown = matches!(msg.request, Request::Shutdown);
        let response = handle_request(&daemon, msg.request, &out_tx, &mut subs);
        if out_tx
            .send(ServerMessage::Response {
                id: msg.id,
                response,
            })
            .await
            .is_err()
        {
            break;
        }
        if is_shutdown {
            tracing::info!("apagado solicitado por un cliente");
            tokio::time::sleep(Duration::from_millis(100)).await;
            daemon.request_shutdown();
            break;
        }
    }

    for (_, task) in subs.drain() {
        task.abort();
    }
    writer.abort();
    daemon.client_disconnected();
    tracing::debug!("cliente desconectado");
}

fn handle_request(
    daemon: &Daemon,
    request: Request,
    out: &mpsc::Sender<ServerMessage>,
    subs: &mut HashMap<SessionId, JoinHandle<()>>,
) -> Response {
    match request {
        Request::Hello { protocol_version } => {
            if protocol_version != PROTOCOL_VERSION {
                tracing::warn!(
                    client = protocol_version,
                    daemon = PROTOCOL_VERSION,
                    "protocolo distinto"
                );
            }
            Response::Hello {
                protocol_version: PROTOCOL_VERSION,
                daemon_version: env!("CARGO_PKG_VERSION").into(),
                build_id: daemon.build_id.clone(),
            }
        }
        Request::ListSessions => {
            Response::Sessions(daemon.sessions.list().iter().map(|s| s.info()).collect())
        }
        Request::CreateSession {
            cwd,
            command,
            cols,
            rows,
        } => {
            match daemon.sessions.create(CreateSpec {
                cwd,
                command,
                cols,
                rows,
            }) {
                Ok(session) => Response::Session(session.info()),
                Err(e) => error(e),
            }
        }
        Request::WriteInput { session, bytes } => {
            with_session(daemon, &session, |s| s.write(&bytes))
        }
        Request::Resize {
            session,
            cols,
            rows,
        } => with_session(daemon, &session, |s| s.resize(cols, rows)),
        Request::Subscribe { session: id } => match daemon.sessions.get(&id) {
            Some(session) => {
                if let Some(old) = subs.insert(id, spawn_forwarder(session, out.clone())) {
                    old.abort();
                }
                Response::Ok
            }
            None => not_found(&id),
        },
        Request::Unsubscribe { session } => {
            if let Some(task) = subs.remove(&session) {
                task.abort();
            }
            Response::Ok
        }
        Request::CloseSession { session } => {
            if let Some(task) = subs.remove(&session) {
                task.abort();
            }
            if daemon.sessions.close(&session) {
                Response::Ok
            } else {
                not_found(&session)
            }
        }
        Request::Shutdown => Response::Ok,
    }
}

fn with_session(
    daemon: &Daemon,
    id: &SessionId,
    f: impl FnOnce(&Session) -> anyhow::Result<()>,
) -> Response {
    match daemon.sessions.get(id) {
        Some(session) => match f(&session) {
            Ok(()) => Response::Ok,
            Err(e) => error(e),
        },
        None => not_found(id),
    }
}

fn error(e: anyhow::Error) -> Response {
    Response::Error {
        message: format!("{e:#}"),
    }
}

fn not_found(id: &SessionId) -> Response {
    Response::Error {
        message: format!("no existe la sesión {id}"),
    }
}

/// Reenvía la salida de una sesión a un cliente: primero el snapshot, luego la salida agrupada.
/// Si el cliente se queda atrás (`Lagged`), vuelve a mandar un snapshot completo.
fn spawn_forwarder(session: Arc<Session>, out: mpsc::Sender<ServerMessage>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let id = session.id.clone();
        'resync: loop {
            let sub = session.subscribe();
            let mut rx = sub.rx;
            let snapshot = Event::Snapshot {
                session: id.clone(),
                bytes: sub.snapshot,
            };
            if send(&out, snapshot).await.is_err() {
                return;
            }
            if let Some(code) = sub.exit {
                let _ = send(
                    &out,
                    Event::Exited {
                        session: id.clone(),
                        exit_code: code,
                    },
                )
                .await;
                return;
            }

            loop {
                let first = match rx.recv().await {
                    Ok(output) => output,
                    Err(RecvError::Lagged(_)) => continue 'resync,
                    Err(RecvError::Closed) => return,
                };
                let mut batch = Vec::new();
                let mut exit = None;
                match first {
                    SessionOutput::Data(data) => batch.extend_from_slice(&data),
                    SessionOutput::Exited(code) => exit = Some(code),
                }
                // Agrupa lo que ya esté disponible sin esperar.
                while exit.is_none() && batch.len() < MAX_BATCH {
                    match rx.try_recv() {
                        Ok(SessionOutput::Data(data)) => batch.extend_from_slice(&data),
                        Ok(SessionOutput::Exited(code)) => exit = Some(code),
                        Err(TryRecvError::Lagged(_)) => continue 'resync,
                        Err(_) => break,
                    }
                }
                if !batch.is_empty()
                    && send(
                        &out,
                        Event::Output {
                            session: id.clone(),
                            bytes: batch,
                        },
                    )
                    .await
                    .is_err()
                {
                    return;
                }
                if let Some(code) = exit {
                    let _ = send(
                        &out,
                        Event::Exited {
                            session: id.clone(),
                            exit_code: code,
                        },
                    )
                    .await;
                    return;
                }
            }
        }
    })
}

async fn send(out: &mpsc::Sender<ServerMessage>, event: Event) -> Result<(), ()> {
    out.send(ServerMessage::Event(event)).await.map_err(|_| ())
}
