//! Comandos Tauri invocados desde `apps/desktop/src/lib/ipc.ts`.
//! Cada comando delega al daemon a través de `DaemonClient`; nada de lógica de negocio aquí.

use lenz_protocol::{Request, Response, SessionId, SessionInfo};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    State,
};

use crate::daemon_client::DaemonClient;

type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn list_sessions(client: State<'_, DaemonClient>) -> CmdResult<Vec<SessionInfo>> {
    match client.request(Request::ListSessions).await? {
        Response::Sessions(sessions) => Ok(sessions),
        other => Err(unexpected(other)),
    }
}

#[tauri::command]
pub async fn create_session(
    client: State<'_, DaemonClient>,
    cols: u16,
    rows: u16,
) -> CmdResult<SessionInfo> {
    let request = Request::CreateSession {
        cwd: None,
        command: None,
        cols,
        rows,
    };
    match client.request(request).await? {
        Response::Session(info) => Ok(info),
        other => Err(unexpected(other)),
    }
}

#[tauri::command]
pub async fn attach_session(
    client: State<'_, DaemonClient>,
    session_id: String,
    on_event: Channel<InvokeResponseBody>,
) -> CmdResult<u64> {
    client.attach(SessionId(session_id), on_event).await
}

#[tauri::command]
pub async fn detach_session(
    client: State<'_, DaemonClient>,
    session_id: String,
    token: u64,
) -> CmdResult<()> {
    client.detach(SessionId(session_id), token).await
}

#[tauri::command]
pub async fn write_input(
    client: State<'_, DaemonClient>,
    session_id: String,
    data: String,
) -> CmdResult<()> {
    let request = Request::WriteInput {
        session: SessionId(session_id),
        bytes: data.into_bytes(),
    };
    client.request(request).await.map(|_| ())
}

#[tauri::command]
pub async fn resize_session(
    client: State<'_, DaemonClient>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> CmdResult<()> {
    let request = Request::Resize {
        session: SessionId(session_id),
        cols,
        rows,
    };
    client.request(request).await.map(|_| ())
}

#[tauri::command]
pub async fn close_session(client: State<'_, DaemonClient>, session_id: String) -> CmdResult<()> {
    let request = Request::CloseSession {
        session: SessionId(session_id),
    };
    client.request(request).await.map(|_| ())
}

fn unexpected(response: Response) -> String {
    format!("respuesta inesperada del daemon: {response:?}")
}
