/*!
 * Grep Tool - Production Ready
 */

use anyhow::Result;
use regex::Regex;
use std::path::Path;
use walkdir::WalkDir;

pub async fn grep_tool(pattern: &str, path: &str, case_sensitive: bool) -> Result<Vec<String>> {
    let regex = if case_sensitive {
        Regex::new(pattern)?
    } else {
        Regex::new(&format!("(?i){}", pattern))?
    };
    
    let mut matches = Vec::new();
    
    for entry in WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Ok(content) = tokio::fs::read_to_string(entry.path()).await {
                for (line_num, line) in content.lines().enumerate() {
                    if regex.is_match(line) {
                        matches.push(format!(
                            "{}:{}:{}",
                            entry.path().display(),
                            line_num + 1,
                            line
                        ));
                    }
                }
            }
        }
    }
    
    Ok(matches)
}

pub async fn find_files_tool(pattern: &str, root: &str) -> Result<Vec<String>> {
    let regex = Regex::new(pattern)?;
    let mut files = Vec::new();
    
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(filename) = entry.file_name().to_str() {
                if regex.is_match(filename) {
                    files.push(entry.path().display().to_string());
                }
            }
        }
    }
    
    Ok(files)
}

