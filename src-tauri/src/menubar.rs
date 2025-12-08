//! Menubar module for NikCLI macOS tray integration
//! Uses tauri-nspanel v2.1 for native NSPanel popover

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl,
};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel,
};

const DAEMON_URL: &str = "http://localhost:3000";
const PANEL_WIDTH: f64 = 320.0;
const PANEL_HEIGHT: f64 = 480.0;

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub connected: bool,
    pub status: String,
    pub uptime: Option<u64>,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobStats {
    pub total: u32,
    pub queued: u32,
    pub running: u32,
    pub succeeded: u32,
    pub failed: u32,
    pub cancelled: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsResponse {
    pub jobs: JobStats,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub task: String,
    pub status: String,
    pub repo: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobsResponse {
    pub jobs: Vec<Job>,
    pub total: u32,
}

// ============================================================================
// Panel Definition using tauri_panel! macro
// ============================================================================

tauri_panel! {
    panel!(MenubarPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })
}

// ============================================================================
// Setup Functions
// ============================================================================

pub fn setup_menubar(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.clone();

    // 1. Create tray icon (simple blue pixel as template)
    let icon = tauri::image::Image::new_owned(vec![0x7a, 0xa2, 0xf7, 0xff], 1, 1);

    let _tray = TrayIconBuilder::with_id("nikcli-tray")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("NikCLI")
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = toggle_panel_internal(&tray.app_handle());
            }
        })
        .menu(&create_tray_menu(&app_handle)?)
        .show_menu_on_left_click(false)
        .build(app)?;

    // 2. Create panel using PanelBuilder (correct v2.1 API)
    PanelBuilder::<_, MenubarPanel>::new(app, "menubar-panel")
        .url(WebviewUrl::App("panel.html".into()))
        .size(tauri::Size::Logical(tauri::LogicalSize::new(
            PANEL_WIDTH,
            PANEL_HEIGHT,
        )))
        .position(tauri::Position::Logical(tauri::LogicalPosition::new(
            100.0, 30.0,
        )))
        .floating(true)
        .level(PanelLevel::Floating)
        .has_shadow(true)
        .alpha_value(0.98)
        .corner_radius(12.0)
        .no_activate(false)
        .hides_on_deactivate(true)
        .collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .ignores_cycle(),
        )
        .build()?;

    // 3. Setup global shortcut (Cmd+Shift+N)
    setup_global_shortcut(app)?;

    // 4. Start background polling for daemon status
    start_daemon_polling(app.clone());

    Ok(())
}

fn create_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let open_terminal =
        MenuItem::with_id(app, "open_terminal", "Open Terminal", true, None::<&str>)?;
    let start_daemon =
        MenuItem::with_id(app, "start_daemon", "Start Daemon", true, None::<&str>)?;
    let stop_daemon = MenuItem::with_id(app, "stop_daemon", "Stop Daemon", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "separator", "─────────────", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit NikCLI", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&open_terminal, &start_daemon, &stop_daemon, &separator, &quit],
    )?;

    // Handle menu events
    app.on_menu_event(move |app, event| match event.id().as_ref() {
        "open_terminal" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "start_daemon" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_daemon_internal().await {
                    eprintln!("Failed to start daemon: {}", e);
                }
                let _ = app.emit("daemon-status-changed", ());
            });
        }
        "stop_daemon" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = stop_daemon_internal().await {
                    eprintln!("Failed to stop daemon: {}", e);
                }
                let _ = app.emit("daemon-status-changed", ());
            });
        }
        "quit" => {
            std::process::exit(0);
        }
        _ => {}
    });

    Ok(menu)
}

fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

    let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);
    let app_clone = app.clone();

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, _event| {
            if let Err(e) = toggle_panel_internal(&app_clone) {
                eprintln!("Failed to toggle panel via shortcut: {}", e);
            }
        })?;

    app.global_shortcut().register(shortcut)?;

    Ok(())
}

// ============================================================================
// Panel Control
// ============================================================================

fn toggle_panel_internal(app: &AppHandle) -> Result<bool, String> {
    let panel = app
        .get_webview_panel("menubar-panel")
        .map_err(|e| format!("{:?}", e))?;

    if panel.is_visible() {
        panel.hide();
        Ok(false)
    } else {
        // Position panel near tray before showing
        position_panel_near_tray(app);
        panel.show_and_make_key();
        Ok(true)
    }
}

