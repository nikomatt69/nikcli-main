// AI system exports - barrel file for cleaner imports
export { advancedAIProvider } from './advanced-ai-provider'
export { modelProvider } from './model-provider'
export { modernAIProvider } from './modern-ai-provider'
export { adaptiveModelRouter } from './adaptive-model-router'
export { ReasoningDetector } from './reasoning-detector'
export { openRouterRegistry } from './openrouter-model-registry'
export { createAICacheMiddleware, getAICacheStats, clearAICache } from './ai-cache-middleware'

// Provider registry exports
export { 
  providerRegistry, 
  getLanguageModel, 
  getTextEmbeddingModel,
  resolveModelAlias,
  MODEL_ALIASES,
  openrouterProvider,
  anthropicProvider,
  openaiProvider,
  googleProvider 
} from './provider-registry'

// Lightweight inference exports
export { 
  initializeLightweightInference, 
  getLightweightInference 
} from './lightweight-inference-layer'

// RAG inference exports
export { 
  initializeRAGInference, 
  getRAGInference 
} from './rag-inference-layer'

// Parameter predictor exports
export { 
  initializeParameterPredictor, 
  getParameterPredictor 
} from './parameter-predictor'

// Tool embeddings cache exports
export { 
  initializeToolEmbeddingsCache, 
  getToolEmbeddingsCache 
} from './tool-embeddings-cache'

// Type exports
export type { ModernAIProvider, ModelConfig, AIProviderOptions } from './modern-ai-provider'
export type { ModelCapabilities, OpenRouterModel } from './openrouter-model-registry'
export type { ReasoningCapabilities, ExtractedReasoning, ReasoningMiddlewareConfig } from './reasoning-detector'
export type { ModelRouteInput, ModelRouteDecision, ModelScope, RoutingStrategy, ModelPricing } from './adaptive-model-router'
export type { LightweightInferenceEngine, ComplexityEstimate, ToolScore } from './lightweight-inference-layer'
export type { RAGSearchResult, SemanticScoreBreakdown } from './rag-inference-layer'
export type { ParameterPrediction } from './parameter-predictor'
export type { EmbeddingCacheEntry } from './tool-embeddings-cache'
export type { GenerateOptions, ChatMessage, ModelResponse } from './model-provider'
