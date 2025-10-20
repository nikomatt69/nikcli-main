/*!
 * ai-lib Configuration Module
 * OpenRouter as main unified gateway provider
 */

use ai_lib::{AiClient, Provider, ConnectionOptions};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::collections::HashMap;

/// Provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider: String,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub timeout_secs: Option<u64>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

/// Main ai-lib configuration using OpenRouter as gateway
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiLibConfig {
    /// Default provider (OpenRouter)
    pub default_provider: String,
    
    /// Current model (OpenRouter format: provider/model)
    pub current_model: String,
    
    /// Available models with their configurations
    pub models: HashMap<String, ProviderConfig>,
    
    /// OpenRouter API key
    pub openrouter_api_key: Option<String>,
    
    /// Fallback providers
    pub fallback_providers: Vec<String>,
    
    /// Global timeout
    pub timeout_secs: u64,
    
    /// Max concurrency
    pub max_concurrency: usize,
}

impl Default for AiLibConfig {
    fn default() -> Self {
        let mut models = HashMap::new();
        
        // OpenRouter models (gateway format: provider/model)
        models.insert(
            "openai/gpt-4o".to_string(),
            ProviderConfig {
                provider: "openrouter".to_string(),
                model: "openai/gpt-4o".to_string(),
                api_key: None,
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
                timeout_secs: Some(120),
                max_tokens: Some(16384),
                temperature: Some(0.7),
            },
        );
        
        models.insert(
            "anthropic/claude-haiku-4.5".to_string(),
            ProviderConfig {
                provider: "openrouter".to_string(),
                model: "anthropic/claude-haiku-4.5".to_string(),
                api_key: None,
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
                timeout_secs: Some(120),
                max_tokens: Some(8192),
                temperature: Some(0.7),
            },
        );
        
        models.insert(
            "anthropic/claude-3-opus".to_string(),
            ProviderConfig {
                provider: "openrouter".to_string(),
                model: "anthropic/claude-3-opus".to_string(),
                api_key: None,
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
                timeout_secs: Some(120),
                max_tokens: Some(4096),
                temperature: Some(0.7),
            },
        );

        models.insert(
            "anthropic/claude-3-5-sonnet-20241022".to_string(),
            ProviderConfig {
                provider: "openrouter".to_string(),
                model: "anthropic/claude-3-5-sonnet-20241022".to_string(),
                api_key: None,
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
                timeout_secs: Some(120),
                max_tokens: Some(8192),
                temperature: Some(0.7),
            },
        );
        
        models.insert(
            "google/gemini-2.0-flash-exp".to_string(),
            ProviderConfig {
                provider: "openrouter".to_string(),
                model: "google/gemini-2.0-flash-exp:free".to_string(),
                api_key: None,
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
                timeout_secs: Some(90),
                max_tokens: Some(8192),
                temperature: Some(0.7),
            },
        );
        
        models.insert(
            "deepseek/deepseek-chat".to_string(),
            ProviderConfig {
                provider: "openrouter".to_string(),
                model: "deepseek/deepseek-chat".to_string(),
                api_key: None,
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
                timeout_secs: Some(90),
                max_tokens: Some(8192),
                temperature: Some(0.7),
            },
        );
        
        models.insert(
            "meta-llama/llama-3.3-70b-instruct".to_string(),
            ProviderConfig {
                provider: "openrouter".to_string(),
                model: "meta-llama/llama-3.3-70b-instruct".to_string(),
                api_key: None,
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
                timeout_secs: Some(90),
                max_tokens: Some(8192),
                temperature: Some(0.7),
            },
        );
        
        // Direct providers as fallback (if OpenRouter fails)
        models.insert(
            "openai-direct".to_string(),
            ProviderConfig {
                provider: "openai".to_string(),
                model: "gpt-4o".to_string(),
                api_key: None,
                base_url: None,
                timeout_secs: Some(120),
                max_tokens: Some(16384),
                temperature: Some(0.7),
            },
        );
        
        models.insert(
            "anthropic-direct".to_string(),
            ProviderConfig {
                provider: "anthropic".to_string(),
                model: "claude-3-5-sonnet-20241022".to_string(),
                api_key: None,
                base_url: None,
                timeout_secs: Some(120),
                max_tokens: Some(8192),
                temperature: Some(0.7),
            },
        );
        
        Self {
            default_provider: "openrouter".to_string(),
            current_model: "anthropic/claude-haiku-4.5".to_string(),
            models,
            openrouter_api_key: None,
            fallback_providers: vec![
                "openai-direct".to_string(),
                "anthropic-direct".to_string(),
            ],
            timeout_secs: 120,
            max_concurrency: 64,
        }
    }
}

