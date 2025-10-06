# Context Interceptor SDK Enhancement Plan v2

## Overview

Elevate the Context Interceptor SDK with **comprehensive OpenAI SDK API compatibility**, advanced features, production-grade observability, intelligent caching, cost optimization, and industry best practices.

## Phase 1: Comprehensive OpenAI SDK API Compatibility

### 1.1 Chat Completions API (Full Support)

**src/providers/openai/chat-completions.ts**:

- Complete `/v1/chat/completions` endpoint support
- **All Models**:

  - GPT-4 family: gpt-4, gpt-4-turbo, gpt-4-turbo-preview, gpt-4-1106-preview, gpt-4-0125-preview
  - GPT-4o family: gpt-4o, gpt-4o-mini, gpt-4o-2024-08-06
  - O1 reasoning: o1-preview, o1-mini
  - GPT-3.5: gpt-3.5-turbo, gpt-3.5-turbo-16k, gpt-3.5-turbo-1106
  - Legacy: gpt-4-32k, gpt-4-0613, etc.

- **Context-Aware Message Handling**:

  - `messages`: Smart context injection preserving conversation flow
  - System message enhancement with retrieved context
  - User message augmentation
  - Assistant message history integration
  - Tool/function message context awareness

- **All Parameters Support**:
  - `model`: Auto-detect context window (8k/32k/128k/200k)
  - `frequency_penalty` (0-2): Pass-through with context impact analysis
  - `presence_penalty` (0-2): Pass-through with logging
  - `logit_bias`: Context-aware token bias adjustments
  - `logprobs`: Debug context effectiveness via probabilities
  - `top_logprobs` (0-20): Enhanced debugging
  - `max_tokens` / `max_completion_tokens`: Dynamic with context budget
  - `n` (1-128): Multiple completions sharing context
  - `response_format`:
    - `{ type: "json_object" }` - JSON mode
    - `{ type: "json_schema", json_schema: {...} }` - Structured Outputs
  - `seed`: Reproducible context injection
  - `stop`: String or array of stop sequences
  - `stream`: SSE streaming support
  - `stream_options`: `{ include_usage: true }`
  - `temperature` (0-2): Pass-through with optimization hints
  - `top_p` (0-1): Nucleus sampling support
  - `tools`: Function/tool definitions with context
  - `tool_choice`: auto | none | required | `{ type: "function", function: {name: "..."} }`
  - `parallel_tool_calls`: Enable/disable parallel execution
  - `user`: Track per-user context usage
  - `metadata`: Custom request metadata

**src/providers/openai/model-config.ts**:

```typescript
interface ModelConfig {
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsFunctions: boolean;
  supportsJSON: boolean;
  supportsStructuredOutputs: boolean;
  supportsParallelTools: boolean;
  costPer1MTokens: { input: number; output: number; cachedInput?: number };
  trainingDataCutoff: string;
  deprecated: boolean;
  recommendedFor: string[];
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "gpt-4o": {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsVision: true,
    supportsFunctions: true,
    supportsJSON: true,
    supportsStructuredOutputs: true,
    supportsParallelTools: true,
    costPer1MTokens: { input: 2.5, output: 10.0 },
    trainingDataCutoff: "2023-10",
    deprecated: false,
    recommendedFor: ["general", "vision", "function-calling"],
  },
  "o1-preview": {
    contextWindow: 128000,
    maxOutputTokens: 32768,
    costPer1MTokens: { input: 15.0, output: 60.0 },
    // Reasoning model with different capabilities
  },
  // ... all other models
};
```

### 1.2 Completions API (Legacy Support)

**src/providers/openai/completions.ts**:

- `/v1/completions` endpoint for legacy models
- Models: text-davinci-003, text-davinci-002, text-curie-001, text-babbage-001, text-ada-001
- Context injection into prompt string
- Parameters: `prompt`, `suffix`, `max_tokens`, `temperature`, `top_p`, `n`, `stream`, `logprobs`, `echo`, `stop`, `presence_penalty`, `frequency_penalty`, `best_of`, `logit_bias`, `user`

### 1.3 Embeddings API (Enhanced)

**src/providers/openai/embeddings.ts**:

