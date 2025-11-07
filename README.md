// TODO: Consider refactoring for reduced complexity

# NikCLI - Context-Aware AI Development Assistant

**Transform your development workflow with intelligent AI agents that understand your code, execute commands, and build applications autonomously.**

[![npm](https://img.shields.io/npm/v/@nicomatt69/nikcli)](https://www.npmjs.com/package/@nicomatt69/nikcli)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Package Manager](https://img.shields.io/badge/supports-npm%20%7C%20yarn%20%7C%20pnpm%20%7C%20bun-brightgreen)](https://www.npmjs.com/package/@nicomatt69/nikcli)

## 🚀 Quick Start

### Installation

<details>
<summary>🔧 <strong>Universal Installation (Any Package Manager)</strong></summary>

#### Quick Install (Recommended)

```bash
# Unix/macOS - Universal installer auto-detects best package manager
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash

# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.ps1 | iex
```

#### Manual Installation

Choose your preferred package manager:

```bash
# npm
npm install -g @nicomatt69/nikcli

# yarn
yarn global add @nicomatt69/nikcli

# pnpm
pnpm install -g @nicomatt69/nikcli

# bun
bun install -g @nicomatt69/nikcli
```

#### Specify Package Manager

```bash
# Force specific package manager with installer
curl -fsSL https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.sh | bash -s pnpm

# Windows PowerShell with specific manager
iwr -useb https://raw.githubusercontent.com/nikomatt69/nikcli-main/main/installer/install.ps1 | iex -PackageManager yarn
```

</details>

<details>
<summary>🔨 <strong>Development Setup</strong></summary>

```bash
# Clone repository
git clone https://github.com/nikomatt69/nikcli-main
cd nikcli-main

# Install dependencies (development uses pnpm for optimal performance)
pnpm install

# Build and start
pnpm run build
pnpm start
```

**Development Scripts:**

- `pnpm start` - Start in development mode
- `pnpm run dev` - Development with watch mode
- `pnpm run build` - Compile TypeScript
- `pnpm test` - Run tests
- `pnpm run build:binary` - Create binary distribution

> **Note**: Development uses pnpm for optimal performance, but NikCLI supports installation with any package manager.

</details>

### First Run

```bash
nikcli
```

## 📚 Documentation

**Complete documentation is available at [nikcli.mintlify.app](https://nikcli.mintlify.app)**

- 📖 [Getting Started](https://nikcli.mintlify.app/quickstart/installation)
- 🎯 [CLI Commands Reference](https://nikcli.mintlify.app/cli-reference/commands-overview)
- 🤖 [Agent System](https://nikcli.mintlify.app/agent-system/overview)
- 🔨 [Configuration](https://nikcli.mintlify.app/configuration)
- 🔨 [Development Guide](https://nikcli.mintlify.app/contributing/development)
- 📝 [Vim Integration Guide](https://nikcli.mintlify.app/features/vim-mode) (New!)

## ✨ Key Features

- **🤖 AI-Powered Development**: Autonomous code generation, analysis, and optimization
- **🔧 100+ Built-in Commands**: Comprehensive CLI with file operations, terminal integration, VM management, and more
- **🛠️ 35+ Production Tools**: Secure, validated tools for filesystem, search, AI, blockchain, browser automation, and CAD
- **🌟 Universal Agent**: Single comprehensive agent with 50+ capabilities covering full-stack development
- **🔒 Secure by Design**: Approval system, encrypted API keys (AES-256-GCM), path sanitization, and command allow-listing
- **📊 Multiple AI Providers**: Claude, GPT, Gemini, Ollama, OpenRouter support with adaptive routing
- **📦 Universal Package Manager Support**: Works with npm, yarn, pnpm, and bun
- **🚀 Production Ready**: Enterprise-grade architecture with comprehensive testing, monitoring, and error handling
- **🐳 Virtualized Agents**: Isolated container-based development environments with VS Code Server integration
- **📋 Autonomous Planning**: AI-powered task planning with risk assessment and step-by-step execution
- **🧠 Context-Aware RAG**: Intelligent workspace context understanding with semantic search

## 🏗️ System Architecture

NikCLI follows a modular, service-oriented architecture with clear separation of concerns:

### Core Layers

**UI Layer** (`src/cli/ui/`)
- Advanced CLI UI with dynamic layouts and progress bars
- Diff Viewer & Manager for code changes
- Approval System for sensitive operations
- IDE-aware formatting and display

**Service Layer** (`src/cli/services/`)
- Agent Service: Manages agent lifecycle and execution
- Tool Service: Tool registry and execution coordination
- Planning Service: Autonomous task planning and execution
- Memory Service: Long-term memory and personalization
- Cache Service: Token and completion caching
- Snapshot Service: Project state snapshots and restoration
- LSP Service: Language Server Protocol integration
- Dashboard Service: Real-time metrics and analytics

**Core Layer** (`src/cli/core/`)
- Config Manager: Multi-provider configuration with encryption
- Agent Manager: Agent registration and orchestration
- Tool Router: Intelligent tool selection and routing
- Token Management: Token optimization and caching
- Context Manager: Workspace context and RAG system
- Performance Optimizer: Caching and optimization strategies

**Tool Layer** (`src/cli/tools/`)
- Secure Tools Registry: Production-ready tool system
- 35+ Tools: File operations, search, AI, blockchain, browser, CAD
- Base Tool: Common tool interface and security validation
- Tool Metadata: Risk assessment, permissions, and capabilities

**Agent Layer** (`src/cli/automation/agents/`)
- Universal Agent: All-in-one enterprise agent (50+ capabilities)
- Specialized Agents: Frontend, Backend, DevOps, Code Review, etc.
- Cognitive Agent Base: Intelligent task understanding
- Autonomous Orchestrator: Multi-agent coordination
- VM Agents: Container-based isolated execution

**Planning Layer** (`src/cli/planning/`)
- Autonomous Planner: AI-powered task breakdown
- Plan Executor: Step-by-step execution with rollback
- Risk Assessment: Automatic risk evaluation
- Tool Capability Discovery: Dynamic tool matching

**Virtualized Agents** (`src/cli/virtualized-agents/`)
- VM Orchestrator: Container lifecycle management
- Container Manager: Docker container operations
- VS Code Server Integration: Remote development environments
- WebSocket Communication: Real-time agent communication

### Entry Points

- **`src/cli/index.ts`** - Main system orchestrator and startup (2057 lines)
- **`src/cli/nik-cli.ts`** - Primary CLI interface (21,099 lines)
- **`src/cli/main-orchestrator.ts`** - AI development orchestrator (696 lines)
- **`src/cli/register-agents.ts`** - Agent system initialization (272 lines)

## 🛠️ Available Tools (35+)

### File Operations
- **read-file-tool**: Read files with security validation
- **write-file-tool**: Write files with backup and validation (837 lines)
- **edit-tool**: Interactive edits with diff preview and backup (441 lines)
- **replace-in-file-tool**: Replace content with validation (523 lines)
- **multi-edit-tool**: Atomic multi-file edits with diff summaries
- **multi-read-tool**: Batch file reading with search/context (289 lines)

### Search & Discovery
- **grep-tool**: Text pattern search across files with context (403 lines)
- **find-files-tool**: Find files matching glob patterns
- **glob-tool**: Fast glob pattern matching with sorting and filtering (238 lines)
- **list-tool**: List files/directories with intelligent ignore patterns (351 lines)

### System & Execution
- **bash-tool**: Execute shell commands with analysis and streaming (414 lines)
- **run-command-tool**: Execute commands with whitelist security (580 lines)
- **git-tools**: Safe Git operations (status, diff, commit) (292 lines)

### AI & Vision
- **vision-analysis-tool**: Analyze images with AI vision models (Claude, GPT-4V, Gemini) (220 lines)
- **image-generation-tool**: Generate images from text prompts (DALL-E 3, GPT-Image-1) (343 lines)

### Blockchain & Web3
- **coinbase-agentkit-tool**: Execute blockchain operations using Coinbase AgentKit (594 lines)
- **goat-tool**: Execute blockchain operations using GOAT SDK (Polymarket, ERC20) (739 lines)

### Browser Automation
- **browserbase-tool**: Web browsing automation and AI-powered content analysis (539 lines)
- **browser_navigate**: Navigate to URLs and wait for page load
- **browser_click**: Click elements using CSS selector or text
- **browser_type**: Type text into input fields
- **browser_screenshot**: Take screenshots of pages
- **browser_extract_text**: Extract text content from pages
- **browser_wait_for_element**: Wait for elements to appear
- **browser_scroll**: Scroll pages or elements
- **browser_execute_script**: Execute JavaScript in browser context
- **browser_get_page_info**: Get page information (title, URL, state)

### CAD & Manufacturing
- **text-to-cad-tool**: Convert text descriptions into CAD elements and models (953 lines)
- **text-to-gcode-tool**: Convert text to G-code for CNC machining and 3D printing (370 lines)

### Utilities
- **diff-tool**: Compare files with multiple diff algorithms (line, word, char) (338 lines)
- **tree-tool**: Visualize directory structure as a tree with statistics (368 lines)
- **watch-tool**: Monitor file system changes in real-time (259 lines)
- **json-patch-tool**: Apply RFC6902-like JSON patches with diff/backup (316 lines)

### Design Integration
- **figma-tool**: Comprehensive Figma integration (REST API, v0 codegen, desktop automation) (1,301 lines)

### Documentation & Context
- **smart-docs-tool**: Intelligent documentation management (391 lines)
- **docs-request-tool**: Documentation request handling (398 lines)
- **snapshot-tool**: Project snapshot management (445 lines)

All tools include:
- Security validation and path sanitization
- Risk assessment and permission checks
- Backup and rollback capabilities
- Comprehensive error handling
- Metadata and capability discovery

## 📋 Available Commands (100+)

### System Commands
- `/help` - Show comprehensive help message
- `/quit`, `/exit` - Exit the chat
- `/clear` - Clear current chat session
- `/new [title]` - Start a new chat session
- `/default` - Switch to default chat mode
- `/config` - Show current configuration
- `/debug` - Debug API key configuration
- `/stats` - Show usage statistics
- `/dashboard` - Show real-time dashboard with metrics
- `/system <prompt>` - Set system prompt for current session

### Authentication & API Keys
- `/auth [login|signup|logout|status]` - Authentication management
- `/pro [status|activate|help]` - Manage Pro plan and NikCLI key
- `/set-key <model> <key>` - Set API key for a model
- `/set-key coinbase` - Interactive wizard for Coinbase keys
- `/set-key browserbase` - Interactive wizard for Browserbase keys
- `/set-key figma` - Configure Figma and v0 API credentials
- `/set-key redis` - Configure Redis/Upstash cache credentials
- `/set-vector-key` - Configure Upstash Vector database credentials

### Model Management
- `/model <name>` - Switch to a model
- `/models` - List available models
- `/router [status|on|off|verbose|mode <m>]` - Adaptive model router controls
- `/temp <0.0-2.0>` - Set temperature (creativity)

### File Operations
- `/read <file>` - Read file contents
- `/write <file> <content>` - Write content to file
- `/edit <file>` - Edit file interactively
- `/ls [directory]` - List files in directory
- `/search <query> [directory]` - Search in files (grep-like)
- `/grep <pattern>` - Search text patterns across files

### Agent Management
- `/agents` - List all available agents
- `/agent <name> <task>` - Run specific agent with task
- `/auto <description>` - Autonomous multi-agent execution
- `/parallel <agents> <task>` - Run multiple agents in parallel
- `/factory` - Show agent factory dashboard
- `/create-agent <name> <specialization>` - Create new specialized agent
- `/launch-agent <id|name> [task]` - Launch agent from blueprint
- `/context <paths>` - Select workspace context paths
- `/index <path>` - Index files in path for better context
- `/stream` - Show live agent stream dashboard

### Planning & Task Management
- `/plan` - Generate autonomous execution plan
- `/todo` - Manage task todos
- `/todos` - List all todos
- `/plan-clean` - Clean up completed plans
- `/todo-hide` - Hide completed todos
- `/todo-show` - Show hidden todos

### VM Container Management (20+ commands)
- `/vm` - Show VM management help
- `/vm-create <repo-url|os>` - Create VM container (supports alpine|debian|ubuntu)
- `/vm-list` - List active containers
- `/vm-stop <id>` - Stop container
- `/vm-remove <id>` - Remove container
- `/vm-connect <id>` - Connect to container
- `/vm-create-pr <id> "<title>" "<desc>"` - Create PR from container
- `/vm-mode` - Enter VM chat mode
- `/vm-switch` - Switch to different VM
- `/vm-dashboard` - Show VM dashboard with status
- `/vm-select [id]` - Select VM for targeted chat
- `/vm-status [id]` - Show detailed VM system status
- `/vm-exec <command>` - Execute command in selected VM
- `/vm-ls [directory]` - List files in VM directory
- `/vm-broadcast <message>` - Send message to all active VMs
- `/vm-health` - Run health check on all VMs
- `/vm-backup [id]` - Backup VM session state
- `/vm-stats` - Show VM session statistics
- `/vm-logs <id>` - View VM container logs

### Background Agents
- `/bg-agent <task>` - Create background job with VM execution + auto PR
- `/bg-jobs [status]` - List all background jobs
- `/bg-status <jobId>` - Get detailed status of specific job
- `/bg-logs <jobId> [limit]` - View job execution logs

### Memory & Personalization
- `/remember "fact"` - Store information in long-term memory
- `/recall "query"` - Search memories for relevant information
- `/memory [stats|config|session|personalization|cleanup]` - Memory management
- `/forget <memory-id>` - Delete a specific memory
- `/forget-session` - Forget all session memories
- `/forget-old <days>` - Forget memories older than N days
- `/forget-tag <tag>` - Forget memories by tag

### Snapshot Management
- `/snapshot <name> [type]` - Create project snapshot (quick/full/dev/config)
- `/snap <name>` - Alias for quick snapshot
- `/restore <snapshot-id>` - Restore files from snapshot
- `/snapshots [query]` - List available snapshots

### Session Management
- `/sessions` - List all chat sessions
- `/resume [session-id]` - Resume previous work session
- `/work-sessions` - List all saved work sessions
- `/save-session [name]` - Save current work session
- `/delete-session <id>` - Delete a work session
- `/export-session <id> <path>` - Export work session to file
- `/export [sessionId]` - Export session to markdown

### Edit History (Undo/Redo)
- `/undo [count]` - Undo last N file edits (default: 1)
- `/redo [count]` - Redo last N undone edits (default: 1)
- `/edit-history` - Show edit history and statistics

### Vision & Image Analysis
- `/analyze-image <path>` - Analyze image with AI vision models
- `/vision <path>` - Alias for analyze-image
- `/images` - Discover images and pick one to analyze
- `/analyze-image --provider <claude|openai|google|openrouter>` - Choose provider
- `/analyze-image --prompt "custom prompt"` - Custom analysis prompt

### Image Generation
- `/generate-image "prompt"` - Generate image with AI models
- `/create-image "prompt"` - Alias for generate-image
- `/generate-image --model <dall-e-3|dall-e-2|gpt-image-1>` - Choose model
- `/generate-image --size <1024x1024|1792x1024|1024x1792>` - Set size

### Blockchain & Web3
- `/web3 status` - Show Coinbase AgentKit status
- `/web3 init` - Initialize AgentKit (CDP keys required)
- `/web3 wallet` - Show wallet address and network
- `/web3 balance` - Check wallet balance
- `/web3 transfer <amount> <to> [--token ETH|USDC|WETH]` - Transfer tokens
- `/web3 chat "message"` - Natural language blockchain request
- `/web3 wallets` - List known wallets
- `/web3 use-wallet <0x...>` - Use specific wallet by address
- `/goat` - GOAT SDK operations (Polymarket, ERC20)
- `/polymarket` - Polymarket-specific operations
- `/web3-toolchain` - Web3 toolchain management
- `/defi-toolchain` - DeFi toolchain management

### Browser Mode (Interactive)
- `/browser [url]` - Start interactive browser mode
- `/browser-status` - Show current browser session status
- `/browser-screenshot` - Take screenshot of current page
- `/browser-exit` - Exit browser mode and cleanup
- `/browser-info` - Show browser capabilities and diagnostics

### Web Browsing (BrowseGPT)
- `/browse-session [id]` - Create new browsing session
- `/browse-search <sessionId> <query>` - Search the web
- `/browse-visit <sessionId> <url> [prompt]` - Visit page and extract content
- `/browse-chat <sessionId> <message>` - Chat with AI about web content
- `/browse-sessions` - List all active browsing sessions
- `/browse-info <sessionId>` - Get session information
- `/browse-close <sessionId>` - Close browsing session
- `/browse-cleanup` - Clean up inactive sessions
- `/browse-quick <query> [prompt]` - Quick search, visit, and analyze

### Figma Design Integration
- `/figma-config` - Show Figma API configuration status
- `/figma-info <file-id>` - Get file information from Figma
- `/figma-export <file-id> [format] [output-path]` - Export designs (png/svg/pdf)
- `/figma-to-code <file-id> [framework] [library]` - Generate code from designs
- `/figma-open <file-url>` - Open Figma file in desktop app (macOS)
- `/figma-tokens <file-id> [format]` - Extract design tokens (json/css/scss)
- `/figma-create <component-path> [name]` - Create Figma design from React component

### Terminal Commands
- `/run <command>` - Execute any terminal command
- `/install <packages>` - Install npm/yarn packages
- `/npm <args>` - Run npm commands
- `/yarn <args>` - Run yarn commands
- `/git <args>` - Run git commands
- `/docker <args>` - Run docker commands
- `/ps` - List running processes
- `/kill <pid>` - Kill process by PID

### Project Commands
- `/build` - Build the project
- `/test [pattern]` - Run tests
- `/lint` - Run linting
- `/create <type> <name>` - Create new project

### Blueprint Management
- `/blueprints` - List and manage all blueprints
- `/blueprint <id|name>` - Show detailed blueprint information
- `/delete-blueprint <id|name>` - Delete a blueprint
- `/export-blueprint <id|name> <file>` - Export blueprint to file
- `/import-blueprint <file>` - Import blueprint from file
- `/search-blueprints <query>` - Search blueprints by capabilities

### Security & Configuration
- `/security [status|set|help]` - Manage security settings
- `/dev-mode [enable|status|help]` - Developer mode controls
- `/safe-mode` - Enable safe mode (maximum security)
- `/clear-approvals` - Clear session approvals
- `/approval [on|off|status]` - Manage approval system
- `/compact [on|off]` - Toggle compact output mode
- `/super-compact [on|off]` - Toggle super compact mode
- `/history <on|off>` - Enable/disable chat history

### Performance & Caching
- `/tokens` - Show token usage and optimization
- `/cache [stats|clear|settings]` - Manage token cache system
- `/redis-enable` - Enable Redis caching
- `/redis-disable` - Disable Redis caching
- `/redis-status` - Show Redis cache status

### Diagnostic & Monitoring
- `/diagnostic [status|start|stop|scan]` - IDE diagnostic integration
- `/monitor` - Start diagnostic monitoring
- `/diag-status` - Show diagnostic status

### Environment Management
- `/env <path>` - Import .env file and persist variables

## 🤖 Agent System

### Universal Agent

The Universal Agent is an all-in-one enterprise agent with **50+ capabilities**:

**Core Capabilities:**
- Code generation, analysis, review, optimization
- Debugging, refactoring, testing
- Performance and security analysis
- Architecture review and documentation generation

**Frontend Capabilities:**
- React, Next.js, TypeScript, JavaScript
- HTML, CSS, JSX, TSX
- Components, hooks, frontend development

**Backend Capabilities:**
- Node.js, API development, database
- Server architecture, REST API, GraphQL
- Microservices development

**DevOps Capabilities:**
- CI/CD, Docker, Kubernetes
- Deployment, infrastructure, monitoring
- Security practices

**Autonomous Capabilities:**
- File operations, project creation
- Autonomous coding, system administration
- Full-stack development

### Specialized Agents

- **Cognitive Agent Base**: Intelligent code generation with cognitive understanding
- **Frontend Agent**: React, Next.js, UI/UX specialization
- **Backend Agent**: API, database, server architecture
- **DevOps Agent**: CI/CD, deployment, infrastructure
- **Code Review Agent**: Quality assessment and security analysis
- **Coding Agent**: General purpose coding assistance
- **React Agent**: React-specific development
- **Optimization Agent**: Performance optimization
- **Autonomous Coder**: Fully autonomous development
- **System Admin Agent**: System administration tasks

### VM Agents

- **Secure VM Agent**: Isolated container-based development
- Container orchestration and management
- Repository cloning and management
- VS Code Server integration
- Pull request automation

## 📋 Autonomous Planning System

NikCLI includes a sophisticated planning system that:

- **Risk Assessment**: Automatically evaluates risk levels (low/medium/high)
- **Execution Planning**: Generates step-by-step execution plans
- **Tool Discovery**: Dynamically discovers available tool capabilities
- **Dependency Management**: Handles task dependencies automatically
- **Rollback Support**: Automatic rollback on errors
- **Progress Tracking**: Real-time progress monitoring

**Planning Components:**
- `autonomous-planner.ts` - AI-powered task breakdown (786 lines)
- `plan-executor.ts` - Step-by-step execution (932 lines)
- `planning-manager.ts` - Plan lifecycle management (576 lines)
- `enhanced-planning.ts` - Advanced planning features (1,450 lines)

## 🐳 Virtualized Agents System

NikCLI provides isolated development environments through containerized VMs:

**Features:**
- **Container Isolation**: Secure, isolated Docker containers
- **VS Code Server**: Remote development environment access
- **Repository Management**: Automatic cloning and setup
- **Resource Monitoring**: CPU, memory, and disk tracking
- **WebSocket Communication**: Real-time agent communication
- **Session Management**: Persistent session state
- **Health Monitoring**: Automatic health checks

**VM Components:**
- `vm-orchestrator.ts` - Container lifecycle management (990 lines)
- `container-manager.ts` - Docker operations (471 lines)
- `secure-vm-agent.ts` - Secure VM agent implementation (1,061 lines)
- `vm-session-manager.ts` - Session state management (452 lines)
- `vm-websocket-server.ts` - Real-time communication (411 lines)

## 🔧 Configuration System

### Config Manager Features

- **Multi-Provider API Keys**: Support for multiple AI providers
- **Encrypted Storage**: AES-256-GCM encryption for sensitive data
- **Environment Variables**: Import and persist .env files
- **Model Configuration**: Per-model settings and limits
- **Output Style Configuration**: Customizable output formats
- **Redis/Supabase Integration**: Cloud storage and caching
- **Feature Flags**: Runtime feature toggling

**Configuration File**: `~/.nikcli/config.json`

**Supported Providers:**
- OpenRouter (primary)
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- Ollama (local)
- Custom providers

## 🆕 **Vim Mode Integration (v0.2.3+)**

NikCLI includes seamless Vim integration for developers who prefer modal editing:

- **Auto-Configured Vim**: Generates .vimrc with vim-plug, popular plugins (NERDTree, ALE linter, Gruvbox theme), and custom mappings
- **Commands**: `/vim setup`, `/vim open <file>`, `/vim diff <file1> <file2>`, `/vim quick-edit`
- **AI-Enhanced Editing**: Use agents inside Vim sessions for real-time suggestions
- **Session Management**: Auto-saves sessions to `~/.vim/sessions`, tracks active edits

## 🆕 **Advanced CLI UI Enhancements**

NikCLI features an advanced, interactive CLI interface:

- **VM Status Indicator**: Real-time monitoring of virtual machine states
- **Completion Display**: Intelligent auto-completion with contextual previews
- **VM Keyboard Controls**: Seamless keyboard shortcuts for VM operations
- **Advanced CLI UI**: Modern terminal UI with dynamic layouts and progress bars
- **Approval System**: Enhanced interactive approvals with diff previews
- **Diff Viewer & Manager**: Built-in side-by-side diff comparison
- **ACP Integration**: Access Control Panel services with Zed editor hooks

## 🎯 Quick Examples

```bash
# Start interactive session
nikcli

# Create React component with Universal Agent
/agent universal-agent "create a login form with validation"

# Run autonomous mode
/auto "optimize this codebase for performance"

# Generate execution plan
/plan "add user authentication system"

# Create and manage VM container
/vm-create https://github.com/user/repo.git --os ubuntu
/vm-connect <container-id>
/vm-status

# Analyze image with AI vision
/analyze-image screenshot.png --provider claude

# Generate image from text
/generate-image "a futuristic cityscape at sunset" --model dall-e-3

# Web3 operations
/web3 init
/web3 balance
/web3 transfer 0.1 0x123... --token ETH

# Browser automation
/browser https://example.com
/browser-screenshot

# Figma integration
/figma-info <file-id>
/figma-to-code <file-id> --framework react

# Memory management
/remember "User prefers TypeScript over JavaScript"
/recall "TypeScript preferences"

# Create snapshot
/snapshot before-refactor
/restore <snapshot-id>

# Background agent job
/bg-agent "implement feature X and create PR"

# Setup and use Vim integration
/vim setup
/vim open src/main.ts

# Help and commands
/help
```

## 🛡️ Security & Privacy

- **Local First**: Works entirely on your machine
- **Encrypted API Keys**: Secure storage with AES-256-GCM encryption
- **Approval System**: Interactive confirmation for sensitive operations
- **Path Sanitization**: Prevents directory traversal attacks
- **Command Allow-Listing**: Whitelist-based command execution
- **Execution Tracking**: Audit logs for all operations
- **No Data Collection**: Your code and projects stay private
- **Universal Compatibility**: Secure installation across all package managers

<details>
<summary>🔐 <strong>Installation Security</strong></summary>

Our universal installers include security features:

- **Automatic verification** of Node.js version requirements
- **Package manager detection** and validation
- **Fallback mechanisms** if primary installation fails
- **No elevated privileges** required for global installation
- **Source verification** from official npm registry

**Installer Files:**

- [`installer/install.sh`](installer/install.sh) - Unix/macOS universal installer
- [`installer/install.ps1`](installer/install.ps1) - Windows PowerShell installer

</details>

## 🤝 Community

- **GitHub Issues**: [Bug reports and feature requests](https://github.com/nikomatt69/nikcli-main/issues)
- **Documentation**: [Complete guides and API reference](https://nikcli.mintlify.app)
- **Contributing**: [Development guidelines](https://nikcli.mintlify.app/contributing/development)

<details>
<summary>🔧 <strong>Project Configuration</strong></summary>

**Package Manager Support:**

- Development optimized with `pnpm` for faster builds and reduced disk usage
- Universal installation support for all major package managers
- Cross-platform compatibility with intelligent fallbacks

**Key Files:**

- [`package.json`](package.json) - Main package configuration with universal engine support
- [`pnpm-workspace.yaml`](pnpm-workspace.yaml) - pnpm workspace configuration
- [`.npmrc`](.npmrc) - npm/pnpm configuration for optimal development experience

</details>

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Visit [nikcli.mintlify.app](https://nikcli.mintlify.app) for complete documentation, tutorials, and examples.**

## Environment Variables (UI / Streaming)

- `NIKCLI_COMPACT=1` enables compact output (fewer banners/panels).
- `NIKCLI_CLEAN_CHAT=1` hides ephemeral toolchain logs (Recent Updates) and suppresses auxiliary router debug logs so only assistant/user stream remains.

## Embedding Optimization Variables

For optimal performance with OpenAI text-embedding-3-small:

- `EMBED_BATCH_SIZE` (default: 300) - Batch size for embedding generation
- `EMBED_MAX_CONCURRENCY` (default: 6) - Maximum concurrent embedding batches
- `EMBED_INTER_BATCH_DELAY_MS` (default: 25) - Delay between batch groups (ms)
- `INDEXING_BATCH_SIZE` (default: 300) - Batch size for vector store indexing
- `EMBED_ADAPTIVE_BATCHING` (default: true) - Enable adaptive batch sizing based on content
- `NIKCLI_MINIMAL_STREAM=1` alias for clean chat; same behavior as `NIKCLI_CLEAN_CHAT=1`.
- `NIKCLI_LIVE_UPDATES_EPHEMERAL=1` clears live updates automatically when the system becomes idle or interactive mode stops.
