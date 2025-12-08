use crate::pty::PtyManager;
use parking_lot::Mutex;
use std::io::Read;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct PtyState(pub Arc<Mutex<Option<PtyManager>>>);

#[tauri::command]
pub async fn create_pty(
    state: State<'_, PtyState>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<(), String> {
    // Close existing PTY if any
    {
        let mut guard = state.0.lock();
        *guard = None;
    }

    let pty = PtyManager::new(cols, rows)?;

    // Spawn NikCLI with bun
    let bun_path = which_bun().unwrap_or_else(|| "bun".to_string());

    pty.spawn_command(
        &bun_path,
        &["run", "src/cli/index.ts"],
        cwd.as_deref(),
    )?;

    // Get reader for async output
    let mut reader = pty.get_reader()?;

    // Store PTY
    *state.0.lock() = Some(pty);

    // Spawn reader task
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF - process exited
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    if app_clone.emit("pty-output", &data).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("PTY read error: {}", e);
                    break;
                }
            }
        }
        let _ = app_clone.emit("pty-exit", ());
    });

    Ok(())
}

#[tauri::command]
pub fn write_to_pty(state: State<'_, PtyState>, data: String) -> Result<(), String> {
    let guard = state.0.lock();
    if let Some(ref pty) = *guard {
        pty.write(data.as_bytes())
    } else {
        Err("PTY not initialized".into())
    }
}

#[tauri::command]
pub fn resize_pty(state: State<'_, PtyState>, cols: u16, rows: u16) -> Result<(), String> {
    let guard = state.0.lock();
    if let Some(ref pty) = *guard {
        pty.resize(cols, rows)
    } else {
        Err("PTY not initialized".into())
    }
}

#[tauri::command]
pub fn close_pty(state: State<'_, PtyState>) -> Result<(), String> {
    *state.0.lock() = None;
    Ok(())
}

pub fn which_bun() -> Option<String> {
    // Try common bun locations
    let candidates = [
        "/usr/local/bin/bun",
        "/opt/homebrew/bin/bun",
        "/home/linuxbrew/.linuxbrew/bin/bun",
    ];

    for candidate in candidates {
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    // Try which command
    if let Ok(output) = std::process::Command::new("which").arg("bun").output() {
        if output.status.success() {
            if let Ok(path) = String::from_utf8(output.stdout) {
                let path = path.trim();
                if !path.is_empty() {
                    return Some(path.to_string());
                }
            }
        }
    }

    None
}
