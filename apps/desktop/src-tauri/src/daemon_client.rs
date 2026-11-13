//! Cliente de `lenz-daemon`.
//!
//! - Se conecta al pipe/socket; si el daemon no está corriendo, lo lanza desacoplado de la app
//!   (Windows: `DETACHED_PROCESS | CREATE_BREAKAWAY_FROM_JOB`; macOS: nuevo grupo de procesos).
//! - Handshake: si el protocolo o el `build_id` no coinciden, apaga el daemon viejo y lanza el nuevo.
//! - Reenvía los eventos de cada sesión a la UI por un `Channel` binario:
//!   `[tag, ...payload]` con tag 0 = salida, 1 = snapshot, 2 = terminado (+ código i32 BE opcional).

use std::{
    collections::HashMap,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, UNIX_EPOCH},
};

use lenz_protocol::{
    frame, paths, transport, ClientMessage, Event, Request, Response, ServerMessage, SessionId,
    PROTOCOL_VERSION,
};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle, Emitter,
};
use tokio::sync::{mpsc, oneshot};

/// Evento global que recibe la UI cuando se pierde la conexión con el daemon.
pub const DISCONNECTED_EVENT: &str = "daemon-disconnected";

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const TAG_OUTPUT: u8 = 0;
const TAG_SNAPSHOT: u8 = 1;
const TAG_EXITED: u8 = 2;

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Response>>>>;
type Subscribers = Arc<Mutex<HashMap<SessionId, Subscriber>>>;

struct Subscriber {
    token: u64,
    channel: Channel<InvokeResponseBody>,
}

#[derive(Clone)]
struct Connection {
    tx: mpsc::Sender<ClientMessage>,
    pending: Pending,
    alive: Arc<AtomicBool>,
    /// `false` cuando cerramos a propósito (reinicio): no avisar a la UI.
    report_disconnect: Arc<AtomicBool>,
}

pub struct DaemonClient {
    app: AppHandle,
    conn: tokio::sync::Mutex<Option<Connection>>,
    subscribers: Subscribers,
    next_id: AtomicU64,
    next_token: AtomicU64,
}

