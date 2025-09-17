use crate::core::types::*;
use crate::error::NikCliResult;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Performance optimizer for system optimization
pub struct PerformanceOptimizer {
    config: PerformanceOptimizationConfig,
    cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
    metrics: Arc<RwLock<PerformanceMetrics>>,
    token_optimizer: TokenOptimizer,
}

/// Token optimizer for managing token usage
pub struct TokenOptimizer {
    config: TokenOptimizationConfig,
    token_budget: Arc<RwLock<u32>>,
    usage_tracking: Arc<RwLock<HashMap<String, TokenUsage>>>,
}

/// Performance metrics
#[derive(Debug, Clone)]
pub struct PerformanceMetrics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub average_response_time_ms: f64,
    pub cache_hit_rate: f64,
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: f64,
    pub token_usage: u64,
    pub token_budget_remaining: u32,
    pub optimization_savings: f64,
}

/// Token usage tracking
#[derive(Debug, Clone)]
pub struct TokenUsage {
    pub total_tokens: u32,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cached_tokens: u32,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Unified token budget for managing token allocation
pub struct UnifiedTokenBudget {
    total_budget: u32,
    allocated_budget: Arc<RwLock<HashMap<String, u32>>>,
    usage_tracking: Arc<RwLock<HashMap<String, TokenUsage>>>,
}

impl PerformanceOptimizer {
    /// Create a new performance optimizer
    pub fn new(config: PerformanceOptimizationConfig) -> Self {
        let token_config = TokenOptimizationConfig {
            max_tokens: 100000,
            token_budget: 50000,
            compression_ratio: 0.7,
            enable_smart_truncation: true,
            preserve_important_content: true,
            enable_context_compression: true,
            context_window_size: 8000,
            overlap_size: 200,
        };
        
        Self {
            config,
            cache: Arc::new(RwLock::new(HashMap::new())),
            metrics: Arc::new(RwLock::new(PerformanceMetrics {
                total_requests: 0,
                successful_requests: 0,
                failed_requests: 0,
                average_response_time_ms: 0.0,
                cache_hit_rate: 0.0,
                memory_usage_bytes: 0,
                cpu_usage_percent: 0.0,
                token_usage: 0,
                token_budget_remaining: token_config.token_budget,
                optimization_savings: 0.0,
            })),
            token_optimizer: TokenOptimizer::new(token_config),
        }
    }
    
    /// Optimize content for better performance
    pub async fn optimize_content(&self, content: &str, optimization_type: OptimizationType) -> NikCliResult<String> {
        match optimization_type {
            OptimizationType::Compression => self.compress_content(content).await,
            OptimizationType::Truncation => self.truncate_content(content).await,
            OptimizationType::Summarization => self.summarize_content(content).await,
            OptimizationType::TokenReduction => self.reduce_tokens(content).await,
        }
    }
    
    /// Compress content
    async fn compress_content(&self, content: &str) -> NikCliResult<String> {
        if !self.config.enable_compression {
            return Ok(content.to_string());
        }
        
        // Simple compression by removing extra whitespace and comments
        let compressed = content
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty() && !line.starts_with("//") && !line.starts_with("#"))
            .collect::<Vec<&str>>()
            .join(" ");
        
        debug!("Content compressed from {} to {} characters", content.len(), compressed.len());
        Ok(compressed)
    }
    
    /// Truncate content intelligently
    async fn truncate_content(&self, content: &str) -> NikCliResult<String> {
        if content.len() <= self.config.max_cache_size {
            return Ok(content.to_string());
        }
        
        // Simple truncation - keep first and last parts
        let max_length = self.config.max_cache_size;
        let keep_start = max_length / 3;
        let keep_end = max_length / 3;
        
        if content.len() <= max_length {
            return Ok(content.to_string());
        }
        
        let start = &content[0..keep_start];
        let end = &content[content.len() - keep_end..];
        let truncated = format!("{}...{}", start, end);
        
        debug!("Content truncated from {} to {} characters", content.len(), truncated.len());
        Ok(truncated)
    }
    
    /// Summarize content
    async fn summarize_content(&self, content: &str) -> NikCliResult<String> {
        // Simple summarization by taking first few sentences
        let sentences: Vec<&str> = content.split('.').collect();
        let summary_sentences = sentences.iter().take(3).collect::<Vec<&&str>>();
        let summary = summary_sentences.join(". ") + ".";
        
        debug!("Content summarized from {} to {} characters", content.len(), summary.len());
        Ok(summary)
    }
    
    /// Reduce token count
    async fn reduce_tokens(&self, content: &str) -> NikCliResult<String> {
        // Simple token reduction by removing common words and shortening
        let words: Vec<&str> = content.split_whitespace().collect();
        let filtered_words: Vec<&str> = words
            .iter()
            .filter(|word| {
                let word = word.to_lowercase();
                !matches!(word.as_str(), "the" | "a" | "an" | "and" | "or" | "but" | "in" | "on" | "at" | "to" | "for" | "of" | "with" | "by")
            })
            .take(100) // Limit to 100 words
            .cloned()
            .collect();
        
        let reduced = filtered_words.join(" ");
        debug!("Token count reduced from {} to {} words", words.len(), filtered_words.len());
        Ok(reduced)
    }
    
