/*!
 * Chat Manager
 * Production-ready chat session management
 */

use anyhow::Result;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub struct ChatSession {
    pub id: String,
    pub messages: Vec<ChatMessage>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub struct ChatManager {
    sessions: Arc<DashMap<String, ChatSession>>,
}

impl ChatManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
        }
    }
    
    pub fn create_session(&self) -> String {
        let session_id = Uuid::new_v4().to_string();
        let session = ChatSession {
            id: session_id.clone(),
            messages: Vec::new(),
            created_at: chrono::Utc::now(),
        };
        
        self.sessions.insert(session_id.clone(), session);
        session_id
    }
    
    pub fn add_message(&self, session_id: &str, role: String, content: String) -> Result<()> {
        if let Some(mut session) = self.sessions.get_mut(session_id) {
            let message = ChatMessage {
                id: Uuid::new_v4().to_string(),
                role,
                content,
                timestamp: chrono::Utc::now(),
            };
            session.messages.push(message);
            Ok(())
        } else {
            anyhow::bail!("Session not found")
        }
    }
    
    pub fn get_messages(&self, session_id: &str) -> Option<Vec<ChatMessage>> {
        self.sessions.get(session_id).map(|s| s.messages.clone())
    }
}

impl Default for ChatManager {
    fn default() -> Self {
        Self::new()
    }
}

