/*!
 * Memory Service
 * Conversation history and context management
 */

use anyhow::Result;

pub struct MemoryService;

impl MemoryService {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn initialize(&self) -> Result<()> {
        Ok(())
    }
}

impl Default for MemoryService {
    fn default() -> Self {
        Self::new()
    }
}

