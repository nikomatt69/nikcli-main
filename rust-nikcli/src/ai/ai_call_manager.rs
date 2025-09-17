use crate::ai::types::*;
use crate::error::NikCliResult;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// AI call manager for handling AI requests and responses
pub struct AiCallManager {
    call_history: Arc<RwLock<Vec<AiCall>>>,
    rate_limits: Arc<RwLock<HashMap<String, RateLimit>>>,
    call_stats: Arc<RwLock<AiCallStats>>,
}

/// AI call record
#[derive(Debug, Clone)]
pub struct AiCall {
    pub id: String,
    pub model: String,
    pub provider: AiProvider,
    pub request_tokens: u32,
    pub response_tokens: u32,
    pub duration_ms: u64,
    pub success: bool,
    pub error: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub cost: f64,
}

/// Rate limit configuration
#[derive(Debug, Clone)]
pub struct RateLimit {
    pub requests_per_minute: u32,
    pub tokens_per_minute: u32,
    pub requests_used: u32,
    pub tokens_used: u32,
    pub window_start: chrono::DateTime<chrono::Utc>,
}

impl AiCallManager {
    /// Create a new AI call manager
    pub fn new() -> Self {
        Self {
            call_history: Arc::new(RwLock::new(Vec::new())),
            rate_limits: Arc::new(RwLock::new(HashMap::new())),
            call_stats: Arc::new(RwLock::new(AiCallStats {
                total_calls: 0,
                successful_calls: 0,
                failed_calls: 0,
                total_tokens: 0,
                total_cost: 0.0,
                average_response_time: 0.0,
                last_call: None,
            })),
        }
    }
    
    /// Record an AI call
    pub async fn record_call(&self, call: AiCall) {
        // Add to history
        {
            let mut history = self.call_history.write().await;
            history.push(call.clone());
            
            // Keep only last 1000 calls
            if history.len() > 1000 {
                history.remove(0);
            }
        }
        
        // Update statistics
        {
            let mut stats = self.call_stats.write().await;
            stats.total_calls += 1;
            
            if call.success {
                stats.successful_calls += 1;
            } else {
                stats.failed_calls += 1;
            }
            
            stats.total_tokens += call.request_tokens as u64 + call.response_tokens as u64;
            stats.total_cost += call.cost;
            stats.last_call = Some(call.timestamp);
            
            // Update average response time
            let total_time = stats.average_response_time * (stats.total_calls - 1) as f64 + call.duration_ms as f64;
            stats.average_response_time = total_time / stats.total_calls as f64;
        }
        
        // Update rate limits
        self.update_rate_limits(&call).await;
        
        debug!("Recorded AI call: {} tokens, {}ms, ${:.4}", 
               call.request_tokens + call.response_tokens, 
               call.duration_ms, 
               call.cost);
    }
    
    /// Update rate limits for a model
    async fn update_rate_limits(&self, call: &AiCall) {
        let mut rate_limits = self.rate_limits.write().await;
        let model_key = format!("{}:{}", call.provider, call.model);
        
        let rate_limit = rate_limits.entry(model_key).or_insert_with(|| RateLimit {
            requests_per_minute: 60, // Default rate limit
            tokens_per_minute: 100000, // Default token limit
            requests_used: 0,
            tokens_used: 0,
            window_start: chrono::Utc::now(),
        });
        
        // Reset window if more than a minute has passed
        let now = chrono::Utc::now();
        if now.signed_duration_since(rate_limit.window_start).num_minutes() >= 1 {
            rate_limit.requests_used = 0;
            rate_limit.tokens_used = 0;
            rate_limit.window_start = now;
        }
        
        rate_limit.requests_used += 1;
        rate_limit.tokens_used += call.request_tokens + call.response_tokens;
    }
    
    /// Check if rate limit is exceeded
    pub async fn is_rate_limited(&self, provider: &AiProvider, model: &str) -> bool {
        let rate_limits = self.rate_limits.read().await;
        let model_key = format!("{}:{}", provider, model);
        
        if let Some(rate_limit) = rate_limits.get(&model_key) {
            let now = chrono::Utc::now();
            
            // Reset window if more than a minute has passed
            if now.signed_duration_since(rate_limit.window_start).num_minutes() >= 1 {
                return false; // Window reset, not rate limited
            }
            
            rate_limit.requests_used >= rate_limit.requests_per_minute ||
            rate_limit.tokens_used >= rate_limit.tokens_per_minute
        } else {
            false // No rate limit configured
        }
    }
    
    /// Get call statistics
    pub async fn get_stats(&self) -> AiCallStats {
        self.call_stats.read().await.clone()
    }
    
    /// Get call history
    pub async fn get_call_history(&self, limit: Option<usize>) -> Vec<AiCall> {
        let history = self.call_history.read().await;
        let limit = limit.unwrap_or(100);
        
        if history.len() <= limit {
            history.clone()
        } else {
            history[history.len() - limit..].to_vec()
        }
    }
    
