/*!
 * AI System Module
 * Unified AI provider system using ai-lib
 */

pub mod ai_lib_config;
pub mod model_provider;
pub mod advanced_ai_provider;
pub mod adaptive_model_router;
pub mod reasoning_detector;

// Re-export main types
pub use ai_lib_config::{AiLibConfig, ProviderConfig};
pub use model_provider::ModelProvider;
pub use advanced_ai_provider::AdvancedAIProvider;
pub use adaptive_model_router::{AdaptiveModelRouter, ModelScope};
pub use reasoning_detector::ReasoningDetector;

pub mod modern_ai_provider;
pub use modern_ai_provider::{ModernAIProvider, MODERN_AI_PROVIDER};
