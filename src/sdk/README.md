# NikCLI SDK

Official SDK for building TTY applications and CLI agents powered by NikCLI.

## Features

- 🤖 **Multi-Agent System**: Create and manage specialized AI agents
- 🌊 **Real-time Streaming**: Handle streaming data and events
- 🖥️ **TTY Components**: Pre-built React components for terminal interfaces
- ⚡ **React Hooks**: Easy-to-use hooks for state management
- 🔧 **TypeScript**: Full TypeScript support with comprehensive types
- 🎨 **Customizable**: Highly customizable and extensible

## Installation

```bash
npm install @nicomatt69/nikcli-sdk
# or
yarn add @nicomatt69/nikcli-sdk
# or
pnpm add @nicomatt69/nikcli-sdk
```

## Quick Start

### Basic Usage

```tsx
import React from 'react'
import { initializeSDK, useTTY, TTYInput, TTYOutput } from '@nicomatt69/nikcli-sdk'

function App() {
  const { input, output, setInput, submitInput } = useTTY()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TTYOutput content={output} />
      <TTYInput 
        value={input}
        onChange={setInput}
        onSubmit={submitInput}
      />
    </div>
  )
}

// Initialize SDK
initializeSDK({
  apiKeys: {
    anthropic: process.env.ANTHROPIC_API_KEY,
  },
  enableStreaming: true,
  enableAgents: true,
})
```

### Using Agents

```tsx
import { useAgent, type AgentConfig } from '@nicomatt69/nikcli-sdk'

function AgentExample() {
  const { agent, executeTask, status, metrics } = useAgent('my-agent')

  const handleTask = async () => {
    await executeTask({
      type: 'user_request',
      title: 'Process Data',
      description: 'Process the provided data',
      priority: 'medium',
      data: { input: 'sample data' },
    })
  }

  return (
    <div>
      <h3>{agent?.name}</h3>
      <p>Status: {status}</p>
      <p>Tasks Completed: {metrics.tasksSucceeded}</p>
      <button onClick={handleTask}>Execute Task</button>
    </div>
  )
}
```

### Streaming Data

```tsx
import { useStream } from '@nicomatt69/nikcli-sdk'

function StreamingExample() {
  const { events, isStreaming, sendMessage } = useStream()

  const handleSend = async () => {
    await sendMessage('Hello, world!')
  }

  return (
    <div>
      <p>Streaming: {isStreaming ? 'Yes' : 'No'}</p>
      <p>Events: {events.length}</p>
      <button onClick={handleSend}>Send Message</button>
    </div>
  )
}
```

## Components

### TTYInput

Terminal-style input component with history and autocomplete support.

```tsx
import { TTYInput, TTYInputWithHistory, TTYInputWithAutocomplete } from '@nicomatt69/nikcli-sdk'

// Basic input
<TTYInput 
  placeholder="Enter command..."
  onChange={setValue}
  onSubmit={handleSubmit}
/>

// With history
<TTYInputWithHistory 
  history={commandHistory}
  onHistoryNavigate={handleHistory}
/>

// With autocomplete
<TTYInputWithAutocomplete 
  suggestions={['help', 'status', 'quit']}
  onSuggestionSelect={handleSuggestion}
/>
```

### TTYOutput

Terminal-style output component with syntax highlighting and streaming.

```tsx
import { TTYOutput, TTYOutputWithHighlighting, TTYOutputWithStreaming } from '@nicomatt69/nikcli-sdk'

// Basic output
<TTYOutput 
  content={output}
  type="text"
  theme="dark"
  scrollable={true}
/>

// With syntax highlighting
<TTYOutputWithHighlighting 
  content={jsonData}
  highlightLanguage="json"
/>

// With streaming
<TTYOutputWithStreaming 
  content={streamingContent}
  streamDelay={50}
/>
```

### TTYPanel

Terminal-style panel component with tabs and status indicators.

