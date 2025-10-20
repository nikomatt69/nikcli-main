/*!
 * Edit Tool - Production Ready
 */

use anyhow::Result;

pub async fn edit_file_tool(
    path: &str,
    old_text: &str,
    new_text: &str,
    replace_all: bool,
) -> Result<String> {
    let content = tokio::fs::read_to_string(path).await?;
    
    let new_content = if replace_all {
        content.replace(old_text, new_text)
    } else {
        content.replacen(old_text, new_text, 1)
    };
    
    tokio::fs::write(path, &new_content).await?;
    
    Ok(format!("File edited: {}", path))
}

pub async fn multi_edit_tool(
    edits: Vec<(String, String, String)>,
) -> Result<Vec<String>> {
    let mut results = Vec::new();
    
    for (path, old_text, new_text) in edits {
        match edit_file_tool(&path, &old_text, &new_text, false).await {
            Ok(msg) => results.push(msg),
            Err(e) => results.push(format!("Error editing {}: {}", path, e)),
        }
    }
    
    Ok(results)
}

