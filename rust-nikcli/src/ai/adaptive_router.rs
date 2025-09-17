use crate::ai::types::*;
use crate::core::config::NikCliConfig;
use crate::error::NikCliResult;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

/// Adaptive model router for intelligent model selection
pub struct AdaptiveModelRouter {
    config: Arc<RwLock<NikCliConfig>>,
    routing_config: ModelRoutingConfig,
    model_performance: Arc<RwLock<HashMap<String, ModelPerformance>>>,
    scope_mappings: HashMap<ModelScope, String>,
}

/// Model performance metrics
#[derive(Debug, Clone)]
pub struct ModelPerformance {
    pub model_name: String,
    pub provider: AiProvider,
    pub average_response_time: f64,
    pub success_rate: f64,
    pub cost_per_token: f64,
    pub capabilities: Vec<String>,
    pub last_used: chrono::DateTime<chrono::Utc>,
    pub total_requests: u64,
}

impl AdaptiveModelRouter {
    /// Create a new adaptive model router
    pub fn new(config: Arc<RwLock<NikCliConfig>>) -> Self {
        let routing_config = ModelRoutingConfig {
            enabled: true,
            verbose: false,
            mode: RoutingMode::Balanced,
            fallback_model: Some("default-openai".to_string()),
            scope_mappings: HashMap::new(),
        };
        
        let mut scope_mappings = HashMap::new();
        scope_mappings.insert(ModelScope::ChatDefault, "default-openai".to_string());
        scope_mappings.insert(ModelScope::Planning, "default-anthropic".to_string());
        scope_mappings.insert(ModelScope::CodeGen, "default-openai".to_string());
        scope_mappings.insert(ModelScope::ToolLight, "default-ollama".to_string());
        scope_mappings.insert(ModelScope::ToolHeavy, "default-anthropic".to_string());
        scope_mappings.insert(ModelScope::Vision, "default-openai".to_string());
        
        Self {
            config,
            routing_config,
            model_performance: Arc::new(RwLock::new(HashMap::new())),
            scope_mappings,
        }
    }
    
    /// Route request to appropriate model based on scope and context
    pub async fn route_request(&self, options: &GenerateOptions) -> NikCliResult<String> {
        if !self.routing_config.enabled {
            return self.get_default_model().await;
        }
        
        let scope = options.scope.clone().unwrap_or(ModelScope::ChatDefault);
        let model_name = self.select_model_for_scope(&scope, options).await?;
        
        if self.routing_config.verbose {
            info!("Routing request to model: {} for scope: {}", model_name, scope);
        }
        
        Ok(model_name)
    }
    
    /// Select model for specific scope
    async fn select_model_for_scope(&self, scope: &ModelScope, options: &GenerateOptions) -> NikCliResult<String> {
        // Check if we have a direct mapping for this scope
        if let Some(model_name) = self.scope_mappings.get(scope) {
            if self.is_model_available(model_name).await {
                return Ok(model_name.clone());
            }
        }
        
        // Find best model based on performance and requirements
        let available_models = self.get_available_models().await?;
        let best_model = self.find_best_model_for_scope(scope, &available_models, options).await?;
        
        Ok(best_model)
    }
    
    /// Find best model for scope based on performance metrics
    async fn find_best_model_for_scope(
        &self,
        scope: &ModelScope,
        available_models: &[String],
        options: &GenerateOptions,
    ) -> NikCliResult<String> {
        let performance = self.model_performance.read().await;
        let mut scored_models: Vec<(String, f64)> = Vec::new();
        
        for model_name in available_models {
            if let Some(perf) = performance.get(model_name) {
                let score = self.calculate_model_score(perf, scope, options);
                scored_models.push((model_name.clone(), score));
            } else {
                // Default score for unknown models
                scored_models.push((model_name.clone(), 0.5));
            }
        }
        
        // Sort by score (highest first)
        scored_models.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        if let Some((best_model, score)) = scored_models.first() {
            if self.routing_config.verbose {
                info!("Selected model {} with score {:.2} for scope {}", best_model, score, scope);
            }
            Ok(best_model.clone())
        } else {
            // Fallback to default model
            self.get_default_model().await
        }
    }
    
