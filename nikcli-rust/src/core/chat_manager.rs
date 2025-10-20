use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tracing::debug;

use super::ai_provider::{AIMessage, AIProvider, AIResponse};
use super::config_manager::ConfigManager;
use super::token_manager::TokenManager;

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl ChatMessage {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: content.into(),
            timestamp: chrono::Utc::now(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: "assistant".to_string(),
            content: content.into(),
            timestamp: chrono::Utc::now(),
        }
    }

    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".to_string(),
            content: content.into(),
            timestamp: chrono::Utc::now(),
        }
    }
}

/// Chat manager for handling conversations
pub struct ChatManager {
    messages: Vec<ChatMessage>,
    system_prompt: Option<String>,
    ai_provider: AIProvider,
}

impl ChatManager {
    /// Create a new chat manager
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            system_prompt: None,
            ai_provider: AIProvider::new(),
        }
    }

    /// Set system prompt
    pub fn set_system_prompt(&mut self, prompt: impl Into<String>) {
        self.system_prompt = Some(prompt.into());
    }

    /// Add a message to the conversation
    pub fn add_message(&mut self, message: ChatMessage) {
        self.messages.push(message);
    }

    /// Get all messages
    pub fn get_messages(&self) -> &[ChatMessage] {
        &self.messages
    }

    /// Clear chat history
    pub fn clear(&mut self) {
        self.messages.clear();
    }

    /// Send a message and get AI response
    pub async fn send_message(
        &mut self,
        content: &str,
        config: &ConfigManager,
        token_manager: &TokenManager,
    ) -> Result<String> {
        debug!("Sending message: {}", content);

        // Add user message
        let user_message = ChatMessage::user(content);
        self.add_message(user_message);

        // Prepare messages for AI
        let mut ai_messages = Vec::new();

        // Add system prompt if present
        if let Some(system_prompt) = &self.system_prompt {
            ai_messages.push(AIMessage {
                role: "system".to_string(),
                content: system_prompt.clone(),
            });
        }

        // Add conversation history
        for msg in &self.messages {
            ai_messages.push(AIMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        // Get API key
        let api_key = config
            .get_api_key()
            .context("No API key configured. Set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY environment variable")?;

        // Get response from AI
        let response = self
            .ai_provider
            .send_message(&ai_messages, &config.get_current_model(), &api_key)
            .await?;

        // Track tokens
        if let (Some(prompt_tokens), Some(completion_tokens)) =
            (response.usage.prompt_tokens, response.usage.completion_tokens)
        {
            // TODO: Update token manager
            debug!(
                "Tokens used - Prompt: {}, Completion: {}",
                prompt_tokens, completion_tokens
            );
        }

        // Add assistant response
        let assistant_message = ChatMessage::assistant(&response.content);
        self.add_message(assistant_message);

        Ok(response.content)
    }

    /// Get conversation context for display
    pub fn get_context_summary(&self) -> String {
        format!("{} messages in conversation", self.messages.len())
    }
}

impl Default for ChatManager {
    fn default() -> Self {
        Self::new()
    }
}
