#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod pty;

use commands::PtyState;
use parking_lot::Mutex;
use std::sync::Arc;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(PtyState(Arc::new(Mutex::new(None))))
        .invoke_handler(tauri::generate_handler![
            commands::create_pty,
            commands::write_to_pty,
            commands::resize_pty,
            commands::close_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
