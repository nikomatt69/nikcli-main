/**
 * Quick Start Example - AI SDK (Vercel)
 * Just 2 lines of code to add context to your AI SDK app!
 */

import { openai } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';
import { initContextInterceptor, getAISDKMiddleware, indexFromGlob } from '../src/quick-setup';

async function main() {
    // 1. Initialize once (at app startup)
    // Required envs:
    // - OPENAI_API_KEY
    // - UPSTASH_VECTOR_URL, UPSTASH_VECTOR_TOKEN
    // - UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
    initContextInterceptor({
        openaiApiKey: process.env.OPENAI_API_KEY!,
        upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
        upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
        upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
        upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
        // Optional quick-setup fields (not required):
        // conversationId: 'default-conv',
        // systemPrompt: 'You are a helpful assistant.',
    });

    // 2. Index your docs from the app context (filesystem glob)
    // Available options: ignore, extensions, maxSizeBytes, rootDir, textOnly
    await indexFromGlob(
        ['docs/**/*.md', 'README*.md'],
        {
            ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
            extensions: ['.md', '.mdx', '.txt'],
            maxSizeBytes: 512_000,
            rootDir: process.cwd(),
        }
    );

    // 3. Use AI SDK with auto-context - Just spread the middleware!
    const result = await generateText({
        model: openai('gpt-4o-mini'),
        messages: [
            {
                role: 'user',
                content: 'What are React Server Components?',
            },
        ],
        ...getAISDKMiddleware(), // <- THAT'S IT! Context is now automatic
    });

    console.log('Response:', result.text);

    // 4. Streaming also works!
    console.log('\nStreaming response:');
    const stream = await streamText({
        model: openai('gpt-4o-mini'),
        messages: [{ role: 'user', content: 'Explain Next.js App Router' }],
        ...getAISDKMiddleware(),
    });

    for await (const chunk of stream.textStream) {
        process.stdout.write(chunk);
    }

    console.log('\n\n✅ Done! Context was automatically injected in both calls.');

    // (Optional) Per-user context example via middleware options is implicit; use conversationId/systemPrompt in init
}

main();