impl AiLibConfig {
    /// Load configuration from environment variables
    pub fn from_env() -> Result<Self> {
        let mut config = Self::default();
        
        // Load OpenRouter API key
        if let Ok(key) = std::env::var("OPENROUTER_API_KEY") {
            config.openrouter_api_key = Some(key.clone());
            
            // Set OpenRouter key for all OpenRouter models
            for (_, model_config) in config.models.iter_mut() {
                if model_config.provider == "openrouter" {
                    model_config.api_key = Some(key.clone());
                }
            }
        }
        
        // Load direct provider keys as fallbacks
        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            if let Some(model_config) = config.models.get_mut("openai-direct") {
                model_config.api_key = Some(key);
            }
        }
        
        if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
            if let Some(model_config) = config.models.get_mut("anthropic-direct") {
                model_config.api_key = Some(key);
            }
        }
        
        // Load current model from env
        if let Ok(model) = std::env::var("NIKCLI_MODEL") {
            config.current_model = model;
        }
        
        // Load timeout
        if let Ok(timeout) = std::env::var("AI_TIMEOUT_SECS") {
            config.timeout_secs = timeout.parse().unwrap_or(120);
        }
        
        Ok(config)
    }
    
    /// Create ai-lib client for the current model
    pub fn create_client(&self) -> Result<AiClient> {
        let model_config = self.models
            .get(&self.current_model)
            .context("Model configuration not found")?;
        
        self.create_client_for_model(model_config)
    }
    
    /// Create ai-lib client for a specific model configuration
    pub fn create_client_for_model(&self, config: &ProviderConfig) -> Result<AiClient> {
        let provider = self.get_provider(&config.provider)?;
        
        let options = ConnectionOptions {
            base_url: config.base_url.clone(),
            proxy: std::env::var("AI_PROXY_URL").ok(),
            api_key: config.api_key.clone(),
            timeout: Some(Duration::from_secs(
                config.timeout_secs.unwrap_or(self.timeout_secs)
            )),
            disable_proxy: false,
        };
        
        AiClient::with_options(provider, options)
            .context("Failed to create ai-lib client")
    }
    
    /// Create client with failover support
    pub fn create_client_with_failover(&self) -> Result<AiClient> {
        // ai-lib 0.3.3 does not expose with_failover; return base client
        self.create_client()
    }
    
    /// Get ai-lib Provider enum from string
    fn get_provider(&self, name: &str) -> Result<Provider> {
        match name.to_lowercase().as_str() {
            // Map OpenRouter to OpenAI adapter with custom base_url
            "openrouter" => Ok(Provider::OpenAI),
            "openai" => Ok(Provider::OpenAI),
            "anthropic" => Ok(Provider::Anthropic),
            // Map Google to Gemini adapter
            "google" => Ok(Provider::Gemini),
            "mistral" => Ok(Provider::Mistral),
            "cohere" => Ok(Provider::Cohere),
            "groq" => Ok(Provider::Groq),
            "deepseek" => Ok(Provider::DeepSeek),
            "ollama" => Ok(Provider::Ollama),
            // Providers below are not native in 0.3.3; map generically
            "replicate" => Ok(Provider::OpenAI),
            "perplexity" => Ok(Provider::OpenAI),
            "huggingface" => Ok(Provider::HuggingFace),
            "togetherai" => Ok(Provider::TogetherAI),
            _ => anyhow::bail!("Unsupported provider: {}", name),
        }
    }
    
    /// Get current model configuration
    pub fn get_current_model_config(&self) -> Option<&ProviderConfig> {
        self.models.get(&self.current_model)
    }
    
    /// Set current model
    pub fn set_current_model(&mut self, model: String) -> Result<()> {
        if !self.models.contains_key(&model) {
            anyhow::bail!("Model not found: {}", model);
        }
        self.current_model = model;
        Ok(())
    }
    
    /// Add a new model configuration
    pub fn add_model(&mut self, name: String, config: ProviderConfig) {
        self.models.insert(name, config);
    }
    
    /// List available models
    pub fn list_models(&self) -> Vec<String> {
        self.models.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        let config = AiLibConfig::default();
        assert_eq!(config.default_provider, "openrouter");
        assert!(config.models.contains_key("anthropic/claude-3-5-sonnet"));
    }
    
    #[test]
    fn test_provider_mapping() {
        let config = AiLibConfig::default();
        assert!(config.get_provider("openrouter").is_ok());
        assert!(config.get_provider("openai").is_ok());
        assert!(config.get_provider("anthropic").is_ok());
    }
}
