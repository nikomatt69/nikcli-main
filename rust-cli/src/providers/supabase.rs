// Supabase provider module
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseProvider {
    pub name: String,
    pub url: String,
    pub api_key: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseRequest {
    pub table: String,
    pub operation: SupabaseOperation,
    pub data: Option<serde_json::Value>,
    pub filters: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SupabaseOperation {
    Select,
    Insert,
    Update,
    Delete,
    Upsert,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseResponse {
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub success: bool,
}

impl SupabaseProvider {
    pub fn new(name: String, url: String, api_key: String) -> Self {
        Self {
            name,
            url,
            api_key,
            enabled: true,
        }
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}