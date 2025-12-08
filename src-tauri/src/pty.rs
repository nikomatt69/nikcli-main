use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::io::{Read, Write};

pub struct PtyManager {
    pair: PtyPair,
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
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        Ok(Self { pair })
    }

    pub fn spawn_command(
        &self,
        program: &str,
        args: &[&str],
        cwd: Option<&str>,
    ) -> Result<(), String> {
        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);

        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        // Set environment
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        self.pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        Ok(())
    }

    pub fn write(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self
            .pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get writer: {}", e))?;

        writer
            .write_all(data)
            .map_err(|e| format!("Failed to write: {}", e))?;

        Ok(())
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
            .map_err(|e| format!("Failed to resize: {}", e))
    }

    pub fn get_reader(&self) -> Result<Box<dyn Read + Send>, String> {
        self.pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))
    }
}
