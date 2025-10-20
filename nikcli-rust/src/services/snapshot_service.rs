/*!
 * Snapshot Service
 * State persistence and rollback capabilities
 */

use anyhow::Result;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Snapshot metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub file_count: usize,
    pub total_size: u64,
}

/// Snapshot Service for state management
pub struct SnapshotService {
    snapshots: Arc<DashMap<String, Snapshot>>,
    snapshot_dir: Arc<RwLock<String>>,
    initialized: Arc<RwLock<bool>>,
}

impl SnapshotService {
    pub fn new() -> Self {
        Self {
            snapshots: Arc::new(DashMap::new()),
            snapshot_dir: Arc::new(RwLock::new(".nikcli/snapshots".to_string())),
            initialized: Arc::new(RwLock::new(false)),
        }
    }
    
    pub async fn initialize(&self) -> Result<()> {
        let mut init = self.initialized.write().await;
        if *init {
            return Ok(());
        }
        
        // Create snapshot directory
        let snapshot_dir = self.snapshot_dir.read().await;
        tokio::fs::create_dir_all(snapshot_dir.as_str()).await?;
        
        *init = true;
        Ok(())
    }
    
    pub async fn create_snapshot(&self, name: String, description: String) -> Result<Snapshot> {
        let snapshot = Snapshot {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            created_at: chrono::Utc::now(),
            file_count: 0,
            total_size: 0,
        };
        
        self.snapshots.insert(snapshot.id.clone(), snapshot.clone());
        
        Ok(snapshot)
    }
    
    pub async fn list_snapshots(&self) -> Vec<Snapshot> {
        self.snapshots.iter().map(|entry| entry.value().clone()).collect()
    }
    
    pub async fn get_snapshot(&self, id: &str) -> Option<Snapshot> {
        self.snapshots.get(id).map(|s| s.clone())
    }
    
    pub async fn delete_snapshot(&self, id: &str) -> Result<()> {
        self.snapshots.remove(id);
        Ok(())
    }
}

impl Default for SnapshotService {
    fn default() -> Self {
        Self::new()
    }
}

