/*!
 * Context Manager
 * Production-ready context aggregation and management
 */

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::WorkspaceContext;

/// Context entry with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub priority: u8,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Context Manager for centralized context handling
pub struct ContextManager {
    workspace_context: Arc<WorkspaceContext>,
    context_store: Arc<RwLock<HashMap<String, ContextEntry>>>,
}

impl ContextManager {
    pub fn new(workspace_context: Arc<WorkspaceContext>) -> Self {
        Self {
            workspace_context,
            context_store: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Add context entry
    pub async fn add_context(&self, key: String, value: serde_json::Value, priority: u8) {
        let entry = ContextEntry {
            key: key.clone(),
            value,
            priority,
            timestamp: chrono::Utc::now(),
        };
        
        self.context_store.write().await.insert(key, entry);
    }
    
    /// Get context entry
    pub async fn get_context(&self, key: &str) -> Option<ContextEntry> {
        self.context_store.read().await.get(key).cloned()
    }
    
    /// Get all context entries sorted by priority
    pub async fn get_all_context(&self) -> Vec<ContextEntry> {
        let store = self.context_store.read().await;
        let mut entries: Vec<_> = store.values().cloned().collect();
        entries.sort_by(|a, b| b.priority.cmp(&a.priority));
        entries
    }
    
    /// Clear all context
    pub async fn clear(&self) {
        self.context_store.write().await.clear();
    }
    
    /// Get workspace context
    pub fn workspace_context(&self) -> Arc<WorkspaceContext> {
        self.workspace_context.clone()
    }
}

