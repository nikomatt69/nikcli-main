/*!
 * Logger - Production Ready
 * Core logging system
 */

use colored::*;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub struct Logger {
    console_output: Arc<AtomicBool>,
}

impl Logger {
    pub fn new() -> Self {
        Self {
            console_output: Arc::new(AtomicBool::new(true)),
        }
    }
    
    pub fn set_console_output(&self, enabled: bool) {
        self.console_output.store(enabled, Ordering::Relaxed);
    }
    
    pub fn info(&self, message: &str) {
        if self.console_output.load(Ordering::Relaxed) {
            println!("{} {}", "INFO:".blue().bold(), message);
        }
        tracing::info!("{}", message);
    }
    
    pub fn success(&self, message: &str) {
        if self.console_output.load(Ordering::Relaxed) {
            println!("{} {}", "✓".green().bold(), message);
        }
        tracing::info!("{}", message);
    }
    
    pub fn warning(&self, message: &str) {
        if self.console_output.load(Ordering::Relaxed) {
            println!("{} {}", "⚠".yellow().bold(), message);
        }
        tracing::warn!("{}", message);
    }
    
    pub fn error(&self, message: &str) {
        if self.console_output.load(Ordering::Relaxed) {
            eprintln!("{} {}", "✗".red().bold(), message);
        }
        tracing::error!("{}", message);
    }
    
    pub fn debug(&self, message: &str) {
        if std::env::var("DEBUG").is_ok() && self.console_output.load(Ordering::Relaxed) {
            println!("{} {}", "DEBUG:".dimmed(), message);
        }
        tracing::debug!("{}", message);
    }
}

impl Default for Logger {
    fn default() -> Self {
        Self::new()
    }
}
