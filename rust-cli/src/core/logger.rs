use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{info, warn, error, debug, trace};
use chrono::{DateTime, Utc};

/// Logger implementation for NikCLI
pub struct Logger {
    console_output: Arc<AtomicBool>,
    log_level: LogLevel,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Error => write!(f, "ERROR"),
            LogLevel::Warn => write!(f, "WARN"),
            LogLevel::Info => write!(f, "INFO"),
            LogLevel::Debug => write!(f, "DEBUG"),
            LogLevel::Trace => write!(f, "TRACE"),
        }
    }
}

impl Logger {
    pub fn new() -> Self {
        Self {
            console_output: Arc::new(AtomicBool::new(true)),
            log_level: LogLevel::Info,
        }
    }

    pub fn set_console_output(&self, enabled: bool) {
        self.console_output.store(enabled, Ordering::Relaxed);
    }

    pub fn set_log_level(&mut self, level: LogLevel) {
        self.log_level = level;
    }

    pub fn log(&self, level: LogLevel, message: &str) {
        if self.should_log(&level) {
            let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S%.3f");
            let output = format!("[{}] {}: {}", timestamp, level, message);
            
            if self.console_output.load(Ordering::Relaxed) {
                match level {
                    LogLevel::Error => error!("{}", output),
                    LogLevel::Warn => warn!("{}", output),
                    LogLevel::Info => info!("{}", output),
                    LogLevel::Debug => debug!("{}", output),
                    LogLevel::Trace => trace!("{}", output),
                }
            }
        }
    }

    pub fn error(&self, message: &str) {
        self.log(LogLevel::Error, message);
    }

    pub fn warn(&self, message: &str) {
        self.log(LogLevel::Warn, message);
    }

    pub fn info(&self, message: &str) {
        self.log(LogLevel::Info, message);
    }

    pub fn debug(&self, message: &str) {
        self.log(LogLevel::Debug, message);
    }

    pub fn trace(&self, message: &str) {
        self.log(LogLevel::Trace, message);
    }

    fn should_log(&self, level: &LogLevel) -> bool {
        match (&self.log_level, level) {
            (LogLevel::Error, LogLevel::Error) => true,
            (LogLevel::Warn, LogLevel::Error | LogLevel::Warn) => true,
            (LogLevel::Info, LogLevel::Error | LogLevel::Warn | LogLevel::Info) => true,
            (LogLevel::Debug, LogLevel::Error | LogLevel::Warn | LogLevel::Info | LogLevel::Debug) => true,
            (LogLevel::Trace, _) => true,
            _ => false,
        }
    }
}

impl Default for Logger {
    fn default() -> Self {
        Self::new()
    }
}

/// Global logger instance
static mut GLOBAL_LOGGER: Option<Logger> = None;
static INIT: std::sync::Once = std::sync::Once::new();

/// Initialize global logger
pub fn init_global_logger() {
    unsafe {
        INIT.call_once(|| {
            GLOBAL_LOGGER = Some(Logger::new());
        });
    }
}

/// Get global logger instance
pub fn get_global_logger() -> &'static Logger {
    unsafe {
        GLOBAL_LOGGER.as_ref().expect("Logger not initialized")
    }
}

/// Set console output for global logger
pub fn set_console_output(enabled: bool) {
    let logger = get_global_logger();
    logger.set_console_output(enabled);
}

/// Log error message
pub fn log_error(message: &str) {
    let logger = get_global_logger();
    logger.error(message);
}

/// Log warning message
pub fn log_warn(message: &str) {
    let logger = get_global_logger();
    logger.warn(message);
}

/// Log info message
pub fn log_info(message: &str) {
    let logger = get_global_logger();
    logger.info(message);
}

/// Log debug message
pub fn log_debug(message: &str) {
    let logger = get_global_logger();
    logger.debug(message);
}

/// Log trace message
pub fn log_trace(message: &str) {
    let logger = get_global_logger();
    logger.trace(message);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_logger_creation() {
        let logger = Logger::new();
        assert_eq!(logger.log_level, LogLevel::Info);
    }

    #[test]
    fn test_log_levels() {
        let mut logger = Logger::new();
        logger.set_log_level(LogLevel::Debug);
        assert_eq!(logger.log_level, LogLevel::Debug);
    }

    #[test]
    fn test_should_log() {
        let mut logger = Logger::new();
        logger.set_log_level(LogLevel::Info);
        
        assert!(logger.should_log(&LogLevel::Error));
        assert!(logger.should_log(&LogLevel::Warn));
        assert!(logger.should_log(&LogLevel::Info));
        assert!(!logger.should_log(&LogLevel::Debug));
        assert!(!logger.should_log(&LogLevel::Trace));
    }
}