/*!
 * Diff Viewer - Production Ready
 */

use colored::*;
use similar::{ChangeTag, TextDiff};

pub struct DiffViewer;

impl DiffViewer {
    pub fn new() -> Self {
        Self
    }
    
    pub fn render_diff(&self, old_content: &str, new_content: &str) -> String {
        let diff = TextDiff::from_lines(old_content, new_content);
        
        let mut output = String::new();
        for change in diff.iter_all_changes() {
            let line = match change.tag() {
                ChangeTag::Delete => format!("{}", change.to_string().red()),
                ChangeTag::Insert => format!("{}", change.to_string().green()),
                ChangeTag::Equal => change.to_string(),
            };
            output.push_str(&line);
        }
        
        output
    }
}

impl Default for DiffViewer {
    fn default() -> Self {
        Self::new()
    }
}