    /// Get rate limits
    pub async fn get_rate_limits(&self) -> HashMap<String, RateLimit> {
        self.rate_limits.read().await.clone()
    }
    
    /// Set rate limit for a model
    pub async fn set_rate_limit(&self, provider: &AiProvider, model: &str, requests_per_minute: u32, tokens_per_minute: u32) {
        let mut rate_limits = self.rate_limits.write().await;
        let model_key = format!("{}:{}", provider, model);
        
        rate_limits.insert(model_key, RateLimit {
            requests_per_minute,
            tokens_per_minute,
            requests_used: 0,
            tokens_used: 0,
            window_start: chrono::Utc::now(),
        });
        
        info!("Set rate limit for {}:{} - {} requests/min, {} tokens/min", 
              provider, model, requests_per_minute, tokens_per_minute);
    }
    
    /// Clear call history
    pub async fn clear_history(&self) {
        let mut history = self.call_history.write().await;
        history.clear();
        
        let mut stats = self.call_stats.write().await;
        *stats = AiCallStats {
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
            total_tokens: 0,
            total_cost: 0.0,
            average_response_time: 0.0,
            last_call: None,
        };
        
        info!("Cleared AI call history and statistics");
    }
    
    /// Get cost analysis
    pub async fn get_cost_analysis(&self) -> CostAnalysis {
        let history = self.call_history.read().await;
        let mut provider_costs: HashMap<String, f64> = HashMap::new();
        let mut model_costs: HashMap<String, f64> = HashMap::new();
        let mut daily_costs: HashMap<String, f64> = HashMap::new();
        
        for call in history.iter() {
            let provider_key = call.provider.to_string();
            let model_key = format!("{}:{}", call.provider, call.model);
            let date_key = call.timestamp.format("%Y-%m-%d").to_string();
            
            *provider_costs.entry(provider_key).or_insert(0.0) += call.cost;
            *model_costs.entry(model_key).or_insert(0.0) += call.cost;
            *daily_costs.entry(date_key).or_insert(0.0) += call.cost;
        }
        
        CostAnalysis {
            total_cost: history.iter().map(|call| call.cost).sum(),
            provider_costs,
            model_costs,
            daily_costs,
            average_cost_per_call: if history.is_empty() { 0.0 } else { 
                history.iter().map(|call| call.cost).sum::<f64>() / history.len() as f64 
            },
        }
    }
    
    /// Get performance analysis
    pub async fn get_performance_analysis(&self) -> PerformanceAnalysis {
        let history = self.call_history.read().await;
        let mut provider_performance: HashMap<String, ProviderPerformance> = HashMap::new();
        
        for call in history.iter() {
            let provider_key = call.provider.to_string();
            let perf = provider_performance.entry(provider_key).or_insert_with(|| ProviderPerformance {
                total_calls: 0,
                successful_calls: 0,
                average_response_time: 0.0,
                total_tokens: 0,
                total_cost: 0.0,
            });
            
            perf.total_calls += 1;
            if call.success {
                perf.successful_calls += 1;
            }
            perf.total_tokens += call.request_tokens as u64 + call.response_tokens as u64;
            perf.total_cost += call.cost;
            
            // Update average response time
            let total_time = perf.average_response_time * (perf.total_calls - 1) as f64 + call.duration_ms as f64;
            perf.average_response_time = total_time / perf.total_calls as f64;
        }
        
        PerformanceAnalysis {
            provider_performance,
            overall_success_rate: if history.is_empty() { 0.0 } else {
                history.iter().filter(|call| call.success).count() as f64 / history.len() as f64
            },
            average_response_time: if history.is_empty() { 0.0 } else {
                history.iter().map(|call| call.duration_ms as f64).sum::<f64>() / history.len() as f64
            },
        }
    }
}

/// Cost analysis
#[derive(Debug, Clone)]
pub struct CostAnalysis {
    pub total_cost: f64,
    pub provider_costs: HashMap<String, f64>,
    pub model_costs: HashMap<String, f64>,
    pub daily_costs: HashMap<String, f64>,
    pub average_cost_per_call: f64,
}

/// Performance analysis
#[derive(Debug, Clone)]
pub struct PerformanceAnalysis {
    pub provider_performance: HashMap<String, ProviderPerformance>,
    pub overall_success_rate: f64,
    pub average_response_time: f64,
}

/// Provider performance metrics
#[derive(Debug, Clone)]
pub struct ProviderPerformance {
    pub total_calls: u64,
    pub successful_calls: u64,
    pub average_response_time: f64,
    pub total_tokens: u64,
    pub total_cost: f64,
}

impl Default for AiCallManager {
    fn default() -> Self {
        Self::new()
    }
}