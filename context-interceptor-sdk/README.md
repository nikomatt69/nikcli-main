# Context Interceptor SDK

**Production-ready RAG SDK for OpenAI and Vercel AI SDK with automatic context injection in 1-2 lines of code.**

[![npm version](https://badge.fury.io/js/@context-interceptor%2Fsdk.svg)](https://www.npmjs.com/package/@context-interceptor/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **✨ Ultra-Simple Integration**: Add RAG to your app in 1-2 lines of code
- **🔌 100% OpenAI Compatible**: Works with all OpenAI SDK features (streaming, tools, vision, etc.)
- **🎯 AI SDK Support**: Full Vercel AI SDK integration with middleware
- **🧠 Smart Pattern Learning**: Background embedding consolidation for optimal context
- **⚡ High Performance**: Pattern caching, unified embeddings, O(1) lookups
- **🔒 Production Ready**: TypeScript, Zod validation, error handling, logging
- **📦 Zero Config**: Works out of the box with sensible defaults

## 📦 Installation

```bash
npm install @context-interceptor/sdk
# or
pnpm add @context-interceptor/sdk
# or
yarn add @context-interceptor/sdk
```

## 🎯 Quick Start

### OpenAI SDK (2 lines!)

```typescript
import OpenAI from 'openai';
import { initContextInterceptor, getOpenAIFetch } from '@context-interceptor/sdk';

// 1. Initialize once (at app startup)
initContextInterceptor({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
});

// 2. Add fetch parameter - THAT'S IT!
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: getOpenAIFetch(), // <- Just this line!
});

// Use normally - context injected automatically! 🎉
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Your question here' }],
});
```

### Vercel AI SDK (2 lines!)

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { initContextInterceptor, getAISDKMiddleware } from '@context-interceptor/sdk';

// 1. Initialize once
initContextInterceptor({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
});

// 2. Spread the middleware - THAT'S IT!
const result = await generateText({
  model: openai('gpt-4o'),
  messages: [{ role: 'user', content: 'Your question' }],
  ...getAISDKMiddleware(), // <- Just this line!
});
```

## 📚 Index Your Documentation

```typescript
import { indexDocs } from '@context-interceptor/sdk';

await indexDocs([
  {
    id: 'doc1',
    content: 'Your documentation content here...',
    metadata: { category: 'api', tags: ['auth', 'rest'] },
  },
  {
    id: 'doc2',
    content: 'More documentation...',
  },
]);
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
OPENAI_API_KEY=sk-...
UPSTASH_VECTOR_URL=https://...
UPSTASH_VECTOR_TOKEN=...
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

### Per-User Contexts

```typescript
// Different contexts for different users
const user1 = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: getOpenAIFetch({ conversationId: 'user-123' }),
});

const user2 = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: getOpenAIFetch({ conversationId: 'user-456' }),
});
```

### Custom System Prompt

```typescript
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: getOpenAIFetch({
    systemPrompt: 'You are a helpful coding assistant specializing in TypeScript.',
  }),
});
```

## 🏗️ Architecture

### How It Works

1. **Transparent Interception**: SDK intercepts OpenAI API calls
2. **Smart Pattern Matching**: Finds best matching patterns from cache (O(1) lookup)
3. **Context Injection**: Adds relevant context to system message
4. **Background Learning**: Learns patterns and creates unified embeddings
5. **Zero Overhead**: All learning happens in background, no blocking

### Pattern System

The SDK automatically:
- ✅ Groups similar queries into patterns
- ✅ Creates unified embeddings (weighted by frequency)
- ✅ Caches patterns with ID keys for fast retrieval
- ✅ Updates patterns in background as they're used
- ✅ Serves best matching patterns on-demand

## 📖 Advanced Usage

### Manual Context Query

```typescript
import { getInterceptor } from '@context-interceptor/sdk';

const interceptor = getInterceptor();
const context = await interceptor.query('How to use React hooks?', {
  topK: 5,
  conversationId: 'user-123',
});
```

### Pattern Statistics

```typescript
const stats = interceptor.getPatternStats();
console.log('Total patterns:', stats.totalPatterns);
console.log('Processing:', stats.isProcessing);
```

### Clear Pattern Cache

```typescript
interceptor.clearPatternCache();
```

### Document Management

```typescript
// Update document
await interceptor.updateDocument('doc1', 'Updated content...');

// Delete document
await interceptor.deleteDocument('doc1');

// Get vector store info
const info = await interceptor.getVectorStoreInfo();
```

### Shutdown (cleanup)

```typescript
// Stop background processing
interceptor.shutdown();
```

## 🔥 Next.js Integration

### App Router (Server Component)

```typescript
// app/page.tsx
import OpenAI from 'openai';
import { initContextInterceptor, getOpenAIFetch } from '@context-interceptor/sdk';

initContextInterceptor({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
});

export default async function Page() {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    fetch: getOpenAIFetch(),
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Your question' }],
  });

  return <div>{response.choices[0].message.content}</div>;
}
```

### API Route

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { initContextInterceptor, getAISDKMiddleware } from '@context-interceptor/sdk';

initContextInterceptor({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4o'),
    messages,
    ...getAISDKMiddleware(),
  });

  return result.toAIStreamResponse();
}
```

## 📊 Performance

- **Pattern Lookup**: O(1) with cache keys
- **Context Injection**: < 50ms per request
- **Background Learning**: Non-blocking, runs every 5s or 20 events
- **Memory**: Minimal (LRU-style pattern cache)

## 🔒 Security

- ✅ Input validation with Zod schemas
- ✅ Secure metadata sanitization
- ✅ API key isolation (never logged)
- ✅ Type-safe throughout

## 📚 Documentation

- [Simple Integration Guide](./SIMPLE_INTEGRATION.md)
- [Provider Architecture](./PROVIDER_ARCHITECTURE.md)
- [API Reference](./API.md)
- [Examples](./examples/)

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md).

## 📝 License

MIT © [Your Name]

## 🙏 Credits

Built with:
- [OpenAI](https://openai.com) - AI models
- [Vercel AI SDK](https://sdk.vercel.ai) - AI framework
- [Upstash Vector](https://upstash.com) - Vector database
- [Upstash Redis](https://upstash.com) - Redis database
- [Zod](https://zod.dev) - Schema validation

---

**Made with ❤️ for developers who want RAG without the complexity**
