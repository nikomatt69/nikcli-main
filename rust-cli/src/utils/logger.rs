// Logger utility module
use chrono::{DateTime, Utc};
use colored::Colorize;
use std::io::{self, Write};

pub struct Logger {
    level: LogLevel,
}

#[derive(Debug, Clone, Copy)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl Logger {
    pub fn new(level: LogLevel) -> Self {
        Self { level }
    }

    pub fn debug(&self, message: &str) {
        if matches!(self.level, LogLevel::Debug) {
            println!("{} {}", "[DEBUG]".blue(), message);
        }
    }

    pub fn info(&self, message: &str) {
        if matches!(self.level, LogLevel::Debug | LogLevel::Info) {
            println!("{} {}", "[INFO]".green(), message);
        }
    }

    pub fn warn(&self, message: &str) {
        if matches!(self.level, LogLevel::Debug | LogLevel::Info | LogLevel::Warn) {
            println!("{} {}", "[WARN]".yellow(), message);
        }
    }

    pub fn error(&self, message: &str) {
        println!("{} {}", "[ERROR]".red(), message);
    }
}

impl Default for Logger {
    fn default() -> Self {
        Self::new(LogLevel::Info)
    }
}