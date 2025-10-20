//! Type definitions for Semantic Caching System
//! Provides caching for semantically similar queries to reduce redundant API calls

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Cache entry with semantic similarity metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub id: String,
    pub query: String,
    pub result: String,
    pub query_embedding: Vec<f32>,
    pub result_embedding: Vec<f32>,
    pub similarity: f64,
    pub timestamp: DateTime<Utc>,
    pub ttl: u64,
    pub metadata: CacheMetadata,
    pub access_count: u64,
    pub last_accessed: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_hit: Option<bool>,
}

/// Cache metadata for additional context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheMetadata {
    pub query_length: u64,
    pub result_length: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_used: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
}

/// Cache configuration options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheConfig {
    pub enabled: bool,
    pub min_similarity: f64,
    pub ttl: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cache_size: Option<u64>,
    pub use_vector_db: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedding_provider: Option<EmbeddingProvider>,
    pub cache_backend: CacheBackend,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redis_key_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vector_collection: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_cleanup_interval: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metrics_enabled: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EmbeddingProvider {
    OpenAI,
    Anthropic,
    Google,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CacheBackend {
    Redis,
    Memory,
    ChromaDB,
}

/// Cache statistics for monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub total_entries: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub total_queries: u64,
    pub hit_rate: f64,
    pub save_rate: f64,
    pub total_tokens_saved: u64,
    pub estimated_cost_saved: f64,
    pub average_similarity: f64,
    pub average_query_time: f64,
    pub memory_usage: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oldest_entry: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub newest_entry: Option<DateTime<Utc>>,
    pub frequent_queries: Vec<FrequentQuery>,
    pub by_category: HashMap<String, CategoryStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequentQuery {
    pub query: String,
    pub count: u64,
    pub similarity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryStats {
    pub entries: u64,
    pub hits: u64,
}

/// Query result from cache
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry: Option<CacheEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub similarity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<CacheResultReason>,
    pub query_id: String,
    pub processing_time: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<CacheMetadata>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CacheResultReason {
    Hit,
    Miss,
    Expired,
    Error,
}

/// Cache query options
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheQueryOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_similarity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_results: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_expired: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter_by_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter_by_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

/// Cache store options
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStoreOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<CacheMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

/// Cache performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheMetrics {
    pub queries_per_second: f64,
    pub average_response_time: f64,
    pub cache_hit_ratio: f64,
    pub memory_efficiency: f64,
    pub embedding_similarity: f64,
    pub time_to_live_distribution: HashMap<u64, u64>,
    pub eviction_reasons: HashMap<String, u64>,
}

/// Vector similarity search result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorSearchResult {
    pub id: String,
    pub similarity: f64,
    pub entry: CacheEntry,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// Cache eviction policy
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvictionPolicy {
    #[serde(rename = "type")]
    pub policy_type: EvictionType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_threshold: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lru_interval: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EvictionType {
    Lru,
    Lfu,
    Ttl,
    Size,
    Random,
}

/// Cache event types for system integration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CacheEventType {
    CacheHit,
    CacheMiss,
    CacheUpdate,
    CacheExpired,
    CacheEvicted,
    CacheError,
    CacheCleared,
}

/// Cache event for system integration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEvent {
    #[serde(rename = "type")]
    pub event_type: CacheEventType,
    pub query_id: String,
    pub similarity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_result_id: Option<String>,
    pub metadata: CacheMetadata,
    pub timestamp: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Cache validation utilities
pub struct CacheValidator;

impl CacheValidator {
    /// Validate cache entry
    pub fn validate_entry(entry: &CacheEntry) -> anyhow::Result<()> {
        if entry.query.is_empty() || entry.query.len() > 10000 {
            anyhow::bail!("Query length must be between 1 and 10000 characters");
        }
        if entry.result.is_empty() || entry.result.len() > 50000 {
            anyhow::bail!("Result length must be between 1 and 50000 characters");
        }
        if entry.query_embedding.len() > 1536 {
            anyhow::bail!("Query embedding length exceeds maximum of 1536");
        }
        if entry.result_embedding.len() > 1536 {
            anyhow::bail!("Result embedding length exceeds maximum of 1536");
        }
        if !Self::is_valid_similarity(entry.similarity) {
            anyhow::bail!("Similarity must be between 0 and 1");
        }
        if !Self::is_valid_ttl(entry.ttl) {
            anyhow::bail!("TTL must be at least 60 seconds");
        }
        Ok(())
    }

    /// Validate cache configuration
    pub fn validate_config(config: &CacheConfig) -> anyhow::Result<()> {
        if !Self::is_valid_similarity(config.min_similarity) {
            anyhow::bail!("Min similarity must be between 0 and 1");
        }
        if !Self::is_valid_ttl(config.ttl) {
            anyhow::bail!("TTL must be at least 60 seconds");
        }
        if let Some(max_size) = config.max_cache_size {
            if max_size < 100 {
                anyhow::bail!("Max cache size must be at least 100");
            }
        }
        Ok(())
    }

    /// Validate cache statistics
    pub fn validate_stats(stats: &CacheStats) -> anyhow::Result<()> {
        if stats.hit_rate < 0.0 || stats.hit_rate > 1.0 {
            anyhow::bail!("Hit rate must be between 0 and 1");
        }
        if stats.save_rate < 0.0 || stats.save_rate > 1.0 {
            anyhow::bail!("Save rate must be between 0 and 1");
        }
        if stats.average_similarity < 0.0 || stats.average_similarity > 1.0 {
            anyhow::bail!("Average similarity must be between 0 and 1");
        }
        Ok(())
    }

    /// Validate cache result
    pub fn validate_result(result: &CacheResult) -> anyhow::Result<()> {
        if let Some(sim) = result.similarity {
            if !Self::is_valid_similarity(sim) {
                anyhow::bail!("Similarity must be between 0 and 1");
            }
        }
        Ok(())
    }

    /// Validate cache event
    pub fn validate_event(event: &CacheEvent) -> anyhow::Result<()> {
        if !Self::is_valid_similarity(event.similarity) {
            anyhow::bail!("Similarity must be between 0 and 1");
        }
        Ok(())
    }

    /// Check if similarity value is valid
    pub fn is_valid_similarity(similarity: f64) -> bool {
        similarity >= 0.0 && similarity <= 1.0
    }

    /// Check if TTL is valid (minimum 60 seconds)
    pub fn is_valid_ttl(ttl: u64) -> bool {
        ttl >= 60
    }

    /// Check if query length is valid
    pub fn is_valid_query_length(length: usize) -> bool {
        length > 0 && length <= 10000
    }

    /// Check if result length is valid
    pub fn is_valid_result_length(length: usize) -> bool {
        length > 0 && length <= 50000
    }
}

