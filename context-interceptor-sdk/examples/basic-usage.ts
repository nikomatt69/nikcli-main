import ContextInterceptor from '../src';

async function main() {
    console.log('🚀 Context Interceptor SDK - Basic Usage Example\n');

    // Initialize the SDK
    const interceptor = new ContextInterceptor({
        upstashVectorUrl: process.env.UPSTASH_VECTOR_URL || '',
        upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN || '',
        upstashRedisUrl: process.env.UPSTASH_REDIS_URL || '',
        upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN || '',
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        topK: 5,
        scoreThreshold: 0.7,
        enableLogging: true
    });

    console.log('✅ SDK initialized\n');

    // Sample documents to index
    const documents = [
        {
            id: 'doc1',
            content: `
        Product Authentication Guide
        
        Our API uses JWT tokens for authentication. To authenticate:
        1. Send a POST request to /auth/login with email and password
        2. Receive a JWT token in the response
        3. Include the token in the Authorization header for subsequent requests
        
        Tokens expire after 24 hours and must be refreshed.
      `,
            metadata: {
                fileName: 'auth-guide.md',
                category: 'authentication',
                priority: 1
            }
        },
        {
            id: 'doc2',
            content: `
        User Management API
        
        The User API provides endpoints for managing user accounts:
        - GET /api/users - List all users (requires admin role)
        - GET /api/users/:id - Get specific user
        - POST /api/users - Create new user
        - PUT /api/users/:id - Update user
        - DELETE /api/users/:id - Delete user (requires admin role)
        
        All endpoints require authentication via JWT token.
      `,
            metadata: {
                fileName: 'user-api.md',
                category: 'api',
                priority: 2
            }
        },
        {
            id: 'doc3',
            content: `
        Rate Limiting
        
        Our API implements rate limiting to prevent abuse:
        - Free tier: 100 requests per hour
        - Pro tier: 1000 requests per hour
        - Enterprise: Custom limits
        
        Rate limit information is included in response headers:
        - X-RateLimit-Limit: Maximum requests allowed
        - X-RateLimit-Remaining: Requests remaining
        - X-RateLimit-Reset: Unix timestamp when limit resets
      `,
            metadata: {
                fileName: 'rate-limiting.md',
                category: 'api',
                priority: 3
            }
        }
    ];

    // Index the documents
    console.log('📚 Indexing documents...');
    const chunkIds = await interceptor.indexDocuments(documents);
    console.log(`✅ Indexed ${chunkIds.length} chunks\n`);

    // Query for relevant context
    console.log('🔍 Querying: "How do I authenticate with the API?"\n');
    const result1 = await interceptor.query('How do I authenticate with the API?', {
        topK: 3,
        scoreThreshold: 0.6
    });

    console.log('📊 Query Results:');
    console.log(`   Found ${result1.retrievedContext.length} relevant chunks`);
    console.log(`   Total tokens: ${result1.totalTokens}\n`);

    result1.retrievedContext.forEach((chunk, i) => {
        console.log(`   [${i + 1}] Score: ${chunk.score.toFixed(3)}`);
        console.log(`       Source: ${chunk.metadata.fileName}`);
        console.log(`       Text: ${chunk.text.substring(0, 100)}...\n`);
    });

    // Second query with different topic
    console.log('🔍 Querying: "What are the API rate limits?"\n');
    const result2 = await interceptor.query('What are the API rate limits?', {
        topK: 3,
        scoreThreshold: 0.6
    });

    console.log('📊 Query Results:');
    console.log(`   Found ${result2.retrievedContext.length} relevant chunks`);
    result2.retrievedContext.forEach((chunk, i) => {
        console.log(`   [${i + 1}] Score: ${chunk.score.toFixed(3)} - ${chunk.metadata.fileName}`);
    });
    console.log();

    // Test conversation management
    console.log('💬 Testing conversation management...');
    const conversationId = 'example-conversation-123';

    await interceptor.saveMessage(conversationId, 'user', 'Hello, how do I get started?');
    await interceptor.saveMessage(conversationId, 'assistant', 'I can help you get started with our API!');
    await interceptor.saveMessage(conversationId, 'user', 'Great! Tell me about authentication.');

    const history = await interceptor.getHistory(conversationId, 10);
    console.log(`✅ Saved and retrieved ${history.length} messages\n`);

    history.forEach((msg, i) => {
        console.log(`   [${i + 1}] ${msg.role}: ${msg.content}`);
    });
    console.log();

    // Query with conversation context
    console.log('🔍 Querying with conversation context...\n');
    const result3 = await interceptor.query('Can you explain it in more detail?', {
        topK: 2,
        conversationId,
        scoreThreshold: 0.5
    });

    console.log('📊 Context Pattern:');
    console.log('   Retrieved Context:', result3.retrievedContext.length, 'chunks');
    console.log('   Conversation History:', result3.conversationHistory.length, 'messages');
    console.log('   Total Tokens:', result3.totalTokens);
    console.log();

    // Cleanup
    console.log('🧹 Cleaning up...');
    await interceptor.deleteConversation(conversationId);
    for (const doc of documents) {
        await interceptor.deleteDocument(doc.id);
    }
    console.log('✅ Cleanup complete\n');

    console.log('✨ Example completed successfully!');
    console.log('\n💡 This example showed core SDK functionality:');
    console.log('   ✅ Document indexing with metadata');
    console.log('   ✅ Vector similarity search');
    console.log('   ✅ Conversation history management');
    console.log('   ✅ Context pattern building');
    console.log('\n📚 Next steps:');
    console.log('   - See openai-example.ts for OpenAI integration');
    console.log('   - See ai-sdk-example.ts for AI SDK integration');
    console.log('   - See quick-start-*.ts for minimal setup');
}

main().catch(console.error);

