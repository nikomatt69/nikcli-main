use crate::ai::types::*;
use crate::ai::advanced_provider::AdvancedAiProvider;
use crate::ai::model_provider::ModelProvider;
use crate::chat::types::*;
use crate::core::config::NikCliConfig;
use crate::error::NikCliResult;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Chat orchestrator for managing chat interactions
pub struct ChatOrchestrator {
    config: Arc<RwLock<NikCliConfig>>,
    chat_manager: Arc<ChatManager>,
    ai_provider: Arc<ModelProvider>,
    advanced_provider: Arc<AdvancedAiProvider>,
    context: Arc<RwLock<ChatContext>>,
}

impl ChatOrchestrator {
    /// Create a new chat orchestrator
    pub fn new(config: Arc<RwLock<NikCliConfig>>) -> Self {
        let chat_manager = Arc::new(ChatManager::new(config.clone()));
        let ai_provider = Arc::new(ModelProvider::new(config.clone()));
        let advanced_provider = Arc::new(AdvancedAiProvider::new(config.clone()));
        
        let context = Arc::new(RwLock::new(ChatContext {
            session_id: String::new(),
            workspace_path: None,
            current_files: Vec::new(),
            recent_commands: Vec::new(),
            project_type: None,
            language: None,
            framework: None,
            dependencies: Vec::new(),
            environment_variables: std::collections::HashMap::new(),
            git_info: None,
            ide_info: None,
        }));
        
        Self {
            config,
            chat_manager,
            ai_provider,
            advanced_provider,
            context,
        }
    }
    
    /// Start a new chat session
    pub async fn start_session(&self, title: Option<String>, system_prompt: Option<String>) -> NikCliResult<ChatSession> {
        let session = self.chat_manager.create_new_session(title, system_prompt).await?;
        
        // Update context
        {
            let mut context = self.context.write().await;
            context.session_id = session.id.clone();
            context.workspace_path = std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string());
        }
        
