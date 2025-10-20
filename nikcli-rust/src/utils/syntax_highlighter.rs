/*!
 * Syntax Highlighter - Production Ready
 */

use syntect::easy::HighlightLines;
use syntect::highlighting::{Style, ThemeSet};
use syntect::parsing::SyntaxSet;
use syntect::util::as_24_bit_terminal_escaped;

pub struct SyntaxHighlighter {
    syntax_set: SyntaxSet,
    theme_set: ThemeSet,
}

impl SyntaxHighlighter {
    pub fn new() -> Self {
        Self {
            syntax_set: SyntaxSet::load_defaults_newlines(),
            theme_set: ThemeSet::load_defaults(),
        }
    }
    
    pub fn highlight(&self, code: &str, language: &str) -> String {
        let syntax = self.syntax_set
            .find_syntax_by_extension(language)
            .unwrap_or_else(|| self.syntax_set.find_syntax_plain_text());
        
        let theme = &self.theme_set.themes["base16-ocean.dark"];
        let mut highlighter = HighlightLines::new(syntax, theme);
        
        let mut output = String::new();
        for line in code.lines() {
            let ranges = highlighter.highlight_line(line, &self.syntax_set).unwrap();
            output.push_str(&as_24_bit_terminal_escaped(&ranges[..], false));
            output.push('\n');
        }
        
        output
    }
}

impl Default for SyntaxHighlighter {
    fn default() -> Self {
        Self::new()
    }
}

