//! Conexión del lado cliente al daemon.

use std::io;

#[cfg(windows)]
pub type Stream = tokio::net::windows::named_pipe::NamedPipeClient;
#[cfg(unix)]
pub type Stream = tokio::net::UnixStream;

/// Se conecta al daemon. Falla rápido si no está corriendo.
pub async fn connect() -> io::Result<Stream> {
    let endpoint = crate::paths::endpoint();

    #[cfg(windows)]
    {
        use std::time::Duration;
        use tokio::net::windows::named_pipe::ClientOptions;

        // Todas las instancias del pipe ocupadas: el daemon crea otra enseguida.
        const ERROR_PIPE_BUSY: i32 = 231;
        for _ in 0..20 {
            match ClientOptions::new().open(&endpoint) {
                Ok(client) => return Ok(client),
                Err(e) if e.raw_os_error() == Some(ERROR_PIPE_BUSY) => {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                Err(e) => return Err(e),
            }
        }
        Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "el pipe del daemon está ocupado",
        ))
    }

    #[cfg(unix)]
    {
        tokio::net::UnixStream::connect(&endpoint).await
    }
}