```tsx
import { TTYPanel, TTYPanelWithTabs, TTYPanelWithStatus } from '@nicomatt69/nikcli-sdk'

// Basic panel
<TTYPanel 
  title="Logs"
  position="right"
  width={300}
  height={200}
  collapsible={true}
  resizable={true}
>
  <LogContent />
</TTYPanel>

// With tabs
<TTYPanelWithTabs 
  title="Terminal"
  tabs={[
    { id: 'main', label: 'Main', content: <MainContent /> },
    { id: 'logs', label: 'Logs', content: <LogContent /> },
  ]}
/>

// With status
<TTYPanelWithStatus 
  title="Agent Status"
  status="busy"
  statusMessage="Processing task..."
/>
```

### TTYStatus

Status indicator component with progress and timer support.

```tsx
import { TTYStatus, TTYStatusWithIcon, TTYStatusWithTimer } from '@nicomatt69/nikcli-sdk'

// Basic status
<TTYStatus 
  status="busy"
  message="Processing..."
  progress={75}
  showProgress={true}
/>

// With icon
<TTYStatusWithIcon 
  status="error"
  icon="⚠️"
  message="Error occurred"
/>

// With timer
<TTYStatusWithTimer 
  status="busy"
  startTime={new Date()}
  showTimer={true}
  format="elapsed"
/>
```

## Hooks

### useAgent

Manage agent state and operations.

```tsx
const { 
  agent, 
  status, 
  metrics, 
  tasks, 
  executeTask, 
  cancelTask, 
  refresh 
} = useAgent('agent-id')
```

### useStream

Manage streaming state and operations.

```tsx
const { 
  events, 
  isStreaming, 
  startStream, 
  stopStream, 
  sendMessage, 
  clearEvents 
} = useStream()
```

### useTTY

Manage TTY interface state.

```tsx
const { 
  input, 
  output, 
  history, 
  setInput, 
  submitInput, 
  clearOutput, 
  addToHistory, 
  navigateHistory 
} = useTTY()
```

## Configuration

```tsx
import { initializeSDK, type SDKConfig } from '@nicomatt69/nikcli-sdk'

const config: SDKConfig = {
  apiKeys: {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  },
  defaultModel: 'claude-3-5-sonnet-20241022',
  workingDirectory: process.cwd(),
  logLevel: 'info',
  enableStreaming: true,
  enableAgents: true,
  enableTools: true,
  maxConcurrentTasks: 5,
  defaultTimeout: 300000,
  retryPolicy: {
    maxAttempts: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,
    retryableErrors: ['NetworkError', 'TimeoutError'],
  },
}

const sdk = await initializeSDK(config)
```

## Examples

Check out the `examples/` directory for complete examples:

- `basic-usage.tsx` - Simple TTY application
- `agent-example.ts` - Custom agent creation and usage
- `streaming-example.ts` - Real-time streaming
- `multi-agent-example.ts` - Multiple agents working together

## API Reference

### Core Classes

- `NikCLISDK` - Main SDK class
- `AgentManager` - Agent lifecycle management
- `StreamManager` - Streaming and event handling

### Types

- `AgentConfig` - Agent configuration
- `AgentTask` - Task definition
- `StreamEvent` - Streaming event
- `SDKConfig` - SDK configuration

### Hooks

- `useAgent` - Agent management hook
- `useStream` - Streaming hook
- `useTTY` - TTY interface hook

### Components

- `TTYInput` - Input component
- `TTYOutput` - Output component
- `TTYPanel` - Panel component
- `TTYStatus` - Status component

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: [Report bugs and request features](https://github.com/nikomatt69/nikcli-main/issues)
- Documentation: [Full API documentation](https://github.com/nikomatt69/nikcli-main/tree/main/src/sdk/docs)
- Examples: [Code examples and tutorials](https://github.com/nikomatt69/nikcli-main/tree/main/src/sdk/examples)