        info!("Started new chat session: {}", session.id);
        Ok(session)
    }
    
    /// Send a message and get response
    pub async fn send_message(&self, content: String) -> NikCliResult<ChatMessage> {
        // Add user message
        let user_message = self.chat_manager.add_message(content.clone(), ChatRole::User).await?;
        
        // Get current session
        let session = self.chat_manager.get_current_session().await
            .ok_or_else(|| crate::error::NikCliError::NotFound("No active session".to_string()))?;
        
        // Prepare messages for AI
        let messages = session.messages.clone();
        
        // Create generate options
        let options = GenerateOptions {
            messages,
            temperature: session.temperature,
            max_tokens: session.max_tokens,
            stream: Some(false),
            scope: Some(ModelScope::ChatDefault),
            needs_vision: None,
            size_hints: None,
        };
        
        // Generate response
        let response = self.ai_provider.generate_text(options).await?;
        
        // Add assistant message
        let assistant_message = self.chat_manager.add_message(response.text, ChatRole::Assistant).await?;
        
        info!("Generated response for session: {}", session.id);
        Ok(assistant_message)
    }
    
    /// Stream a message response
    pub async fn stream_message(&self, content: String) -> NikCliResult<Box<dyn tokio_stream::Stream<Item = StreamEvent> + Send + Unpin>> {
        // Add user message
        let _user_message = self.chat_manager.add_message(content.clone(), ChatRole::User).await?;
        
        // Get current session
        let session = self.chat_manager.get_current_session().await
            .ok_or_else(|| crate::error::NikCliError::NotFound("No active session".to_string()))?;
        
        // Prepare messages for AI
        let messages = session.messages.clone();
        
        // Create generate options
        let options = GenerateOptions {
            messages,
            temperature: session.temperature,
            max_tokens: session.max_tokens,
            stream: Some(true),
            scope: Some(ModelScope::ChatDefault),
            needs_vision: None,
            size_hints: None,
        };
        
        // Stream response
        let stream = self.ai_provider.stream_text(options).await?;
        
        info!("Started streaming response for session: {}", session.id);
        Ok(stream)
    }
    
    /// Execute autonomous task
    pub async fn execute_autonomous_task(&self, task: String) -> NikCliResult<Box<dyn tokio_stream::Stream<Item = StreamEvent> + Send + Unpin>> {
        // Get current session
        let session = self.chat_manager.get_current_session().await
            .ok_or_else(|| crate::error::NikCliError::NotFound("No active session".to_string()))?;
        
        // Get context
        let context = self.context.read().await;
        let context_json = serde_json::to_value(&*context)?;
        
        // Execute autonomous task
        let stream = self.advanced_provider.execute_autonomous_task(task, Some(context_json)).await;
        
        info!("Started autonomous task execution for session: {}", session.id);
        Ok(Box::new(stream))
    }
    
    /// Get chat manager
    pub fn get_chat_manager(&self) -> &Arc<ChatManager> {
        &self.chat_manager
    }
    
    /// Get AI provider
    pub fn get_ai_provider(&self) -> &Arc<ModelProvider> {
        &self.ai_provider
    }
    
    /// Get advanced provider
    pub fn get_advanced_provider(&self) -> &Arc<AdvancedAiProvider> {
        &self.advanced_provider
    }
    
    /// Update context
    pub async fn update_context(&self, context: ChatContext) {
        let mut current_context = self.context.write().await;
        *current_context = context;
        debug!("Updated chat context");
    }
    
    /// Get current context
    pub async fn get_context(&self) -> ChatContext {
        let context = self.context.read().await;
        context.clone()
    }
    
    /// Set workspace path
    pub async fn set_workspace_path(&self, path: String) {
        let mut context = self.context.write().await;
        context.workspace_path = Some(path);
        debug!("Set workspace path in context");
    }
    
    /// Add current file to context
    pub async fn add_current_file(&self, file_path: String) {
        let mut context = self.context.write().await;
        if !context.current_files.contains(&file_path) {
            context.current_files.push(file_path);
        }
        debug!("Added file to context");
    }
    
    /// Add recent command to context
    pub async fn add_recent_command(&self, command: String) {
        let mut context = self.context.write().await;
        context.recent_commands.push(command);
        
        // Keep only last 10 commands
        if context.recent_commands.len() > 10 {
            context.recent_commands.remove(0);
        }
        
        debug!("Added command to context");
    }
    
    /// Set project information
    pub async fn set_project_info(&self, project_type: String, language: String, framework: Option<String>) {
        let mut context = self.context.write().await;
        context.project_type = Some(project_type);
        context.language = Some(language);
        context.framework = framework;
        debug!("Set project information in context");
    }
    
    /// Set git information
    pub async fn set_git_info(&self, git_info: GitInfo) {
        let mut context = self.context.write().await;
        context.git_info = Some(git_info);
        debug!("Set git information in context");
    }
    
    /// Set IDE information
    pub async fn set_ide_info(&self, ide_info: IdeInfo) {
        let mut context = self.context.write().await;
        context.ide_info = Some(ide_info);
        debug!("Set IDE information in context");
    }
    
    /// Get session analytics
    pub async fn get_session_analytics(&self, session_id: &str) -> NikCliResult<ChatSessionStats> {
        self.chat_manager.get_session_stats(session_id).await
            .ok_or_else(|| crate::error::NikCliError::NotFound(format!("Session {} not found", session_id)))
    }
    
    /// Get overall analytics
    pub async fn get_overall_analytics(&self) -> NikCliResult<ChatAnalytics> {
        let sessions = self.chat_manager.get_all_sessions().await;
        
        let mut total_sessions = 0;
        let mut total_messages = 0;
        let mut total_tokens = 0;
        let mut total_cost = 0.0;
        let mut total_response_time = 0.0;
        let mut response_count = 0;
        let mut model_usage: std::collections::HashMap<String, ModelUsage> = std::collections::HashMap::new();
        let mut daily_usage: std::collections::HashMap<String, DailyUsage> = std::collections::HashMap::new();
        
        for session in &sessions {
            total_sessions += 1;
            total_messages += session.messages.len() as u32;
            
            for message in &session.messages {
                // Estimate tokens
                let tokens = message.content.len() / 4;
                total_tokens += tokens as u64;
                
                // Estimate cost (simplified)
                let cost = tokens as f64 * 0.00001;
                total_cost += cost;
                
                if matches!(message.role, ChatRole::Assistant) {
                    total_response_time += 1000.0; // 1 second average
                    response_count += 1;
                }
            }
            
            // Track daily usage
            let date_key = session.created_at.format("%Y-%m-%d").to_string();
            let daily = daily_usage.entry(date_key).or_insert_with(|| DailyUsage {
                date: session.created_at,
                sessions: 0,
                messages: 0,
                tokens: 0,
                cost: 0.0,
            });
            
            daily.sessions += 1;
            daily.messages += session.messages.len() as u32;
            daily.tokens += total_tokens;
            daily.cost += total_cost;
        }
        
        let average_session_length = if total_sessions > 0 { total_messages as f64 / total_sessions as f64 } else { 0.0 };
        let average_response_time = if response_count > 0 { total_response_time / response_count as f64 } else { 0.0 };
        
        Ok(ChatAnalytics {
            total_sessions,
            total_messages,
            total_tokens,
            total_cost,
            average_session_length,
            average_response_time,
            most_used_models: model_usage.values().cloned().collect(),
            daily_usage: daily_usage.values().cloned().collect(),
            cost_by_model: std::collections::HashMap::new(),
            token_usage_by_model: std::collections::HashMap::new(),
        })
    }
    
    /// Search chat history
    pub async fn search_chat_history(&self, criteria: ChatSearchCriteria) -> NikCliResult<Vec<ChatSearchResult>> {
        self.chat_manager.search_sessions(criteria).await
    }
    
    /// Export session
    pub async fn export_session(&self, session_id: &str, format: ExportFormat) -> NikCliResult<String> {
        self.chat_manager.export_session(session_id, format).await
    }
    
    /// Import session
    pub async fn import_session(&self, content: &str, format: ExportFormat) -> NikCliResult<ChatImportResult> {
        self.chat_manager.import_session(content, format).await
    }
    
    /// Create backup
    pub async fn create_backup(&self) -> NikCliResult<ChatBackup> {
        let sessions = self.chat_manager.get_all_sessions().await;
        let total_messages: u32 = sessions.iter().map(|s| s.messages.len() as u32).sum();
        
        let backup = ChatBackup {
            sessions,
            created_at: chrono::Utc::now(),
            version: "1.0".to_string(),
            total_sessions: sessions.len() as u32,
            total_messages,
            backup_size: 0, // Will be calculated when serialized
        };
        
        info!("Created chat backup with {} sessions and {} messages", backup.total_sessions, backup.total_messages);
        Ok(backup)
    }
    
    /// Restore from backup
    pub async fn restore_from_backup(&self, backup: ChatBackup) -> NikCliResult<ChatImportResult> {
        let mut imported_sessions = 0;
        let mut imported_messages = 0;
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        
        for session in backup.sessions {
            match self.chat_manager.import_session(&serde_json::to_string(&session)?, ExportFormat::Json).await {
                Ok(result) => {
                    imported_sessions += result.imported_sessions;
                    imported_messages += result.imported_messages;
                    errors.extend(result.errors);
                    warnings.extend(result.warnings);
                }
                Err(e) => {
                    errors.push(format!("Failed to import session {}: {}", session.id, e));
                }
            }
        }
        
        info!("Restored backup: {} sessions, {} messages", imported_sessions, imported_messages);
        
        Ok(ChatImportResult {
            imported_sessions,
            imported_messages,
            skipped_sessions: 0,
            errors,
            warnings,
        })
    }
}