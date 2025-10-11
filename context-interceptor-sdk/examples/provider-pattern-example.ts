import ContextInterceptor from '../src';
import OpenAI from 'openai';

async function demonstrateProviderPattern() {
    console.log('🚀 Provider Pattern & Background Embedding Demo\n');

    // Initialize SDK with all new capabilities
    const interceptor = new ContextInterceptor({
        openaiApiKey: process.env.OPENAI_API_KEY!,
        upstashVectorUrl: process.env.UPSTASH_VECTOR_URL!,
        upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN!,
        upstashRedisUrl: process.env.UPSTASH_REDIS_URL!,
        upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN!,
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        enableLogging: true,
    });

    // 1. Provider Registry Demo
    console.log('📦 Provider Registry:');
    const registry = interceptor.getProviderRegistry();
    console.log('Available providers:', registry.listProviders());

    // Get OpenAI provider
    const openaiProvider = registry.get('openai');
    if (openaiProvider) {
        console.log('\n✅ OpenAI Provider loaded:');
        console.log('  - Supports streaming:', openaiProvider.supportsStreaming);
        console.log('  - Supports tools:', openaiProvider.supportsTools);
        console.log('  - Supports vision:', openaiProvider.supportsVision);
    }

    // 2. Index some documents to create patterns
    console.log('\n📚 Indexing documents to create patterns...');
    await interceptor.indexDocuments([
        {
            id: 'doc-1',
            content: 'Next.js is a React framework for production. It provides features like server-side rendering and static site generation.',
            metadata: { category: 'framework', language: 'javascript' },
        },
        {
            id: 'doc-2',
            content: 'TypeScript adds static typing to JavaScript, making code more maintainable and catching errors at compile time.',
            metadata: { category: 'language', language: 'typescript' },
        },
        {
            id: 'doc-3',
            content: 'React hooks like useState and useEffect allow you to use state and lifecycle features in functional components.',
            metadata: { category: 'library', language: 'javascript' },
        },
    ]);

    // 3. Make multiple queries to trigger pattern consolidation
    console.log('\n🔍 Creating query patterns for consolidation...');
    for (let i = 0; i < 5; i++) {
        await interceptor.query('How to use React hooks in Next.js?', {
            conversationId: 'demo-conversation',
            topK: 3,
        });
    }

    // Check pattern stats
    const stats = interceptor.getPatternStats();
    console.log('\n📊 Pattern Consolidation Stats:');
    console.log('  - Total patterns:', stats.totalPatterns);
    console.log('  - Queue size:', stats.queueSize);
    console.log('  - Processing:', stats.isProcessing);

    // 4. Use OpenAI with auto-context injection via Provider pattern
    console.log('\n🤖 Using OpenAI with Provider Pattern & Context Injection...');

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        fetch: interceptor.createOpenAIFetchInterceptor('demo-conversation', 'You are a helpful coding assistant.'),
    });

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: 'Explain how to use React hooks in a Next.js application',
                },
            ],
            temperature: 0.7,
            max_tokens: 500,
        });

        console.log('\n✨ Response with unified patterns:', response.choices[0].message.content);
        console.log('\n📈 Usage:', response.usage);
    } catch (error) {
        console.error('Error:', error);
    }

    // 5. Query with unified patterns
    console.log('\n🎯 Final query using unified patterns...');
    const finalContext = await interceptor.query('Best practices for Next.js with TypeScript?', {
        conversationId: 'demo-conversation',
        topK: 5,
    });

    console.log('Context with unified patterns:', {
        relevantChunks: finalContext.relevantChunks.length,
        conversationHistory: finalContext.conversationHistory.length,
        systemPrompt: finalContext.systemPrompt?.substring(0, 100) + '...',
    });

    // 6. Pattern cache management
    console.log('\n🧹 Pattern cache management:');
    interceptor.clearPatternCache();
    console.log('Pattern cache cleared');

    // Final stats
    const finalStats = interceptor.getPatternStats();
    console.log('\n📊 Final Pattern Stats:');
    console.log('  - Total patterns:', finalStats.totalPatterns);
    console.log('  - Queue size:', finalStats.queueSize);
    console.log('  - Processing:', finalStats.isProcessing);

    // Cleanup
    console.log('\n🧹 Shutting down background systems...');
    interceptor.shutdown();

    console.log('\n✅ Demo complete!');
}

// Run the demo
if (import.meta.main) {
    demonstrateProviderPattern().catch(console.error);
}

export default demonstrateProviderPattern;

