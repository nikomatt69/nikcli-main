#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod pty;

#[cfg(feature = "menubar")]
mod menubar;

use commands::PtyState;
use parking_lot::Mutex;
use std::sync::Arc;

fn main() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init());

    // Add menubar plugins when feature is enabled
    #[cfg(feature = "menubar")]
    {
        builder = builder
            .plugin(tauri_nspanel::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_notification::init());
    }

    builder
        .manage(PtyState(Arc::new(Mutex::new(None))))
        .setup(|app| {
            // Setup menubar when feature is enabled
            #[cfg(feature = "menubar")]
            {
                if let Err(e) = menubar::setup_menubar(app.handle()) {
                    eprintln!("Failed to setup menubar: {}", e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // PTY commands
            commands::create_pty,
            commands::write_to_pty,
            commands::resize_pty,
            commands::close_pty,
            // Menubar commands (conditionally compiled)
            #[cfg(feature = "menubar")]
            menubar::get_daemon_status,
            #[cfg(feature = "menubar")]
            menubar::get_daemon_stats,
            #[cfg(feature = "menubar")]
            menubar::get_recent_jobs,
            #[cfg(feature = "menubar")]
            menubar::toggle_panel,
            #[cfg(feature = "menubar")]
            menubar::hide_panel,
            #[cfg(feature = "menubar")]
            menubar::start_daemon,
            #[cfg(feature = "menubar")]
            menubar::stop_daemon,
            #[cfg(feature = "menubar")]
            menubar::show_notification,
            #[cfg(feature = "menubar")]
            menubar::open_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
