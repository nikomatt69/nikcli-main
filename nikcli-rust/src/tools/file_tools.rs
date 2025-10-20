/*!
 * File Tools
 * Production-ready file operation tools
 */

use anyhow::Result;
use std::path::Path;

pub async fn read_file_tool(path: &str) -> Result<String> {
    let content = tokio::fs::read_to_string(path).await?;
    Ok(content)
}

pub async fn write_file_tool(path: &str, content: &str) -> Result<()> {
    if let Some(parent) = Path::new(path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(path, content).await?;
    Ok(())
}

pub async fn list_files_tool(path: &str) -> Result<Vec<String>> {
    let mut files = Vec::new();
    let mut entries = tokio::fs::read_dir(path).await?;
    
    while let Some(entry) = entries.next_entry().await? {
        if let Some(filename) = entry.file_name().to_str() {
            files.push(filename.to_string());
        }
    }
    
    Ok(files)
}

