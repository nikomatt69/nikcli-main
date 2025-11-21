# NikCLI Enterprise SDK

> Complete programmatic access to all NikCLI commands, tools, agents, and services

The NikCLI Enterprise SDK provides a comprehensive TypeScript/JavaScript interface to control every aspect of NikCLI programmatically. Build custom workflows, automate tasks, integrate AI agents, and leverage the full power of NikCLI in your applications.

## Features

- 🚀 **100+ Commands** - Full programmatic access to all CLI commands
- 🛠️ **35+ Production Tools** - File operations, search, execution, AI, Web3, and more
- 🤖 **10+ AI Agents** - Universal, specialized, and custom agents
- 🧠 **Advanced AI** - Multi-provider support with adaptive routing
- 🌐 **Browser Automation** - Browserbase integration for web tasks
- ⚡ **VM Isolation** - Secure containerized development environments
- 🔗 **Web3 Integration** - GOAT SDK, Polymarket, Coinbase Agent Kit
- 💾 **Memory & RAG** - Long-term memory and retrieval-augmented generation
- 📊 **Real-time Metrics** - Dashboard and monitoring capabilities
- 🔒 **Type-Safe** - Full TypeScript support with comprehensive types

## Installation

```bash
npm install @nikcli/enterprise-sdk
```

Or with yarn:

```bash
yarn add @nikcli/enterprise-sdk
```

## Quick Start

```typescript
import { NikCLI, createNikCLI } from '@nikcli/enterprise-sdk';

// Method 1: Auto-initialize
const nikcli = await createNikCLI({
  workingDirectory: '/path/to/project',
  apiKeys: {
    anthropic: 'your-api-key',
  },
});

// Method 2: Manual initialization
const nikcli = new NikCLI({
  workingDirectory: '/path/to/project',
  defaultModel: 'claude-sonnet-4',
  temperature: 0.7,
});
await nikcli.init();

// Execute commands
const help = await nikcli.commands.help();
console.log(help.data);

// Use tools
const fileContent = await nikcli.tools.readFile('package.json');
console.log(fileContent.data);

// Run AI agent
const result = await nikcli.agents.universal('Build a React login component');
console.log(result.data);

// Chat with AI
const response = await nikcli.chat('Explain this codebase');
console.log(response.data);
```

## SDK Modules

The SDK is organized into 8 main modules:

### 1. Commands Module

Access all 100+ CLI commands programmatically.

```typescript
// System commands
await nikcli.commands.help('agents');
await nikcli.commands.getStats();
await nikcli.commands.getDashboard();

// File operations
await nikcli.commands.readFile('src/index.ts');
await nikcli.commands.writeFile('output.txt', 'Hello World');
await nikcli.commands.searchFiles('TODO', 'src/');

// Model management
await nikcli.commands.switchModel('claude-opus-4');
await nikcli.commands.setTemperature(0.8);
await nikcli.commands.enableRouter();

// Agent operations
await nikcli.commands.listAgents();
await nikcli.commands.runAgent('UniversalAgent', 'Build a API server');
await nikcli.commands.auto('Deploy to production');

// Planning & tasks
await nikcli.commands.generatePlan();
await nikcli.commands.listTodos();

// Session management
await nikcli.commands.saveSession('my-session');
await nikcli.commands.resumeSession('session-id');
```

### 2. Tools Module

Execute 35+ production-ready tools.

