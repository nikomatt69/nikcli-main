/**
 * Quick Start Example - OpenAI SDK (Existing Vector DB)
 * Uses an already-populated Upstash Vector index; no indexing step.
 */

import OpenAI from 'openai';
import { initContextInterceptor, getOpenAIFetch } from '../src/quick-setup';

async function main() {
    // 1. Initialize once (at app startup)
    // Required envs for existing Vector DB usage
    // - OPENAI_API_KEY
    // - UPSTASH_VECTOR_URL, UPSTASH_VECTOR_TOKEN
    // - UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
    initContextInterceptor({
        openaiApiKey: process.env.OPENAI_API_KEY!,
        upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
        upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
        upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
        upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
        // Optional quick-setup fields:
        // conversationId: 'default-conv',
        // systemPrompt: 'You are a helpful assistant.',
    });

    // 2. Use OpenAI with auto-context - Vector DB already contains your docs
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        fetch: getOpenAIFetch(),
    });

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'user', content: 'How do I use TypeScript with Next.js?' },
        ],
    });

    console.log('Response:', response.choices[0].message.content);
    console.log('\n✅ Done! Context was pulled from your existing Vector DB.');
}

main();


