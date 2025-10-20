/*!
 * Web3 Provider - Base interface wrappers
 */

use anyhow::Result;

#[derive(Debug, Clone)]
pub struct Web3Provider {
    pub project_id: Option<String>,
}

impl Web3Provider {
    pub fn new(project_id: Option<String>) -> Self { Self { project_id } }

    pub fn is_configured(&self) -> bool { self.project_id.is_some() }
}

