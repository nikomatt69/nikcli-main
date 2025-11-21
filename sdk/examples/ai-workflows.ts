/**
 * AI Workflows Example
 *
 * Advanced AI operations with streaming, RAG, and multi-model support
 */

import { createNikCLI } from '@nikcli/enterprise-sdk';

async function main() {
  const nikcli = await createNikCLI({
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    },
    defaultModel: 'claude-sonnet-4',
  });

  console.log('Running AI Workflow Examples...\n');

  // Example 1: Basic Completion
  console.log('--- Basic Completion ---');
  const completion = await nikcli.ai.complete(
    'Explain the concept of closures in JavaScript',
    {
      temperature: 0.7,
      maxTokens: 500,
    }
  );

  if (completion.success) {
    console.log('Response:', completion.data.content);
    console.log('Tokens used:', completion.data.tokensUsed);
  }

  // Example 2: Streaming Completion
  console.log('\n--- Streaming Completion ---');
  process.stdout.write('Story: ');

  for await (const chunk of nikcli.ai.streamComplete(
    'Write a short story about a robot learning to paint',
    { temperature: 0.9 }
  )) {
    process.stdout.write(chunk.content);
  }
  console.log('\n');

  // Example 3: Multi-turn Chat
  console.log('--- Multi-turn Chat ---');
  const chatResult = await nikcli.ai.chat([
    { role: 'system', content: 'You are a helpful coding tutor' },
    { role: 'user', content: 'How do I use async/await in TypeScript?' },
  ]);

  if (chatResult.success) {
    console.log('Assistant:', chatResult.data.content);
  }

  // Example 4: Provider-specific Calls
  console.log('\n--- Provider-specific Calls ---');

  // Claude
  const claudeResult = await nikcli.ai.claude(
    'What are the best practices for React hooks?'
  );
  if (claudeResult.success) {
    console.log('Claude response received');
  }

  // GPT
  const gptResult = await nikcli.ai.gpt(
    'Generate 5 creative variable names for a user authentication system'
  );
  if (gptResult.success) {
    console.log('GPT response:', gptResult.data.content);
  }

  // Example 5: Embeddings
  console.log('\n--- Embeddings ---');
  const texts = [
    'Machine learning is a subset of artificial intelligence',
    'Deep learning uses neural networks with multiple layers',
    'Natural language processing helps computers understand text',
  ];

  const embeddings = await nikcli.ai.embed(texts);
  if (embeddings.success) {
    console.log(`Generated embeddings for ${texts.length} texts`);
    console.log('First embedding dimensions:', embeddings.data[0].length);
  }

  // Example 6: RAG Workflow
  console.log('\n--- RAG Workflow ---');

  // Index documents
  const docs = [
    'NikCLI is an enterprise AI-powered CLI tool',
    'The SDK provides programmatic access to all features',
    'Agents can be used for autonomous task execution',
  ];

  for (const doc of docs) {
    await nikcli.services.ragIndex(doc, { type: 'documentation' });
  }
  console.log('Indexed documents');

  // Search
  const ragResults = await nikcli.services.ragSearch({
    query: 'How to use agents?',
    topK: 2,
  });

  if (ragResults.success) {
    console.log('RAG search results:');
    ragResults.data.forEach((doc: any, i: number) => {
      console.log(`${i + 1}. ${doc.content} (score: ${doc.score})`);
    });
  }

  // Use RAG results in completion
  const context = ragResults.data.map((d: any) => d.content).join('\n');
  const ragCompletion = await nikcli.ai.complete(
    `Based on this context:\n${context}\n\nAnswer: How do I use agents in NikCLI?`
  );

  if (ragCompletion.success) {
    console.log('\nRAG-enhanced response:', ragCompletion.data.content);
  }

  // Example 7: Adaptive Routing
  console.log('\n--- Adaptive Routing ---');
  await nikcli.ai.enableAdaptiveRouting();
  const routerStatus = await nikcli.ai.getRouterStatus();

  if (routerStatus.success) {
    console.log('Router enabled:', routerStatus.data.enabled);
    console.log('Current strategy:', routerStatus.data.strategy);
  }

  // Example 8: Token Management
  console.log('\n--- Token Management ---');
  const tokenCount = await nikcli.ai.countTokens(
    'This is a sample text to count tokens'
  );

  if (tokenCount.success) {
    console.log('Token count:', tokenCount.data);
  }

  const usage = await nikcli.ai.getTokenUsage();
  if (usage.success) {
    console.log('Total tokens used:', usage.data.total);
    console.log('By model:', usage.data.byModel);
  }

  // Example 9: Memory Integration
  console.log('\n--- Memory Integration ---');

  // Remember user preferences
  await nikcli.services.remember(
    'User prefers TypeScript over JavaScript',
    { category: 'preferences' }
  );

  await nikcli.services.remember(
    'User is building a React e-commerce app',
    { category: 'project' }
  );

  // Recall memories
  const memories = await nikcli.services.recall({
    query: 'user preferences and project',
    limit: 5,
  });

  if (memories.success) {
    console.log('Recalled memories:');
    memories.data.forEach((m: any, i: number) => {
      console.log(`${i + 1}. ${m.content}`);
    });

    // Use memories in AI completion
    const memoryContext = memories.data.map((m: any) => m.content).join('\n');
    const personalizedResponse = await nikcli.ai.complete(
      `Considering:\n${memoryContext}\n\nSuggest the best state management solution`
    );

    if (personalizedResponse.success) {
      console.log('\nPersonalized suggestion:', personalizedResponse.data.content);
    }
  }

  await nikcli.shutdown();
}

main().catch(console.error);
