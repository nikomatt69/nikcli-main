# Simple Integration Guide

## 🚀 Add Context to Your AI App in 2 Lines of Code

This SDK provides **100% OpenAI-compatible** context injection with **minimal code changes**.

---

## Installation

```bash
npm install @context-interceptor/sdk
# or
pnpm add @context-interceptor/sdk
```

---

## Quick Start - OpenAI SDK

### Before (Standard OpenAI)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Your question' }],
});
```

### After (With Auto-Context) - Just 2 Lines!

```typescript
import OpenAI from 'openai';
import { initContextInterceptor, getOpenAIFetch } from '@context-interceptor/sdk/quick-setup';

// 1. Initialize once (at app startup)
initContextInterceptor({
  openaiApiKey: process.env.OPENAI_API_KEY,
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN,
});

// 2. Add fetch parameter - THAT'S IT!
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: getOpenAIFetch(), // <- Just this line!
});

// Use normally - context injected automatically!
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Your question' }],
});
```

**That's it! 🎉** Context is now automatically injected from your indexed documents and conversation history.

---

## Quick Start - AI SDK (Vercel)

### Before (Standard AI SDK)

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-4o'),
  messages: [{ role: 'user', content: 'Your question' }],
});
```

### After (With Auto-Context) - Just 2 Lines!

```typescript
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { initContextInterceptor, getAISDKMiddleware } from '@context-interceptor/sdk/quick-setup';

// 1. Initialize once (at app startup)
initContextInterceptor({
  openaiApiKey: process.env.OPENAI_API_KEY,
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN,
});

// 2. Spread the middleware - THAT'S IT!
const result = await generateText({
  model: openai('gpt-4o'),
  messages: [{ role: 'user', content: 'Your question' }],
  ...getAISDKMiddleware(), // <- Just this line!
});
```

**That's it! 🎉** Context is now automatically injected.

---

## Index Your Documents

Before using the SDK, index your documentation:

```typescript
import { indexDocs } from '@context-interceptor/sdk/quick-setup';

await indexDocs([
  {
    id: 'doc1',
    content: 'Your documentation content here...',
    metadata: { category: 'api', tags: ['rest', 'auth'] },
  },
  {
    id: 'doc2',
    content: 'More documentation...',
  },
]);
```

---

## Features

### ✅ 100% OpenAI Compatible
- Works with **all** OpenAI SDK methods
- Supports streaming, function calling, vision, etc.
- Zero breaking changes to your code

### ✅ Minimal Code Changes
- **OpenAI SDK**: Add 1 parameter (`fetch`)
- **AI SDK**: Spread 1 object (`...getAISDKMiddleware()`)
- No complex setup or configuration

### ✅ Automatic Context Injection
- Retrieves relevant docs from your knowledge base
- Includes recent conversation history
- Smart pattern matching in background

### ✅ Background Pattern Learning
- Learns common query patterns
- Creates unified embeddings for similar queries
- Serves best patterns on-demand
- Zero performance impact

---

## Advanced Usage

### Per-Conversation Context

```typescript
// Different contexts for different users
const user1Client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: getOpenAIFetch({ conversationId: 'user-123' }),
});

const user2Client = new OpenAI({
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

### Access Advanced Features

```typescript
import { getInterceptor } from '@context-interceptor/sdk/quick-setup';

const interceptor = getInterceptor();

// Get pattern statistics
const stats = interceptor.getPatternStats();
console.log('Pattern groups:', stats.totalPatterns);

// Clear pattern cache
interceptor.clearPatternCache();

// Update specific document
await interceptor.updateDocument('doc1', 'Updated content...');
```

---

## Next.js Integration

### App Router (Server Component)

```typescript
import OpenAI from 'openai';
import { initContextInterceptor, getOpenAIFetch } from '@context-interceptor/sdk/quick-setup';

// Initialize in server component
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
import { initContextInterceptor, getAISDKMiddleware } from '@context-interceptor/sdk/quick-setup';

// Initialize once
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
    ...getAISDKMiddleware(), // <- Automatic context!
  });

  return result.toAIStreamResponse();
}
```

---

## How It Works

1. **Transparent Interception**: The SDK intercepts OpenAI API calls
2. **Smart Pattern Matching**: Finds best matching patterns from cache
3. **Context Injection**: Adds relevant context to system message
4. **Background Learning**: Learns patterns and creates unified embeddings
5. **Zero Overhead**: All learning happens in background

### Architecture

```
Your Code → OpenAI SDK → Context Interceptor → OpenAI API
                              ↓
                    [Pattern Groups + Cache]
                              ↓
                    [Background Learning]
```

---

## Environment Variables

```env
OPENAI_API_KEY=sk-...
UPSTASH_VECTOR_URL=https://...
UPSTASH_VECTOR_TOKEN=...
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

---

## Migration Guide

Already using OpenAI or AI SDK? Just add 2 lines:

### OpenAI SDK
```diff
  import OpenAI from 'openai';
+ import { initContextInterceptor, getOpenAIFetch } from '@context-interceptor/sdk/quick-setup';

+ initContextInterceptor({ /* config */ });

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
+   fetch: getOpenAIFetch(),
  });
```

### AI SDK
```diff
  import { openai } from '@ai-sdk/openai';
  import { generateText } from 'ai';
+ import { initContextInterceptor, getAISDKMiddleware } from '@context-interceptor/sdk/quick-setup';

+ initContextInterceptor({ /* config */ });

  const result = await generateText({
    model: openai('gpt-4o'),
    messages,
+   ...getAISDKMiddleware(),
  });
```

---

## Troubleshooting

### Context not appearing?
- Make sure you've indexed documents first
- Check that Upstash credentials are correct
- Enable logging: `interceptor.getLogger().level = 'debug'`

### Performance impact?
- Pattern learning happens in background
- Cache lookups are O(1) with cache keys
- Minimal overhead (< 50ms per request)

---

## Examples

See full examples in `/examples`:
- `quick-start-openai.ts` - OpenAI SDK example
- `quick-start-aisdk.ts` - AI SDK example
- `provider-pattern-example.ts` - Advanced usage

---

## Support

- 📚 [Full Documentation](./README.md)
- 🏗️ [Architecture](./PROVIDER_ARCHITECTURE.md)
- 🔧 [API Reference](./API.md)
- 🐛 [GitHub Issues](https://github.com/your-repo/issues)

---

**Made with ❤️ for developers who want RAG without the complexity**

