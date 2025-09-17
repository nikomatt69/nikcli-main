use colored::*;

/// Format text with colors and styling
pub struct TextFormatter;

impl TextFormatter {
    /// Format success message
    pub fn success(message: &str) -> String {
        format!("✓ {}", message).green().to_string()
    }
    
    /// Format error message
    pub fn error(message: &str) -> String {
        format!("✗ {}", message).red().to_string()
    }
    
    /// Format warning message
    pub fn warning(message: &str) -> String {
        format!("⚠ {}", message).yellow().to_string()
    }
    
    /// Format info message
    pub fn info(message: &str) -> String {
        format!("ℹ {}", message).blue().to_string()
    }
    
    /// Format code block
    pub fn code(code: &str) -> String {
        format!("```\n{}\n```", code).dim().to_string()
    }
    
    /// Format inline code
    pub fn inline_code(code: &str) -> String {
        format!("`{}`", code).cyan().to_string()
    }
    
    /// Format file path
    pub fn file_path(path: &str) -> String {
        path.blue().underline().to_string()
    }
    
    /// Format command
    pub fn command(cmd: &str) -> String {
        format!("`{}`", cmd).green().to_string()
    }
    
    /// Format agent name
    pub fn agent(name: &str) -> String {
        format!("🤖 {}", name).cyan().bold().to_string()
    }
    
    /// Format model name
    pub fn model(name: &str) -> String {
        name.magenta().bold().to_string()
    }
    
    /// Format provider name
    pub fn provider(name: &str) -> String {
        name.yellow().to_string()
    }
}

/// Text wrapping utilities
pub struct TextWrapper {
    width: usize,
}

impl TextWrapper {
    /// Create a new text wrapper with specified width
    pub fn new(width: usize) -> Self {
        Self { width }
    }
    
    /// Wrap text to specified width
    pub fn wrap(&self, text: &str) -> String {
        textwrap::wrap(text, self.width).join("\n")
    }
    
    /// Wrap text with indentation
    pub fn wrap_indent(&self, text: &str, indent: usize) -> String {
        let wrapped = self.wrap(text);
        let indent_str = " ".repeat(indent);
        wrapped.lines()
            .map(|line| format!("{}{}", indent_str, line))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

impl Default for TextWrapper {
    fn default() -> Self {
        Self::new(80)
    }
}

/// Progress bar utilities
pub struct ProgressDisplay {
    current: usize,
    total: usize,
    width: usize,
}

impl ProgressDisplay {
    /// Create a new progress display
    pub fn new(total: usize) -> Self {
        Self {
            current: 0,
            total,
            width: 50,
        }
    }
    
    /// Update progress
    pub fn update(&mut self, current: usize) {
        self.current = current.min(self.total);
    }
    
    /// Display progress bar
    pub fn display(&self) -> String {
        let percentage = (self.current as f64 / self.total as f64 * 100.0) as usize;
        let filled = (self.current * self.width) / self.total;
        let empty = self.width - filled;
        
        let bar = format!(
            "[{}{}] {}%",
            "█".repeat(filled),
            "░".repeat(empty),
            percentage
        );
        
        bar.green().to_string()
    }
}

/// Table formatting utilities
pub struct TableFormatter {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
    column_widths: Vec<usize>,
}

impl TableFormatter {
    /// Create a new table formatter
    pub fn new(headers: Vec<&str>) -> Self {
        let headers: Vec<String> = headers.iter().map(|s| s.to_string()).collect();
        let column_widths = headers.iter().map(|h| h.len()).collect();
        
        Self {
            headers,
            rows: Vec::new(),
            column_widths,
        }
    }
    
    /// Add a row to the table
    pub fn add_row(&mut self, row: Vec<&str>) {
        let row: Vec<String> = row.iter().map(|s| s.to_string()).collect();
        
        // Update column widths
        for (i, cell) in row.iter().enumerate() {
            if i < self.column_widths.len() {
                self.column_widths[i] = self.column_widths[i].max(cell.len());
            }
        }
        
        self.rows.push(row);
    }
    
    /// Format the table as a string
    pub fn format(&self) -> String {
        let mut result = String::new();
        
        // Format header
        result.push_str(&self.format_row(&self.headers, true));
        result.push('\n');
        
        // Format separator
        let separator = self.column_widths.iter()
            .map(|&width| "─".repeat(width))
            .collect::<Vec<_>>()
            .join("─┬─");
        result.push_str(&format!("─{}─\n", separator));
        
        // Format rows
        for row in &self.rows {
            result.push_str(&self.format_row(row, false));
            result.push('\n');
        }
        
        result
    }
    
    /// Format a single row
    fn format_row(&self, row: &[String], is_header: bool) -> String {
        let formatted_cells: Vec<String> = row.iter()
            .enumerate()
            .map(|(i, cell)| {
                let width = if i < self.column_widths.len() {
                    self.column_widths[i]
                } else {
                    cell.len()
                };
                
                let formatted = if is_header {
                    format!("{:^width$}", cell).bold().to_string()
                } else {
                    format!("{:<width$}", cell)
                };
                
                formatted
            })
            .collect();
        
        format!("│ {} │", formatted_cells.join(" │ "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_text_formatter() {
        assert!(TextFormatter::success("Test").contains("✓"));
        assert!(TextFormatter::error("Test").contains("✗"));
        assert!(TextFormatter::warning("Test").contains("⚠"));
        assert!(TextFormatter::info("Test").contains("ℹ"));
    }
    
    #[test]
    fn test_text_wrapper() {
        let wrapper = TextWrapper::new(20);
        let text = "This is a very long text that should be wrapped to multiple lines";
        let wrapped = wrapper.wrap(text);
        assert!(wrapped.contains('\n'));
    }
    
    #[test]
    fn test_progress_display() {
        let mut progress = ProgressDisplay::new(100);
        progress.update(50);
        let display = progress.display();
        assert!(display.contains("50%"));
    }
    
    #[test]
    fn test_table_formatter() {
        let mut table = TableFormatter::new(vec!["Name", "Age"]);
        table.add_row(vec!["Alice", "25"]);
        table.add_row(vec!["Bob", "30"]);
        
        let formatted = table.format();
        assert!(formatted.contains("Name"));
        assert!(formatted.contains("Alice"));
        assert!(formatted.contains("Bob"));
    }
}