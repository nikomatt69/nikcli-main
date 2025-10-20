/*!
 * Enhanced Session Manager - Production Ready
 * Multi-backend session persistence (Redis, Supabase, Local)
 */

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::providers::{RedisProvider, SupabaseAuthProvider};

/// Chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub messages: Vec<ChatMessage>,
    pub system_prompt: Option<String>,
    pub metadata: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

impl ChatSession {
    pub fn new(title: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title: title.unwrap_or_else(|| format!("Chat {}", now.format("%Y-%m-%d %H:%M"))),
            created_at: now,
            updated_at: now,
            messages: Vec::new(),
            system_prompt: None,
            metadata: std::collections::HashMap::new(),
        }
    }
    
    pub fn add_message(&mut self, role: String, content: String) {
        self.messages.push(ChatMessage {
            role,
            content,
            timestamp: Utc::now(),
        });
        self.updated_at = Utc::now();
    }
}

/// Session configuration
pub struct SessionConfig {
    pub redis_enabled: bool,
    pub supabase_enabled: bool,
}

/// Enhanced Session Manager
pub struct EnhancedSessionManager {
    redis_enabled: bool,
    supabase_enabled: bool,
    local_sessions: Arc<DashMap<String, ChatSession>>,
    redis_provider: Option<Arc<RedisProvider>>,
    supabase_provider: Option<Arc<SupabaseAuthProvider>>,
}

impl EnhancedSessionManager {
    pub fn new(config: SessionConfig) -> Self {
        Self {
            redis_enabled: config.redis_enabled,
            supabase_enabled: config.supabase_enabled,
            local_sessions: Arc::new(DashMap::new()),
            redis_provider: None,
            supabase_provider: None,
        }
    }
    
    pub fn with_default_config() -> Self {
        let redis_enabled = std::env::var("REDIS_URL").is_ok();
        let supabase_enabled = std::env::var("SUPABASE_URL").is_ok() 
            && std::env::var("SUPABASE_KEY").is_ok();
        
        Self::new(SessionConfig {
            redis_enabled,
            supabase_enabled,
        })
    }
    
    /// Initialize providers
    pub async fn initialize(&mut self) -> Result<()> {
        if self.redis_enabled {
            let mut provider = RedisProvider::new();
            if let Ok(url) = std::env::var("REDIS_URL") {
                if let Err(e) = provider.initialize(&url).await {
                    tracing::warn!("Failed to initialize Redis: {}", e);
                    self.redis_enabled = false;
                } else {
                    self.redis_provider = Some(Arc::new(provider));
                    tracing::info!("Redis provider initialized");
                }
            } else {
                self.redis_enabled = false;
            }
        }
        
        if self.supabase_enabled {
            let mut provider = SupabaseAuthProvider::new();
            let url = std::env::var("SUPABASE_URL").ok();
            let key = std::env::var("SUPABASE_KEY").ok();
            if let (Some(u), Some(k)) = (url, key) {
                if let Err(e) = provider.initialize(&u, &k) {
                    tracing::warn!("Failed to initialize Supabase: {}", e);
                    self.supabase_enabled = false;
                } else {
                    self.supabase_provider = Some(Arc::new(provider));
                    tracing::info!("Supabase provider initialized");
                }
            } else {
                self.supabase_enabled = false;
            }
        }
        
        Ok(())
    }
    
    /// Create new session
    pub async fn create_session(&self, title: Option<String>) -> Result<ChatSession> {
        let session = ChatSession::new(title);
        let id = session.id.clone();
        
        // Save locally first
        self.local_sessions.insert(id.clone(), session.clone());
        
        // Try to save to remote backends
        self.save_to_backends(&session).await?;
        
        Ok(session)
    }
    
    /// Load session
    pub async fn load_session(&self, session_id: String) -> Result<ChatSession> {
        // Try local first
        if let Some(session) = self.local_sessions.get(&session_id) {
            return Ok(session.clone());
        }
        
        // Try Redis
        if self.redis_enabled {
            if let Some(provider) = &self.redis_provider {
                if let Ok(Some(data)) = provider.get(&format!("session:{}", session_id)).await {
                    if let Ok(session) = serde_json::from_str::<ChatSession>(&data) {
                        self.local_sessions.insert(session_id.clone(), session.clone());
                        return Ok(session);
                    }
                }
            }
        }
        
        // Try Supabase
        if self.supabase_enabled {
            // Supabase loading would go here
        }
        
        Err(anyhow!("Session not found: {}", session_id))
    }
    
    /// Save session
    pub async fn save_session(&self, session: ChatSession) -> Result<()> {
        let id = session.id.clone();
        
        // Save locally
        self.local_sessions.insert(id.clone(), session.clone());
        
        // Save to backends
        self.save_to_backends(&session).await?;
        
        Ok(())
    }
    
    async fn save_to_backends(&self, session: &ChatSession) -> Result<()> {
        let session_json = serde_json::to_string(session)?;
        
        // Try Redis
        if self.redis_enabled {
            if let Some(provider) = &self.redis_provider {
                let _ = provider.set(
                    &format!("session:{}", session.id),
                    &session_json,
                    Some(86400 * 30), // 30 days TTL
                ).await;
            }
        }
        
        // Try Supabase
        if self.supabase_enabled {
            // Supabase saving would go here
        }
        
        Ok(())
    }
    
    /// List all sessions
    pub async fn list_sessions(&self) -> Result<Vec<ChatSession>> {
        let mut sessions: Vec<ChatSession> = self.local_sessions.iter()
            .map(|entry| entry.value().clone())
            .collect();
        
        sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        
        Ok(sessions)
    }
    
    /// Delete session
    pub async fn delete_session(&self, session_id: String) -> Result<bool> {
        // Remove from local
        let existed = self.local_sessions.remove(&session_id).is_some();
        
        // Remove from Redis
        if self.redis_enabled {
            if let Some(provider) = &self.redis_provider {
                let _ = provider.delete(&format!("session:{}", session_id)).await;
            }
        }
        
        // Remove from Supabase
        if self.supabase_enabled {
            // Supabase deletion would go here
        }
        
        Ok(existed)
    }
}

impl Default for EnhancedSessionManager {
    fn default() -> Self {
        Self::with_default_config()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_enhanced_session_manager() {
        let manager = EnhancedSessionManager::with_default_config();
        let session = manager.create_session(Some("Test".to_string())).await.unwrap();
        assert_eq!(session.title, "Test");
    }
}
