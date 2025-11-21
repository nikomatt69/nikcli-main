/**
 * Agent Automation Example
 *
 * This example shows how to use AI agents for automated development tasks
 */

import { createNikCLI } from '@nikcli/enterprise-sdk';

async function main() {
  const nikcli = await createNikCLI({
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY!,
    },
  });

  console.log('Running Agent Automation Examples...\n');

  // Example 1: Universal Agent
  console.log('--- Universal Agent ---');
  const universalResult = await nikcli.agents.universal(
    'Create a simple Express.js server with health check endpoint'
  );

  if (universalResult.success) {
    console.log('Universal agent completed:', universalResult.data.output);
  }

  // Example 2: Frontend Agent
  console.log('\n--- Frontend Agent ---');
  const frontendResult = await nikcli.agents.frontend(
    'Create a React component for a user profile card'
  );

  if (frontendResult.success) {
    console.log('Frontend agent completed');
  }

  // Example 3: Code Review Agent
  console.log('\n--- Code Review ---');
  const reviewResult = await nikcli.agents.codeReview(
    'src/index.ts',
    'Check for security issues and performance optimizations'
  );

  if (reviewResult.success) {
    console.log('Code review:', reviewResult.data.output);
  }

  // Example 4: Parallel Agents
  console.log('\n--- Parallel Agents ---');
  const parallelResult = await nikcli.agents.runParallel({
    agents: ['FrontendAgent', 'BackendAgent'],
    task: 'Build a simple todo app',
    mergeStrategy: 'all',
  });

  if (parallelResult.success) {
    console.log('Parallel execution completed');
    parallelResult.data.forEach((result: any, i: number) => {
      console.log(`Agent ${i + 1} result:`, result.output);
    });
  }

  // Example 5: Create Custom Agent
  console.log('\n--- Custom Agent ---');
  const customAgent = await nikcli.agents.createAgent({
    name: 'TestGeneratorAgent',
    type: 'specialized',
    capabilities: ['test-generation', 'code-analysis'],
    configuration: {
      model: 'claude-sonnet-4',
      temperature: 0.3,
    },
  });

  if (customAgent.success) {
    console.log('Created custom agent:', customAgent.data.name);

    // Use the custom agent
    const testResult = await nikcli.agents.run(
      'TestGeneratorAgent',
      'Generate unit tests for user authentication module'
    );

    if (testResult.success) {
      console.log('Test generation completed');
    }
  }

  // Example 6: Agent Metrics
  console.log('\n--- Agent Metrics ---');
  const metrics = await nikcli.agents.getMetrics('UniversalAgent');
  if (metrics.success) {
    console.log('Agent performance metrics:', metrics.data);
  }

  await nikcli.shutdown();
}

main().catch(console.error);
