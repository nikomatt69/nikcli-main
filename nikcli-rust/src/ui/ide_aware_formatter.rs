/*!
 * IDE Aware Formatter - Production Ready
 */

use colored::*;

pub struct IDEAwareFormatter;

impl IDEAwareFormatter {
    pub fn new() -> Self {
        Self
    }
    
    pub fn format_code(&self, code: &str, language: &str) -> String {
        format!("```{}\n{}\n```", language, code)
    }
    
    pub fn format_error(&self, error: &str) -> String {
        format!("{} {}", "ERROR:".red().bold(), error)
    }
    
    pub fn format_success(&self, message: &str) -> String {
        format!("{} {}", "✓".green().bold(), message)
    }
}

impl Default for IDEAwareFormatter {
    fn default() -> Self {
        Self::new()
    }
}

