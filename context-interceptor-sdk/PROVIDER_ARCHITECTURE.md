# Provider Architecture & Background Embedding System

## Overview

The Context Interceptor SDK now features a modular provider architecture with comprehensive Zod validation and an intelligent background embedding system that consolidates patterns into unified vectors.

## 🏗️ Provider Architecture

### Base Provider Interface

All providers extend the `BaseProvider` abstract class which provides:

- **Type-safe request/response validation** using Zod schemas
- **Context injection** - automatically inject relevant context into requests
- **Usage extraction** - track token usage and costs
- **Capability flags** - streaming, tools, vision support

```typescript
import { BaseProvider } from '@context-interceptor/sdk/providers';

abstract class BaseProvider<TRequest, TResponse> {
  abstract name: string;
  abstract requestSchema: z.ZodSchema<TRequest>;
  abstract responseSchema: z.ZodSchema<TResponse>;
  abstract supportsStreaming: boolean;
  abstract supportsTools: boolean;
  abstract supportsVision: boolean;
  
  async validateRequest(request: TRequest): Promise<void>;
  async injectContext(request: TRequest, context: ContextPattern): Promise<TRequest>;
  abstract executeRequest(request: TRequest): Promise<TResponse>;
  abstract extractUsage(response: TResponse): UsageStats;
}
```

### Provider Registry

The `ProviderRegistry` manages multiple AI providers and supports auto-detection:

```typescript
import { createProviderRegistry } from '@context-interceptor/sdk';

const registry = createProviderRegistry(logger);

// Register providers
registry.register(new OpenAIProvider(logger));
registry.register(new AnthropicProvider(logger));

// Auto-detect from URL
const provider = registry.detectProvider('https://api.openai.com/v1/chat/completions');
// Returns: OpenAIProvider instance

// List available providers
console.log(registry.listProviders()); // ['openai', 'anthropic']
```

### OpenAI Provider

Full OpenAI API support with comprehensive Zod validation:

```typescript
import { OpenAIProvider } from '@context-interceptor/sdk/providers/openai';

const provider = new OpenAIProvider(logger);

// Validate request before sending
await provider.validateRequest(chatRequest);

// Inject context
const enrichedRequest = await provider.injectContext(chatRequest, contextPattern);

// Extract usage
const stats = provider.extractUsage(chatResponse);
// { inputTokens: 150, outputTokens: 50, totalTokens: 200, cost: 0.0003 }
```

## 📋 Zod Schema Validation

### Chat Completions

Complete type-safe schemas for all OpenAI endpoints:

```typescript
import {
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  type ChatCompletionRequest,
  type ChatCompletionResponse
} from '@context-interceptor/sdk/providers/openai/schemas';

// Runtime validation
const validatedRequest = await ChatCompletionRequestSchema.parseAsync(request);

// Type inference
const request: ChatCompletionRequest = {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7,
  tools: [/* ... */],
  response_format: { type: 'json_object' }
};
```

### Embeddings API

```typescript
import {
  EmbeddingRequestSchema,
  EmbeddingResponseSchema
} from '@context-interceptor/sdk/providers/openai/embeddings-schemas';

const request = await EmbeddingRequestSchema.parseAsync({
  input: 'Text to embed',
  model: 'text-embedding-3-small',
  dimensions: 1536
});
```

### Assistants API

```typescript
import {
  AssistantSchema,
  ThreadSchema,
  RunSchema
} from '@context-interceptor/sdk/providers/openai/assistants-schemas';

const assistant = await AssistantSchema.parseAsync(assistantData);
```

## 🧠 Background Embedding System

### Pattern Consolidation

The system automatically consolidates similar patterns into unified embeddings in the background:

```typescript
import { createPatternConsolidator } from '@context-interceptor/sdk/embedding';

const consolidator = createPatternConsolidator(embedder, vectorStore, logger);

// Add patterns (runs consolidation in background)
await consolidator.addPattern({
  id: 'pattern-1',
  type: 'conversation',
  text: 'How to use React hooks?',
  metadata: { category: 'react' },
  frequency: 5,
  lastUsed: new Date()
});

// Get statistics
const stats = consolidator.getStats();
// { totalPatterns: 150, queueSize: 8, isProcessing: true }
```

#### How Consolidation Works

1. **Pattern Collection**: Patterns are added to a queue as they're used
2. **Similarity Grouping**: When queue reaches threshold (10 patterns):
   - Generate embeddings for each pattern
   - Calculate cosine similarity between patterns
   - Group patterns with similarity > 0.9
3. **Unified Embedding Creation**:
   - Combine pattern texts with frequency weighting
   - Generate single embedding for the group
   - Store with consolidated metadata
