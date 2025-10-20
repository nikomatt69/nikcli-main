/*!
 * Reasoning Detector
 * Detects and manages reasoning capabilities for different AI models
 */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Reasoning capability levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ReasoningLevel {
    /// No reasoning support
    None,
    /// Basic reasoning (implicit)
    Basic,
    /// Advanced reasoning with chain-of-thought
    Advanced,
    /// Native reasoning mode (e.g., o1, o3)
    Native,
}

/// Reasoning capabilities for a model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasoningCapabilities {
    pub level: ReasoningLevel,
    pub supports_thinking: bool,
    pub supports_reflection: bool,
    pub max_reasoning_tokens: Option<usize>,
    pub description: String,
}

/// Reasoning Detector for identifying model capabilities
pub struct ReasoningDetector {
    capabilities: HashMap<String, ReasoningCapabilities>,
}

impl ReasoningDetector {
    pub fn new() -> Self {
        let mut capabilities = HashMap::new();
        
        // OpenAI Models
        capabilities.insert(
            "gpt-4o".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Advanced,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(4096),
                description: "GPT-4o with advanced chain-of-thought reasoning".to_string(),
            },
        );
        
        capabilities.insert(
            "gpt-4o-mini".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Basic,
                supports_thinking: true,
                supports_reflection: false,
                max_reasoning_tokens: Some(2048),
                description: "GPT-4o mini with basic reasoning".to_string(),
            },
        );
        
        capabilities.insert(
            "o1".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Native,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(32768),
                description: "OpenAI o1 with native reasoning mode".to_string(),
            },
        );
        
        capabilities.insert(
            "o1-mini".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Native,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(16384),
                description: "OpenAI o1-mini with native reasoning mode".to_string(),
            },
        );
        
        capabilities.insert(
            "o3-mini".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Native,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(16384),
                description: "OpenAI o3-mini with native reasoning mode".to_string(),
            },
        );
        
        // Anthropic Models
        capabilities.insert(
            "claude-3-5-sonnet".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Advanced,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(8192),
                description: "Claude 3.5 Sonnet with extended thinking".to_string(),
            },
        );
        
        capabilities.insert(
            "claude-3-opus".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Advanced,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(8192),
                description: "Claude 3 Opus with advanced reasoning".to_string(),
            },
        );

        capabilities.insert(
            "claude-haiku-4.5".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Advanced,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(4096),
                description: "Claude Haiku 4.5 with fast reasoning capabilities".to_string(),
            },
        );
        
        capabilities.insert(
            "claude-3-sonnet".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Basic,
                supports_thinking: true,
                supports_reflection: false,
                max_reasoning_tokens: Some(4096),
                description: "Claude 3 Sonnet with basic reasoning".to_string(),
            },
        );
        
        // Google Models
        capabilities.insert(
            "gemini-2.0-flash-thinking-exp".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Native,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(8192),
                description: "Gemini 2.0 Flash with native thinking mode".to_string(),
            },
        );
        
        capabilities.insert(
            "gemini-exp-1206".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Advanced,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(8192),
                description: "Gemini Experimental with advanced reasoning".to_string(),
            },
        );
        
        // DeepSeek Models
        capabilities.insert(
            "deepseek-chat".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Advanced,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(8192),
                description: "DeepSeek with advanced reasoning".to_string(),
            },
        );
        
        capabilities.insert(
            "deepseek-reasoner".to_string(),
            ReasoningCapabilities {
                level: ReasoningLevel::Native,
                supports_thinking: true,
                supports_reflection: true,
                max_reasoning_tokens: Some(16384),
                description: "DeepSeek Reasoner with native reasoning mode".to_string(),
            },
        );
        
        Self { capabilities }
    }
    
    /// Detect reasoning support for a model
    pub fn detect_reasoning_support(&self, provider: &str, model: &str) -> ReasoningCapabilities {
        // Try exact match first
        if let Some(caps) = self.capabilities.get(model) {
            return caps.clone();
        }
        
        // Try partial match (for versioned models)
        for (key, caps) in &self.capabilities {
            if model.contains(key) || key.contains(model) {
                return caps.clone();
            }
        }
        
        // Try provider-based detection
        let level = match provider.to_lowercase().as_str() {
            "openai" => {
                if model.contains("o1") || model.contains("o3") {
                    ReasoningLevel::Native
                } else if model.contains("gpt-4") {
                    ReasoningLevel::Advanced
                } else {
                    ReasoningLevel::Basic
                }
            }
            "anthropic" => {
                if model.contains("opus") || model.contains("sonnet") {
                    ReasoningLevel::Advanced
                } else {
                    ReasoningLevel::Basic
                }
            }
            "google" => {
                if model.contains("thinking") || model.contains("exp") {
                    ReasoningLevel::Advanced
                } else {
                    ReasoningLevel::Basic
                }
            }
            "deepseek" => {
                if model.contains("reasoner") {
                    ReasoningLevel::Native
                } else {
                    ReasoningLevel::Advanced
                }
            }
            _ => ReasoningLevel::Basic,
        };
        
        ReasoningCapabilities {
            level,
            supports_thinking: level != ReasoningLevel::None,
            supports_reflection: matches!(level, ReasoningLevel::Advanced | ReasoningLevel::Native),
            max_reasoning_tokens: match level {
                ReasoningLevel::Native => Some(16384),
                ReasoningLevel::Advanced => Some(8192),
                ReasoningLevel::Basic => Some(4096),
                ReasoningLevel::None => None,
            },
            description: format!("{} model with {} reasoning", provider, 
                match level {
                    ReasoningLevel::Native => "native",
                    ReasoningLevel::Advanced => "advanced",
                    ReasoningLevel::Basic => "basic",
                    ReasoningLevel::None => "no",
                }
            ),
        }
    }
    
    /// Check if reasoning should be enabled for a model
    pub fn should_enable_reasoning(&self, provider: &str, model: &str) -> bool {
        let caps = self.detect_reasoning_support(provider, model);
        caps.level != ReasoningLevel::None
    }
    
    /// Get reasoning summary for a model
    pub fn get_model_reasoning_summary(&self, provider: &str, model: &str) -> String {
        let caps = self.detect_reasoning_support(provider, model);
        format!(
            "{} - Level: {:?}, Thinking: {}, Reflection: {}",
            caps.description,
            caps.level,
            caps.supports_thinking,
            caps.supports_reflection
        )
    }
    
    /// Get max reasoning tokens for a model
    pub fn get_max_reasoning_tokens(&self, provider: &str, model: &str) -> Option<usize> {
        let caps = self.detect_reasoning_support(provider, model);
        caps.max_reasoning_tokens
    }
    
    /// Check if model supports extended thinking
    pub fn supports_extended_thinking(&self, provider: &str, model: &str) -> bool {
        let caps = self.detect_reasoning_support(provider, model);
        caps.supports_thinking
    }
    
    /// Check if model supports reflection
    pub fn supports_reflection(&self, provider: &str, model: &str) -> bool {
        let caps = self.detect_reasoning_support(provider, model);
        caps.supports_reflection
    }
}

