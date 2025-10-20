/*!
 * Work Session Manager - Production Ready
 * Complete work session persistence with undo/redo
 */

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs;
use tokio::sync::RwLock;

use super::edit_history::{EditHistory, FileOperation};

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Work session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkSession {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub last_accessed_at: DateTime<Utc>,
    pub total_edits: usize,
    pub total_messages: usize,
    pub files_modified: usize,
    pub tags: Vec<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(skip)]
    pub edit_history: EditHistory,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl WorkSession {
    pub fn new(name: Option<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.unwrap_or_else(|| format!("Session {}", chrono::Local::now().format("%Y-%m-%d %H:%M"))),
            created_at: Utc::now(),
            last_accessed_at: Utc::now(),
            total_edits: 0,
            total_messages: 0,
            files_modified: 0,
            tags: Vec::new(),
            messages: Vec::new(),
            edit_history: EditHistory::new(),
            metadata: HashMap::new(),
        }
    }
}

/// Work session summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkSessionSummary {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub last_accessed_at: DateTime<Utc>,
    pub total_edits: usize,
    pub total_messages: usize,
    pub files_modified: usize,
    pub tags: Vec<String>,
}

impl From<&WorkSession> for WorkSessionSummary {
    fn from(session: &WorkSession) -> Self {
        Self {
            id: session.id.clone(),
            name: session.name.clone(),
            created_at: session.created_at,
            last_accessed_at: session.last_accessed_at,
            total_edits: session.total_edits,
            total_messages: session.total_messages,
            files_modified: session.files_modified,
            tags: session.tags.clone(),
        }
    }
}

/// Work Session Manager
pub struct WorkSessionManager {
    sessions: Arc<DashMap<String, WorkSession>>,
    current_session_id: Arc<RwLock<Option<String>>>,
    storage_path: PathBuf,
}

impl WorkSessionManager {
    pub fn new() -> Self {
        let storage_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".nikcli")
            .join("work-sessions");
        
        Self {
            sessions: Arc::new(DashMap::new()),
            current_session_id: Arc::new(RwLock::new(None)),
            storage_path,
        }
    }
    
    /// Initialize manager and load existing sessions
    pub async fn initialize(&mut self) -> Result<()> {
        // Create storage directory if needed
        if !self.storage_path.exists() {
            fs::create_dir_all(&self.storage_path).await?;
        }
        
        // Load existing sessions
        self.load_sessions_from_disk().await?;
        
        Ok(())
    }
    
    async fn load_sessions_from_disk(&self) -> Result<()> {
        if !self.storage_path.exists() {
            return Ok(());
        }
        
        let mut entries = fs::read_dir(&self.storage_path).await?;
        
        while let Some(entry) = entries.next_entry().await? {
            if let Ok(content) = fs::read_to_string(entry.path()).await {
                if let Ok(session) = serde_json::from_str::<WorkSession>(&content) {
                    self.sessions.insert(session.id.clone(), session);
                }
            }
        }
        
        Ok(())
    }
    
    /// Create new work session
    pub async fn create_session(&mut self, name: Option<String>) -> Result<WorkSession> {
        let session = WorkSession::new(name);
        let id = session.id.clone();
        
        self.sessions.insert(id.clone(), session.clone());
        *self.current_session_id.write().await = Some(id);
        
        self.save_session_to_disk(&session).await?;
        
        Ok(session)
    }
    
    /// Resume existing session
    pub async fn resume_session(&mut self, session_id: String) -> Result<WorkSession> {
        let mut session = self.sessions.get_mut(&session_id)
            .ok_or_else(|| anyhow!("Session not found: {}", session_id))?
            .clone();
        
        session.last_accessed_at = Utc::now();
        
        self.sessions.insert(session_id.clone(), session.clone());
        *self.current_session_id.write().await = Some(session_id);
        
        self.save_session_to_disk(&session).await?;
        
        Ok(session)
    }
    
    /// List all sessions
    pub async fn list_sessions(&self) -> Result<Vec<WorkSessionSummary>> {
        let mut summaries: Vec<WorkSessionSummary> = self.sessions.iter()
            .map(|entry| WorkSessionSummary::from(entry.value()))
            .collect();
        
        summaries.sort_by(|a, b| b.last_accessed_at.cmp(&a.last_accessed_at));
        
        Ok(summaries)
    }
    
    /// Save current session
    pub async fn save_current_session(&self) -> Result<()> {
        let session_id = self.current_session_id.read().await.clone()
            .ok_or_else(|| anyhow!("No current session"))?;
        
        let session = self.sessions.get(&session_id)
            .ok_or_else(|| anyhow!("Current session not found"))?
            .clone();
        
        self.save_session_to_disk(&session).await
    }
    
    async fn save_session_to_disk(&self, session: &WorkSession) -> Result<()> {
        let file_path = self.storage_path.join(format!("{}.json", session.id));
        let content = serde_json::to_string_pretty(session)?;
        fs::write(file_path, content).await?;
        Ok(())
    }
    
    /// Delete session
    pub async fn delete_session(&mut self, session_id: String) -> Result<bool> {
        if self.sessions.remove(&session_id).is_some() {
            let file_path = self.storage_path.join(format!("{}.json", session_id));
            if file_path.exists() {
                fs::remove_file(file_path).await?;
            }
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    /// Export session to file
    pub async fn export_session(&self, session_id: String, export_path: String) -> Result<()> {
        let session = self.sessions.get(&session_id)
            .ok_or_else(|| anyhow!("Session not found"))?;
        
        let content = serde_json::to_string_pretty(session.value())?;
        fs::write(export_path, content).await?;
        
        Ok(())
    }
    
    /// Undo N edits in current session
    pub async fn undo(&mut self, count: usize) -> Result<Vec<FileOperation>> {
        let session_id = self.current_session_id.read().await.clone()
            .ok_or_else(|| anyhow!("No current session"))?;
        
        let mut session = self.sessions.get_mut(&session_id)
            .ok_or_else(|| anyhow!("Current session not found"))?
            .clone();
        
        let undone = session.edit_history.undo(count).await?;
        
        self.sessions.insert(session_id, session);
        
        Ok(undone)
    }
    
    /// Redo N edits in current session
    pub async fn redo(&mut self, count: usize) -> Result<Vec<FileOperation>> {
        let session_id = self.current_session_id.read().await.clone()
            .ok_or_else(|| anyhow!("No current session"))?;
        
        let mut session = self.sessions.get_mut(&session_id)
            .ok_or_else(|| anyhow!("Current session not found"))?
            .clone();
        
        let redone = session.edit_history.redo(count).await?;
        
        self.sessions.insert(session_id, session);
        
        Ok(redone)
    }
    
    /// Get current session
    pub fn get_current_session(&self) -> Option<WorkSession> {
        let session_id = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                self.current_session_id.read().await.clone()
            })
        })?;
        
        self.sessions.get(&session_id).map(|s| s.clone())
    }
}

impl Default for WorkSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_work_session_manager() {
        let mut manager = WorkSessionManager::new();
        let session = manager.create_session(Some("Test Session".to_string())).await.unwrap();
        assert_eq!(session.name, "Test Session");
    }
}

