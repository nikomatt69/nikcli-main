use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::debug;

/// Token usage statistics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TokenStats {
    pub prompt_tokens: usize,
    pub completion_tokens: usize,
    pub total_tokens: usize,
    pub estimated_cost: f64,
}

/// Token manager for tracking token usage and costs
pub struct TokenManager {
    model_pricing: HashMap<String, ModelPricing>,
    session_stats: TokenStats,
}

/// Model pricing information
#[derive(Debug, Clone)]
struct ModelPricing {
    input_price_per_1k: f64,
    output_price_per_1k: f64,
}

impl TokenManager {
    /// Create a new token manager
    pub fn new() -> Self {
        let mut manager = Self {
            model_pricing: HashMap::new(),
            session_stats: TokenStats::default(),
        };

        manager.initialize_pricing();
        manager
    }

    /// Initialize model pricing
    fn initialize_pricing(&mut self) {
        // Claude models
        self.model_pricing.insert(
            "anthropic/claude-3.5-sonnet".to_string(),
            ModelPricing {
                input_price_per_1k: 0.003,
                output_price_per_1k: 0.015,
            },
        );

        self.model_pricing.insert(
            "anthropic/claude-3-opus".to_string(),
            ModelPricing {
                input_price_per_1k: 0.015,
                output_price_per_1k: 0.075,
            },
        );

        // GPT models
        self.model_pricing.insert(
            "openai/gpt-4".to_string(),
            ModelPricing {
                input_price_per_1k: 0.03,
                output_price_per_1k: 0.06,
            },
        );

        self.model_pricing.insert(
            "openai/gpt-3.5-turbo".to_string(),
            ModelPricing {
                input_price_per_1k: 0.0015,
                output_price_per_1k: 0.002,
            },
        );

        // Add more models as needed
    }

    /// Track token usage
    pub fn track_usage(
        &mut self,
        model: &str,
        prompt_tokens: usize,
        completion_tokens: usize,
    ) -> f64 {
        let total_tokens = prompt_tokens + completion_tokens;

        // Calculate cost
        let cost = self.calculate_cost(model, prompt_tokens, completion_tokens);

        // Update session stats
        self.session_stats.prompt_tokens += prompt_tokens;
        self.session_stats.completion_tokens += completion_tokens;
        self.session_stats.total_tokens += total_tokens;
        self.session_stats.estimated_cost += cost;

        debug!(
            "Token usage - Model: {}, Prompt: {}, Completion: {}, Cost: ${:.6}",
            model, prompt_tokens, completion_tokens, cost
        );

        cost
    }

    /// Calculate cost for token usage
    pub fn calculate_cost(
        &self,
        model: &str,
        prompt_tokens: usize,
        completion_tokens: usize,
    ) -> f64 {
        if let Some(pricing) = self.model_pricing.get(model) {
            let input_cost = (prompt_tokens as f64 / 1000.0) * pricing.input_price_per_1k;
            let output_cost = (completion_tokens as f64 / 1000.0) * pricing.output_price_per_1k;
            input_cost + output_cost
        } else {
            // Default pricing if model not found
            debug!("Unknown model pricing for: {}", model);
            0.0
        }
    }

    /// Get session statistics
    pub fn get_session_stats(&self) -> &TokenStats {
        &self.session_stats
    }

    /// Reset session statistics
    pub fn reset_session_stats(&mut self) {
        self.session_stats = TokenStats::default();
    }

    /// Get estimated cost for a token count
    pub fn estimate_cost(&self, model: &str, prompt_tokens: usize, completion_tokens: usize) -> f64 {
        self.calculate_cost(model, prompt_tokens, completion_tokens)
    }
}

impl Default for TokenManager {
    fn default() -> Self {
        Self::new()
    }
}