```typescript
// File operations
await nikcli.tools.readFile('package.json');
await nikcli.tools.writeFile('output.txt', 'content');
await nikcli.tools.editFile('src/app.ts', [
  { search: 'old code', replace: 'new code' }
]);
await nikcli.tools.multiEdit([
  { filePath: 'file1.ts', changes: [...] },
  { filePath: 'file2.ts', changes: [...] }
]);

// Search & discovery
await nikcli.tools.grep('TODO', { caseSensitive: false });
await nikcli.tools.findFiles('**/*.ts');
await nikcli.tools.glob('src/**/*.tsx');

// System execution
await nikcli.tools.bash('npm install');
await nikcli.tools.git('status');

// AI & Vision
await nikcli.tools.analyzeImage('screenshot.png', 'What is in this image?');
await nikcli.tools.generateImage('A futuristic city');

// Browser automation
await nikcli.tools.browserNavigate({ url: 'https://example.com' });
await nikcli.tools.browserClick({ selector: '#submit-button' });
await nikcli.tools.browserType({ selector: '#email', text: 'user@example.com' });
await nikcli.tools.browserScreenshot({ fullPage: true });

// CAD & Manufacturing
await nikcli.tools.textToCad({
  description: 'A gear with 20 teeth',
  format: 'step'
});
await nikcli.tools.textToGcode({
  description: 'Cut a 10cm circle'
});

// Web3
await nikcli.tools.goat('getBalance');
await nikcli.tools.coinbaseAgent('transfer', { to: '0x...', amount: '1.0' });
```

### 3. Agents Module

Run and manage 10+ AI agents.

```typescript
// Universal agent - All capabilities
await nikcli.agents.universal('Build a full-stack app with auth');

// Specialized agents
await nikcli.agents.frontend('Create a React dashboard');
await nikcli.agents.backend('Build a REST API with Express');
await nikcli.agents.devops('Setup CI/CD pipeline');
await nikcli.agents.codeReview('src/components/Login.tsx');
await nikcli.agents.optimize('database queries', ['speed', 'memory']);

// VM-based agent
await nikcli.agents.virtualized('Clone and fix issues in repo', 'owner/repo');

// Polymarket trading agent
await nikcli.agents.polymarket('analyzeBestMarkets');

// Parallel execution
await nikcli.agents.runParallel({
  agents: ['FrontendAgent', 'BackendAgent', 'DevOpsAgent'],
  task: 'Build complete e-commerce platform',
  mergeStrategy: 'all'
});

// Custom agent creation
await nikcli.agents.createAgent({
  name: 'MyCustomAgent',
  type: 'specialized',
  capabilities: ['code-generation', 'testing'],
  configuration: { model: 'claude-opus-4' }
});

// Agent management
await nikcli.agents.listAgents();
await nikcli.agents.getAgent('UniversalAgent');
await nikcli.agents.getMetrics('UniversalAgent');
```

### 4. Services Module

Access core services for memory, RAG, cache, and more.

```typescript
// Memory service
await nikcli.services.remember('User prefers dark mode', { userId: '123' });
const memories = await nikcli.services.recall({ query: 'user preferences' });
await nikcli.services.forget('memory-id');

// RAG (Retrieval-Augmented Generation)
await nikcli.services.ragIndex('Documentation content...', { type: 'docs' });
const docs = await nikcli.services.ragSearch({
  query: 'How to use agents?',
  topK: 5
});

// Cache service
await nikcli.services.cacheSet('key', { data: 'value' }, 3600);
const value = await nikcli.services.cacheGet('key');

// Snapshots
await nikcli.services.createSnapshot('before-refactor');
await nikcli.services.restoreSnapshot('snapshot-id');
await nikcli.services.compareSnapshots('snap1', 'snap2');

// Dashboard metrics
const metrics = await nikcli.services.getMetrics();
await nikcli.services.subscribeToMetrics((metrics) => {
  console.log('Tokens used:', metrics.tokensUsed);
});

// Planning
const plan = await nikcli.services.generatePlan('Migrate to TypeScript');
await nikcli.services.executePlan(plan.id);

// NikDrive cloud storage
await nikcli.services.uploadFile('local/file.txt', 'remote/path');
await nikcli.services.downloadFile('remote/file.txt', 'local/');
```

### 5. AI Module

Advanced AI operations with multi-provider support.

