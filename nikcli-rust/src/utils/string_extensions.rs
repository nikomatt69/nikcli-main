/*!
 * String Extensions - Production Ready
 * Utility extensions for string formatting and styling
 */

use colored::*;

/// String extension trait for additional formatting capabilities
pub trait StringExtensions {
    /// Pad string to specified width
    fn pad_to_width(&self, width: usize) -> String;

    /// Get gray colored string
    fn gray(&self) -> ColoredString;
}

impl StringExtensions for String {
    fn pad_to_width(&self, width: usize) -> String {
        format!("{:<width$}", self, width = width)
    }

    fn gray(&self) -> ColoredString {
        self.bright_black()
    }
}

impl StringExtensions for &str {
    fn pad_to_width(&self, width: usize) -> String {
        format!("{:<width$}", self, width = width)
    }

    fn gray(&self) -> ColoredString {
        self.bright_black()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pad_to_width() {
        let text = "hello".to_string();
        assert_eq!(text.pad_to_width(10), "hello     ");
    }

    #[test]
    fn test_gray() {
        let text = "test";
        let gray_text = text.gray();
        // Just ensure it doesn't panic and returns a ColoredString
        assert!(!gray_text.to_string().is_empty());
    }
}