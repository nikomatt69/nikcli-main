// Redis provider module
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisProvider {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub database: u8,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisRequest {
    pub operation: RedisOperation,
    pub key: String,
    pub value: Option<serde_json::Value>,
    pub ttl: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RedisOperation {
    Get,
    Set,
    Delete,
    Exists,
    Expire,
    Ttl,
    Keys,
    Flush,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisResponse {
    pub success: bool,
    pub value: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl RedisProvider {
    pub fn new(name: String, host: String, port: u16) -> Self {
        Self {
            name,
            host,
            port,
            password: None,
            database: 0,
            enabled: true,
        }
    }

    pub fn with_password(mut self, password: String) -> Self {
        self.password = Some(password);
        self
    }

    pub fn with_database(mut self, database: u8) -> Self {
        self.database = database;
        self
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}