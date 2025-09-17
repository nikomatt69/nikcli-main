use crate::ai::types::*;
use crate::ai::ai_call_manager::AiCallManager;
use crate::core::config::NikCliConfig;
use crate::error::NikCliResult;
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Modern AI provider with advanced features
pub struct ModernAiProvider {
    config: Arc<RwLock<NikCliConfig>>,
    call_manager: AiCallManager,
    context_window: Arc<RwLock<Vec<ChatMessage>>>,
    max_context_length: usize,
}

impl ModernAiProvider {
    /// Create a new modern AI provider
    pub fn new(config: Arc<RwLock<NikCliConfig>>) -> Self {
        Self {
            config,
            call_manager: AiCallManager::new(),
            context_window: Arc::new(RwLock::new(Vec::new())),
            max_context_length: 100, // Keep last 100 messages
        }
    }
    
    /// Add message to context window
    pub async fn add_to_context(&self, message: ChatMessage) {
        let mut context = self.context_window.write().await;
        context.push(message);
        
        // Trim context if it exceeds max length
        if context.len() > self.max_context_length {
            context.drain(0..context.len() - self.max_context_length);
        }
    }
    
    /// Clear context window
    pub async fn clear_context(&self) {
        let mut context = self.context_window.write().await;
        context.clear();
        info!("Context window cleared");
    }
    
    /// Get current context
    pub async fn get_context(&self) -> Vec<ChatMessage> {
        self.context_window.read().await.clone()
    }
    
    /// Generate response with context awareness
    pub async fn generate_with_context(&self, options: GenerateOptions) -> NikCliResult<ModelResponse> {
        // Add new messages to context
        for message in &options.messages {
            self.add_to_context(message.clone()).await;
        }
        
        // Get full context
        let context = self.get_context().await;
        
        // Create new options with full context
        let context_options = GenerateOptions {
            messages: context,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            stream: options.stream,
            scope: options.scope,
            needs_vision: options.needs_vision,
            size_hints: options.size_hints,
        };
        
        // Generate response
        let response = self.generate_text(context_options).await?;
        
        // Add response to context
        self.add_to_context(ChatMessage {
            role: ChatRole::Assistant,
            content: response.text.clone(),
            timestamp: Some(chrono::Utc::now()),
        }).await;
        
        Ok(response)
    }
    
    /// Stream response with context awareness
    pub async fn stream_with_context(&self, options: GenerateOptions) -> NikCliResult<Box<dyn tokio_stream::Stream<Item = StreamEvent> + Send + Unpin>> {
        // Add new messages to context
        for message in &options.messages {
            self.add_to_context(message.clone()).await;
        }
        
        // Get full context
        let context = self.get_context().await;
        
        // Create new options with full context
        let context_options = GenerateOptions {
            messages: context,
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            stream: options.stream,
            scope: options.scope,
            needs_vision: options.needs_vision,
            size_hints: options.size_hints,
        };
        
        // Stream response
        let stream = self.stream_text(context_options).await?;
        
        // Note: In a real implementation, we would need to collect the stream
        // and add the complete response to context
        
        Ok(stream)
    }
    
    /// Get conversation summary
    pub async fn get_conversation_summary(&self) -> String {
        let context = self.get_context().await;
        
        if context.is_empty() {
            return "No conversation history".to_string();
        }
        
        let mut summary = String::new();
        summary.push_str(&format!("Conversation with {} messages:\n", context.len()));
        
        let mut user_messages = 0;
        let mut assistant_messages = 0;
        let mut total_tokens = 0;
        
        for message in &context {
            match message.role {
                ChatRole::User => user_messages += 1,
                ChatRole::Assistant => assistant_messages += 1,
                ChatRole::System => {}
            }
            total_tokens += message.content.len() / 4; // Rough token estimate
        }
        
        summary.push_str(&format!("- User messages: {}\n", user_messages));
        summary.push_str(&format!("- Assistant messages: {}\n", assistant_messages));
        summary.push_str(&format!("- Estimated tokens: {}\n", total_tokens));
        
        if let Some(first_message) = context.first() {
            summary.push_str(&format!("- Started: {}\n", 
                first_message.timestamp.unwrap_or(chrono::Utc::now()).format("%Y-%m-%d %H:%M:%S")));
        }
        
        if let Some(last_message) = context.last() {
            summary.push_str(&format!("- Last activity: {}\n", 
                last_message.timestamp.unwrap_or(chrono::Utc::now()).format("%Y-%m-%d %H:%M:%S")));
        }
        
        summary
    }
    