impl Default for ReasoningDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detect_openai_reasoning() {
        let detector = ReasoningDetector::new();
        
        // o1 should have native reasoning
        let caps = detector.detect_reasoning_support("openai", "o1");
        assert_eq!(caps.level, ReasoningLevel::Native);
        
        // gpt-4o should have advanced reasoning
        let caps = detector.detect_reasoning_support("openai", "gpt-4o");
        assert_eq!(caps.level, ReasoningLevel::Advanced);
    }
    
    #[test]
    fn test_detect_anthropic_reasoning() {
        let detector = ReasoningDetector::new();
        
        // Claude 3.5 Sonnet should have advanced reasoning
        let caps = detector.detect_reasoning_support("anthropic", "claude-3-5-sonnet");
        assert_eq!(caps.level, ReasoningLevel::Advanced);
        assert!(caps.supports_thinking);
        assert!(caps.supports_reflection);
    }
    
    #[test]
    fn test_should_enable_reasoning() {
        let detector = ReasoningDetector::new();
        
        assert!(detector.should_enable_reasoning("openai", "gpt-4o"));
        assert!(detector.should_enable_reasoning("anthropic", "claude-3-5-sonnet"));
        assert!(detector.should_enable_reasoning("deepseek", "deepseek-reasoner"));
    }
    
    #[test]
    fn test_max_reasoning_tokens() {
        let detector = ReasoningDetector::new();
        
        let tokens = detector.get_max_reasoning_tokens("openai", "o1");
        assert!(tokens.is_some());
        assert!(tokens.unwrap() > 0);
    }
}

