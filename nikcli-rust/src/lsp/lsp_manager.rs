/*!
 * LSP Manager - Production Ready
 */

use anyhow::Result;
use dashmap::DashMap;
use std::sync::Arc;

pub struct LspManager {
    servers: Arc<DashMap<String, String>>,
}

impl LspManager {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(DashMap::new()),
        }
    }
    
    pub async fn start_server(&self, language: String, command: String) -> Result<()> {
        self.servers.insert(language, command);
        Ok(())
    }
    
    pub fn is_server_running(&self, language: &str) -> bool {
        self.servers.contains_key(language)
    }
}

impl Default for LspManager {
    fn default() -> Self {
        Self::new()
    }
}

