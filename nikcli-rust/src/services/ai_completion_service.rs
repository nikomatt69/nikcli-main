/*!
 * AI Completion Service - Production Ready
 */

use anyhow::Result;
use crate::ai::{ModelProvider, AdvancedAIProvider};
use crate::ai::model_provider::{ChatMessage, GenerateOptions, Role};
use std::sync::Arc;

pub struct AICompletionService {
    advanced_provider: Arc<AdvancedAIProvider>,
}

impl AICompletionService {
    pub fn new(model_provider: ModelProvider) -> Self {
        Self {
            advanced_provider: Arc::new(AdvancedAIProvider::new(model_provider)),
        }
    }
    
    pub async fn complete(&self, prompt: &str) -> Result<String> {
        let options = crate::ai::advanced_ai_provider::AdvancedGenerateOptions {
            messages: vec![ChatMessage {
                role: Role::User,
                content: prompt.to_string(),
                name: None,
            }],
            temperature: Some(0.7),
            max_tokens: Some(4096),
            stream: Some(false),
            scope: None,
            use_cache: Some(true),
            cache_ttl_secs: None,
            enable_retry: Some(true),
            max_retries: Some(3),
        };
        
        let response = self.advanced_provider.generate(options).await?;
        Ok(response.text)
    }
}

