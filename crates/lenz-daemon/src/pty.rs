//! Apertura de PTYs con `portable-pty` (ConPTY en Windows, PTY nativo en macOS)
//! y elección del shell por defecto.

use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};

pub fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

pub fn open(cols: u16, rows: u16) -> anyhow::Result<PtyPair> {
    native_pty_system().openpty(size(cols, rows))
}

/// Shell por defecto y su título: `pwsh`/`powershell` en Windows, `$SHELL` en macOS.
pub fn default_command() -> (CommandBuilder, String) {
    #[cfg(windows)]
    {
        let exe = if in_path("pwsh.exe") {
            "pwsh.exe"
        } else {
            "powershell.exe"
        };
        let mut cmd = CommandBuilder::new(exe);
        cmd.arg("-NoLogo");
        (cmd, exe.trim_end_matches(".exe").to_string())
    }
    #[cfg(unix)]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let title = std::path::Path::new(&shell)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| shell.clone());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");
        (cmd, title)
    }
}

#[cfg(windows)]
fn in_path(exe: &str) -> bool {
    std::env::var_os("PATH")
        .is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join(exe).is_file()))
}
