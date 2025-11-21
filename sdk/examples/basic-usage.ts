/**
 * Basic Usage Example
 *
 * This example demonstrates basic SDK initialization and usage
 */

import { createNikCLI } from '@nikcli/enterprise-sdk';

async function main() {
  // Create and initialize SDK
  const nikcli = await createNikCLI({
    workingDirectory: process.cwd(),
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY!,
    },
    defaultModel: 'claude-sonnet-4',
    temperature: 0.7,
    verbose: true,
  });

  console.log('NikCLI SDK initialized!');
  console.log('Version:', nikcli.getVersion());

  // Example 1: File Operations
  console.log('\n--- File Operations ---');
  const fileResult = await nikcli.tools.readFile('package.json');
  if (fileResult.success) {
    console.log('Read package.json successfully');
  }

  // Example 2: Search
  console.log('\n--- Search ---');
  const searchResult = await nikcli.tools.grep('TODO', {
    regex: false,
    caseInsensitive: true,
  });
  if (searchResult.success) {
    console.log('Found TODOs:', searchResult.data);
  }

  // Example 3: AI Chat
  console.log('\n--- AI Chat ---');
  const chatResult = await nikcli.chat('What is TypeScript?');
  if (chatResult.success) {
    console.log('AI Response:', chatResult.data.content);
  }

  // Example 4: Get Stats
  console.log('\n--- Statistics ---');
  const stats = await nikcli.commands.getStats();
  if (stats.success) {
    console.log('Usage stats:', stats.data);
  }

  // Cleanup
  await nikcli.shutdown();
  console.log('\nSDK shutdown complete');
}

main().catch(console.error);
