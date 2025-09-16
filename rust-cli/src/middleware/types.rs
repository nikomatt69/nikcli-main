// Middleware types module
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiddlewareContext {
    pub request_id: String,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiddlewareRequest {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Option<serde_json::Value>,
    pub query: HashMap<String, String>,
    pub context: MiddlewareContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiddlewareResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Option<serde_json::Value>,
    pub context: MiddlewareContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiddlewareError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
    pub context: MiddlewareContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MiddlewareResult {
    Continue(MiddlewareRequest),
    Response(MiddlewareResponse),
    Error(MiddlewareError),
}

impl MiddlewareContext {
    pub fn new(request_id: String) -> Self {
        Self {
            request_id,
            user_id: None,
            session_id: None,
            metadata: HashMap::new(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    pub fn with_user_id(mut self, user_id: String) -> Self {
        self.user_id = Some(user_id);
        self
    }

    pub fn with_session_id(mut self, session_id: String) -> Self {
        self.session_id = Some(session_id);
        self
    }

    pub fn with_metadata(mut self, metadata: HashMap<String, serde_json::Value>) -> Self {
        self.metadata = metadata;
        self
    }
}