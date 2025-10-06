# Quick Start Guide

Get up and running with Context Interceptor SDK in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- npm or pnpm
- Upstash account (free tier available)
- OpenAI API key

## Setup

### 1. Install Dependencies

```bash
cd context-interceptor-sdk
npm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
UPSTASH_VECTOR_URL=https://your-vector-db.upstash.io
UPSTASH_VECTOR_TOKEN=your-vector-token
UPSTASH_REDIS_URL=https://your-redis.upstash.io
UPSTASH_REDIS_TOKEN=your-redis-token
OPENAI_API_KEY=sk-your-key-here
```

### 3. Build the SDK

```bash
npm run build
```

### 4. Run Examples

```bash
# Basic usage example
npx ts-node examples/basic-usage.ts

# OpenAI integration
npx ts-node examples/openai-example.ts

# Vercel AI SDK integration
npx ts-node examples/ai-sdk-example.ts
```

## Getting Upstash Credentials

### Upstash Vector

1. Go to [upstash.com](https://upstash.com)
2. Create a new Vector database
3. Choose dimension: **1536** (for text-embedding-3-small)
4. Copy the REST URL and Token

### Upstash Redis

1. In Upstash dashboard, create a new Redis database
2. Choose any region (closest to you)
3. Copy the REST URL and Token

## Quick Integration

### With OpenAI

```typescript
import OpenAI from "openai";
import ContextInterceptor from "@context-interceptor/sdk";

const interceptor = new ContextInterceptor({
  upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
  upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
  openaiApiKey: process.env.OPENAI_API_KEY!,
});

// Index your docs
await interceptor.indexDocuments([
  {
    content: "Your documentation...",
    metadata: { source: "docs" },
  },
]);

// Use with OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: interceptor.createFetchInterceptor(),
});

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Your question" }],
});
```

### With Vercel AI SDK

```typescript
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const { text } = await generateText({
  model: openai.chat("gpt-4"),
  messages: [{ role: "user", content: "Your question" }],
  experimental_wrapLanguageModel: interceptor.createAISDKMiddleware(),
});
```

## Testing

Run the test suite:

```bash
npm test
```

## Publishing

When ready to publish:

```bash
# Update version in package.json
npm version patch

# Build
npm run build

# Publish to npm
npm publish --access public
```

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Check out the [examples](./examples/) directory
- Customize configuration options
- Add more documents to your index

## Troubleshooting

### "Invalid dimension" error

Make sure your Upstash Vector database uses dimension 1536.

### "Authentication failed"

Double-check your API keys and tokens in `.env`.

### Slow indexing

Indexing large documents takes time. Consider batching smaller chunks.

### High token usage

Reduce `maxContextTokens` or `topK` in configuration.

## Support

- GitHub Issues: Report bugs and request features
- Documentation: See README.md for full API reference
- Examples: Check the examples/ directory

## License

MIT
