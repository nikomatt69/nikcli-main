# Context Interceptor SDK - Examples

This directory contains comprehensive examples demonstrating different features and use cases of the Context Interceptor SDK.

## 🚀 Quick Start Examples

### 1. **quick-start-openai.ts**
The simplest OpenAI SDK integration - just 2 lines of code!

```bash
npm run example:quick-openai
```

**Features:**
- Minimal setup with `initContextInterceptor()` and `getOpenAIFetch()`
- Automatic context injection
- Streaming support

### 2. **quick-start-aisdk.ts**
The simplest AI SDK (Vercel) integration - just 2 lines of code!

```bash
npm run example:quick-aisdk
```

**Features:**
- Minimal setup with `getAISDKMiddleware()`
- Works with all AI SDK features
- Streaming support

## 📚 Comprehensive Examples

### 3. **basic-usage.ts**
Core SDK functionality without OpenAI/AI SDK integration.

```bash
npm run example:basic
```

**Features:**
- Document indexing
- Manual context queries
- Conversation management
- Pattern retrieval

### 4. **openai-example.ts**
Standard OpenAI SDK integration with conversation flow.

```bash
npm run example:openai
```

**Features:**
- Multi-turn conversations
- Streaming responses
- Conversation history
- Context-aware responses

### 5. **openai-advanced-example.ts**
Advanced OpenAI features with context injection.

```bash
npm run example:openai-advanced
```

**Features:**
- ✅ GPT-4o with cost tracking
- ✅ Structured JSON outputs
- ✅ Function/tool calling
- ✅ Streaming responses
- ✅ Multiple completions (n parameter)
- ✅ Reproducible outputs (seed)

### 6. **ai-sdk-example.ts**
Vercel AI SDK integration with comprehensive features.

```bash
npm run example:aisdk
```

**Features:**
- `generateText()` with context
- `streamText()` with context
- Multi-turn conversations
- Behind-the-scenes context visualization

### 7. **provider-pattern-example.ts**
Advanced features: Provider registry, pattern consolidation, background learning.

```bash
npm run example:provider
```

**Features:**
- Provider registry demonstration
- Pattern consolidation system
- Background embedding generation
- Pattern caching and statistics
- Smart pattern matching

## 🏃 Running Examples

### Prerequisites

Create a `.env` file in the SDK root:

```env
OPENAI_API_KEY=sk-...
UPSTASH_VECTOR_URL=https://...
UPSTASH_VECTOR_TOKEN=...
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

### Run Individual Examples

```bash
# Quick start examples
npx tsx examples/quick-start-openai.ts
npx tsx examples/quick-start-aisdk.ts

# Comprehensive examples
npx tsx examples/basic-usage.ts
npx tsx examples/openai-example.ts
npx tsx examples/openai-advanced-example.ts
npx tsx examples/ai-sdk-example.ts
npx tsx examples/provider-pattern-example.ts
```

### Or add to package.json scripts:

```json
{
  "scripts": {
    "example:quick-openai": "tsx examples/quick-start-openai.ts",
    "example:quick-aisdk": "tsx examples/quick-start-aisdk.ts",
    "example:basic": "tsx examples/basic-usage.ts",
    "example:openai": "tsx examples/openai-example.ts",
    "example:openai-advanced": "tsx examples/openai-advanced-example.ts",
    "example:aisdk": "tsx examples/ai-sdk-example.ts",
    "example:provider": "tsx examples/provider-pattern-example.ts"
  }
}
```

## 📖 Example Comparison

| Example | Use Case | Complexity | Best For |
|---------|----------|------------|----------|
| quick-start-openai | OpenAI integration | ⭐ Simple | Getting started quickly with OpenAI |
| quick-start-aisdk | AI SDK integration | ⭐ Simple | Getting started quickly with AI SDK |
| basic-usage | Core SDK only | ⭐⭐ Medium | Understanding SDK fundamentals |
| openai-example | Standard OpenAI | ⭐⭐ Medium | Production OpenAI applications |
| openai-advanced | Advanced OpenAI | ⭐⭐⭐ Complex | Using all OpenAI features |
| ai-sdk-example | Vercel AI SDK | ⭐⭐ Medium | Production AI SDK applications |
| provider-pattern | Advanced patterns | ⭐⭐⭐ Complex | Understanding architecture |

## 🎯 Learning Path

**Beginner:**
1. Start with `quick-start-openai.ts` or `quick-start-aisdk.ts`
2. Move to `basic-usage.ts` to understand core concepts
3. Try `openai-example.ts` or `ai-sdk-example.ts` for your framework

**Intermediate:**
1. Explore `openai-advanced-example.ts` for advanced features
2. Learn about structured outputs, function calling, streaming

**Advanced:**
1. Study `provider-pattern-example.ts` for architecture
2. Understand pattern consolidation and background learning
3. Build custom providers

## 💡 Key Concepts Demonstrated

### 1. Context Injection
All examples show how context is automatically injected into AI requests based on:
- Vector similarity search
- Conversation history
- Pattern matching

### 2. Pattern Learning
Advanced examples demonstrate:
- Background pattern consolidation
- Unified embedding generation
- Smart caching with O(1) lookups

### 3. Multi-Provider Support
Provider examples show:
- Provider registry system
- Auto-detection from URLs
- Capability checking

### 4. Production Features
- Cost tracking
- Token management
- Error handling
- Streaming support
- Function calling

## 🐛 Troubleshooting

### "Missing environment variables"
Make sure all required env vars are set in `.env`:
```bash
# Required
OPENAI_API_KEY=...
UPSTASH_VECTOR_URL=...
UPSTASH_VECTOR_TOKEN=...
UPSTASH_REDIS_URL=...
UPSTASH_REDIS_TOKEN=...
```

### "Failed to connect"
- Verify your Upstash credentials
- Check network connectivity
- Ensure databases are created in Upstash console

### "Context not appearing"
- Documents must be indexed first
- Wait a few seconds after indexing
- Check `topK` and `scoreThreshold` values

## 📚 Next Steps

- Read [SIMPLE_INTEGRATION.md](../SIMPLE_INTEGRATION.md) for integration guides
- See [PROVIDER_ARCHITECTURE.md](../PROVIDER_ARCHITECTURE.md) for architecture details
- Check [README.md](../README.md) for full documentation

## 🤝 Contributing

Found a bug or have an improvement? Examples are a great place to contribute!

- Add new use cases
- Improve existing examples
- Add comments and explanations
- Report issues

---

**Happy coding! 🎉**