    /// Cache content
    pub async fn cache_content(&self, key: String, content: String) -> NikCliResult<()> {
        if !self.config.enable_caching {
            return Ok(());
        }
        
        let expires_at = if self.config.cache_ttl_seconds > 0 {
            Some(chrono::Utc::now() + chrono::Duration::seconds(self.config.cache_ttl_seconds as i64))
        } else {
            None
        };
        
        let cache_entry = CacheEntry {
            key: key.clone(),
            value: serde_json::Value::String(content),
            created_at: chrono::Utc::now(),
            expires_at,
            access_count: 0,
            last_accessed: chrono::Utc::now(),
            size_bytes: 0, // Would be calculated
            metadata: HashMap::new(),
        };
        
        {
            let mut cache = self.cache.write().await;
            cache.insert(key, cache_entry);
            
            // Enforce cache size limit
            if cache.len() > self.config.max_cache_size {
                self.cleanup_cache().await?;
            }
        }
        
        debug!("Content cached with key");
        Ok(())
    }
    
    /// Get cached content
    pub async fn get_cached_content(&self, key: &str) -> Option<String> {
        let mut cache = self.cache.write().await;
        if let Some(entry) = cache.get_mut(key) {
            // Check if expired
            if let Some(expires_at) = entry.expires_at {
                if chrono::Utc::now() > expires_at {
                    cache.remove(key);
                    return None;
                }
            }
            
            // Update access statistics
            entry.access_count += 1;
            entry.last_accessed = chrono::Utc::now();
            
            // Return content
            if let serde_json::Value::String(content) = &entry.value {
                return Some(content.clone());
            }
        }
        
        None
    }
    
    /// Cleanup expired cache entries
    async fn cleanup_cache(&self) -> NikCliResult<()> {
        let mut cache = self.cache.write().await;
        let now = chrono::Utc::now();
        
        cache.retain(|_, entry| {
            if let Some(expires_at) = entry.expires_at {
                now <= expires_at
            } else {
                true
            }
        });
        
        // If still over limit, remove oldest entries
        if cache.len() > self.config.max_cache_size {
            let mut entries: Vec<_> = cache.iter().collect();
            entries.sort_by(|a, b| a.1.last_accessed.cmp(&b.1.last_accessed));
            
            let to_remove = cache.len() - self.config.max_cache_size;
            for (key, _) in entries.iter().take(to_remove) {
                cache.remove(*key);
            }
        }
        
        debug!("Cache cleaned up, {} entries remaining", cache.len());
        Ok(())
    }
    
    /// Get performance metrics
    pub async fn get_metrics(&self) -> PerformanceMetrics {
        let metrics = self.metrics.read().await;
        metrics.clone()
    }
    
    /// Update performance metrics
    pub async fn update_metrics(&self, request_time_ms: u64, success: bool, cache_hit: bool) {
        let mut metrics = self.metrics.write().await;
        
        metrics.total_requests += 1;
        if success {
            metrics.successful_requests += 1;
        } else {
            metrics.failed_requests += 1;
        }
        
        // Update average response time
        let total_time = metrics.average_response_time_ms * (metrics.total_requests - 1) as f64 + request_time_ms as f64;
        metrics.average_response_time_ms = total_time / metrics.total_requests as f64;
        
        // Update cache hit rate
        let total_hits = (metrics.cache_hit_rate * (metrics.total_requests - 1) as f64) as u64;
        let new_hits = if cache_hit { total_hits + 1 } else { total_hits };
        metrics.cache_hit_rate = new_hits as f64 / metrics.total_requests as f64;
    }
    
    /// Get cache statistics
    pub async fn get_cache_statistics(&self) -> CacheStatistics {
        let cache = self.cache.read().await;
        
        let total_entries = cache.len();
        let total_size_bytes: u64 = cache.values().map(|entry| entry.size_bytes).sum();
        let hit_count = cache.values().map(|entry| entry.access_count).sum();
        let miss_count = 0; // Would be tracked separately
        
        let hit_rate = if hit_count + miss_count > 0 {
            hit_count as f64 / (hit_count + miss_count) as f64
        } else {
            0.0
        };
        
        let oldest_entry = cache.values().map(|entry| entry.created_at).min();
        let newest_entry = cache.values().map(|entry| entry.created_at).max();
        
        CacheStatistics {
            total_entries,
            total_size_bytes,
            hit_count,
            miss_count,
            hit_rate,
            average_access_time_ms: 0.0, // Would be calculated
            oldest_entry,
            newest_entry,
        }
    }
    
    /// Get token optimizer
    pub fn get_token_optimizer(&self) -> &TokenOptimizer {
        &self.token_optimizer
    }
}

/// Optimization types
#[derive(Debug, Clone, PartialEq)]
pub enum OptimizationType {
    Compression,
    Truncation,
    Summarization,
    TokenReduction,
}

