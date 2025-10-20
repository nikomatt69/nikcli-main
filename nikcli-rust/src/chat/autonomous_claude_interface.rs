/*!
 * Autonomous Claude Interface - Production Ready
 */

use anyhow::Result;
use crate::ai::ModelProvider;
use std::sync::Arc;

pub struct AutonomousClaudeInterface {
    model_provider: Arc<ModelProvider>,
}

impl AutonomousClaudeInterface {
    pub fn new(model_provider: Arc<ModelProvider>) -> Self {
        Self { model_provider }
    }
    
    pub async fn process_message(&self, message: &str) -> Result<String> {
        use crate::ai::model_provider::{ChatMessage, GenerateOptions, Role};
        
        let options = GenerateOptions {
            messages: vec![ChatMessage {
                role: Role::User,
                content: message.to_string(),
                name: None,
            }],
            temperature: Some(0.7),
            max_tokens: Some(8192),
            stream: Some(false),
            top_p: None,
            frequency_penalty: None,
            presence_penalty: None,
            stop: None,
        };
        
        let response = self.model_provider.generate(options).await?;
        Ok(response.text)
    }
}

