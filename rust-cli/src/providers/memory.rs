// Memory provider module
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryProvider {
    pub name: String,
    pub enabled: bool,
    pub max_memory: usize,
    pub ttl_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub created_at: u64,
    pub expires_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRequest {
    pub operation: MemoryOperation,
    pub key: String,
    pub value: Option<serde_json::Value>,
    pub ttl: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemoryOperation {
    Get,
    Set,
    Delete,
    Exists,
    Clear,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryResponse {
    pub success: bool,
    pub value: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl MemoryProvider {
    pub fn new(name: String) -> Self {
        Self {
            name,
            enabled: true,
            max_memory: 1024 * 1024 * 100, // 100MB
            ttl_seconds: 3600, // 1 hour
        }
    }

    pub fn with_max_memory(mut self, max: usize) -> Self {
        self.max_memory = max;
        self
    }

    pub fn with_ttl(mut self, ttl: u64) -> Self {
        self.ttl_seconds = ttl;
        self
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}