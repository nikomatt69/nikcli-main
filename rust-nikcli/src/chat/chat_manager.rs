use crate::ai::types::*;
use crate::chat::types::*;
use crate::core::config::NikCliConfig;
use crate::error::NikCliResult;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use tracing::{debug, info, warn, error};

/// Chat manager for handling chat sessions
pub struct ChatManager {
    config: Arc<RwLock<NikCliConfig>>,
    current_session: Arc<RwLock<Option<ChatSession>>>,
    sessions: Arc<RwLock<HashMap<String, ChatSession>>>,
    event_sender: Option<mpsc::UnboundedSender<ChatEvent>>,
    auto_save_timer: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl ChatManager {
    /// Create a new chat manager
    pub fn new(config: Arc<RwLock<NikCliConfig>>) -> Self {
        Self {
            config,
            current_session: Arc::new(RwLock::new(None)),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            event_sender: None,
            auto_save_timer: Arc::new(RwLock::new(None)),
        }
    }
    
    /// Create a new chat session
    pub async fn create_new_session(&self, title: Option<String>, system_prompt: Option<String>) -> NikCliResult<ChatSession> {
        let session_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        
        let title = title.unwrap_or_else(|| {
            format!("Chat {}", now.format("%Y-%m-%d %H:%M:%S"))
        });
        
        let mut session = ChatSession {
            id: session_id.clone(),
            title,
            messages: Vec::new(),
            created_at: now,
            updated_at: now,
            system_prompt: system_prompt.clone(),
            max_tokens: None,
            model: None,
            temperature: None,
            metadata: HashMap::new(),
        };
        
        // Add system message if system prompt is provided
        if let Some(prompt) = system_prompt {
            session.messages.push(ChatMessage {
                role: ChatRole::System,
                content: prompt,
                timestamp: Some(now),
            });
        }
        
        // Store session
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(session_id.clone(), session.clone());
        }
        
        // Set as current session
        {
            let mut current = self.current_session.write().await;
            *current = Some(session.clone());
        }
        
        // Apply adaptive token cap
        self.apply_adaptive_cap(&session).await?;
        
        // Emit event
        self.emit_event(ChatEvent {
            event_type: ChatEventType::SessionCreated,
            session_id: Some(session_id),
            message_id: None,
            content: Some("New chat session created".to_string()),
            metadata: Some(json!({
                "title": session.title,
                "system_prompt": session.system_prompt,
                "created_at": session.created_at
            })),
            timestamp: now,
        }).await;
        
        info!("Created new chat session: {}", session.id);
        Ok(session)
    }
    
    /// Get current session
    pub async fn get_current_session(&self) -> Option<ChatSession> {
        let current = self.current_session.read().await;
        current.clone()
    }
    
    /// Set current session
    pub async fn set_current_session(&self, session_id: &str) -> NikCliResult<Option<ChatSession>> {
        let sessions = self.sessions.read().await;
        if let Some(session) = sessions.get(session_id) {
            let mut current = self.current_session.write().await;
            *current = Some(session.clone());
            
            // Emit event
            self.emit_event(ChatEvent {
                event_type: ChatEventType::SessionUpdated,
                session_id: Some(session_id.to_string()),
                message_id: None,
                content: Some("Switched to session".to_string()),
                metadata: None,
                timestamp: chrono::Utc::now(),
            }).await;
            
            info!("Switched to session: {}", session_id);
            Ok(Some(session.clone()))
        } else {
            warn!("Session not found: {}", session_id);
            Ok(None)
        }
    }
    
    /// Add message to current session
    pub async fn add_message(&self, content: String, role: ChatRole) -> NikCliResult<ChatMessage> {
        let mut current = self.current_session.write().await;
        
        // Create new session if none exists
        if current.is_none() {
            drop(current);
            self.create_new_session(None, None).await?;
            current = self.current_session.write().await;
        }
        
        let session = current.as_mut().unwrap();
        let message = ChatMessage {
            role: role.clone(),
            content: content.clone(),
            timestamp: Some(chrono::Utc::now()),
        };
        
        session.messages.push(message.clone());
        session.updated_at = chrono::Utc::now();
        
        // Trim history if needed
        self.trim_history(session).await?;
        
        // Emit event
        self.emit_event(ChatEvent {
            event_type: ChatEventType::MessageAdded,
            session_id: Some(session.id.clone()),
            message_id: None,
            content: Some(content),
            metadata: Some(json!({
                "role": role,
                "message_count": session.messages.len()
            })),
            timestamp: chrono::Utc::now(),
        }).await;
        
        debug!("Added message to session {}: {} ({})", session.id, role, content.len());
        Ok(message)
    }
    
