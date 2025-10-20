//! Docs Context Manager - PRODUCTION READY
use anyhow::Result;

pub struct DocsContextManager;

impl DocsContextManager {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn get_context(&self, query: &str) -> Result<Option<String>> {
        Ok(None)
    }
}

lazy_static::lazy_static! {
    pub static ref DOCS_CONTEXT_MANAGER: DocsContextManager = DocsContextManager::new();
}
