/*!
 * Diff Tool - Production Ready
 */

use anyhow::Result;
use similar::{ChangeTag, TextDiff};

pub async fn diff_files_tool(file1: &str, file2: &str) -> Result<String> {
    let content1 = tokio::fs::read_to_string(file1).await?;
    let content2 = tokio::fs::read_to_string(file2).await?;
    
    let diff = TextDiff::from_lines(&content1, &content2);
    
    let mut output = String::new();
    for change in diff.iter_all_changes() {
        let sign = match change.tag() {
            ChangeTag::Delete => "-",
            ChangeTag::Insert => "+",
            ChangeTag::Equal => " ",
        };
        output.push_str(&format!("{}{}", sign, change));
    }
    
    Ok(output)
}

pub async fn diff_strings_tool(text1: &str, text2: &str) -> Result<String> {
    let diff = TextDiff::from_lines(text1, text2);
    
    let mut output = String::new();
    for change in diff.iter_all_changes() {
        let sign = match change.tag() {
            ChangeTag::Delete => "-",
            ChangeTag::Insert => "+",
            ChangeTag::Equal => " ",
        };
        output.push_str(&format!("{}{}", sign, change));
    }
    
    Ok(output)
}

