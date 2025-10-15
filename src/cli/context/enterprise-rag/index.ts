// Enterprise RAG Architecture - Main Export
// Based on the comprehensive design from NikCLI_Context_Awareness_RAG.md

export { multiLayerContextExtractor } from './multi-layer-context-extractor'
export { intelligentContextCache } from './intelligent-context-cache'
export { distributedContextManager } from './distributed-context-manager'
export { enterpriseRAGSystem } from './enterprise-rag-system'

// Export types
export type {
  ContextLayer,
  ExtractedContext,
  ContextMetadata,
  ContextExtractor,
  ExtractionTarget,
  RawContext,
  ContextType,
  UpdateFrequency,
} from './multi-layer-context-extractor'

export type {
  CacheOptimization,
  AccessPattern,
  PrefetchConfig,
  CorrelationData,
  CacheEntry,
  CacheMetadata,
  AccessRecord,
} from './intelligent-context-cache'

export type {
  DistributedContextConfig,
  ContextShard,
  ShardRange,
  PartitioningStrategy,
  ContextReplication,
  ConsistencyLevel,
  DistributedContext,
} from './distributed-context-manager'

export type {
  RAGQuery,
  QueryContext,
  RAGOptions,
  RAGResult,
  RAGSystemStats,
} from './enterprise-rag-system'
