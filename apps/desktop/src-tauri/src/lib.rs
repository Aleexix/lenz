//! Backend Tauri de Lenz. Traductor delgado entre la UI y `lenz-daemon`:
//! sin lógica de negocio aquí (ver CLAUDE.md, reglas de arquitectura).

mod commands;
mod daemon_client;

use tauri::Manager;

use crate::daemon_client::DaemonClient;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(DaemonClient::new(app.handle().clone()));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = handle.state::<DaemonClient>().warm_up().await {
                    tracing::warn!(error = %e, "no se pudo conectar con lenz-daemon al iniciar");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::list_sessions,
            commands::create_session,
            commands::attach_session,
            commands::detach_session,
            commands::write_input,
            commands::resize_session,
            commands::close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Lenz");
}