- `/v1/embeddings` full support
- **All Models**:
  - text-embedding-3-small (1536 dims, configurable 256-1536)
  - text-embedding-3-large (3072 dims, configurable 256-3072)
  - text-embedding-ada-002 (1536 dims, legacy)
- **Parameters**:

  - `input`: String or array (max 8191 tokens per item)
  - `model`: Model selection
  - `encoding_format`: float (default) | base64
  - `dimensions`: Custom dimensions for v3 models
  - `user`: Usage tracking

- **Advanced Features**:
  - Automatic batching (8191 token limit per request)
  - Embedding cache with TTL
  - Cost optimization strategies
  - Dimension reduction without quality loss
  - Batch retry logic

**src/providers/openai/embedding-strategies.ts**:

```typescript
const EMBEDDING_STRATEGIES = {
  highestQuality: {
    model: "text-embedding-3-large",
    dimensions: 3072,
    costPer1M: 0.13,
  },
  balanced: {
    model: "text-embedding-3-large",
    dimensions: 1536,
    costPer1M: 0.13,
  },
  costOptimized: {
    model: "text-embedding-3-small",
    dimensions: 512,
    costPer1M: 0.02,
  },
  standard: {
    model: "text-embedding-3-small",
    dimensions: 1536,
    costPer1M: 0.02,
  },
};
```

### 1.4 Assistants API (Beta)

**src/providers/openai/assistants.ts**:
Full Assistants API v2 support with context injection:

- **Assistants** (`/v1/assistants`):

  - Create: Context-aware instructions, tools, file_search, code_interpreter
  - Retrieve, update, delete operations
  - List with pagination
  - Tool resources configuration
  - Metadata support

- **Threads** (`/v1/threads`):

  - Create with initial messages + context
  - Retrieve, update, delete
  - Message management with context injection
  - Tool resources per thread

- **Messages** (`/v1/threads/{thread_id}/messages`):

  - Create messages with context
  - List, retrieve, update, delete
  - File attachments
  - Metadata tracking

- **Runs** (`/v1/threads/{thread_id}/runs`):

  - Create and execute with context
  - Streaming runs (`/v1/threads/runs`)
  - Submit tool outputs
  - Cancel, retrieve runs
  - Steps tracking

- **Vector Stores** (`/v1/vector_stores`):
  - Integration with our existing vector store
  - Bidirectional sync
  - File management in vector stores

### 1.5 Function/Tool Calling (Advanced)

**src/features/function-calling-advanced.ts**:

- **Full JSON Schema Support**:

  - Complex nested schemas
  - Array and object types
  - Required/optional parameters
  - Enum constraints
  - Pattern validation
  - Min/max constraints

- **Context-Enhanced Features**:

  - Inject context into function descriptions
  - Context-aware parameter suggestions
  - Function result integration into context
  - Multi-turn function calling with context preservation
  - Parallel function execution support

- **Tool Choice Strategies**:
  - `auto`: Model decides
  - `none`: Never call functions
  - `required`: Must call at least one
  - Specific function: `{ type: "function", function: { name: "get_weather" } }`

**src/features/structured-outputs.ts**:

- Structured Outputs API (strict JSON schema)
- Response format validation
- Type-safe TypeScript interfaces
- Schema generation from Zod types
- Recursive schemas
- Union types support

### 1.6 Vision API

**src/providers/openai/vision.ts**:

- Models: gpt-4-vision-preview, gpt-4o, gpt-4o-mini, gpt-4-turbo
- **Image Input Types**:
  - URL: `{ type: "image_url", image_url: { url: "https://...", detail: "high" } }`
  - Base64: `{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }`
- **Detail Levels**: low (65 tokens), high (detailed), auto
- **Multiple images per message**
- Context injection for image analysis
- Token calculation for images
- Image + text context combination

### 1.7 Audio API

**src/providers/openai/audio.ts**:

**Speech to Text (Whisper)**:

- `/v1/audio/transcriptions`:
  - Models: whisper-1
  - Formats: mp3, mp4, mpeg, mpga, m4a, wav, webm (max 25MB)
  - Parameters: `file`, `model`, `language`, `prompt`, `response_format` (json, text, srt, verbose_json, vtt), `temperature`, `timestamp_granularities` (word, segment)
  - Context-aware prompt for better accuracy
- `/v1/audio/translations`:
  - Translate audio to English
  - Same formats and parameters as transcriptions

