/*!
 * LSP Service
 * Language Server Protocol integration
 */

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct LspService {
    working_directory: Arc<RwLock<String>>,
    initialized: Arc<RwLock<bool>>,
}

impl LspService {
    pub fn new() -> Self {
        Self {
            working_directory: Arc::new(RwLock::new(
                std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string()
            )),
            initialized: Arc::new(RwLock::new(false)),
        }
    }
    
    pub async fn initialize(&self) -> Result<()> {
        let mut init = self.initialized.write().await;
        if *init {
            return Ok(());
        }
        
        *init = true;
        Ok(())
    }
    
    pub async fn set_working_directory(&self, dir: String) {
        let mut wd = self.working_directory.write().await;
        *wd = dir;
    }
}

impl Default for LspService {
    fn default() -> Self {
        Self::new()
    }
}
