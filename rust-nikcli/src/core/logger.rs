use tracing::{debug, error, info, warn};
use tracing_subscriber::{fmt, EnvFilter};

/// Logger configuration and utilities
pub struct Logger {
    console_output: bool,
}

impl Logger {
    /// Create a new logger instance
    pub fn new() -> Self {
        Self {
            console_output: true,
        }
    }
    
    /// Set console output enabled/disabled
    pub fn set_console_output(&mut self, enabled: bool) {
        self.console_output = enabled;
    }
    
    /// Check if console output is enabled
    pub fn is_console_output_enabled(&self) -> bool {
        self.console_output
    }
    
    /// Log an info message
    pub fn info(&self, message: &str) {
        if self.console_output {
            info!("{}", message);
        }
    }
    
    /// Log a warning message
    pub fn warn(&self, message: &str) {
        if self.console_output {
            warn!("{}", message);
        }
    }
    
    /// Log an error message
    pub fn error(&self, message: &str) {
        if self.console_output {
            error!("{}", message);
        }
    }
    
    /// Log a debug message
    pub fn debug(&self, message: &str) {
        if self.console_output {
            debug!("{}", message);
        }
    }
}

impl Default for Logger {
    fn default() -> Self {
        Self::new()
    }
}

/// Global logger instance
static mut LOGGER: Option<Logger> = None;

/// Get the global logger instance
pub fn get_logger() -> &'static mut Logger {
    unsafe {
        if LOGGER.is_none() {
            LOGGER = Some(Logger::new());
        }
        LOGGER.as_mut().unwrap()
    }
}

/// Initialize the logging system
pub fn init_logging(verbose: bool) -> Result<(), Box<dyn std::error::Error>> {
    let level = if verbose { "debug" } else { "info" };
    
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(format!("nikcli={}", level)));
    
    fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_thread_ids(false)
        .with_thread_names(false)
        .init();
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_logger_creation() {
        let logger = Logger::new();
        assert!(logger.is_console_output_enabled());
    }
    
    #[test]
    fn test_logger_console_output_toggle() {
        let mut logger = Logger::new();
        logger.set_console_output(false);
        assert!(!logger.is_console_output_enabled());
        
        logger.set_console_output(true);
        assert!(logger.is_console_output_enabled());
    }
    
    #[test]
    fn test_global_logger() {
        let logger = get_logger();
        assert!(logger.is_console_output_enabled());
    }
}