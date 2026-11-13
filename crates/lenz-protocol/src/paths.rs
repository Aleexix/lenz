//! Rutas y nombres compartidos por la app y el daemon.
//! Las builds de desarrollo usan nombres con `-dev` para no chocar con una versión instalada.

use std::path::PathBuf;

fn app_dir_name() -> &'static str {
    if cfg!(debug_assertions) {
        "Lenz-dev"
    } else {
        "Lenz"
    }
}

/// Variables para aislar un daemon (tests de integración): carpeta de datos y endpoint propios.
pub const DATA_DIR_ENV: &str = "LENZ_DATA_DIR";
pub const ENDPOINT_ENV: &str = "LENZ_ENDPOINT";

/// Carpeta de datos local: `%LOCALAPPDATA%\Lenz` en Windows, `~/Library/Application Support/Lenz` en macOS.
pub fn data_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os(DATA_DIR_ENV) {
        return PathBuf::from(dir);
    }
    dirs::data_local_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(app_dir_name())
}

pub fn daemon_log() -> PathBuf {
    data_dir().join("daemon.log")
}

/// Dirección del daemon: named pipe en Windows, socket Unix en macOS.
pub fn endpoint() -> String {
    if let Ok(endpoint) = std::env::var(ENDPOINT_ENV) {
        return endpoint;
    }
    #[cfg(windows)]
    {
        let user: String = std::env::var("USERNAME")
            .unwrap_or_default()
            .chars()
            .filter(char::is_ascii_alphanumeric)
            .collect();
        let suffix = if cfg!(debug_assertions) { "-dev" } else { "" };
        format!(r"\\.\pipe\lenz-daemon-{user}{suffix}")
    }
    #[cfg(unix)]
    {
        data_dir()
            .join("daemon.sock")
            .to_string_lossy()
            .into_owned()
    }
}