**Text to Speech**:

- `/v1/audio/speech`:
  - Models: tts-1 (fast), tts-1-hd (quality)
  - Voices: alloy, echo, fable, onyx, nova, shimmer
  - Formats: mp3, opus, aac, flac, wav, pcm
  - Speed: 0.25 to 4.0
  - Context-aware voice selection
  - Streaming support

### 1.8 Images API (DALL-E)

**src/providers/openai/images.ts**:

- **Generation** (`/v1/images/generations`):

  - Models: dall-e-2, dall-e-3
  - DALL-E 2: 256x256, 512x512, 1024x1024 | n: 1-10
  - DALL-E 3: 1024x1024, 1792x1024, 1024x1792 | n: 1 only
  - Quality: standard, hd (DALL-E 3 only)
  - Style: vivid, natural (DALL-E 3 only)
  - Response format: url, b64_json
  - Context-aware prompt enhancement

- **Edits** (`/v1/images/edits`):

  - DALL-E 2 only
  - Edit images with masks
  - Context-aware edit instructions

- **Variations** (`/v1/images/variations`):
  - Generate variations of existing images
  - DALL-E 2 only

### 1.9 Files API

**src/providers/openai/files.ts**:

- `/v1/files`:
  - Upload files (max 512MB)
  - Purpose: assistants, vision, batch, fine-tune
  - List files with pagination
  - Retrieve file info
  - Retrieve file content
  - Delete files
- Automatic chunking for large files
- Progress tracking
- Retry logic

### 1.10 Fine-Tuning API

**src/providers/openai/fine-tuning.ts**:

- `/v1/fine_tuning/jobs`:
  - Create jobs with training files
  - Models: gpt-4o-mini-2024-07-18, gpt-3.5-turbo-1106, gpt-3.5-turbo-0613, babbage-002, davinci-002
  - Hyperparameters: n_epochs, batch_size, learning_rate_multiplier
  - List jobs with pagination
  - Retrieve job status
  - Cancel jobs
  - List events
  - Checkpoints management
- Context-aware training data preparation
- Fine-tuned model integration with context

### 1.11 Batch API

**src/providers/openai/batch.ts**:

- `/v1/batches`:
  - Create batch jobs (50% cost savings, 24h completion)
  - Supported endpoints: /v1/chat/completions, /v1/embeddings, /v1/completions
  - JSONL file preparation
  - Status monitoring
  - Results retrieval
  - Cancel batches
- Context injection for batch requests
- Automatic retry for failed items
- Cost optimization

### 1.12 Uploads API (Large Files)

**src/providers/openai/uploads.ts**:

- `/v1/uploads`:
  - Multipart uploads for files > 512MB
  - Create upload
  - Add parts
  - Complete upload
  - Cancel upload
- Progress tracking
- Resume capability
- Parallel part uploads

### 1.13 Moderation API

**src/providers/openai/moderation.ts**:

- `/v1/moderations`:
  - Model: text-moderation-latest, text-moderation-stable
  - Categories: hate, hate/threatening, harassment, harassment/threatening, self-harm, self-harm/intent, self-harm/instructions, sexual, sexual/minors, violence, violence/graphic
  - Content filtering before context injection
  - Automatic sanitization
  - Moderation history

### 1.14 Models API

**src/providers/openai/models.ts**:

- `/v1/models`:
  - List all models
  - Retrieve model details
  - Delete fine-tuned models
- Automatic model selection
- Capability detection
- Cost comparison
- Deprecation warnings

### 1.15 Advanced Streaming

**src/streaming/openai-streaming.ts**:

- **SSE Stream Handling**:
  - Proper event parsing
  - `data: [DONE]` detection
  - Error handling and recovery
  - Stream cancellation
- **Event Types**:

  - Chat completions: chunk, delta, done
  - Assistants: thread events, run events, message events
  - Function calling: partial JSON parsing

- **Progressive Context**:
  - Context injection during stream setup
  - Token-by-token relevance feedback
  - Dynamic context adjustment
  - Backpressure handling

### 1.16 Token Management

**src/providers/openai/token-manager.ts**:

- **Tiktoken Integration**:
  - Accurate token counting for all models
  - Different encodings: cl100k_base (GPT-4, GPT-3.5), p50k_base, r50k_base
  - Special token handling
