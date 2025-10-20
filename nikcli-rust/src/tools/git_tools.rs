/*!
 * Git Tools - Production Ready
 */

use anyhow::Result;
use git2::Repository;
use std::path::Path;

pub async fn git_status_tool(path: &str) -> Result<String> {
    let repo = Repository::open(path)?;
    let statuses = repo.statuses(None)?;
    
    let mut output = String::new();
    for entry in statuses.iter() {
        if let Some(path) = entry.path() {
            output.push_str(&format!("{}\n", path));
        }
    }
    
    Ok(output)
}

pub async fn git_diff_tool(path: &str) -> Result<String> {
    let repo = Repository::open(path)?;
    let head = repo.head()?;
    let tree = head.peel_to_tree()?;
    
    let diff = repo.diff_tree_to_workdir_with_index(Some(&tree), None)?;
    
    let mut output = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })?;
    
    Ok(output)
}

pub async fn git_log_tool(path: &str, max_count: usize) -> Result<Vec<String>> {
    let repo = Repository::open(path)?;
    let mut revwalk = repo.revwalk()?;
    revwalk.push_head()?;
    
    let mut commits = Vec::new();
    for (i, oid) in revwalk.enumerate() {
        if i >= max_count {
            break;
        }
        
        if let Ok(oid) = oid {
            if let Ok(commit) = repo.find_commit(oid) {
                commits.push(format!(
                    "{} - {}",
                    commit.id(),
                    commit.message().unwrap_or("No message")
                ));
            }
        }
    }
    
    Ok(commits)
}