```typescript
// Completions
const result = await nikcli.ai.complete('Explain quantum computing', {
  model: 'claude-sonnet-4',
  temperature: 0.7,
  maxTokens: 1000
});

// Streaming
for await (const chunk of nikcli.ai.streamComplete('Write a story')) {
  process.stdout.write(chunk.content);
}

// Chat
const response = await nikcli.ai.chat([
  { role: 'system', content: 'You are a helpful coding assistant' },
  { role: 'user', content: 'How do I implement auth?' }
]);

// Provider-specific
await nikcli.ai.claude('Analyze this code');
await nikcli.ai.gpt('Generate unit tests');
await nikcli.ai.gemini('Summarize this document');
await nikcli.ai.ollama('Explain in simple terms', 'llama2');

// Adaptive routing
await nikcli.ai.enableAdaptiveRouting();
const status = await nikcli.ai.getRouterStatus();

// Embeddings
const embeddings = await nikcli.ai.embed(['text 1', 'text 2']);
const singleEmbedding = await nikcli.ai.embedSingle('query text');

// Token management
const count = await nikcli.ai.countTokens('Sample text');
const usage = await nikcli.ai.getTokenUsage();
```

### 6. Browser Module

Automated browser control.

```typescript
// Start browser
await nikcli.browser.start();

// Navigate
await nikcli.browser.navigate({
  url: 'https://example.com',
  waitUntil: 'networkidle'
});

// Interact
await nikcli.browser.click({ selector: '#login-button' });
await nikcli.browser.type({ selector: '#email', text: 'user@example.com' });
await nikcli.browser.scroll('down', 500);
await nikcli.browser.waitForElement('#results', 5000);

// Extract data
const screenshot = await nikcli.browser.screenshot({ fullPage: true });
const text = await nikcli.browser.extractText();
const html = await nikcli.browser.getHTML();
const pageInfo = await nikcli.browser.getPageInfo();

// Execute JavaScript
const result = await nikcli.browser.executeScript(`
  return document.title;
`);

// Close
await nikcli.browser.close();
```

### 7. VM Module

Secure virtualized development environments.

```typescript
// Create VM
const vm = await nikcli.vm.create({
  type: 'repo',
  repository: 'https://github.com/owner/repo',
  resources: {
    cpu: 2,
    memory: '4GB',
    disk: '20GB'
  }
});

// Manage VMs
const vms = await nikcli.vm.list();
await nikcli.vm.start(vm.data.id);
await nikcli.vm.stop(vm.data.id);

// Execute commands
await nikcli.vm.exec(vm.data.id, 'npm install');
await nikcli.vm.exec(vm.data.id, 'npm test');

// File transfer
await nikcli.vm.copyTo(vm.data.id, 'local/config.json', '/app/config.json');
await nikcli.vm.copyFrom(vm.data.id, '/app/output.log', 'local/');

// Create from repository
const repoVM = await nikcli.vm.createFromRepo('https://github.com/owner/repo');
```

### 8. Web3 Module

Blockchain and Web3 integrations.

```typescript
// GOAT SDK
await nikcli.web3.initGoat({
  provider: 'https://mainnet.infura.io/v3/YOUR-PROJECT-ID',
  privateKey: process.env.PRIVATE_KEY
});

const wallet = await nikcli.web3.getWallet();
const balance = await nikcli.web3.getBalance('USDC');

await nikcli.web3.transfer({
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  amount: '10.0',
  token: 'USDC'
});

// Polymarket
const markets = await nikcli.web3.listMarkets({ active: true });
const market = await nikcli.web3.getMarket('market-id');

await nikcli.web3.placeBet({
  marketId: 'market-id',
  outcome: 'Yes',
  amount: '100'
});

const positions = await nikcli.web3.getPositions();
const analysis = await nikcli.web3.analyzeMarket('market-id');

// Coinbase Agent Kit
await nikcli.web3.initCoinbase();
const cbWallet = await nikcli.web3.getCoinbaseWallet();

// Smart contracts
await nikcli.web3.callContract(
  '0x...',
  contractABI,
  'balanceOf',
  ['0x...']
);

await nikcli.web3.sendTransaction(
  '0x...',
  contractABI,
  'transfer',
  ['0x...', '1000000'],
  '0'
);

// Toolchains
const toolchains = await nikcli.web3.listToolchains();
await nikcli.web3.executeToolchain('erc20-transfer', {
  token: '0x...',
  to: '0x...',
  amount: '100'
});
```

## Advanced Usage

### Event Handling

