# TUI-Kit-AI

A comprehensive Terminal User Interface (TUI) component library for building AI-powered CLI applications and agents. Built with TypeScript, designed for modern AI copilots like Claude Code.

## 🚀 Features

- **Rich TUI Components**: Pre-built terminal components (boxes, inputs, spinners, etc.)
- **AI Integration**: Seamless integration with AI providers (OpenAI, Anthropic, etc.)
- **Agent System**: Modular agent architecture for specialized AI tasks
- **Streaming Support**: Real-time AI response streaming with visual feedback
- **CLI Framework**: Quick setup for professional CLI applications
- **TypeScript First**: Full type safety and excellent developer experience
- **Modular Architecture**: Use only what you need, when you need it

## 📦 Packages

|Package                |Description                         |
|-----------------------|------------------------------------|
|`@tui-kit-ai/core`     |Core TUI components and primitives  |
|`@tui-kit-ai/ai`       |AI-specific components and streaming|
|`@tui-kit-ai/agents`   |Agent system and specialized agents |
|`@tui-kit-ai/providers`|AI provider implementations         |
|`@tui-kit-ai/cli`      |CLI framework and bootstrapping     |

## 🔧 Quick Start

### Installation

```bash
npm i @tui-kit-ai/core @tui-kit-ai/ai @tui-kit-ai/agents
```

### Basic Chat Application

```typescript
import { useTerminal, Box, TextInput } from '@tui-kit-ai/core';
import { ChatContainer, AIService } from '@tui-kit-ai/ai';

const aiService = new AIService({
  provider: 'openai',
  model: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY
});

const { screen } = useTerminal();

const chatContainer = new ChatContainer({
  parent: screen,
  messages: [],
  onMessageSubmit: async (content) => {
    const result = await aiService.streamCompletion([
      { role: 'user', content }
    ]);
    
    for await (const chunk of result.textStream) {
      // Handle streaming response
    }
  }
});
```

### Agent-Based Application

```typescript
import { AgentManager, TodoAgent } from '@tui-kit-ai/agents';

const agentManager = new AgentManager();

const todoAgent = new TodoAgent({
  name: 'todo-agent',
  description: 'Manages development tasks',
});

agentManager.registerAgent(todoAgent);
await agentManager.startAllAgents();

// Add a task to the todo agent
await todoAgent.addTask({
  type: 'create',
  data: { title: 'Implement user authentication' }
});
```

## 🏗️ Architecture

### Core Components

- **Layout**: `Box`, `Flex`, `Grid`, `Panel`
- **Input**: `TextInput`, `Select`, `Checkbox`, `MultiSelect`, `Button`, `RadioGroup`, `Prompt`, `SearchBox`
- **Display**: `Text`, `Heading`, `Paragraph`, `Badge`, `Avatar`, `Divider`
- **Feedback**: `Spinner`, `ProgressBar`, `Gauge`, `StatusIndicator`, `Toast`, `Notification`, `ProgressSpinner`, `ProgressDots`, `ProgressList`, `StatusBar`
- **Navigation**: `Menu`, `Tabs`, `Breadcrumb`, `Tree`, `Table`
- **Containers**: `Scrollable`, `Modal`, `HelpOverlay`, `Tooltip`, `Collapsible`, `LogViewer`, `Stepper`

### AI Components

- **Chat**: `ChatContainer`
- **Streaming**: `AIService` with provider injection

### Agent System

- **Base**: `BaseAgent`, `AgentManager`
- **Specialized**: `TodoAgent`

## 📋 Examples

### Simple Todo CLI

```bash
cd examples/todo-agent
npm install
npm run dev
```

### Code Assistant

```bash
cd examples/code-assistant
npm install
npm run dev
```

### Multi-Agent System

```bash
cd examples/multi-agent
npm install
npm run dev
```

## 🛠️ Development

```bash
# Install root deps
npm install

# Build all packages
npm run build
```

## 📚 Documentation

- [Getting Started](./docs/getting-started.md)

## 🔌 AI Provider Support

- **OpenAI**: via `OpenAIProvider`
- **Anthropic**: via `AnthropicProvider`
- **Local Models**: via `OllamaProvider`

## 🎨 Theming

Use `darkTheme` or `lightTheme` and override any token via `theme` prop on components.

## 📄 License

MIT