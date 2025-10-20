/*!
 * Advanced AI Provider
 * Streaming, caching, retry logic, and advanced features
 */

use anyhow::{Context, Result};
use async_trait::async_trait;
use dashmap::DashMap;
use futures::Stream;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

use super::model_provider::{ChatMessage, GenerateOptions, ModelProvider, ModelResponse};
use super::adaptive_model_router::{AdaptiveModelRouter, ModelScope};

/// Cache entry
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntry {
    response: ModelResponse,
    timestamp: u64,
    hits: usize,
}

/// Stream chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub content: String,
    pub is_final: bool,
    pub usage: Option<TokenUsage>,
    pub event_type: Option<String>,
    pub tool_name: Option<String>,
    pub tool_args: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Advanced generation options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvancedGenerateOptions {
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<ModelScope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_cache: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_ttl_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enable_retry: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<u32>,
}

impl From<AdvancedGenerateOptions> for GenerateOptions {
    fn from(opts: AdvancedGenerateOptions) -> Self {
        GenerateOptions {
            messages: opts.messages,
            temperature: opts.temperature,
            max_tokens: opts.max_tokens,
            stream: opts.stream,
            top_p: None,
            frequency_penalty: None,
            presence_penalty: None,
            stop: None,
        }
    }
}

/// Advanced AI Provider with caching and streaming
pub struct AdvancedAIProvider {
    provider: Arc<ModelProvider>,
    router: Arc<RwLock<AdaptiveModelRouter>>,
    cache: Arc<DashMap<String, CacheEntry>>,
    cache_enabled: bool,
    default_cache_ttl: u64,
    retry_enabled: bool,
    max_retries: u32,
}

impl AdvancedAIProvider {
    /// Create a new AdvancedAIProvider
    pub fn new(provider: ModelProvider) -> Self {
        Self {
            provider: Arc::new(provider),
            router: Arc::new(RwLock::new(AdaptiveModelRouter::new())),
            cache: Arc::new(DashMap::new()),
            cache_enabled: true,
            default_cache_ttl: 3600, // 1 hour
            retry_enabled: true,
            max_retries: 3,
        }
    }
    
    /// Create with custom configuration
    pub fn with_config(
        provider: ModelProvider,
        cache_enabled: bool,
        cache_ttl: u64,
        retry_enabled: bool,
        max_retries: u32,
    ) -> Self {
        Self {
            provider: Arc::new(provider),
            router: Arc::new(RwLock::new(AdaptiveModelRouter::new())),
            cache: Arc::new(DashMap::new()),
            cache_enabled,
            default_cache_ttl: cache_ttl,
            retry_enabled,
            max_retries,
        }
    }
    
    /// Generate completion with advanced features
    pub async fn generate(&self, options: AdvancedGenerateOptions) -> Result<ModelResponse> {
        // Check if we should use a specific model based on scope
        if let Some(scope) = options.scope {
            self.apply_scope_routing(scope).await?;
        }
        
        // Check cache if enabled
        let use_cache = options.use_cache.unwrap_or(self.cache_enabled);
        if use_cache {
            let cache_key = self.compute_cache_key(&options);
            if let Some(entry) = self.get_cached_response(&cache_key).await {
                return Ok(entry.response);
            }
        }
        
        // Generate with retry logic
        let response = if options.enable_retry.unwrap_or(self.retry_enabled) {
            self.generate_with_retry(
                options.clone().into(),
                options.max_retries.unwrap_or(self.max_retries),
            )
            .await?
        } else {
            self.provider.generate(options.clone().into()).await?
        };
        
        // Cache response if enabled
        if use_cache {
            let cache_key = self.compute_cache_key(&options);
            let ttl = options.cache_ttl_secs.unwrap_or(self.default_cache_ttl);
            self.cache_response(&cache_key, &response, ttl).await;
        }
        
        Ok(response)
    }
    
    /// Generate with streaming
    pub async fn generate_stream(
        &self,
        options: AdvancedGenerateOptions,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
        // Apply scope routing if specified
        if let Some(scope) = options.scope {
            self.apply_scope_routing(scope).await?;
        }
        
        // Generate stream
        let stream = self.provider.generate_stream(options.into()).await?;
        
        Ok(Box::pin(stream))
    }
    
    /// Apply scope-based routing
    async fn apply_scope_routing(&self, scope: ModelScope) -> Result<()> {
        let router = self.router.read().await;
        
        if let Some(model) = router.select_model(scope) {
            self.provider.switch_model(model).await?;
        }
        
        Ok(())
    }
    
