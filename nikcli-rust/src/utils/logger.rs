/*!
 * Logger Utility
 * Production-ready logging system
 */

use colored::*;

pub struct Logger;

impl Logger {
    pub fn info(message: &str) {
        println!("{} {}", "INFO:".blue().bold(), message);
    }
    
    pub fn success(message: &str) {
        println!("{} {}", "✓".green().bold(), message);
    }
    
    pub fn warning(message: &str) {
        println!("{} {}", "⚠".yellow().bold(), message);
    }
    
    pub fn error(message: &str) {
        eprintln!("{} {}", "✗".red().bold(), message);
    }
    
    pub fn debug(message: &str) {
        if std::env::var("DEBUG").is_ok() {
            println!("{} {}", "DEBUG:".dimmed(), message);
        }
    }
}
