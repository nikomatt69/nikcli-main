// CLI UI utilities
use colored::Colorize;
use std::io::{self, Write};

pub struct CliUI;

impl CliUI {
    pub fn print_header(title: &str) {
        let border = "=".repeat(title.len() + 4);
        println!("{}", border.cyan());
        println!("  {}", title.cyan().bold());
        println!("{}", border.cyan());
    }

    pub fn print_section(title: &str) {
        println!("\n{}", title.yellow().bold());
        println!("{}", "-".repeat(title.len()).yellow());
    }

    pub fn print_success(message: &str) {
        println!("{} {}", "✓".green(), message.green());
    }

    pub fn print_error(message: &str) {
        println!("{} {}", "✗".red(), message.red());
    }

    pub fn print_warning(message: &str) {
        println!("{} {}", "⚠".yellow(), message.yellow());
    }

    pub fn print_info(message: &str) {
        println!("{} {}", "ℹ".blue(), message.blue());
    }

    pub fn print_progress(current: usize, total: usize, message: &str) {
        let percentage = (current as f32 / total as f32 * 100.0) as usize;
        let bar_length = 30;
        let filled_length = (current as f32 / total as f32 * bar_length as f32) as usize;
        
        let bar = format!(
            "{}{}",
            "█".repeat(filled_length),
            "░".repeat(bar_length - filled_length)
        );
        
        print!("\r{} [{}] {}% {}", 
               message.cyan(), 
               bar.cyan(), 
               percentage.to_string().cyan(), 
               format!("({}/{})", current, total).cyan()
        );
        io::stdout().flush().unwrap();
        
        if current == total {
            println!();
        }
    }

    pub fn print_table(headers: &[&str], rows: &[Vec<String>]) {
        if headers.is_empty() || rows.is_empty() {
            return;
        }

        // Calculate column widths
        let mut widths = vec![0; headers.len()];
        for (i, header) in headers.iter().enumerate() {
            widths[i] = header.len();
        }
        
        for row in rows {
            for (i, cell) in row.iter().enumerate() {
                if i < widths.len() {
                    widths[i] = widths[i].max(cell.len());
                }
            }
        }

        // Print header
        print!("┌");
        for (i, width) in widths.iter().enumerate() {
            if i > 0 {
                print!("┬");
            }
            print!("{}", "─".repeat(*width + 2));
        }
        println!("┐");

        print!("│");
        for (i, header) in headers.iter().enumerate() {
            if i > 0 {
                print!("│");
            }
            print!(" {} ", header.bold());
            if header.len() < widths[i] {
                print!("{}", " ".repeat(widths[i] - header.len()));
            }
        }
        println!("│");

        print!("├");
        for (i, width) in widths.iter().enumerate() {
            if i > 0 {
                print!("┼");
            }
            print!("{}", "─".repeat(*width + 2));
        }
        println!("┤");

        // Print rows
        for row in rows {
            print!("│");
            for (i, cell) in row.iter().enumerate() {
                if i > 0 {
                    print!("│");
                }
                print!(" {} ", cell);
                if cell.len() < widths[i] {
                    print!("{}", " ".repeat(widths[i] - cell.len()));
                }
            }
            println!("│");
        }

        print!("└");
        for (i, width) in widths.iter().enumerate() {
            if i > 0 {
                print!("┴");
            }
            print!("{}", "─".repeat(*width + 2));
        }
        println!("┘");
    }

    pub fn print_list(items: &[String], title: Option<&str>) {
        if let Some(title) = title {
            println!("{}", title.bold());
        }
        
        for (i, item) in items.iter().enumerate() {
            println!("  {}. {}", i + 1, item);
        }
    }

    pub fn print_key_value(key: &str, value: &str) {
        println!("{}: {}", key.bold(), value);
    }

    pub fn print_separator() {
        println!("{}", "─".repeat(50).dimmed());
    }

    pub fn clear_screen() {
        print!("\x1B[2J\x1B[1;1H");
        io::stdout().flush().unwrap();
    }

    pub fn hide_cursor() {
        print!("\x1B[?25l");
        io::stdout().flush().unwrap();
    }

    pub fn show_cursor() {
        print!("\x1B[?25h");
        io::stdout().flush().unwrap();
    }
}