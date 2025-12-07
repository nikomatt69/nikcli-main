use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;

pub struct PtyManager {
    pair: PtyPair,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

impl PtyManager {
    pub fn new(cols: u16, rows: u16) -> Result<Self, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        Ok(Self {
            pair,
            writer: Arc::new(Mutex::new(writer)),
        })
    }

    pub fn spawn_command(&self, cmd: &str, args: &[&str], cwd: Option<&str>) -> Result<(), String> {
        let mut command = CommandBuilder::new(cmd);
        command.args(args);

        if let Some(dir) = cwd {
            command.cwd(dir);
        } else if let Ok(current_dir) = std::env::current_dir() {
            command.cwd(current_dir);
        }

        // Set environment variables
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");

        // Inherit PATH and other important vars
        if let Ok(path) = std::env::var("PATH") {
            command.env("PATH", path);
        }
        if let Ok(home) = std::env::var("HOME") {
            command.env("HOME", home);
        }
        if let Ok(user) = std::env::var("USER") {
            command.env("USER", user);
        }

        self.pair
            .slave
            .spawn_command(command)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        self.writer
            .lock()
            .write_all(data)
            .map_err(|e| e.to_string())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    pub fn get_reader(&self) -> Result<Box<dyn Read + Send>, String> {
        self.pair
            .master
            .try_clone_reader()
            .map_err(|e| e.to_string())
    }
}