4. **Background Processing**: Runs asynchronously without blocking

### Pattern Server

On-demand pattern serving with intelligent caching:

```typescript
import { createPatternServer } from '@context-interceptor/sdk/embedding';

const server = createPatternServer(consolidator, vectorStore, embedder, logger);

// Serve patterns for a query
const results = await server.servePatterns('How to build a React app?', {
  topK: 5,
  includeUnified: true,  // Include consolidated patterns
  includeRaw: true       // Include original patterns
});

// Clear cache
server.clearCache();
```

### Integration with SDK

The pattern system is automatically integrated:

```typescript
import ContextInterceptor from '@context-interceptor/sdk';

const interceptor = new ContextInterceptor({
  // ... config
});

// Query uses pattern server automatically
const context = await interceptor.query('Your question here', {
  topK: 5,
  conversationId: 'conv-123'
});

// Get pattern statistics
const stats = interceptor.getPatternStats();
console.log('Total patterns:', stats.totalPatterns);
console.log('Processing:', stats.isProcessing);

// Clear pattern cache
interceptor.clearPatternCache();
```

## 🎯 Benefits

### 1. Type Safety
- **Compile-time**: TypeScript types inferred from Zod schemas
- **Runtime**: Automatic validation of all requests/responses
- **Error catching**: Invalid data caught before API calls

### 2. Modularity
- **Easy provider addition**: Implement `BaseProvider` interface
- **Auto-detection**: Providers auto-selected based on URL
- **Capability discovery**: Query provider capabilities at runtime

### 3. Performance
- **Background consolidation**: No blocking during pattern processing
- **Unified embeddings**: Reduce redundant embedding calls
- **Smart caching**: Pattern results cached for repeated queries

### 4. Intelligence
- **Frequency weighting**: Frequently used patterns weighted higher
- **Similarity detection**: Automatically groups related patterns
- **Context enrichment**: Better context from consolidated patterns

### 5. Scalability
- **Async processing**: Pattern consolidation runs in background
- **Queue management**: Automatic batching and throttling
- **Resource efficient**: Reduces vector storage through unification

## 📊 Performance Characteristics

### Pattern Consolidation

- **Queue threshold**: 10 patterns (configurable)
- **Batch size**: 50 patterns per processing cycle
- **Similarity threshold**: 0.9 (cosine similarity)
- **Processing delay**: 1 second between batches

### Caching

- **Cache key format**: `{query}_{topK}_{includeUnified}_{includeRaw}`
- **Cache invalidation**: Manual via `clearPatternCache()`
- **Memory overhead**: Minimal (Map-based LRU-style)

## 🔧 Advanced Usage

### Custom Provider

```typescript
import { BaseProvider, UsageStats } from '@context-interceptor/sdk/providers';
import { z } from 'zod';

class CustomProvider extends BaseProvider<CustomRequest, CustomResponse> {
  name = 'custom-ai';
  requestSchema = CustomRequestSchema;
  responseSchema = CustomResponseSchema;
  supportsStreaming = true;
  supportsTools = false;
  supportsVision = false;

  async injectContext(request: CustomRequest, context: ContextPattern): Promise<CustomRequest> {
    // Inject context into request
    return { ...request, context: context.systemPrompt };
  }

  async executeRequest(request: CustomRequest): Promise<CustomResponse> {
    // Execute request
    return fetch(/* ... */);
  }

  extractUsage(response: CustomResponse): UsageStats {
    // Extract usage stats
    return {
      inputTokens: response.usage.input,
      outputTokens: response.usage.output,
      totalTokens: response.usage.total,
      cost: calculateCost(response.usage)
    };
  }
}

// Register custom provider
const registry = interceptor.getProviderRegistry();
registry.register(new CustomProvider(logger));
```

### Pattern Monitoring

```typescript
// Monitor pattern consolidation in real-time
setInterval(() => {
  const stats = interceptor.getPatternStats();
  console.log('Pattern system health:', {
    patterns: stats.totalPatterns,
    queueSize: stats.queueSize,
    processing: stats.isProcessing
  });
}, 5000);
```

## 🚀 Next Steps

1. Add more providers (Anthropic, Google, etc.)
2. Implement provider-specific optimizations
3. Add pattern analytics and insights
4. Support custom similarity thresholds
5. Add pattern export/import capabilities

## 📚 Related Documentation

- [API Reference](./API.md)
- [OpenAI Provider](./providers/OPENAI.md)
- [Pattern System](./PATTERNS.md)
- [Migration Guide](./MIGRATION.md)