    /// Calculate model score based on performance and requirements
    fn calculate_model_score(&self, perf: &ModelPerformance, scope: &ModelScope, options: &GenerateOptions) -> f64 {
        let mut score = 0.0;
        
        // Base score from success rate
        score += perf.success_rate * 0.3;
        
        // Response time score (faster is better)
        let time_score = if perf.average_response_time > 0.0 {
            (5000.0 - perf.average_response_time).max(0.0) / 5000.0
        } else {
            0.5
        };
        score += time_score * 0.2;
        
        // Cost score (cheaper is better)
        let cost_score = if perf.cost_per_token > 0.0 {
            (0.01 - perf.cost_per_token).max(0.0) / 0.01
        } else {
            0.5
        };
        score += cost_score * 0.1;
        
        // Capability score
        let capability_score = self.calculate_capability_score(perf, scope, options);
        score += capability_score * 0.4;
        
        // Recency bonus (recently used models get slight bonus)
        let hours_since_last_use = chrono::Utc::now().signed_duration_since(perf.last_used).num_hours();
        let recency_bonus = if hours_since_last_use < 24 { 0.1 } else { 0.0 };
        score += recency_bonus;
        
        score.min(1.0)
    }
    
    /// Calculate capability score for model
    fn calculate_capability_score(&self, perf: &ModelPerformance, scope: &ModelScope, options: &GenerateOptions) -> f64 {
        let mut score = 0.0;
        
        // Check if model has required capabilities
        match scope {
            ModelScope::ChatDefault => {
                if perf.capabilities.contains(&"chat".to_string()) {
                    score += 0.8;
                }
            }
            ModelScope::Planning => {
                if perf.capabilities.contains(&"planning".to_string()) ||
                   perf.capabilities.contains(&"reasoning".to_string()) {
                    score += 0.8;
                }
            }
            ModelScope::CodeGen => {
                if perf.capabilities.contains(&"code".to_string()) ||
                   perf.capabilities.contains(&"programming".to_string()) {
                    score += 0.8;
                }
            }
            ModelScope::ToolLight => {
                if perf.capabilities.contains(&"tools".to_string()) {
                    score += 0.6;
                }
            }
            ModelScope::ToolHeavy => {
                if perf.capabilities.contains(&"tools".to_string()) &&
                   perf.capabilities.contains(&"complex".to_string()) {
                    score += 0.8;
                }
            }
            ModelScope::Vision => {
                if perf.capabilities.contains(&"vision".to_string()) ||
                   perf.capabilities.contains(&"image".to_string()) {
                    score += 0.8;
                }
            }
        }
        
        // Check for vision requirements
        if options.needs_vision.unwrap_or(false) {
            if perf.capabilities.contains(&"vision".to_string()) {
                score += 0.2;
            } else {
                score *= 0.1; // Heavily penalize non-vision models
            }
        }
        
        // Check for size requirements
        if let Some(size_hints) = &options.size_hints {
            if let Some(file_count) = size_hints.file_count {
                if file_count > 10 && perf.capabilities.contains(&"large-context".to_string()) {
                    score += 0.1;
                }
            }
        }
        
        score.min(1.0)
    }
    
    /// Get available models from configuration
    async fn get_available_models(&self) -> NikCliResult<Vec<String>> {
        let config = self.config.read().await;
        let models: Vec<String> = config.models.keys().cloned().collect();
        Ok(models)
    }
    
    /// Check if model is available
    async fn is_model_available(&self, model_name: &str) -> bool {
        let config = self.config.read().await;
        config.models.contains_key(model_name) &&
        config.api_keys.as_ref()
            .and_then(|keys| keys.get(model_name))
            .is_some()
    }
    
    /// Get default model
    async fn get_default_model(&self) -> NikCliResult<String> {
        let config = self.config.read().await;
        Ok(config.current_model.clone())
    }
    
    /// Update model performance metrics
    pub async fn update_model_performance(
        &self,
        model_name: &str,
        response_time: f64,
        success: bool,
        tokens_used: u32,
    ) {
        let mut performance = self.model_performance.write().await;
        let model_perf = performance.entry(model_name.to_string()).or_insert_with(|| {
            ModelPerformance {
                model_name: model_name.to_string(),
                provider: AiProvider::OpenAi, // Default, will be updated
                average_response_time: 0.0,
                success_rate: 0.0,
                cost_per_token: 0.0,
                capabilities: Vec::new(),
                last_used: chrono::Utc::now(),
                total_requests: 0,
            }
        });
        
        // Update metrics
        model_perf.total_requests += 1;
        model_perf.last_used = chrono::Utc::now();
        
        // Update success rate
        let total_requests = model_perf.total_requests as f64;
        let successful_requests = if success {
            (model_perf.success_rate * (total_requests - 1.0)) + 1.0
        } else {
            model_perf.success_rate * (total_requests - 1.0)
        };
        model_perf.success_rate = successful_requests / total_requests;
        
        // Update average response time
        let total_time = model_perf.average_response_time * (total_requests - 1.0) + response_time;
        model_perf.average_response_time = total_time / total_requests;
        
        // Update cost (simplified calculation)
        let cost = self.calculate_token_cost(model_name, tokens_used);
        let total_cost = model_perf.cost_per_token * (total_requests - 1.0) + cost;
        model_perf.cost_per_token = total_cost / total_requests;
        
        debug!("Updated performance for model {}: success_rate={:.2}, avg_time={:.1}ms", 
               model_name, model_perf.success_rate, model_perf.average_response_time);
    }
    
