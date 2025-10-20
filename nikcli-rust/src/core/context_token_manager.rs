//! Context Token Manager - PRODUCTION READY
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

pub struct ContextTokenManager {
    current_session: Arc<AtomicU64>,
    total_tokens: Arc<AtomicU64>,
}

impl ContextTokenManager {
    pub fn new() -> Self {
        Self {
            current_session: Arc::new(AtomicU64::new(0)),
            total_tokens: Arc::new(AtomicU64::new(0)),
        }
    }
    
    pub fn get_current_session(&self) -> Option<u64> {
        let session = self.current_session.load(Ordering::Relaxed);
        if session > 0 { Some(session) } else { None }
    }
    
    pub async fn track_message(&self, tokens: u64) {
        self.total_tokens.fetch_add(tokens, Ordering::Relaxed);
    }
}

lazy_static::lazy_static! {
    pub static ref CONTEXT_TOKEN_MANAGER: ContextTokenManager = ContextTokenManager::new();
}