    /// Generate with retry logic
    async fn generate_with_retry(
        &self,
        options: GenerateOptions,
        max_retries: u32,
    ) -> Result<ModelResponse> {
        let mut attempt = 0;
        let mut last_error = None;
        
        while attempt <= max_retries {
            match self.provider.generate(options.clone()).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    last_error = Some(e);
                    attempt += 1;
                    
                    if attempt <= max_retries {
                        // Exponential backoff
                        let delay = Duration::from_millis(100 * 2u64.pow(attempt - 1));
                        tokio::time::sleep(delay).await;
                    }
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Generation failed after {} retries", max_retries)))
    }
    
    /// Compute cache key from options
    fn compute_cache_key(&self, options: &AdvancedGenerateOptions) -> String {
        use sha2::{Digest, Sha256};
        
        let messages_json = serde_json::to_string(&options.messages).unwrap_or_default();
        let params = format!(
            "{}:{}:{}",
            messages_json,
            options.temperature.unwrap_or(0.7),
            options.max_tokens.unwrap_or(8192)
        );
        
        let mut hasher = Sha256::new();
        hasher.update(params.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Get cached response if valid
    async fn get_cached_response(&self, key: &str) -> Option<CacheEntry> {
        if let Some(mut entry) = self.cache.get_mut(key) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            
            // Check if cache entry is still valid
            if now - entry.timestamp < self.default_cache_ttl {
                entry.hits += 1;
                return Some(entry.clone());
            } else {
                // Remove expired entry
                drop(entry);
                self.cache.remove(key);
            }
        }
        
        None
    }
    
    /// Cache a response
    async fn cache_response(&self, key: &str, response: &ModelResponse, _ttl: u64) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        let entry = CacheEntry {
            response: response.clone(),
            timestamp: now,
            hits: 0,
        };
        
        self.cache.insert(key.to_string(), entry);
    }
    
    /// Clear cache
    pub async fn clear_cache(&self) {
        self.cache.clear();
    }
    
    /// Get cache statistics
    pub async fn get_cache_stats(&self) -> CacheStats {
        let total_entries = self.cache.len();
        let total_hits: usize = self.cache.iter().map(|e| e.hits).sum();
        
        CacheStats {
            total_entries,
            total_hits,
            hit_rate: if total_entries > 0 {
                total_hits as f32 / total_entries as f32
            } else {
                0.0
            },
        }
    }
    
    /// Get current model
    pub async fn get_current_model(&self) -> String {
        self.provider.get_current_model().await
    }
    
    /// Switch model
    pub async fn switch_model(&self, model: String) -> Result<()> {
        self.provider.switch_model(model).await
    }
    
    /// List available models
    pub async fn list_models(&self) -> Vec<String> {
        self.provider.list_models().await
    }

    /// Stream chat with full autonomy
    pub async fn stream_chat_with_full_autonomy(
        &self,
        messages: Vec<ChatMessage>,
        _options: serde_json::Value,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<StreamChunk>> + Send>>> {
        // Create stream options
        let stream_options = AdvancedGenerateOptions {
            messages,
            temperature: Some(0.7),
            max_tokens: Some(4096),
            stream: Some(true),
            scope: None,
            use_cache: Some(false),
            cache_ttl_secs: None,
            enable_retry: Some(true),
            max_retries: Some(3),
        };

        let string_stream = self.generate_stream(stream_options).await?;

        // Convert String stream to StreamChunk stream
        use futures::StreamExt;
        let chunk_stream = string_stream.map(|result| {
            result.map(|content| StreamChunk {
                content,
                is_final: false,
                usage: None,
                event_type: Some("text_delta".to_string()),
                tool_name: None,
                tool_args: None,
            })
        });

        Ok(Box::pin(chunk_stream))
    }
}

/// Cache statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub total_hits: usize,
    pub hit_rate: f32,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_cache_key_generation() {
        let provider = ModelProvider::new().unwrap();
        let advanced = AdvancedAIProvider::new(provider);
        
        let options = AdvancedGenerateOptions {
            messages: vec![ChatMessage {
                role: super::super::model_provider::Role::User,
                content: "Hello".to_string(),
                name: None,
            }],
            temperature: Some(0.7),
            max_tokens: Some(100),
            stream: None,
            scope: None,
            use_cache: Some(true),
            cache_ttl_secs: None,
            enable_retry: None,
            max_retries: None,
        };
        
        let key1 = advanced.compute_cache_key(&options);
        let key2 = advanced.compute_cache_key(&options);
        
        assert_eq!(key1, key2);
    }
    
    #[tokio::test]
    async fn test_cache_stats() {
        let provider = ModelProvider::new().unwrap();
        let advanced = AdvancedAIProvider::new(provider);
        
        let stats = advanced.get_cache_stats().await;
        assert_eq!(stats.total_entries, 0);
    }
}

