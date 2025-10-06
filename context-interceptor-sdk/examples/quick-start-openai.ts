/**
 * Quick Start Example - OpenAI SDK
 * Just 2 lines of code to add context to your OpenAI app!
 */

import OpenAI from 'openai';
import { initContextInterceptor, getOpenAIFetch, indexFromGlob } from '../src/quick-setup';

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

    // 3. Use OpenAI with auto-context - Just add fetch!
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        fetch: getOpenAIFetch(), // <- THAT'S IT! Context is now automatic
    });

    // 4. Use normally - context is injected automatically!
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'user',
                content: 'How do I use TypeScript with Next.js?',
            },
        ],
    });

    console.log('Response:', response.choices[0].message.content);

    // 5. Streaming also works!
    const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Explain React Server Components' }],
        stream: true,
    });

    console.log('\nStreaming response:');
    for await (const chunk of stream) {
        process.stdout.write(chunk.choices[0]?.delta?.content || '');
    }

    console.log('\n\n✅ Done! Context was automatically injected in both calls.');

    // (Optional) Per-user context example with conversationId/systemPrompt
    const openaiPerUser = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        fetch: getOpenAIFetch({
            conversationId: 'user-123',
            systemPrompt: 'You are a senior TypeScript assistant.',
        }),
    });
    const resp2 = await openaiPerUser.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Give me TS best practices.' }],
    });
    console.log('\nPer-user response:', resp2.choices[0].message.content);
}

main();

