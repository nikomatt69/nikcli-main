/*!
 * Session Manager - Production Ready
 */

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub user_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_activity: chrono::DateTime<chrono::Utc>,
    pub metadata: serde_json::Value,
}

pub struct SessionManager {
    sessions: Arc<DashMap<String, Session>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
        }
    }
    
    pub fn create_session(&self, user_id: Option<String>) -> String {
        let session_id = Uuid::new_v4().to_string();
        let session = Session {
            id: session_id.clone(),
            user_id,
            created_at: chrono::Utc::now(),
            last_activity: chrono::Utc::now(),
            metadata: serde_json::json!({}),
        };
        
        self.sessions.insert(session_id.clone(), session);
        session_id
    }
    
    pub fn get_session(&self, session_id: &str) -> Option<Session> {
        self.sessions.get(session_id).map(|s| s.clone())
    }
    
    pub fn update_activity(&self, session_id: &str) {
        if let Some(mut session) = self.sessions.get_mut(session_id) {
            session.last_activity = chrono::Utc::now();
        }
    }
    
    pub fn delete_session(&self, session_id: &str) {
        self.sessions.remove(session_id);
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