- **Context Window Management**:
  - Per-model window sizes
  - Reserve tokens for completion
  - Priority-based message pruning
  - Intelligent truncation
- **Budget Enforcement**:
  - Per-request token limits
  - Daily/monthly quotas
  - Cost-based decisions
  - Usage analytics

### 1.17 Error Handling

**src/providers/openai/error-handler.ts**:

- **OpenAI Error Types**:
  - 400: Invalid request (validation)
  - 401: Authentication failed
  - 403: Permission denied
  - 404: Resource not found
  - 429: Rate limit exceeded
  - 500: Server error
  - 503: Service unavailable
- **Retry Strategies**:
  - Rate limits: Exponential backoff with `Retry-After` header
  - Network errors: 3 retries
  - Server errors: 2 retries with backoff
  - Timeout errors: Increase timeout and retry
- **Graceful Degradation**:
  - Return without context on retrieval failure
  - Use cached results when available
  - Fallback to simpler models

## Phase 2: Enhanced Vercel AI SDK Integration

### 2.1 Multi-Provider Support

**src/providers/ai-sdk/multi-provider.ts**:

- **Supported Providers**:

  - OpenAI (@ai-sdk/openai)
  - Anthropic Claude (@ai-sdk/anthropic)
  - Google Gemini (@ai-sdk/google)
  - Mistral (@ai-sdk/mistral)
  - Cohere (@ai-sdk/cohere)
  - Azure OpenAI (@ai-sdk/azure)
  - Groq (@ai-sdk/groq)
  - Perplexity (@ai-sdk/perplexity)
  - Fireworks (@ai-sdk/fireworks)

- **Context Injection Per Provider**:
  - Provider-specific message formats
  - Token limit awareness
  - Feature compatibility checks
  - Cost optimization per provider

### 2.2 AI SDK Core Features

**src/providers/ai-sdk/core-features.ts**:

- **generateText**: Context-enhanced text generation
- **streamText**: Streaming with context injection
- **generateObject**: Structured output with context
- **streamObject**: Streaming structured output
- **embed**: Embedding with context metadata
- **embedMany**: Batch embeddings

### 2.3 AI SDK Tools & Functions

**src/providers/ai-sdk/tools.ts**:

- Tool definition with context
- `tool()` function wrapper
- `execute()` with context integration
- Multi-turn tool conversations
- Tool result formatting

### 2.4 AI SDK Middleware

**src/providers/ai-sdk/middleware-enhanced.ts**:

- `wrapLanguageModel`: Enhanced wrapper
- Request interception
- Response modification
- Telemetry integration
- Cost tracking

### 2.5 Edge Runtime Support

**src/runtime/edge-adapter.ts**:

- Cloudflare Workers compatibility
- Vercel Edge Functions optimization
- Deno runtime support
- Bundle size reduction (<50KB)
- Lazy loading strategies
- Web Crypto API usage

## Phase 3: Intelligent Caching System

[... rest of the plan remains the same ...]

## New Dependencies

```json
{
  "dependencies": {
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/google": "^1.0.0",
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/sdk-node": "^0.45.0",
    "tiktoken": "^1.0.10",
    "ioredis": "^5.3.0",
    "zod": "^3.22.4",
    "pino": "^8.16.0",
    "lru-cache": "^10.0.0",
    "p-queue": "^8.0.1",
    "p-retry": "^6.2.0"
  }
}
```

## Implementation Priority

**Phase 1A - Critical OpenAI APIs** (Week 1-2):

1. Chat Completions with full parameter support
2. Embeddings API enhancement
3. Function/Tool calling
4. Streaming improvements
5. Token management with tiktoken

**Phase 1B - Extended OpenAI APIs** (Week 3-4): 6. Assistants API integration 7. Vision API support 8. Audio API support 9. Images API integration 10. Files & Batch APIs

**Phase 2 - AI SDK Integration** (Week 5-6): 11. Multi-provider support 12. AI SDK middleware enhancement 13. Edge runtime compatibility

**Phase 3+ - Advanced Features** (Week 7+): 14. Caching system 15. Observability 16. Cost optimization 17. Security enhancements

## Backward Compatibility

All enhancements maintain 100% backward compatibility with v1 API. New features are opt-in through configuration.