impl DaemonClient {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            conn: tokio::sync::Mutex::new(None),
            subscribers: Arc::default(),
            next_id: AtomicU64::new(1),
            next_token: AtomicU64::new(1),
        }
    }

    /// Envía una petición; convierte `Response::Error` en `Err`.
    pub async fn request(&self, request: Request) -> Result<Response, String> {
        let conn = self.connection().await?;
        match self.send(&conn, request).await? {
            Response::Error { message } => Err(message),
            response => Ok(response),
        }
    }

    /// Conecta (o lanza) el daemon por adelantado para que la primera terminal abra rápido.
    pub async fn warm_up(&self) -> Result<(), String> {
        self.connection().await.map(|_| ())
    }

    /// Registra el canal de la UI para una sesión y se suscribe en el daemon.
    /// Devuelve un token: `detach` solo quita el canal si el token coincide (evita carreras al remontar).
    pub async fn attach(
        &self,
        session: SessionId,
        channel: Channel<InvokeResponseBody>,
    ) -> Result<u64, String> {
        let token = self.next_token.fetch_add(1, Ordering::Relaxed);
        self.subscribers
            .lock()
            .unwrap()
            .insert(session.clone(), Subscriber { token, channel });
        if let Err(e) = self
            .request(Request::Subscribe {
                session: session.clone(),
            })
            .await
        {
            self.remove_subscriber(&session, token);
            return Err(e);
        }
        Ok(token)
    }

    pub async fn detach(&self, session: SessionId, token: u64) -> Result<(), String> {
        if self.remove_subscriber(&session, token) {
            self.request(Request::Unsubscribe { session }).await?;
        }
        Ok(())
    }

    fn remove_subscriber(&self, session: &SessionId, token: u64) -> bool {
        let mut subs = self.subscribers.lock().unwrap();
        if subs.get(session).is_some_and(|s| s.token == token) {
            subs.remove(session);
            true
        } else {
            false
        }
    }

    async fn send(&self, conn: &Connection, request: Request) -> Result<Response, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        conn.pending.lock().unwrap().insert(id, tx);
        if conn.tx.send(ClientMessage { id, request }).await.is_err() {
            conn.pending.lock().unwrap().remove(&id);
            return Err("la conexión con el daemon está cerrada".into());
        }
        match tokio::time::timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(_)) => Err("el daemon se desconectó".into()),
            Err(_) => {
                conn.pending.lock().unwrap().remove(&id);
                Err("el daemon no respondió a tiempo".into())
            }
        }
    }

    async fn connection(&self) -> Result<Connection, String> {
        let mut guard = self.conn.lock().await;
        if let Some(conn) = guard.as_ref() {
            if conn.alive.load(Ordering::SeqCst) {
                return Ok(conn.clone());
            }
        }
        let conn = self.establish().await?;
        *guard = Some(conn.clone());
        drop(guard);

        // Tras una reconexión, vuelve a suscribir las terminales que la UI tiene abiertas.
        let sessions: Vec<SessionId> = self.subscribers.lock().unwrap().keys().cloned().collect();
        for session in sessions {
            let _ = self.send(&conn, Request::Subscribe { session }).await;
        }
        Ok(conn)
    }

    async fn establish(&self) -> Result<Connection, String> {
        let binary = DaemonBinary::locate()?;
        for _ in 0..2 {
            let conn = self.connect_or_spawn(&binary).await?;
            match self
                .send(
                    &conn,
                    Request::Hello {
                        protocol_version: PROTOCOL_VERSION,
                    },
                )
                .await?
            {
                Response::Hello {
                    protocol_version,
                    build_id,
                    ..
                } if protocol_version == PROTOCOL_VERSION && build_id == binary.build_id => {
                    return Ok(conn);
                }
                Response::Hello { build_id, .. } => {
                    tracing::info!(running = %build_id, expected = %binary.build_id, "daemon desactualizado; reiniciando");
                    conn.report_disconnect.store(false, Ordering::SeqCst);
                    let _ = self.send(&conn, Request::Shutdown).await;
                    wait_until_gone().await;
                }
                other => return Err(format!("respuesta inesperada del daemon: {other:?}")),
            }
        }
        Err("no se pudo iniciar una versión compatible de lenz-daemon".into())
    }

    async fn connect_or_spawn(&self, binary: &DaemonBinary) -> Result<Connection, String> {
        if let Ok(stream) = transport::connect().await {
            return Ok(self.start(stream));
        }
        binary
            .spawn()
            .map_err(|e| format!("no se pudo lanzar lenz-daemon: {e}"))?;
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if let Ok(stream) = transport::connect().await {
                return Ok(self.start(stream));
            }
        }
        Err(format!(
            "lenz-daemon no respondió. Revisa el log en {}",
            paths::daemon_log().display()
        ))
    }

    fn start(&self, stream: transport::Stream) -> Connection {
        let (mut rd, mut wr) = tokio::io::split(stream);
        let (tx, mut rx) = mpsc::channel::<ClientMessage>(256);
        let conn = Connection {
            tx,
            pending: Pending::default(),
            alive: Arc::new(AtomicBool::new(true)),
            report_disconnect: Arc::new(AtomicBool::new(true)),
        };

        tauri::async_runtime::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if frame::write_frame(&mut wr, &msg).await.is_err() {
                    break;
                }
            }
        });

        let reader_conn = conn.clone();
        let subscribers = self.subscribers.clone();
        let app = self.app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                match frame::read_frame::<_, ServerMessage>(&mut rd).await {
                    Ok(Some(ServerMessage::Response { id, response })) => {
                        if let Some(tx) = reader_conn.pending.lock().unwrap().remove(&id) {
                            let _ = tx.send(response);
                        }
                    }
                    Ok(Some(ServerMessage::Event(event))) => dispatch(&subscribers, event),
                    Ok(None) | Err(_) => break,
                }
            }
            reader_conn.alive.store(false, Ordering::SeqCst);
            reader_conn.pending.lock().unwrap().clear();
            if reader_conn.report_disconnect.load(Ordering::SeqCst) {
                tracing::warn!("se perdió la conexión con lenz-daemon");
                let _ = app.emit(DISCONNECTED_EVENT, ());
            }
        });

        conn
    }
}