```typescript
nikcli.on((event) => {
  switch (event.type) {
    case 'tool.start':
      console.log(`Tool started: ${event.toolName}`);
      break;
    case 'agent.complete':
      console.log(`Agent completed: ${event.agentId}`);
      break;
    case 'chat.message':
      console.log(`Message: ${event.message.content}`);
      break;
  }
});
```

### Configuration

```typescript
const nikcli = new NikCLI({
  // Working directory
  workingDirectory: '/path/to/project',

  // API keys
  apiKeys: {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  },

  // AI settings
  defaultModel: 'claude-sonnet-4',
  temperature: 0.7,
  adaptiveRouting: true,

  // Services
  redisUrl: process.env.REDIS_URL,
  upstashVector: {
    url: process.env.UPSTASH_VECTOR_URL,
    token: process.env.UPSTASH_VECTOR_TOKEN,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },

  // Features
  features: {
    clearCacheOnShutdown: true,
  },

  // Logging
  verbose: true,
  debug: false,
});

await nikcli.init();
```

### Error Handling

All SDK methods return a standardized response:

```typescript
interface SDKResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    stack?: string;
  };
  metadata?: Record<string, any>;
}
```

Usage:

```typescript
const result = await nikcli.tools.readFile('file.txt');

if (result.success) {
  console.log('File content:', result.data);
} else {
  console.error('Error:', result.error.message);
  console.error('Code:', result.error.code);
}
```

### Cleanup

```typescript
// Always cleanup when done
await nikcli.shutdown();
```

## Examples

### Example 1: Build a Full-Stack App

```typescript
const nikcli = await createNikCLI({
  apiKeys: { anthropic: process.env.ANTHROPIC_API_KEY }
});

// Generate plan
const plan = await nikcli.services.generatePlan(
  'Build a full-stack todo app with React and Express'
);

// Execute with agents in parallel
await nikcli.agents.runParallel({
  agents: ['FrontendAgent', 'BackendAgent', 'DevOpsAgent'],
  task: plan.data.goal,
  mergeStrategy: 'all'
});

await nikcli.shutdown();
```

### Example 2: Automated Testing

```typescript
const nikcli = await createNikCLI();

// Read test files
const tests = await nikcli.tools.findFiles('**/*.test.ts');

// Run tests
for (const testFile of tests.data) {
  const result = await nikcli.tools.bash(`npm test ${testFile}`);
  console.log(result.data);
}

await nikcli.shutdown();
```

### Example 3: Web Scraping

```typescript
const nikcli = await createNikCLI();

await nikcli.browser.start();
await nikcli.browser.navigate({ url: 'https://news.ycombinator.com' });

const titles = await nikcli.browser.executeScript(`
  return Array.from(document.querySelectorAll('.titleline > a'))
    .map(a => a.textContent);
`);

console.log('Top stories:', titles.data);

await nikcli.browser.close();
await nikcli.shutdown();
```

### Example 4: AI Code Review

```typescript
const nikcli = await createNikCLI();

// Get changed files
const diff = await nikcli.tools.git('diff', ['--name-only', 'HEAD~1']);

// Review each file
for (const file of diff.data.split('\n')) {
  const review = await nikcli.agents.codeReview(file);
  console.log(`Review for ${file}:`, review.data);
}

await nikcli.shutdown();
```

## API Reference

Full API documentation is available at [https://nikcli.mintlify.app/sdk](https://nikcli.mintlify.app/sdk)

## TypeScript Support

The SDK is written in TypeScript and includes comprehensive type definitions:

```typescript
import type {
  SDKConfig,
  SDKResponse,
  AgentDefinition,
  ToolDefinition,
  AICompletionResult,
  // ... and 50+ more types
} from '@nikcli/enterprise-sdk';
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

## License

MIT © NikCLI Team

## Support

- Documentation: [https://nikcli.mintlify.app](https://nikcli.mintlify.app)
- Issues: [GitHub Issues](https://github.com/nikomatt69/nikcli-main/issues)
- Discussions: [GitHub Discussions](https://github.com/nikomatt69/nikcli-main/discussions)

---

Built with ❤️ by the NikCLI team
