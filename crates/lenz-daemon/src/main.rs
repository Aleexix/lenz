//! `lenz-daemon`: proceso que sobrevive al cierre de la app y es dueño de las terminales.
//! Ver `docs/adr/0001-daemon-sidecar.md`.
//!
//! Uso:
//! - `lenz-daemon --build-id <id>`: lo lanza la app.
//! - `lenz-daemon --stop`: apaga el daemon que esté corriendo (útil en desarrollo).

mod emulator;
mod git;
mod hooks;
mod ipc;
mod pty;
mod session;
mod storage;

use std::{fs::OpenOptions, sync::Mutex};

use anyhow::Context;
use lenz_protocol::{frame, paths, transport, ClientMessage, Request, ServerMessage};
use tracing_subscriber::EnvFilter;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let runtime = tokio::runtime::Runtime::new()?;

    if args.iter().any(|a| a == "--stop") {
        return runtime.block_on(stop());
    }

    let build_id = args
        .iter()
        .position(|a| a == "--build-id")
        .and_then(|i| args.get(i + 1))
        .cloned()
        .unwrap_or_else(|| "manual".into());

    init_logging()?;
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        protocol = lenz_protocol::PROTOCOL_VERSION,
        %build_id,
        pid = std::process::id(),
        "lenz-daemon iniciado"
    );

    let daemon = ipc::Daemon::new(build_id);
    let result = runtime.block_on(ipc::serve(daemon.clone()));
    if let Err(e) = &result {
        tracing::error!(error = %format!("{e:#}"), "el servidor terminó con error");
    }
    daemon.sessions.kill_all();
    tracing::info!("lenz-daemon detenido");
    // Los hilos de lectura de los PTYs son bloqueantes: salir sin esperarlos.
    std::process::exit(if result.is_ok() { 0 } else { 1 });
}

fn init_logging() -> anyhow::Result<()> {
    std::fs::create_dir_all(paths::data_dir())?;
    let path = paths::daemon_log();
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 5 * 1024 * 1024) {
        let _ = std::fs::remove_file(&path);
    }
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .with_context(|| format!("no se pudo abrir {}", path.display()))?;
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_ansi(false)
        .with_writer(Mutex::new(file))
        .init();
    Ok(())
}

async fn stop() -> anyhow::Result<()> {
    let Ok(stream) = transport::connect().await else {
        println!("No hay ningún lenz-daemon corriendo.");
        return Ok(());
    };
    let (mut rd, mut wr) = tokio::io::split(stream);
    frame::write_frame(
        &mut wr,
        &ClientMessage {
            id: 1,
            request: Request::Shutdown,
        },
    )
    .await?;
    let _: Option<ServerMessage> = frame::read_frame(&mut rd).await.ok().flatten();
    println!("lenz-daemon detenido.");
    Ok(())
}
