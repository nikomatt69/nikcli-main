import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';
import ContextInterceptor from '../src';

async function main() {
    console.log('🚀 Context Interceptor SDK - Vercel AI SDK Integration Example\n');

    // Initialize the Context Interceptor
    const interceptor = new ContextInterceptor({
        upstashVectorUrl: process.env.UPSTASH_VECTOR_URL || '',
        upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN || '',
        upstashRedisUrl: process.env.UPSTASH_REDIS_URL || '',
        upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN || '',
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        topK: 5,
        scoreThreshold: 0.7
    });

    console.log('✅ Interceptor initialized\n');

    // Index technical documentation
    console.log('📚 Indexing technical documentation...');
    await interceptor.indexDocuments([
        {
            id: 'react-hooks',
            content: `
        React Hooks Best Practices
        
        useState: Use for simple state management within a component.
        Always initialize with a sensible default value.
        
        useEffect: Use for side effects like API calls, subscriptions, or manual DOM updates.
        Always clean up resources in the return function.
        Dependencies array controls when the effect runs.
        
        useContext: Share data across component tree without prop drilling.
        Combine with useMemo to prevent unnecessary re-renders.
        
        useMemo: Memoize expensive calculations. Only recompute when dependencies change.
        Don't overuse - only for actual performance bottlenecks.
        
        useCallback: Memoize function references to prevent child re-renders.
        Essential when passing callbacks to optimized child components.
      `,
            metadata: {
                fileName: 'react-hooks.md',
                category: 'react',
                framework: 'react'
            }
        },
        {
            id: 'nextjs-routing',
            content: `
        Next.js App Router Guide
        
        File-based routing: Create routes by adding files to the app directory.
        - app/page.tsx: Home page (/)
        - app/about/page.tsx: About page (/about)
        - app/blog/[slug]/page.tsx: Dynamic route (/blog/post-1)
        
        Server Components: Default in App Router. Great for data fetching.
        Client Components: Add 'use client' directive for interactivity.
        
        Layouts: Share UI across multiple pages with layout.tsx files.
        Nested layouts automatically wrap child routes.
        
        Loading States: Add loading.tsx for automatic loading UI.
        Error Handling: Add error.tsx for error boundaries.
        
        Data Fetching: Async Server Components can fetch directly.
        Use React Suspense for streaming and loading states.
      `,
            metadata: {
                fileName: 'nextjs-routing.md',
                category: 'nextjs',
                framework: 'nextjs'
            }
        },
        {
            id: 'typescript-types',
            content: `
        TypeScript Type System Fundamentals
        
        Basic Types: string, number, boolean, array, tuple, enum, any, unknown, never
        
        Interfaces vs Types:
        - Interfaces: Better for objects, can be extended, declaration merging
        - Types: More flexible, can use unions and intersections
        
        Generics: Create reusable components that work with multiple types.
        Example: function identity<T>(arg: T): T { return arg; }
        
        Utility Types:
        - Partial<T>: Make all properties optional
        - Required<T>: Make all properties required
        - Readonly<T>: Make all properties readonly
        - Pick<T, K>: Select specific properties
        - Omit<T, K>: Exclude specific properties
        
        Type Guards: Use typeof, instanceof, or custom type predicates
        to narrow types safely.
      `,
            metadata: {
                fileName: 'typescript-types.md',
                category: 'typescript',
                language: 'typescript'
            }
        }
    ]);
    console.log('✅ Documentation indexed\n');

    // Setup AI SDK with middleware
    const conversationId = 'ai-sdk-demo-' + Date.now();
    const systemPrompt = 'You are a senior software engineer helping with React, Next.js, and TypeScript questions. Provide practical, production-ready advice.';

    const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });

    const model = openai.chat('gpt-3.5-turbo');

    // Get middleware for automatic context injection
    const middleware = interceptor.createAISDKMiddleware(conversationId, systemPrompt);

    console.log('💬 Example 1: generateText with context\n');
    console.log('User: When should I use useMemo vs useCallback?\n');

    const result1 = await generateText({
        model,
        messages: [
            {
                role: 'user',
                content: 'When should I use useMemo vs useCallback in React?'
            }
        ],
        experimental_providerMetadata: { middleware },
        experimental_telemetry: { isEnabled: false }
    });

    console.log('Assistant:', result1.text);
    console.log('\n---\n');

    console.log('💬 Example 2: generateText with different topic\n');
    console.log('User: How does file-based routing work in Next.js?\n');

    const result2 = await generateText({
        model,
        messages: [
            {
                role: 'user',
                content: 'How does file-based routing work in Next.js App Router?'
            }
        ],
        experimental_providerMetadata: { middleware },
        experimental_telemetry: { isEnabled: false }
    });

    console.log('Assistant:', result2.text);
    console.log('\n---\n');

    console.log('💬 Example 3: streamText with context\n');
    console.log('User: Explain TypeScript generics with examples\n');
    console.log('Assistant (streaming): ');

    const streamResult = await streamText({
        model,
        messages: [
            {
                role: 'user',
                content: 'Explain TypeScript generics with a practical example'
            }
        ],
        experimental_providerMetadata: { middleware },
        experimental_telemetry: { isEnabled: false }
    });

    for await (const chunk of streamResult.textStream) {
        process.stdout.write(chunk);
    }

    console.log('\n\n---\n');

    console.log('💬 Example 4: Multi-turn conversation with context\n');

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: 'What are React hooks?' }
    ];

    console.log('User:', messages[0].content, '\n');

    const turn1 = await generateText({
        model,
        messages,
        experimental_providerMetadata: { middleware },
        experimental_telemetry: { isEnabled: false }
    });

    console.log('Assistant:', turn1.text);
    console.log();

    messages.push(
        { role: 'assistant', content: turn1.text },
        { role: 'user', content: 'Which ones are most commonly used?' }
    );

    console.log('User:', messages[2].content, '\n');

    const turn2 = await generateText({
        model,
        messages,
        experimental_providerMetadata: { middleware },
        experimental_telemetry: { isEnabled: false }
    });

    console.log('Assistant:', turn2.text);
    console.log('\n---\n');

    // Manual context query to show what's happening under the hood
    console.log('🔍 Behind the scenes: Manual context query\n');
    const contextPattern = await interceptor.query(
        'What are TypeScript utility types?',
        {
            topK: 3,
            scoreThreshold: 0.6
        }
    );

    console.log('Retrieved context chunks:');
    contextPattern.retrievedContext.forEach((chunk, i) => {
        console.log(`\n${i + 1}. Score: ${chunk.score.toFixed(3)}`);
        console.log(`   Source: ${chunk.metadata.fileName}`);
        console.log(`   Preview: ${chunk.text.substring(0, 100)}...`);
    });

    console.log('\n\n📊 Context Statistics:');
    console.log(`   - Retrieved chunks: ${contextPattern.retrievedContext.length}`);
    console.log(`   - Conversation messages: ${contextPattern.conversationHistory.length}`);
    console.log(`   - Estimated tokens: ${contextPattern.totalTokens}`);
    console.log();

    // Cleanup
    console.log('🧹 Cleaning up...');
    await interceptor.deleteDocument('react-hooks');
    await interceptor.deleteDocument('nextjs-routing');
    await interceptor.deleteDocument('typescript-types');
    console.log('✅ Cleanup complete\n');

    console.log('✨ Example completed successfully!');
    console.log('\n💡 Note: The AI SDK middleware automatically injected relevant context into each request.');
    console.log('    Context includes:');
    console.log('    - Relevant documentation chunks from vector search');
    console.log('    - Conversation history for multi-turn interactions');
    console.log('    - Smart pattern matching with background consolidation');
}

main().catch(console.error);

