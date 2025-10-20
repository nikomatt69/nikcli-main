/*!
 * Git Integration - Production Ready
 */

use anyhow::Result;
use git2::Repository;
use std::path::Path;

pub struct GitIntegration;

impl GitIntegration {
    pub fn new() -> Self {
        Self
    }
    
    pub fn open_repository(&self, path: &Path) -> Result<Repository> {
        let repo = Repository::open(path)?;
        Ok(repo)
    }
    
    pub async fn get_status(&self, path: &Path) -> Result<String> {
        let repo = self.open_repository(path)?;
        let statuses = repo.statuses(None)?;
        
        Ok(format!("Git status: {} changes", statuses.len()))
    }
}

impl Default for GitIntegration {
    fn default() -> Self {
        Self::new()
    }
}

