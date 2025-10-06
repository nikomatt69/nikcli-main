import OpenAI from "openai";
import ContextInterceptor from "../src";

async function main() {
    console.log("🚀 Context Interceptor SDK - Advanced OpenAI Features Example\n");

    // Initialize the Context Interceptor
    const interceptor = new ContextInterceptor({
        upstashVectorUrl: process.env.UPSTASH_VECTOR_URL || "",
        upstashVectorToken: process.env.UPSTASH_VECTOR_TOKEN || "",
        upstashRedisUrl: process.env.UPSTASH_REDIS_URL || "",
        upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN || "",
        openaiApiKey: process.env.OPENAI_API_KEY || "",
    });

    console.log("✅ Interceptor initialized\n");

    // Index technical documentation
    console.log("📚 Indexing API documentation...");
    await interceptor.indexDocuments([
        {
            id: "api-auth",
            content: `
        API Authentication Guide
        
        All API requests require authentication using Bearer tokens.
        Include your API key in the Authorization header:
        Authorization: Bearer YOUR_API_KEY
        
        Rate Limits:
        - Free tier: 60 requests/hour
        - Pro tier: 600 requests/hour
        - Enterprise: Custom limits
        
        Error Codes:
        - 401: Invalid or missing API key
        - 403: Insufficient permissions
        - 429: Rate limit exceeded
      `,
            metadata: {
                fileName: "auth-guide.md",
                category: "authentication",
            },
        },
        {
            id: "api-endpoints",
            content: `
        Main API Endpoints
        
        GET /api/users - List all users
        POST /api/users - Create new user
        GET /api/users/:id - Get user details
        PUT /api/users/:id - Update user
        DELETE /api/users/:id - Delete user
        
        All endpoints return JSON responses.
        Use Content-Type: application/json for POST/PUT requests.
      `,
            metadata: {
                fileName: "endpoints.md",
                category: "api",
            },
        },
    ]);
    console.log("✅ Documentation indexed\n");

    const conversationId = "advanced-demo-" + Date.now();

    // Example 1: GPT-4o with cost tracking
    console.log("💬 Example 1: GPT-4o with cost tracking\n");

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        fetch: interceptor.createOpenAIFetchInterceptor(conversationId),
    });

    console.log("User: How do I authenticate API requests?\n");

    const response1 = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "How do I authenticate API requests?" }],
        temperature: 0.7,
        max_tokens: 200,
    });

    console.log("Assistant:", response1.choices[0].message.content);
    console.log("\nUsage:", {
        prompt_tokens: response1.usage?.prompt_tokens,
        completion_tokens: response1.usage?.completion_tokens,
        total_tokens: response1.usage?.total_tokens,
    });
    console.log("\n---\n");

    // Example 2: Structured output with JSON schema
    console.log("💬 Example 2: Structured output with JSON schema\n");
    console.log("User: List the API endpoints\n");

    const response2 = await openai.chat.completions.create({
        model: "gpt-4o-2024-08-06",
        messages: [
            {
                role: "user",
                content: "List all the available API endpoints with their HTTP methods",
            },
        ],
        response_format: {
            type: "json_object",
        },
        temperature: 0.7,
    });

    console.log("Assistant (JSON):");
    console.log(JSON.parse(response2.choices[0].message.content || "{}"));
    console.log("\n---\n");

    // Example 3: Function calling with context
    console.log("💬 Example 3: Function calling with context\n");
    console.log("User: What's the rate limit for pro tier?\n");

    const tools = [
        {
            type: "function" as const,
            function: {
                name: "get_rate_limit",
                description: "Get rate limit information for a specific tier",
                parameters: {
                    type: "object",
                    properties: {
                        tier: {
                            type: "string",
                            enum: ["free", "pro", "enterprise"],
                            description: "The subscription tier",
                        },
                    },
                    required: ["tier"],
                },
            },
        },
    ];

    const response3 = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: "What's the rate limit for the pro tier?",
            },
        ],
        tools,
        tool_choice: "auto",
    });

    const toolCall = response3.choices[0].message.tool_calls?.[0];
    if (toolCall) {
        console.log("Function called:", toolCall.function.name);
        console.log("Arguments:", toolCall.function.arguments);
    } else {
        console.log("No function called, direct response:");
        console.log(response3.choices[0].message.content);
    }
    console.log("\n---\n");

    // Example 4: Streaming with context
    console.log("💬 Example 4: Streaming response\n");
    console.log("User: Explain API error codes\n");
    console.log("Assistant (streaming): ");

    const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "user",
                content: "Explain the main API error codes",
            },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 150,
    });

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        process.stdout.write(content);
    }
    console.log("\n\n---\n");

    // Example 5: Multiple completions (n parameter)
    console.log("💬 Example 5: Multiple completion options\n");
    console.log("User: Suggest an API endpoint name\n");

    const response5 = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            {
                role: "user",
                content: "Suggest a good name for an endpoint that retrieves user preferences",
            },
        ],
        n: 3,
        temperature: 0.9,
        max_tokens: 30,
    });

    console.log("Generated options:");
    response5.choices.forEach((choice, i) => {
        console.log(`  ${i + 1}. ${choice.message.content}`);
    });
    console.log("\n---\n");

    // Example 6: Using seed for reproducibility
    console.log("💬 Example 6: Reproducible responses with seed\n");

    const seed = 12345;
    console.log(`Using seed: ${seed}\n`);

    const response6a = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say a random greeting" }],
        seed,
        temperature: 0.7,
    });

    const response6b = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Say a random greeting" }],
        seed,
        temperature: 0.7,
    });

    console.log("Response 1:", response6a.choices[0].message.content);
    console.log("Response 2:", response6b.choices[0].message.content);
    console.log(
        "Identical?",
        response6a.choices[0].message.content ===
            response6b.choices[0].message.content
            ? "✅ Yes"
            : "❌ No (some variance is normal)"
    );
    console.log("\n---\n");

    // Cleanup
    console.log("🧹 Cleaning up...");
    await interceptor.deleteDocument("api-auth");
    await interceptor.deleteDocument("api-endpoints");
    console.log("✅ Cleanup complete\n");

    console.log("✨ Example completed successfully!");
    console.log("\n💡 Features demonstrated:");
    console.log("   ✅ GPT-4o with unified OpenAI interceptor");
    console.log("   ✅ Cost tracking and token usage");
    console.log("   ✅ JSON structured outputs");
    console.log("   ✅ Function/tool calling");
    console.log("   ✅ Streaming responses");
    console.log("   ✅ Multiple completions (n parameter)");
    console.log("   ✅ Reproducible outputs (seed)");
    console.log("   ✅ Automatic context injection for all features");
    console.log("\n🎯 Key Benefit: One interceptor works with ALL OpenAI features!");
}

main().catch(console.error);

