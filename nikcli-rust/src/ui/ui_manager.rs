use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use std::io::{self, Write};
use termimad::crossterm::style::Color;

/// UI Manager for consistent terminal output
pub struct UIManager {
    thinking_spinner: Option<ProgressBar>,
}

impl UIManager {
    /// Create a new UI manager
    pub fn new() -> Self {
        Self {
            thinking_spinner: None,
        }
    }

    /// Print an info message
    pub fn print_info(&self, message: &str) {
        println!("{} {}", "ℹ".bright_blue(), message);
    }

    /// Print a success message
    pub fn print_success(&self, message: &str) {
        println!("{} {}", "✓".bright_green(), message);
    }

    /// Print an error message
    pub fn print_error(&self, message: &str) {
        eprintln!("{} {}", "✗".bright_red(), message);
    }

    /// Print a warning message
    pub fn print_warning(&self, message: &str) {
        println!("{} {}", "⚠".bright_yellow(), message);
    }

    /// Print assistant message with formatting
    pub fn print_assistant_message(&self, message: &str) {
        println!();
        println!("{}", "Assistant:".bright_cyan().bold());
        println!("{}", "─".repeat(60).bright_black());

        // Simple markdown-like formatting
        for line in message.lines() {
            if line.starts_with("```") {
                println!("{}", line.bright_black());
            } else if line.starts_with('#') {
                println!("{}", line.bright_yellow().bold());
            } else if line.starts_with('-') || line.starts_with('*') {
                println!("  {}", line.bright_white());
            } else {
                println!("{}", line);
            }
        }

        println!("{}", "─".repeat(60).bright_black());
        println!();
    }

    /// Print user message
    pub fn print_user_message(&self, message: &str) {
        println!("{} {}", "You:".bright_green().bold(), message);
    }

    /// Show thinking indicator
    pub fn show_thinking(&mut self) {
        let pb = ProgressBar::new_spinner();
        pb.set_style(
            ProgressStyle::default_spinner()
                .template("{spinner:.cyan} {msg}")
                .unwrap()
                .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
        );
        pb.set_message("Thinking...");
        pb.enable_steady_tick(std::time::Duration::from_millis(80));
        self.thinking_spinner = Some(pb);
    }

    /// Hide thinking indicator
    pub fn hide_thinking(&mut self) {
        if let Some(pb) = self.thinking_spinner.take() {
            pb.finish_and_clear();
        }
    }

    /// Create a progress bar
    pub fn create_progress_bar(&self, total: u64, message: &str) -> ProgressBar {
        let pb = ProgressBar::new(total);
        pb.set_style(
            ProgressStyle::default_bar()
                .template("{msg} [{bar:40.cyan/blue}] {pos}/{len} ({percent}%)")
                .unwrap()
                .progress_chars("█▓▒░"),
        );
        pb.set_message(message.to_string());
        pb
    }

    /// Print a section header
    pub fn print_section(&self, title: &str) {
        println!();
        println!("{}", title.bright_cyan().bold());
        println!("{}", "═".repeat(60).bright_black());
    }

    /// Print a subsection header
    pub fn print_subsection(&self, title: &str) {
        println!();
        println!("{}", title.bright_white().bold());
        println!("{}", "─".repeat(40).bright_black());
    }

    /// Print a key-value pair
    pub fn print_kv(&self, key: &str, value: &str) {
        println!("  {} {}", format!("{}:", key).bright_white(), value.bright_yellow());
    }

    /// Print a bullet point
    pub fn print_bullet(&self, text: &str) {
        println!("  {} {}", "•".bright_blue(), text);
    }

    /// Print a numbered item
    pub fn print_numbered(&self, number: usize, text: &str) {
        println!("  {} {}", format!("{}.", number).bright_yellow(), text);
    }

    /// Clear the screen
    pub fn clear_screen(&self) {
        print!("\x1B[2J\x1B[1;1H");
        io::stdout().flush().unwrap();
    }

    /// Print a divider
    pub fn print_divider(&self) {
        println!("{}", "─".repeat(60).bright_black());
    }

    /// Print a box around text
    pub fn print_box(&self, title: &str, content: &[&str]) {
        let max_len = content
            .iter()
            .map(|s| s.len())
            .max()
            .unwrap_or(0)
            .max(title.len());

        println!("╭─{}─╮", "─".repeat(max_len + 2));
        println!("│ {} │", title.bright_cyan().bold());
        println!("├─{}─┤", "─".repeat(max_len + 2));

        for line in content {
            let padding = " ".repeat(max_len - line.len());
            println!("│ {}{} │", line, padding);
        }

        println!("╰─{}─╯", "─".repeat(max_len + 2));
    }
}

impl Default for UIManager {
    fn default() -> Self {
        Self::new()
    }
}
