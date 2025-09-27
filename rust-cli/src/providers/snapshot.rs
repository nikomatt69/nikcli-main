// Snapshot provider module
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotProvider {
    pub name: String,
    pub enabled: bool,
    pub max_snapshots: usize,
    pub retention_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub size: u64,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotRequest {
    pub name: String,
    pub description: Option<String>,
    pub include_files: Vec<String>,
    pub exclude_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotResponse {
    pub snapshot: Snapshot,
    pub success: bool,
    pub message: Option<String>,
}

impl SnapshotProvider {
    pub fn new(name: String) -> Self {
        Self {
            name,
            enabled: true,
            max_snapshots: 100,
            retention_days: 30,
        }
    }

    pub fn with_max_snapshots(mut self, max: usize) -> Self {
        self.max_snapshots = max;
        self
    }

    pub fn with_retention_days(mut self, days: u32) -> Self {
        self.retention_days = days;
        self
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}