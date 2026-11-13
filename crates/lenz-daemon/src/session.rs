//! Gestor de sesiones: une cada PTY con su scrollback y sus suscriptores.
//!
//! Por cada sesión hay dos hilos:
//! - lectura: lee el PTY, guarda en el scrollback y publica en un `broadcast`;
//! - espera: espera a que el proceso termine, cierra el PTY y publica `Exited`.
//!
//! Fase 1: el scrollback son los bytes crudos (últimos 2 MB) y se reproducen al reconectar.
//! En la fase 2 lo reemplaza el emulador (`emulator.rs`) para tener la pantalla exacta.

use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use anyhow::{anyhow, Context};
use lenz_protocol::{SessionId, SessionInfo};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty};
use tokio::sync::broadcast;

use crate::pty;

const SCROLLBACK_BYTES: usize = 2 * 1024 * 1024;
/// Consulta de posición del cursor (DSR). ConPTY la envía al arrancar y bloquea hasta recibir respuesta.
const CURSOR_QUERY: &[u8] = b"\x1b[6n";
const CURSOR_AT_ORIGIN: &[u8] = b"\x1b[1;1R";
const BROADCAST_CAPACITY: usize = 1024;
const READ_BUFFER: usize = 64 * 1024;

#[derive(Debug, Clone)]
pub enum SessionOutput {
    Data(Arc<Vec<u8>>),
    Exited(Option<i32>),
}

struct OutputState {
    scrollback: VecDeque<u8>,
    /// Aún no llegó la primera salida (ahí viene la consulta de cursor de ConPTY).
    starting: bool,
    /// `Some(code)` cuando el proceso terminó.
    exit: Option<Option<i32>>,
}

pub struct Subscription {
    pub snapshot: Vec<u8>,
    pub rx: broadcast::Receiver<SessionOutput>,
    pub exit: Option<Option<i32>>,
}

pub struct Session {
    pub id: SessionId,
    seq: u64,
    title: String,
    cwd: String,
    size: Mutex<(u16, u16)>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    output: Mutex<OutputState>,
    tx: broadcast::Sender<SessionOutput>,
}

impl Session {
    pub fn info(&self) -> SessionInfo {
        let (cols, rows) = *self.size.lock().unwrap();
        let exit = self.output.lock().unwrap().exit;
        SessionInfo {
            id: self.id.clone(),
            title: self.title.clone(),
            cwd: self.cwd.clone(),
            cols,
            rows,
            exited: exit.is_some(),
            exit_code: exit.flatten(),
        }
    }

    /// Foto del scrollback + receptor de lo que venga después, sin huecos entre ambos.
    pub fn subscribe(&self) -> Subscription {
        let out = self.output.lock().unwrap();
        Subscription {
            snapshot: out.scrollback.iter().copied().collect(),
            rx: self.tx.subscribe(),
            exit: out.exit,
        }
    }

