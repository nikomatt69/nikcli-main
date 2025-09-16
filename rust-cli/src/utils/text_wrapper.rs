// Text wrapping utilities
use colored::Colorize;

pub struct TextWrapper {
    width: usize,
}

impl TextWrapper {
    pub fn new(width: usize) -> Self {
        Self { width }
    }

    pub fn wrap(&self, text: &str) -> String {
        let words: Vec<&str> = text.split_whitespace().collect();
        let mut lines = Vec::new();
        let mut current_line = String::new();

        for word in words {
            if current_line.len() + word.len() + 1 <= self.width {
                if !current_line.is_empty() {
                    current_line.push(' ');
                }
                current_line.push_str(word);
            } else {
                if !current_line.is_empty() {
                    lines.push(current_line);
                    current_line = word.to_string();
                } else {
                    // Word is longer than width, force it on its own line
                    lines.push(word.to_string());
                }
            }
        }

        if !current_line.is_empty() {
            lines.push(current_line);
        }

        lines.join("\n")
    }

    pub fn wrap_with_indent(&self, text: &str, indent: usize) -> String {
        let wrapped = self.wrap(text);
        let indent_str = " ".repeat(indent);
        
        wrapped
            .lines()
            .map(|line| format!("{}{}", indent_str, line))
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub fn wrap_colored(&self, text: &str, color: &str) -> String {
        let wrapped = self.wrap(text);
        
        wrapped
            .lines()
            .map(|line| {
                match color {
                    "red" => line.red().to_string(),
                    "green" => line.green().to_string(),
                    "blue" => line.blue().to_string(),
                    "yellow" => line.yellow().to_string(),
                    "cyan" => line.cyan().to_string(),
                    "magenta" => line.magenta().to_string(),
                    _ => line.to_string(),
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

impl Default for TextWrapper {
    fn default() -> Self {
        Self::new(80)
    }
}