    /// Get call manager
    pub fn get_call_manager(&self) -> &AiCallManager {
        &self.call_manager
    }
    
    /// Set max context length
    pub fn set_max_context_length(&mut self, length: usize) {
        self.max_context_length = length;
        info!("Set max context length to {}", length);
    }
    
    /// Get max context length
    pub fn get_max_context_length(&self) -> usize {
        self.max_context_length
    }
}

#[async_trait]
impl crate::ai::types::AiProvider for ModernAiProvider {
    fn name(&self) -> &str {
        "modern-ai-provider"
    }
    
    async fn is_available(&self) -> bool {
        // Check if we have any configured models
        let config = self.config.read().await;
        !config.models.is_empty()
    }
    
    async fn generate_text(&self, options: GenerateOptions) -> NikCliResult<ModelResponse> {
        let start_time = std::time::Instant::now();
        
        // Simulate AI generation
        let response_text = if let Some(last_message) = options.messages.last() {
            format!("I understand you're asking about: {}. Here's my response based on the context of our conversation.", 
                    last_message.content)
        } else {
            "Hello! I'm ready to help you.".to_string()
        };
        
        let duration = start_time.elapsed().as_millis() as u64;
        let tokens = response_text.len() / 4; // Rough token estimate
        
        // Record the call
        let call = crate::ai::ai_call_manager::AiCall {
            id: uuid::Uuid::new_v4().to_string(),
            model: "modern-model".to_string(),
            provider: AiProvider::OpenAi,
            request_tokens: tokens as u32,
            response_tokens: tokens as u32,
            duration_ms: duration,
            success: true,
            error: None,
            timestamp: chrono::Utc::now(),
            cost: tokens as f64 * 0.00001, // $0.01 per 1K tokens
        };
        
        self.call_manager.record_call(call).await;
        
        Ok(ModelResponse {
            text: response_text,
            usage: Some(TokenUsage {
                prompt_tokens: tokens as u32,
                completion_tokens: tokens as u32,
                total_tokens: (tokens * 2) as u32,
            }),
            finish_reason: Some(FinishReason::Stop),
            warnings: None,
        })
    }
    
    async fn stream_text(&self, options: GenerateOptions) -> NikCliResult<Box<dyn tokio_stream::Stream<Item = StreamEvent> + Send + Unpin>> {
        let messages = options.messages.clone();
        
        let stream = tokio_stream::unfold((messages, 0), move |(msgs, index)| async move {
            if index >= 3 {
                return None; // End after 3 events
            }
            
            let event = match index {
                0 => StreamEvent {
                    event_type: StreamEventType::Start,
                    content: Some("Starting modern AI response".to_string()),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    error: None,
                    metadata: None,
                },
                1 => StreamEvent {
                    event_type: StreamEventType::TextDelta,
                    content: Some("Processing your request with modern AI capabilities...".to_string()),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    error: None,
                    metadata: None,
                },
                2 => StreamEvent {
                    event_type: StreamEventType::Complete,
                    content: Some("Modern AI response completed".to_string()),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    error: None,
                    metadata: None,
                },
                _ => return None,
            };
            
            Some((event, (msgs, index + 1)))
        });
        
        Ok(Box::new(stream))
    }
    
    async fn generate_structured<T>(&self, options: GenerateOptions, _schema: &T) -> NikCliResult<T>
    where
        T: serde::de::DeserializeOwned + Send + Sync,
    {
        // This would use the AI model to generate structured data
        // For now, return an error
        Err(crate::error::NikCliError::NotImplemented("Structured generation not yet implemented".to_string()))
    }
    
    fn get_model_info(&self) -> ModelConfig {
        ModelConfig {
            provider: AiProvider::OpenAi,
            model: "modern-model".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4000),
            api_key: None,
            base_url: None,
            timeout: Some(30000),
        }
    }
    
    fn get_stats(&self) -> AiCallStats {
        // This would return actual stats from the call manager
        AiCallStats {
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
            total_tokens: 0,
            total_cost: 0.0,
            average_response_time: 0.0,
            last_call: None,
        }
    }
}