    /// Get all sessions
    pub async fn get_all_sessions(&self) -> Vec<ChatSession> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }
    
    /// Get session by ID
    pub async fn get_session(&self, session_id: &str) -> Option<ChatSession> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).cloned()
    }
    
    /// Delete session
    pub async fn delete_session(&self, session_id: &str) -> NikCliResult<bool> {
        let mut sessions = self.sessions.write().await;
        let deleted = sessions.remove(session_id).is_some();
        
        // Clear current session if it was deleted
        if deleted {
            let mut current = self.current_session.write().await;
            if let Some(ref current_id) = current.as_ref().map(|s| &s.id) {
                if current_id == session_id {
                    *current = None;
                }
            }
        }
        
        if deleted {
            info!("Deleted session: {}", session_id);
        }
        
        Ok(deleted)
    }
    
    /// Update session title
    pub async fn update_session_title(&self, session_id: &str, new_title: String) -> NikCliResult<bool> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.title = new_title.clone();
            session.updated_at = chrono::Utc::now();
            
            // Update current session if it's the same
            let mut current = self.current_session.write().await;
            if let Some(ref mut current_session) = current.as_mut() {
                if current_session.id == session_id {
                    current_session.title = new_title;
                    current_session.updated_at = chrono::Utc::now();
                }
            }
            
            info!("Updated session title: {} -> {}", session_id, new_title);
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    /// Get session statistics
    pub async fn get_session_stats(&self, session_id: &str) -> Option<ChatSessionStats> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(session_id)?;
        
        let mut user_messages = 0;
        let mut assistant_messages = 0;
        let mut system_messages = 0;
        let mut total_tokens = 0;
        let mut total_response_time = 0.0;
        let mut response_count = 0;
        
        for message in &session.messages {
            match message.role {
                ChatRole::User => user_messages += 1,
                ChatRole::Assistant => {
                    assistant_messages += 1;
                    // Estimate response time (simplified)
                    total_response_time += 1000.0; // 1 second average
                    response_count += 1;
                }
                ChatRole::System => system_messages += 1,
            }
            
            // Estimate tokens (rough approximation)
            total_tokens += message.content.len() / 4;
        }
        
        let session_duration = session.updated_at.signed_duration_since(session.created_at).num_seconds() as u64;
        let average_response_time = if response_count > 0 { total_response_time / response_count as f64 } else { 0.0 };
        
        Some(ChatSessionStats {
            total_messages: session.messages.len() as u32,
            user_messages,
            assistant_messages,
            system_messages,
            total_tokens: total_tokens as u64,
            average_response_time,
            session_duration,
            last_activity: session.updated_at,
        })
    }
    
    /// Export session
    pub async fn export_session(&self, session_id: &str, format: ExportFormat) -> NikCliResult<String> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(session_id)
            .ok_or_else(|| crate::error::NikCliError::NotFound(format!("Session {} not found", session_id)))?;
        
        let stats = self.get_session_stats(session_id).await
            .ok_or_else(|| crate::error::NikCliError::NotFound(format!("Stats for session {} not found", session_id)))?;
        
        let export = ChatSessionExport {
            session: session.clone(),
            stats,
            export_metadata: ExportMetadata {
                exported_at: chrono::Utc::now(),
                export_version: "1.0".to_string(),
                nikcli_version: env!("CARGO_PKG_VERSION").to_string(),
                format: format.clone(),
            },
        };
        
        let content = match format {
            ExportFormat::Json => serde_json::to_string_pretty(&export)?,
            ExportFormat::Markdown => self.export_to_markdown(&export).await,
            ExportFormat::Text => self.export_to_text(&export).await,
            ExportFormat::Html => self.export_to_html(&export).await,
        };
        
        // Emit event
        self.emit_event(ChatEvent {
            event_type: ChatEventType::SessionExported,
            session_id: Some(session_id.to_string()),
            message_id: None,
            content: Some(format!("Session exported in {} format", format)),
            metadata: Some(json!({
                "format": format,
                "size": content.len()
            })),
            timestamp: chrono::Utc::now(),
        }).await;
        
        info!("Exported session {} in {} format ({} bytes)", session_id, format, content.len());
        Ok(content)
    }
    
    /// Import session
    pub async fn import_session(&self, content: &str, format: ExportFormat) -> NikCliResult<ChatImportResult> {
        let export: ChatSessionExport = match format {
            ExportFormat::Json => serde_json::from_str(content)?,
            _ => return Err(crate::error::NikCliError::NotImplemented("Only JSON import is supported".to_string())),
        };
        
        let mut sessions = self.sessions.write().await;
        let mut imported_sessions = 0;
        let mut imported_messages = 0;
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        
        // Check if session already exists
        if sessions.contains_key(&export.session.id) {
            warnings.push(format!("Session {} already exists, skipping", export.session.id));
            return Ok(ChatImportResult {
                imported_sessions: 0,
                imported_messages: 0,
                skipped_sessions: 1,
                errors,
                warnings,
            });
        }
        
        // Import session
        sessions.insert(export.session.id.clone(), export.session.clone());
        imported_sessions = 1;
        imported_messages = export.session.messages.len() as u32;
        
        // Emit event
        self.emit_event(ChatEvent {
            event_type: ChatEventType::SessionImported,
            session_id: Some(export.session.id.clone()),
            message_id: None,
            content: Some("Session imported".to_string()),
            metadata: Some(json!({
                "imported_messages": imported_messages,
                "export_version": export.export_metadata.export_version
            })),
            timestamp: chrono::Utc::now(),
        }).await;
        
        info!("Imported session {} with {} messages", export.session.id, imported_messages);
        
        Ok(ChatImportResult {
            imported_sessions,
            imported_messages,
            skipped_sessions: 0,
            errors,
            warnings,
        })
    }
    
    /// Search sessions
    pub async fn search_sessions(&self, criteria: ChatSearchCriteria) -> NikCliResult<Vec<ChatSearchResult>> {
        let sessions = self.sessions.read().await;
        let mut results = Vec::new();
        
        for session in sessions.values() {
            // Apply filters
            if let Some(ref session_ids) = criteria.session_ids {
                if !session_ids.contains(&session.id) {
                    continue;
                }
            }
            
            if let Some(date_from) = criteria.date_from {
                if session.created_at < date_from {
                    continue;
                }
            }
            
            if let Some(date_to) = criteria.date_to {
                if session.created_at > date_to {
                    continue;
                }
            }
            
            if let Some(min_messages) = criteria.min_tokens {
                if session.messages.len() < min_messages as usize {
                    continue;
                }
            }
            
            if let Some(max_messages) = criteria.max_tokens {
                if session.messages.len() > max_messages as usize {
                    continue;
                }
            }
            
            // Search in messages
            for message in &session.messages {
                if let Some(ref role_filter) = criteria.role_filter {
                    if message.role != *role_filter {
                        continue;
                    }
                }
                
                if message.content.to_lowercase().contains(&criteria.query.to_lowercase()) {
                    let relevance_score = self.calculate_relevance_score(&criteria.query, &message.content);
                    
                    results.push(ChatSearchResult {
                        session_id: session.id.clone(),
                        message_id: uuid::Uuid::new_v4().to_string(), // Simplified
                        message: message.clone(),
                        metadata: MessageMetadata {
                            tokens_used: None,
                            model_used: None,
                            response_time_ms: None,
                            cost: None,
                            tool_calls: None,
                            tool_results: None,
                            context_files: None,
                            context_tokens: None,
                        },
                        relevance_score,
                        matched_text: message.content.clone(),
                    });
                }
            }
        }
        
        // Sort by relevance score
        results.sort_by(|a, b| b.relevance_score.partial_cmp(&a.relevance_score).unwrap_or(std::cmp::Ordering::Equal));
        
        Ok(results)
    }
    
    /// Apply adaptive token cap to session
    async fn apply_adaptive_cap(&self, session: &ChatSession) -> NikCliResult<()> {
        let config = self.config.read().await;
        
        // Calculate complexity based on system prompt
        let complexity = if let Some(ref prompt) = session.system_prompt {
            (prompt.len() / 800).min(10) as u32
        } else {
            3
        };
        
        // Calculate token cap
        let base_max = config.max_tokens;
        let min_cap = 6000;
        let reserve_pct = 0.25; // Reserve for model output/tool calls
        let cap = (base_max as f32 * (1.0 - reserve_pct)) as u32;
        let final_cap = cap.max(min_cap).min(base_max);
        
        // Update session max tokens
        {
            let mut sessions = self.sessions.write().await;
            if let Some(session) = sessions.get_mut(&session.id) {
                session.max_tokens = Some(final_cap);
            }
        }
        
        debug!("Applied adaptive token cap {} to session {}", final_cap, session.id);
        Ok(())
    }
    
    /// Trim message history if needed
    async fn trim_history(&self, session: &mut ChatSession) -> NikCliResult<()> {
        let config = self.config.read().await;
        let max_history = config.max_history_length;
        
        if session.messages.len() > max_history as usize {
            let to_remove = session.messages.len() - max_history as usize;
            
            // Keep system messages and recent messages
            let mut new_messages = Vec::new();
            let mut removed_count = 0;
            
            for message in &session.messages {
                if matches!(message.role, ChatRole::System) || removed_count >= to_remove {
                    new_messages.push(message.clone());
                } else {
                    removed_count += 1;
                }
            }
            
            session.messages = new_messages;
            debug!("Trimmed {} messages from session {}", removed_count, session.id);
        }
        
        Ok(())
    }
    
    /// Calculate relevance score for search
    fn calculate_relevance_score(&self, query: &str, content: &str) -> f64 {
        let query_lower = query.to_lowercase();
        let content_lower = content.to_lowercase();
        
        if content_lower.contains(&query_lower) {
            // Simple scoring based on position and frequency
            let position_score = if content_lower.starts_with(&query_lower) { 1.0 } else { 0.5 };
            let frequency_score = content_lower.matches(&query_lower).count() as f64 * 0.1;
            position_score + frequency_score
        } else {
            0.0
        }
    }
    
    /// Export to markdown format
    async fn export_to_markdown(&self, export: &ChatSessionExport) -> String {
        let mut content = String::new();
        
        content.push_str(&format!("# {}\n\n", export.session.title));
        content.push_str(&format!("**Created:** {}\n", export.session.created_at.format("%Y-%m-%d %H:%M:%S")));
        content.push_str(&format!("**Messages:** {}\n", export.stats.total_messages));
        content.push_str(&format!("**Tokens:** {}\n\n", export.stats.total_tokens));
        
        if let Some(ref system_prompt) = export.session.system_prompt {
            content.push_str("## System Prompt\n\n");
            content.push_str(&format!("{}\n\n", system_prompt));
        }
        
        content.push_str("## Messages\n\n");
        
        for message in &export.session.messages {
            let role = match message.role {
                ChatRole::User => "**User**",
                ChatRole::Assistant => "**Assistant**",
                ChatRole::System => "**System**",
            };
            
            content.push_str(&format!("{}: {}\n\n", role, message.content));
        }
        
        content
    }
    
    /// Export to text format
    async fn export_to_text(&self, export: &ChatSessionExport) -> String {
        let mut content = String::new();
        
        content.push_str(&format!("Chat Session: {}\n", export.session.title));
        content.push_str(&format!("Created: {}\n", export.session.created_at.format("%Y-%m-%d %H:%M:%S")));
        content.push_str(&format!("Messages: {}\n", export.stats.total_messages));
        content.push_str(&format!("Tokens: {}\n\n", export.stats.total_tokens));
        
        for message in &export.session.messages {
            let role = match message.role {
                ChatRole::User => "User",
                ChatRole::Assistant => "Assistant",
                ChatRole::System => "System",
            };
            
            content.push_str(&format!("{}: {}\n", role, message.content));
        }
        
        content
    }
    
    /// Export to HTML format
    async fn export_to_html(&self, export: &ChatSessionExport) -> String {
        let mut content = String::new();
        
        content.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
        content.push_str("<title>Chat Session Export</title>\n");
        content.push_str("<style>\n");
        content.push_str("body { font-family: Arial, sans-serif; margin: 20px; }\n");
        content.push_str(".message { margin: 10px 0; padding: 10px; border-radius: 5px; }\n");
        content.push_str(".user { background-color: #e3f2fd; }\n");
        content.push_str(".assistant { background-color: #f3e5f5; }\n");
        content.push_str(".system { background-color: #e8f5e8; }\n");
        content.push_str("</style>\n</head>\n<body>\n");
        
        content.push_str(&format!("<h1>{}</h1>\n", export.session.title));
        content.push_str(&format!("<p><strong>Created:</strong> {}</p>\n", export.session.created_at.format("%Y-%m-%d %H:%M:%S")));
        content.push_str(&format!("<p><strong>Messages:</strong> {}</p>\n", export.stats.total_messages));
        content.push_str(&format!("<p><strong>Tokens:</strong> {}</p>\n", export.stats.total_tokens));
        
        content.push_str("<h2>Messages</h2>\n");
        
        for message in &export.session.messages {
            let class = match message.role {
                ChatRole::User => "user",
                ChatRole::Assistant => "assistant",
                ChatRole::System => "system",
            };
            
            let role = match message.role {
                ChatRole::User => "User",
                ChatRole::Assistant => "Assistant",
                ChatRole::System => "System",
            };
            
            content.push_str(&format!("<div class=\"message {}\">\n", class));
            content.push_str(&format!("<strong>{}:</strong> {}\n", role, message.content));
            content.push_str("</div>\n");
        }
        
        content.push_str("</body>\n</html>\n");
        content
    }
    
    /// Emit chat event
    async fn emit_event(&self, event: ChatEvent) {
        if let Some(ref sender) = self.event_sender {
            let _ = sender.send(event);
        }
    }
    
    /// Set event sender for notifications
    pub fn set_event_sender(&mut self, sender: mpsc::UnboundedSender<ChatEvent>) {
        self.event_sender = Some(sender);
    }
    
    /// Get event receiver
    pub fn get_event_receiver(&self) -> Option<mpsc::UnboundedReceiver<ChatEvent>> {
        let (sender, receiver) = mpsc::unbounded_channel();
        self.event_sender = Some(sender);
        Some(receiver)
    }
}