impl std::fmt::Display for OptimizationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OptimizationType::Compression => write!(f, "compression"),
            OptimizationType::Truncation => write!(f, "truncation"),
            OptimizationType::Summarization => write!(f, "summarization"),
            OptimizationType::TokenReduction => write!(f, "token_reduction"),
        }
    }
}

impl TokenOptimizer {
    /// Create a new token optimizer
    pub fn new(config: TokenOptimizationConfig) -> Self {
        Self {
            config,
            token_budget: Arc::new(RwLock::new(config.token_budget)),
            usage_tracking: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Allocate tokens for a request
    pub async fn allocate_tokens(&self, request_id: &str, estimated_tokens: u32) -> NikCliResult<u32> {
        let mut budget = self.token_budget.write().await;
        
        if *budget < estimated_tokens {
            return Err(crate::error::NikCliError::ResourceExhausted(
                format!("Insufficient token budget: {} requested, {} available", estimated_tokens, *budget)
            ));
        }
        
        *budget -= estimated_tokens;
        
        // Track usage
        {
            let mut usage = self.usage_tracking.write().await;
            usage.insert(request_id.to_string(), TokenUsage {
                total_tokens: estimated_tokens,
                prompt_tokens: estimated_tokens,
                completion_tokens: 0,
                cached_tokens: 0,
                timestamp: chrono::Utc::now(),
            });
        }
        
        debug!("Allocated {} tokens for request {}", estimated_tokens, request_id);
        Ok(estimated_tokens)
    }
    
    /// Release tokens back to budget
    pub async fn release_tokens(&self, request_id: &str, actual_tokens: u32) -> NikCliResult<()> {
        let mut budget = self.token_budget.write().await;
        
        // Update usage tracking
        {
            let mut usage = self.usage_tracking.write().await;
            if let Some(token_usage) = usage.get_mut(request_id) {
                let difference = token_usage.total_tokens.saturating_sub(actual_tokens);
                *budget += difference;
                token_usage.total_tokens = actual_tokens;
            }
        }
        
        debug!("Released tokens for request {}", request_id);
        Ok(())
    }
    
    /// Get remaining token budget
    pub async fn get_remaining_budget(&self) -> u32 {
        let budget = self.token_budget.read().await;
        *budget
    }
    
    /// Get token usage statistics
    pub async fn get_usage_statistics(&self) -> HashMap<String, TokenUsage> {
        let usage = self.usage_tracking.read().await;
        usage.clone()
    }
    
    /// Optimize content for token usage
    pub async fn optimize_for_tokens(&self, content: &str) -> NikCliResult<String> {
        if !self.config.enable_smart_truncation {
            return Ok(content.to_string());
        }
        
        // Simple token optimization
        let words: Vec<&str> = content.split_whitespace().collect();
        let max_words = (self.config.context_window_size as f32 * self.config.compression_ratio) as usize;
        
        if words.len() <= max_words {
            return Ok(content.to_string());
        }
        
        let optimized = words.iter().take(max_words).collect::<Vec<&&str>>().join(" ");
        debug!("Content optimized from {} to {} words", words.len(), max_words);
        Ok(optimized)
    }
}

impl UnifiedTokenBudget {
    /// Create a new unified token budget
    pub fn new(total_budget: u32) -> Self {
        Self {
            total_budget,
            allocated_budget: Arc::new(RwLock::new(HashMap::new())),
            usage_tracking: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Allocate tokens for a specific purpose
    pub async fn allocate_tokens(&self, purpose: &str, complexity: u32, priority: &str) -> NikCliResult<u32> {
        let base_allocation = match priority {
            "high" => 1000,
            "normal" => 500,
            "low" => 200,
            _ => 300,
        };
        
        let allocation = base_allocation * complexity;
        
        let mut allocated = self.allocated_budget.write().await;
        let current_total: u32 = allocated.values().sum();
        
        if current_total + allocation > self.total_budget {
            return Err(crate::error::NikCliError::ResourceExhausted(
                format!("Insufficient token budget for allocation")
            ));
        }
        
        allocated.insert(purpose.to_string(), allocation);
        
        debug!("Allocated {} tokens for {} (complexity: {}, priority: {})", allocation, purpose, complexity, priority);
        Ok(allocation)
    }
    
    /// Release tokens for a specific purpose
    pub async fn release_tokens(&self, purpose: &str) -> NikCliResult<u32> {
        let mut allocated = self.allocated_budget.write().await;
        if let Some(tokens) = allocated.remove(purpose) {
            debug!("Released {} tokens for {}", tokens, purpose);
            Ok(tokens)
        } else {
            Ok(0)
        }
    }
    
    /// Get remaining budget
    pub async fn get_remaining_budget(&self) -> u32 {
        let allocated = self.allocated_budget.read().await;
        let used: u32 = allocated.values().sum();
        self.total_budget.saturating_sub(used)
    }
    
    /// Get allocation status
    pub async fn get_allocation_status(&self) -> HashMap<String, u32> {
        let allocated = self.allocated_budget.read().await;
        allocated.clone()
    }
}