    pub fn write(&self, bytes: &[u8]) -> anyhow::Result<()> {
        let mut writer = self.writer.lock().unwrap();
        let writer = writer
            .as_mut()
            .ok_or_else(|| anyhow!("la sesión ya terminó"))?;
        writer.write_all(bytes)?;
        writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> anyhow::Result<()> {
        let (cols, rows) = (cols.max(2), rows.max(2));
        if let Some(master) = self.master.lock().unwrap().as_ref() {
            master.resize(pty::size(cols, rows))?;
        }
        *self.size.lock().unwrap() = (cols, rows);
        Ok(())
    }

    fn kill(&self) {
        let _ = self.killer.lock().unwrap().kill();
    }

    fn push_output(&self, data: &[u8]) {
        let mut data = data.to_vec();
        let mut out = self.output.lock().unwrap();

        // ConPTY (INHERIT_CURSOR) pregunta la posición del cursor al arrancar y no deja correr
        // el proceso hasta recibir respuesta: la contesta el daemon, así no depende de que haya
        // una UI conectada. TODO(fase 2): con el emulador, responder la posición real siempre.
        if out.starting && !data.is_empty() {
            out.starting = false;
            if cfg!(windows) && remove_first(&mut data, CURSOR_QUERY) {
                if let Some(writer) = self.writer.lock().unwrap().as_mut() {
                    let _ = writer
                        .write_all(CURSOR_AT_ORIGIN)
                        .and_then(|()| writer.flush());
                }
            }
        }

        // El scrollback se reproduce al reconectar: sin consultas de cursor, o xterm las
        // contestaría de nuevo y metería basura como entrada del shell.
        out.scrollback.extend(without(&data, CURSOR_QUERY));
        let excess = out.scrollback.len().saturating_sub(SCROLLBACK_BYTES);
        if excess > 0 {
            out.scrollback.drain(..excess);
        }
        if !data.is_empty() {
            let _ = self.tx.send(SessionOutput::Data(Arc::new(data)));
        }
    }

    fn mark_exited(&self, code: Option<i32>) {
        let mut out = self.output.lock().unwrap();
        if out.exit.is_none() {
            out.exit = Some(code);
            let _ = self.tx.send(SessionOutput::Exited(code));
        }
    }

    /// Cierra el PTY. En Windows esto es lo que hace que el hilo de lectura reciba EOF.
    fn close_pty(&self) {
        self.writer.lock().unwrap().take();
        self.master.lock().unwrap().take();
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Quita la primera aparición de `needle`. Devuelve `true` si la encontró.
fn remove_first(data: &mut Vec<u8>, needle: &[u8]) -> bool {
    match find(data, needle) {
        Some(at) => {
            data.drain(at..at + needle.len());
            true
        }
        None => false,
    }
}

/// Copia de `data` sin ninguna aparición de `needle`.
fn without(data: &[u8], needle: &[u8]) -> Vec<u8> {
    let mut rest = data;
    let mut result = Vec::with_capacity(data.len());
    while let Some(at) = find(rest, needle) {
        result.extend_from_slice(&rest[..at]);
        rest = &rest[at + needle.len()..];
    }
    result.extend_from_slice(rest);
    result
}

pub struct CreateSpec {
    pub cwd: Option<String>,
    pub command: Option<Vec<String>>,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Default)]
pub struct SessionManager {
    sessions: Mutex<HashMap<SessionId, Arc<Session>>>,
    next_seq: AtomicU64,
}

impl SessionManager {
    pub fn create(&self, spec: CreateSpec) -> anyhow::Result<Arc<Session>> {
        let seq = self.next_seq.fetch_add(1, Ordering::SeqCst) + 1;
        let id = SessionId(format!("s{}-{seq}", std::process::id()));
        let (cols, rows) = (spec.cols.max(2), spec.rows.max(2));
        let cwd = spec
            .cwd
            .map(PathBuf::from)
            .or_else(dirs::home_dir)
            .unwrap_or_else(|| PathBuf::from("."));

        let (mut cmd, title) = match spec.command {
            Some(argv) if !argv.is_empty() => {
                let mut cmd = CommandBuilder::new(&argv[0]);
                cmd.args(&argv[1..]);
                (cmd, argv[0].clone())
            }
            _ => pty::default_command(),
        };
        cmd.cwd(&cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("LENZ_SESSION_ID", &id.0);

        let pair = pty::open(cols, rows)?;
        let mut child = pair
            .slave
            .spawn_command(cmd)
            .with_context(|| format!("no se pudo lanzar «{title}»"))?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;
        let killer = child.clone_killer();
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);

        let session = Arc::new(Session {
            id: id.clone(),
            seq,
            title,
            cwd: cwd.to_string_lossy().into_owned(),
            size: Mutex::new((cols, rows)),
            master: Mutex::new(Some(pair.master)),
            writer: Mutex::new(Some(writer)),
            killer: Mutex::new(killer),
            output: Mutex::new(OutputState {
                scrollback: VecDeque::new(),
                starting: true,
                exit: None,
            }),
            tx,
        });

        let reader_thread = {
            let session = session.clone();
            std::thread::Builder::new()
                .name(format!("pty-read-{id}"))
                .spawn(move || {
                    let mut buf = vec![0u8; READ_BUFFER];
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) => break,
                            Ok(n) => session.push_output(&buf[..n]),
                            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                            Err(_) => break,
                        }
                    }
                })?
        };

        {
            let session = session.clone();
            std::thread::Builder::new()
                .name(format!("pty-wait-{id}"))
                .spawn(move || {
                    let code = child.wait().ok().map(|status| status.exit_code() as i32);
                    tracing::debug!(session = %session.id, ?code, "el proceso salió");
                    // Deja que el lector vacíe la salida final antes de cerrar el PTY.
                    std::thread::sleep(Duration::from_millis(150));
                    session.close_pty();
                    tracing::debug!(session = %session.id, "pty cerrado");
                    let _ = reader_thread.join();
                    tracing::debug!(session = %session.id, "lector terminado");
                    session.mark_exited(code);
                    tracing::info!(session = %session.id, ?code, "proceso terminado");
                })?;
        }

        tracing::info!(session = %id, title = %session.title, cwd = %session.cwd, "sesión creada");
        self.sessions.lock().unwrap().insert(id, session.clone());
        Ok(session)
    }

    pub fn get(&self, id: &SessionId) -> Option<Arc<Session>> {
        self.sessions.lock().unwrap().get(id).cloned()
    }

    /// Sesiones en orden de creación.
    pub fn list(&self) -> Vec<Arc<Session>> {
        let mut sessions: Vec<_> = self.sessions.lock().unwrap().values().cloned().collect();
        sessions.sort_by_key(|s| s.seq);
        sessions
    }

    pub fn is_empty(&self) -> bool {
        self.sessions.lock().unwrap().is_empty()
    }

    /// Mata el proceso y elimina la sesión. Devuelve `false` si no existía.
    pub fn close(&self, id: &SessionId) -> bool {
        let session = self.sessions.lock().unwrap().remove(id);
        match session {
            Some(session) => {
                session.kill();
                tracing::info!(session = %id, "sesión cerrada");
                true
            }
            None => false,
        }
    }

    pub fn kill_all(&self) {
        for (_, session) in self.sessions.lock().unwrap().drain() {
            session.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_cursor_queries() {
        let mut data = b"\x1b[6nhola\x1b[6n".to_vec();
        assert!(remove_first(&mut data, CURSOR_QUERY));
        assert_eq!(data, b"hola\x1b[6n");
        assert_eq!(without(&data, CURSOR_QUERY), b"hola");
        assert!(!remove_first(&mut b"hola".to_vec(), CURSOR_QUERY));
    }
}