    /// Calculate token cost for model
    fn calculate_token_cost(&self, model_name: &str, tokens: u32) -> f64 {
        // Simplified cost calculation - in reality this would be more sophisticated
        match model_name {
            name if name.contains("gpt-4") => tokens as f64 * 0.00003, // $0.03 per 1K tokens
            name if name.contains("gpt-3.5") => tokens as f64 * 0.000002, // $0.002 per 1K tokens
            name if name.contains("claude") => tokens as f64 * 0.000015, // $0.015 per 1K tokens
            name if name.contains("gemini") => tokens as f64 * 0.00001, // $0.01 per 1K tokens
            name if name.contains("ollama") => 0.0, // Local models are free
            _ => tokens as f64 * 0.00001, // Default cost
        }
    }
    
    /// Get routing configuration
    pub fn get_routing_config(&self) -> &ModelRoutingConfig {
        &self.routing_config
    }
    
    /// Update routing configuration
    pub fn update_routing_config(&mut self, config: ModelRoutingConfig) {
        self.routing_config = config;
    }
    
    /// Get model performance statistics
    pub async fn get_model_performance(&self) -> HashMap<String, ModelPerformance> {
        self.model_performance.read().await.clone()
    }
    
    /// Reset model performance statistics
    pub async fn reset_performance_stats(&self) {
        let mut performance = self.model_performance.write().await;
        performance.clear();
        info!("Model performance statistics reset");
    }
    
    /// Get routing recommendations
    pub async fn get_routing_recommendations(&self) -> RoutingRecommendations {
        let performance = self.model_performance.read().await;
        let mut recommendations = RoutingRecommendations {
            best_for_chat: None,
            best_for_planning: None,
            best_for_code: None,
            best_for_tools: None,
            best_for_vision: None,
            most_cost_effective: None,
            fastest: None,
        };
        
        if performance.is_empty() {
            return recommendations;
        }
        
        // Find best models for each category
        for (model_name, perf) in performance.iter() {
            // Best for chat (high success rate, good response time)
            if recommendations.best_for_chat.is_none() || 
               (perf.success_rate > 0.9 && perf.average_response_time < 2000.0) {
                recommendations.best_for_chat = Some(model_name.clone());
            }
            
            // Best for planning (high success rate, reasoning capabilities)
            if perf.capabilities.contains(&"planning".to_string()) &&
               (recommendations.best_for_planning.is_none() || perf.success_rate > 0.95) {
                recommendations.best_for_planning = Some(model_name.clone());
            }
            
            // Best for code (code capabilities, good success rate)
            if perf.capabilities.contains(&"code".to_string()) &&
               (recommendations.best_for_code.is_none() || perf.success_rate > 0.9) {
                recommendations.best_for_code = Some(model_name.clone());
            }
            
            // Most cost effective (lowest cost per token)
            if recommendations.most_cost_effective.is_none() ||
               perf.cost_per_token < performance[recommendations.most_cost_effective.as_ref().unwrap()].cost_per_token {
                recommendations.most_cost_effective = Some(model_name.clone());
            }
            
            // Fastest (lowest response time)
            if recommendations.fastest.is_none() ||
               perf.average_response_time < performance[recommendations.fastest.as_ref().unwrap()].average_response_time {
                recommendations.fastest = Some(model_name.clone());
            }
        }
        
        recommendations
    }
}

/// Routing recommendations
#[derive(Debug, Clone)]
pub struct RoutingRecommendations {
    pub best_for_chat: Option<String>,
    pub best_for_planning: Option<String>,
    pub best_for_code: Option<String>,
    pub best_for_tools: Option<String>,
    pub best_for_vision: Option<String>,
    pub most_cost_effective: Option<String>,
    pub fastest: Option<String>,
}