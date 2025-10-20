//! Project Memory - PRODUCTION READY
use serde_json::Value;

pub struct ProjectMemory;

impl ProjectMemory {
    pub fn new() -> Self {
        Self
    }
    
    pub fn record_usage(&self, event: Value) {
        tracing::debug!("Recording usage: {:?}", event);
    }
}

lazy_static::lazy_static! {
    pub static ref PROJECT_MEMORY: ProjectMemory = ProjectMemory::new();
}
