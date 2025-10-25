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
- 🟣 Polymarket CLOB (Polygon 137)
  - Env:
    - `POLYMARKET_PRIVATE_KEY` (required) EOA private key for proxy signer
    - `POLYMARKET_SIGNATURE_TYPE=1` (recommended)
    - `POLYMARKET_CHAIN_ID=137` (default)
    - `POLYMARKET_HOST=https://clob.polymarket.com` (default)
  - Quickstart:
    - `nikcli polymarket init`
    - `nikcli polymarket markets`
    - `nikcli polymarket price --token-id <id> --side buy`
    - `nikcli polymarket place-order --token-id <id> --side buy --price 0.55 --size 10 --confirm true`
    - `nikcli polymarket cancel-order --order-id <id> --confirm true`


- 📖 [Getting Started](https://nikcli.mintlify.app/quickstart/installation)
- 🎯 [CLI Commands Reference](https://nikcli.mintlify.app/cli-reference/commands-overview)
- 🤖 [Agent System](https://nikcli.mintlify.app/agent-system/overview)
- 🔨 [Configuration](https://nikcli.mintlify.app/configuration)
- 🔨 [Development Guide](https://nikcli.mintlify.app/contributing/development)
- 📝 [Vim Integration Guide](https://nikcli.mintlify.app/features/vim-mode) (New!)

## ✨ Key Features

- **🤖 AI-Powered Development**: Autonomous code generation, analysis, and optimization
- **🔧 50+ Built-in Commands**: File operations, terminal integration, project management
- **🌟 Universal Agent**: Single comprehensive agent with 64+ capabilities
- **🔒 Secure by Design**: Approval system for sensitive operations
- **📊 Multiple AI Providers**: Claude, GPT, Gemini, Ollama support
- **📦 Universal Package Manager Support**: Works with npm, yarn, pnpm, and bun
- **🚀 Production Ready**: Comprehensive testing and enterprise-grade architecture

### 🆕 **Vim Mode Integration (v0.2.3+)**

NikCLI now includes seamless Vim integration for developers who prefer modal editing within the CLI ecosystem:

- **Auto-Configured Vim**: Generates .vimrc with vim-plug, popular plugins (NERDTree, ALE linter, Gruvbox theme), and custom mappings (e.g., jj to escape, leader-w to save).
- **Commands**: `/vim setup` (install config), `/vim open <file>` (edit with session tracking), `/vim diff <file1> <file2>`, `/vim quick-edit`, `/vim config add-plugin`.
- **AI-Enhanced Editing**: Use agents inside Vim sessions, e.g., `/agent code-review` while editing for real-time suggestions.
- **Session Management**: Auto-saves sessions to `~/.vim/sessions`, tracks active edits.
- **Requirements**: System Vim installed; NikCLI spawns processes securely.

This brings terminal-grade editing power directly into your AI development workflow!

### 🆕 New CLI UI Enhancements (v+)

NikCLI now features an advanced, interactive CLI interface with rich UI components for better user experience, especially in VM management and code review workflows:

- **VM Status Indicator**: Real-time monitoring of virtual machine states directly in the CLI, with visual indicators for status, performance, and alerts.
- **Completion Display**: Intelligent auto-completion suggestions with contextual previews, making command input faster and more intuitive.
- **VM Keyboard Controls**: Seamless keyboard shortcuts for VM operations, including start/stop, snapshot management, and console access.
- **Advanced CLI UI**: Modern, terminal-friendly UI with dynamic layouts, progress bars, and interactive panels for complex tasks.
- **Approval System**: Enhanced interactive approvals for sensitive actions, with clear diff previews and one-click confirmations.
- **Diff Viewer & Manager**: Built-in side-by-side diff comparison for code changes, merges, and version control, integrated into the CLI workflow.
- **ACP Integration**: Access Control Panel (ACP) services with Zed editor hooks for secure, collaborative editing sessions.

These features make NikCLI ideal for developers working with virtual environments, code reviews, and interactive AI-driven terminals.

## 🎯 Quick Examples

```bash
# Start interactive session
nikcli

# Create React component
/agent universal-agent "create a login form with validation"

# Run autonomous mode
/auto "optimize this codebase for performance"

# Project analysis
/analyze-project

# View VM status with new UI
/vm status --watch

# Use diff viewer for changes
/diff compare --file myfile.js

# Setup and use Vim integration
/vim setup
/vim open src/main.ts

# Help and commands
/help
```

## 🛡️ Security & Privacy

- **Local First**: Works entirely on your machine
- **Encrypted API Keys**: Secure storage with AES-256-GCM
- **Approval System**: Interactive confirmation for sensitive operations
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
