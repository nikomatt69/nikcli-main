# Getting Started with Context Interceptor SDK

## Prerequisites

Before using the SDK, you need:

1. **Node.js** >= 18.0.0
2. **OpenAI API Key** - [Get one here](https://platform.openai.com/api-keys)
3. **Upstash Account** - [Sign up free](https://upstash.com)

## Setup

### 1. Install the SDK

```bash
npm install @context-interceptor/sdk
```

### 2. Create Upstash Databases

#### Vector Database
1. Go to [Upstash Console](https://console.upstash.com)
2. Create a new **Vector Database**
3. Choose dimensions: **1536** (for text-embedding-3-small)
4. Copy the **REST URL** and **REST Token**

#### Redis Database
1. In Upstash Console, create a new **Redis Database**
2. Choose a region close to your app
3. Copy the **REST URL** and **REST Token**

### 3. Configure Environment Variables

Create a `.env` file in your project root:

```bash
cp node_modules/@context-interceptor/sdk/.env.example .env
```

Then fill in your credentials:

```env
# OpenAI API Key
OPENAI_API_KEY=sk-proj-...

# Upstash Vector Database
UPSTASH_VECTOR_URL=https://xxxxx.upstash.io
UPSTASH_VECTOR_TOKEN=AbCdEf...

# Upstash Redis
UPSTASH_REDIS_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_TOKEN=AaBbCc...
```

### 4. Initialize the SDK

```typescript
import { initContextInterceptor } from '@context-interceptor/sdk';

initContextInterceptor({
  openaiApiKey: process.env.OPENAI_API_KEY!,
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
});
```

### 5. Index Your Documentation

```typescript
import { indexDocs } from '@context-interceptor/sdk';

await indexDocs([
  {
    id: 'getting-started',
    content: 'Your documentation content here...',
    metadata: { category: 'docs', section: 'intro' }
  },
  // Add more documents...
]);
```

### 6. Use with OpenAI SDK

```typescript
import OpenAI from 'openai';
import { getOpenAIFetch } from '@context-interceptor/sdk';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: getOpenAIFetch(), // 🎉 Context injected automatically!
});

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'How do I get started?' }],
});
```

## Verification

Test that everything works:

```typescript
import { getInterceptor } from '@context-interceptor/sdk';

const interceptor = getInterceptor();

// Check vector store
const info = await interceptor.getVectorStoreInfo();
console.log('Vector store ready:', info);

// Test query
const context = await interceptor.query('test query');
console.log('Context retrieval works!');
```

## Next Steps

- See [Simple Integration Guide](./SIMPLE_INTEGRATION.md) for usage examples
- Check [Provider Architecture](./PROVIDER_ARCHITECTURE.md) for advanced features
- View [examples/](./examples/) for complete examples

## Troubleshooting

### "Failed to connect to Upstash"
- Verify your URLs and tokens are correct
- Check that your IP isn't blocked (Upstash has IP whitelisting)
- Ensure databases are in the same region for best performance

### "OpenAI API error"
- Verify your API key is valid
- Check you have credits in your OpenAI account
- Ensure the API key has the correct permissions

### "Context not appearing in responses"
- Make sure you've indexed documents first
- Verify embeddings were created successfully
- Check that the query is finding relevant documents

## Support

- 📚 [Documentation](./README.md)
- 🐛 [Report Issues](https://github.com/yourusername/context-interceptor-sdk/issues)
- 💬 [Discussions](https://github.com/yourusername/context-interceptor-sdk/discussions)