fn position_panel_near_tray(app: &AppHandle) {
    // Get primary monitor dimensions
    if let Ok(monitors) = app.available_monitors() {
        if let Some(monitor) = monitors.first() {
            let screen_size = monitor.size();
            let scale = monitor.scale_factor();

            // Position in top-right area (typical menubar location)
            let x = (screen_size.width as f64 / scale) - PANEL_WIDTH - 20.0;
            let y = 30.0;

            // Update panel position via window handle if available
            if let Some(window) = app.get_webview_window("menubar-panel") {
                let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
            }
        }
    }
}

// ============================================================================
// Daemon Communication
// ============================================================================

fn start_daemon_polling(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .expect("Failed to create HTTP client");

        let mut last_connected = false;

        loop {
            let status = check_daemon_status(&client).await;
            let is_connected = status.connected;

            // Emit status change event if changed
            if is_connected != last_connected {
                let _ = app.emit("daemon-status-changed", &status);
                last_connected = is_connected;
            }

            // Emit periodic status updates
            let _ = app.emit("daemon-status", &status);

            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        }
    });
}

async fn check_daemon_status(client: &Client) -> DaemonStatus {
    match client
        .get(format!("{}/v1/health", DAEMON_URL))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            if let Ok(json) = response.json::<serde_json::Value>().await {
                DaemonStatus {
                    connected: true,
                    status: json
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("running")
                        .to_string(),
                    uptime: json.get("uptime").and_then(|v| v.as_u64()),
                    version: json
                        .get("version")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                }
            } else {
                DaemonStatus {
                    connected: true,
                    status: "running".to_string(),
                    uptime: None,
                    version: None,
                }
            }
        }
        _ => DaemonStatus {
            connected: false,
            status: "disconnected".to_string(),
            uptime: None,
            version: None,
        },
    }
}

async fn start_daemon_internal() -> Result<(), String> {
    let bun_path = crate::commands::which_bun().unwrap_or_else(|| "bun".to_string());

    std::process::Command::new(&bun_path)
        .args(["run", "src/cli/nikd.ts", "start"])
        .spawn()
        .map_err(|e| format!("Failed to start daemon: {}", e))?;

    // Wait for daemon to start
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    Ok(())
}

async fn stop_daemon_internal() -> Result<(), String> {
    let client = Client::new();

    // Try graceful shutdown
    match client
        .post(format!("{}/v1/shutdown", DAEMON_URL))
        .send()
        .await
    {
        Ok(_) => Ok(()),
        Err(_) => {
            // Force kill if graceful shutdown fails
            let _ = std::process::Command::new("pkill")
                .args(["-f", "nikd"])
                .output();
            Ok(())
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn get_daemon_status() -> Result<DaemonStatus, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    Ok(check_daemon_status(&client).await)
}

#[tauri::command]
pub async fn get_daemon_stats() -> Result<StatsResponse, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(format!("{}/v1/stats", DAEMON_URL))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch stats: {}", e))?;

    response
        .json::<StatsResponse>()
        .await
        .map_err(|e| format!("Failed to parse stats: {}", e))
}

#[tauri::command]
pub async fn get_recent_jobs(limit: Option<u32>) -> Result<JobsResponse, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let limit = limit.unwrap_or(10);

    let response = client
        .get(format!("{}/v1/jobs?limit={}", DAEMON_URL, limit))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch jobs: {}", e))?;

    response
        .json::<JobsResponse>()
        .await
        .map_err(|e| format!("Failed to parse jobs: {}", e))
}

#[tauri::command]
pub fn toggle_panel(app: AppHandle) -> Result<bool, String> {
    toggle_panel_internal(&app)
}

#[tauri::command]
pub fn hide_panel(app: AppHandle) -> Result<(), String> {
    let panel = app
        .get_webview_panel("menubar-panel")
        .map_err(|e| format!("{:?}", e))?;

    panel.hide();
    Ok(())
}

#[tauri::command]
pub async fn start_daemon() -> Result<(), String> {
    start_daemon_internal().await
}

#[tauri::command]
pub async fn stop_daemon() -> Result<(), String> {
    stop_daemon_internal().await
}

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))
}

#[tauri::command]
pub fn open_terminal(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
