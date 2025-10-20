/*!
 * Adaptive Model Router
 * Intelligent model selection based on task scope and requirements
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Model scope for routing decisions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelScope {
    /// Default chat interactions
    ChatDefault,
    /// Planning and task breakdown
    Planning,
    /// Code generation
    CodeGen,
    /// Lightweight tool usage
    ToolLight,
    /// Heavy tool usage
    ToolHeavy,
    /// Vision/multimodal tasks
    Vision,
    /// Research and analysis
    Research,
    /// Quick responses
    Quick,
}

/// Model selection strategy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelStrategy {
    pub primary_model: String,
    pub fallback_models: Vec<String>,
    pub max_tokens: u32,
    pub temperature: f32,
    pub reasoning_enabled: bool,
}

/// Adaptive Model Router
pub struct AdaptiveModelRouter {
    strategies: HashMap<ModelScope, ModelStrategy>,
}

impl AdaptiveModelRouter {
    pub fn new() -> Self {
        let mut strategies = HashMap::new();
        
        // Chat Default - Claude 3.5 Sonnet (balanced)
        strategies.insert(
            ModelScope::ChatDefault,
            ModelStrategy {
                primary_model: "anthropic/claude-3-5-sonnet".to_string(),
                fallback_models: vec![
                    "openai/gpt-4o".to_string(),
                    "google/gemini-2.0-flash-exp".to_string(),
                ],
                max_tokens: 8192,
                temperature: 0.7,
                reasoning_enabled: true,
            },
        );
        
        // Planning - GPT-4o or o1 (best for structured planning)
        strategies.insert(
            ModelScope::Planning,
            ModelStrategy {
                primary_model: "openai/gpt-4o".to_string(),
                fallback_models: vec![
                    "anthropic/claude-3-5-sonnet".to_string(),
                    "deepseek/deepseek-chat".to_string(),
                ],
                max_tokens: 16384,
                temperature: 0.5,
                reasoning_enabled: true,
            },
        );
        
        // Code Generation - Claude 3.5 Sonnet (excellent for code)
        strategies.insert(
            ModelScope::CodeGen,
            ModelStrategy {
                primary_model: "anthropic/claude-3-5-sonnet".to_string(),
                fallback_models: vec![
                    "openai/gpt-4o".to_string(),
                    "deepseek/deepseek-chat".to_string(),
                ],
                max_tokens: 8192,
                temperature: 0.3,
                reasoning_enabled: false,
            },
        );
        
        // Tool Light - Fast models for simple tool usage
        strategies.insert(
            ModelScope::ToolLight,
            ModelStrategy {
                primary_model: "google/gemini-2.0-flash-exp".to_string(),
                fallback_models: vec![
                    "openai/gpt-4o-mini".to_string(),
                    "anthropic/claude-3-haiku".to_string(),
                ],
                max_tokens: 4096,
                temperature: 0.5,
                reasoning_enabled: false,
            },
        );
        
        // Tool Heavy - Powerful models for complex tool orchestration
        strategies.insert(
            ModelScope::ToolHeavy,
            ModelStrategy {
                primary_model: "openai/gpt-4o".to_string(),
                fallback_models: vec![
                    "anthropic/claude-3-5-sonnet".to_string(),
                ],
                max_tokens: 16384,
                temperature: 0.5,
                reasoning_enabled: true,
            },
        );
        
        // Vision - Multimodal models
        strategies.insert(
            ModelScope::Vision,
            ModelStrategy {
                primary_model: "openai/gpt-4o".to_string(),
                fallback_models: vec![
                    "google/gemini-2.0-flash-exp".to_string(),
                    "anthropic/claude-3-5-sonnet".to_string(),
                ],
                max_tokens: 4096,
                temperature: 0.7,
                reasoning_enabled: false,
            },
        );
        
        // Research - Deep analysis models
        strategies.insert(
            ModelScope::Research,
            ModelStrategy {
                primary_model: "anthropic/claude-3-opus".to_string(),
                fallback_models: vec![
                    "openai/o1".to_string(),
                    "deepseek/deepseek-chat".to_string(),
                ],
                max_tokens: 4096,
                temperature: 0.6,
                reasoning_enabled: true,
            },
        );
        
        // Quick - Fast, efficient responses
        strategies.insert(
            ModelScope::Quick,
            ModelStrategy {
                primary_model: "google/gemini-2.0-flash-exp".to_string(),
                fallback_models: vec![
                    "openai/gpt-4o-mini".to_string(),
                ],
                max_tokens: 2048,
                temperature: 0.7,
                reasoning_enabled: false,
            },
        );
        
        Self { strategies }
    }
    
    /// Get model strategy for a scope
    pub fn get_strategy(&self, scope: ModelScope) -> Option<&ModelStrategy> {
        self.strategies.get(&scope)
    }
    
    /// Select best model for a scope
    pub fn select_model(&self, scope: ModelScope) -> Option<String> {
        self.strategies
            .get(&scope)
            .map(|s| s.primary_model.clone())
    }
    
    /// Get fallback models for a scope
    pub fn get_fallbacks(&self, scope: ModelScope) -> Vec<String> {
        self.strategies
            .get(&scope)
            .map(|s| s.fallback_models.clone())
            .unwrap_or_default()
    }
    
    /// Update strategy for a scope
    pub fn update_strategy(&mut self, scope: ModelScope, strategy: ModelStrategy) {
        self.strategies.insert(scope, strategy);
    }
    
    /// Get recommended temperature for scope
    pub fn get_temperature(&self, scope: ModelScope) -> f32 {
        self.strategies
            .get(&scope)
            .map(|s| s.temperature)
            .unwrap_or(0.7)
    }
    
    /// Get recommended max tokens for scope
    pub fn get_max_tokens(&self, scope: ModelScope) -> u32 {
        self.strategies
            .get(&scope)
            .map(|s| s.max_tokens)
            .unwrap_or(8192)
    }
    
    /// Check if reasoning should be enabled for scope
    pub fn should_enable_reasoning(&self, scope: ModelScope) -> bool {
        self.strategies
            .get(&scope)
            .map(|s| s.reasoning_enabled)
            .unwrap_or(false)
    }
}

impl Default for AdaptiveModelRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_router_creation() {
        let router = AdaptiveModelRouter::new();
        assert!(router.get_strategy(ModelScope::ChatDefault).is_some());
        assert!(router.get_strategy(ModelScope::Planning).is_some());
    }
    
    #[test]
    fn test_model_selection() {
        let router = AdaptiveModelRouter::new();
        
        let chat_model = router.select_model(ModelScope::ChatDefault);
        assert!(chat_model.is_some());
        assert!(chat_model.unwrap().contains("claude"));
        
        let planning_model = router.select_model(ModelScope::Planning);
        assert!(planning_model.is_some());
    }
    
    #[test]
    fn test_fallback_models() {
        let router = AdaptiveModelRouter::new();
        
        let fallbacks = router.get_fallbacks(ModelScope::ChatDefault);
        assert!(!fallbacks.is_empty());
    }
    
    #[test]
    fn test_temperature_selection() {
        let router = AdaptiveModelRouter::new();
        
        // Code generation should have lower temperature
        let code_temp = router.get_temperature(ModelScope::CodeGen);
        assert!(code_temp < 0.5);
        
        // Chat should have higher temperature
        let chat_temp = router.get_temperature(ModelScope::ChatDefault);
        assert!(chat_temp >= 0.5);
    }
}