fn dispatch(subscribers: &Subscribers, event: Event) {
    let (session, payload) = match event {
        Event::Output { session, bytes } => (session, tagged(TAG_OUTPUT, &bytes)),
        Event::Snapshot { session, bytes } => (session, tagged(TAG_SNAPSHOT, &bytes)),
        Event::Exited { session, exit_code } => {
            let code = exit_code.map(i32::to_be_bytes);
            (
                session,
                tagged(TAG_EXITED, code.as_ref().map_or(&[][..], |c| &c[..])),
            )
        }
    };
    if let Some(sub) = subscribers.lock().unwrap().get(&session) {
        let _ = sub.channel.send(InvokeResponseBody::Raw(payload));
    }
}

fn tagged(tag: u8, body: &[u8]) -> Vec<u8> {
    let mut payload = Vec::with_capacity(1 + body.len());
    payload.push(tag);
    payload.extend_from_slice(body);
    payload
}

async fn wait_until_gone() {
    for _ in 0..30 {
        if transport::connect().await.is_err() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

/// El binario del daemon que viene con esta app (al lado del ejecutable, en dev y en el bundle).
struct DaemonBinary {
    path: PathBuf,
    /// Tamaño + fecha de modificación: cambia con cada build del daemon.
    build_id: String,
}

impl DaemonBinary {
    fn locate() -> Result<Self, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let dir = exe.parent().ok_or("ruta del ejecutable inválida")?;
        let path = dir.join(if cfg!(windows) {
            "lenz-daemon.exe"
        } else {
            "lenz-daemon"
        });
        let meta = std::fs::metadata(&path).map_err(|_| {
            format!(
                "no se encontró {}. En desarrollo usa `pnpm dev`, que compila el daemon antes.",
                path.display()
            )
        })?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_nanos());
        Ok(Self {
            path,
            build_id: format!("{:x}-{modified:x}", meta.len()),
        })
    }

    fn spawn(&self) -> std::io::Result<()> {
        let program = self.runnable_path()?;
        let workdir = paths::data_dir();
        std::fs::create_dir_all(&workdir)?;
        let mut cmd = Command::new(program);
        cmd.arg("--build-id")
            .arg(&self.build_id)
            .current_dir(workdir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut child = spawn_detached(cmd)?;
        // Recoge el proceso cuando termine para no dejar zombies mientras la app siga abierta.
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }

    /// En Windows un .exe en uso no se puede sobrescribir: se ejecuta una copia, así `cargo build`
    /// y las actualizaciones de la app no chocan con un daemon corriendo.
    #[cfg(windows)]
    fn runnable_path(&self) -> std::io::Result<PathBuf> {
        let dir = if cfg!(debug_assertions) {
            self.path.with_file_name("daemon-run")
        } else {
            paths::data_dir().join("daemon")
        };
        std::fs::create_dir_all(&dir)?;
        let target = dir.join(format!("lenz-daemon-{}.exe", self.build_id));
        if !target.exists() {
            // Limpia copias viejas; las que estén en uso fallan en silencio.
            for entry in std::fs::read_dir(&dir)?.flatten() {
                let _ = std::fs::remove_file(entry.path());
            }
            std::fs::copy(&self.path, &target)?;
        }
        Ok(target)
    }

    #[cfg(not(windows))]
    fn runnable_path(&self) -> std::io::Result<PathBuf> {
        Ok(self.path.clone())
    }
}

#[cfg(windows)]
fn spawn_detached(mut cmd: Command) -> std::io::Result<Child> {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

    cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB);
    match cmd.spawn() {
        Ok(child) => Ok(child),
        // Si el job actual no permite "breakaway", lanzarlo igual (puede morir con la app).
        Err(_) => {
            cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
            cmd.spawn()
        }
    }
}

#[cfg(unix)]
fn spawn_detached(mut cmd: Command) -> std::io::Result<Child> {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
    cmd.spawn()
}
