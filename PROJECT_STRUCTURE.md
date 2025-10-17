# NikCLI Project Structure & Architecture

**Project**: @nicomatt69/nikcli v0.3.0  
**Type**: Context-Aware AI Development Assistant CLI  
**Framework**: Express.js + TypeScript  
**Runtime**: Node.js 22+, Bun 1.3+  
**Package Manager**: Supports npm, yarn, pnpm, bun

---

## 📁 Directory Structure Overview

```
nikcli-main/
├── bin/                                 # CLI Entry Points
│   └── cli.ts                          # Main CLI binary (delegates to src/cli/index.ts)
│
├── src/                                 # [Primary Source Code - Not Shown in Explore]
│   ├── cli/                            # CLI Application Core
│   │   ├── index.ts                    # Main CLI entry point
│   │   ├── nikctl.ts                   # Control daemon commands
│   │   └── nikd.ts                     # Daemon service
│   ├── agents/                         # AI Agent System
│   ├── services/                       # Core Services
│   ├── tools/                          # Tool Registry & Management
│   ├── providers/                      # AI Provider Integration
│   └── utils/                          # Utilities
│
├── streamtty/                          # Streaming Terminal UI Framework
│   ├── src/
│   │   ├── stream-protocol.ts          # Stream protocol implementation
│   │   ├── ai-sdk-adapter.ts           # AI SDK integration adapter
│   │   ├── cli.ts                      # CLI interface
│   │   ├── performance.ts              # Performance monitoring
│   │   ├── errors.ts                   # Error handling
│   │   ├── events.ts                   # Event system
│   │   ├── streamdown-compat.ts        # Markdown compatibility
│   │   ├── index.ts                    # Main export
│   │   ├── renderers/                  # Terminal rendering (5 files)
│   │   ├── types/                      # Type definitions (3 files)
│   │   ├── security/                   # Security utilities (3 files)
│   │   ├── plugins/                    # Plugin system (3 files)
│   │   ├── utils/                      # Utilities (5 files)
│   │   ├── controls/                   # UI controls (4 files)
│   │   ├── themes/                     # Terminal themes (1 file)
│   │   ├── parser/                     # Protocol parser (1 file)
│   │   └── widgets/                    # UI widgets
│   ├── examples/                       # Usage examples (3 files)
│   ├── test/                           # Test files
│   ├── dist/                           # Compiled output (16 files)
│   ├── vitest.config.ts               # Test configuration
│   └── package.json                    # Workspace package
│
├── context-interceptor-sdk/            # Context Interception & RAG System
│   ├── src/
│   │   ├── types.ts                    # Type definitions
│   │   ├── index.ts                    # Main export
│   │   ├── config.ts                   # Configuration
│   │   ├── quick-setup.ts              # Quick setup utilities
│   │   ├── interceptors/               # Context interceptors (4 files)
│   │   ├── providers/                  # Provider implementations (2 files)
│   │   ├── embedding/                  # Embedding system (4 files)
│   │   ├── storage/                    # Vector storage (2 files)
│   │   ├── query/                      # Query engine (2 files)
│   │   ├── indexer/                    # Indexing system (3 files)
│   │   └── utils/                      # Utilities (2 files)
│   ├── examples/                       # Usage examples (9 files)
│   ├── tests/                          # Test suite
│   ├── vitest.config.ts               # Test configuration
│   └── package.json                    # Workspace package
│
├── tests/                              # Test Suite
│   ├── unit/                           # Unit tests (7 files)
│   ├── integration/                    # Integration tests (2 files)
│   ├── e2e/                            # End-to-end tests (1 file)
│   ├── functional/                     # Functional tests (1 file)
│   ├── helpers/                        # Test helpers (1 file)
│   ├── setup.ts                        # Test setup
│   ├── manual-test.js                  # Manual testing
│   ├── verify-system.js                # System verification
│   └── verify-coherence.js             # Coherence verification
│
├── scripts/                            # Build & Utility Scripts
│   ├── setup-database.ts               # Database initialization
│   ├── build-release.js                # Release build script
│   ├── build-esbuild.js                # ESBuild configuration
│   ├── export-dist.js                  # Distribution export
│   └── releases/                       # Release artifacts
│
├── database/                           # Database Storage (2 files)
│   └── [SQLite/Vector DB files]
│
├── docs/                               # Documentation (7 files)
│   └── [Markdown documentation]
│
├── nikcli-academic-docs/               # Academic Documentation (7 files)
│   └── [Research & specification docs]
│
├── examples/                           # Example Projects (6 files)
│   └── [Usage examples]
│
├── web/                                # Web Dashboard (7 files)
│   ├── src/
│   ├── public/
│   └── [React/Next.js frontend]
│
├── api/                                # API Layer (1 file)
│   └── [Vercel serverless functions]
│
├── public/                             # Static Assets
│   └── bin/                            # Binary distributions
│
├── generated_images/                   # Generated outputs
│
├── dist/                               # Compiled distribution (1 file)
│   └── cli/                            # CLI distribution
│
├── node_modules/                       # Dependencies
│
├── Configuration Files
│   ├── package.json                    # Main package config (165 lines)
│   ├── tsconfig.json                   # TypeScript base config
│   ├── tsconfig.base.json              # Base TypeScript config
│   ├── tsconfig.cli.json               # CLI TypeScript config
│   ├── tsconfig.vercel.json            # Vercel TypeScript config
│   ├── biome.json                      # Biome linter/formatter config
│   ├── bunfig.toml                     # Bun configuration
│   ├── vercel.json                     # Vercel deployment config
│   ├── docker-compose.yml              # Docker Compose config
│   ├── Dockerfile                      # Docker image definition
│   ├── pkg-config.json                 # PKG binary config
│   └── .npmrc                          # NPM/PNPM config
│
├── Documentation Files
│   ├── README.md                       # Main documentation (243 lines)
│   ├── README_EN.md                    # English variant
│   ├── README_IT.md                    # Italian variant
│   ├── NIKOCLI.md                      # NikCLI specification
│   ├── SECURITY.md                     # Security guidelines
│   ├── todo.md                         # Development TODO
│   └── LICENSE                         # MIT License
│
├── Credentials & Keys
│   └── nikcli.2025-09-25.private-key.pem  # Private key (SECURITY)
│
└── System Files
    ├── system_prompt_enhancement.ts    # System prompt enhancement
    └── [Various config files]
```

---

## 🏗️ Core Architecture

### 1. **CLI Application Layer** (`bin/`, `src/cli/`)

**Entry Point**: `bin/cli.ts`

- Minimal binary that delegates to unified entrypoint
- Handles process startup and error management
- Uses chalk for colored output

**Main CLI**: `src/cli/index.ts` (Not directly visible but referenced)

- Core CLI application logic
- Command routing and processing
- Interactive session management

**Daemon Services**:

- `nikctl.ts` - Control daemon for background operations
- `nikd.ts` - Daemon service for long-running processes

---

### 2. **StreamTTY Framework** (`streamtty/`)

**Purpose**: Advanced streaming terminal UI framework for real-time AI responses

**Key Components**:

| Component           | Files                  | Purpose                              |
| ------------------- | ---------------------- | ------------------------------------ |
| **Stream Protocol** | `stream-protocol.ts`   | Protocol for streaming data over TTY |
| **AI SDK Adapter**  | `ai-sdk-adapter.ts`    | Integration with Vercel AI SDK       |
| **Renderers**       | `renderers/` (5 files) | Terminal rendering engines           |
| **Controls**        | `controls/` (4 files)  | Interactive UI controls              |
| **Types**           | `types/` (3 files)     | TypeScript type definitions          |
| **Security**        | `security/` (3 files)  | Security utilities and sanitization  |
| **Plugins**         | `plugins/` (3 files)   | Plugin system for extensions         |
| **Utils**           | `utils/` (5 files)     | Helper utilities                     |
| **Themes**          | `themes/` (1 file)     | Terminal color themes                |
| **Parser**          | `parser/` (1 file)     | Protocol parser                      |

**Capabilities**:

- Real-time streaming of AI responses
- Rich terminal UI rendering
- Performance monitoring and optimization
- Event-driven architecture
- Markdown to terminal rendering
- Error handling and recovery

---

### 3. **Context Interceptor SDK** (`context-interceptor-sdk/`)

**Purpose**: Context-aware RAG (Retrieval-Augmented Generation) system for intelligent code understanding

**Key Modules**:

| Module           | Files                     | Purpose                            |
| ---------------- | ------------------------- | ---------------------------------- |
| **Interceptors** | `interceptors/` (4 files) | Context interception mechanisms    |
| **Embedding**    | `embedding/` (4 files)    | Semantic embedding generation      |
| **Storage**      | `storage/` (2 files)      | Vector database storage            |
| **Indexer**      | `indexer/` (3 files)      | Code indexing system               |
| **Query**        | `query/` (2 files)        | Semantic query engine              |
| **Providers**    | `providers/` (2 files)    | Embedding provider implementations |
| **Utils**        | `utils/` (2 files)        | Utility functions                  |
| **Config**       | `config.ts`               | Configuration management           |

**Capabilities**:

- Workspace context analysis
- Code semantic understanding
- Vector-based similarity search
- Intelligent code indexing
- Quick setup utilities

---

### 4. **Testing Framework** (`tests/`)

**Test Categories**:

| Category        | Files                    | Purpose                       |
| --------------- | ------------------------ | ----------------------------- |
| **Unit Tests**  | `unit/` (7 files)        | Individual component testing  |
| **Integration** | `integration/` (2 files) | Multi-component testing       |
| **E2E Tests**   | `e2e/` (1 file)          | End-to-end workflows          |
| **Functional**  | `functional/` (1 file)   | Feature functionality testing |
| **Helpers**     | `helpers/` (1 file)      | Test utilities                |

**Test Infrastructure**:

- Vitest as test runner
- Manual testing utilities
- System verification scripts
- Coherence verification

---

### 5. **Build & Deployment** (`scripts/`, configuration files)

**Build Scripts**:

- `build-release.js` - Release build pipeline
- `build-esbuild.js` - ESBuild configuration
- `export-dist.js` - Distribution export

**Build Targets**:

- Node.js CommonJS (`dist/cli/`)
- Bun standalone binary (`public/bin/nikcli`)
- PKG binaries (macOS, Linux, Windows)

**Deployment Configurations**:

- Docker & Docker Compose for containerization
- Vercel configuration for serverless deployment
- TypeScript configurations for different targets

---

## 📦 Dependencies Overview

### **Production Dependencies** (74 packages)

**AI/ML Providers**:

- `@ai-sdk/*` - Vercel AI SDK providers (OpenAI, Anthropic, Google, Ollama)
- `@openrouter/ai-sdk-provider` - OpenRouter integration
- `task-master-ai` - TaskMaster AI planning engine
- `@coinbase/agentkit` - Blockchain agent capabilities

**CLI & UI**:

- `commander` - CLI argument parsing
- `blessed` - Terminal UI library
- `chalk` - Colored terminal output
- `gradient-string` - Gradient text
- `inquirer` - Interactive prompts
- `ora` - Loading spinners
- `boxen` - Boxes for terminal

**Data Processing**:

- `marked` - Markdown parsing
- `shiki` - Syntax highlighting
- `highlight.js` - Code highlighting
- `katex` - Math rendering
- `@mozilla/readability` - Article extraction

**Storage & Database**:

- `@supabase/supabase-js` - Supabase client
- `@upstash/redis` - Redis client
- `@vercel/kv` - Vercel KV storage
- `ioredis` - Redis driver
- `chromadb` - Vector database

**API & Networking**:

- `express` - Web framework
- `axios` - HTTP client
- `ws` - WebSocket support
- `cors` - CORS middleware
- `helmet` - Security headers

**Utilities**:

- `dotenv` - Environment variables
- `js-yaml` - YAML parsing
- `zod` - Schema validation
- `zustand` - State management
- `viem` - Ethereum utilities
- `uuid` - UUID generation

### **Development Dependencies** (15 packages)

- `@biomejs/biome` - Linter & formatter
- `typescript` - TypeScript compiler
- `vitest` - Test framework
- `@types/*` - Type definitions
- `esbuild` - Build tool
- `pkg` - Binary packaging
- `ts-node` - TypeScript execution

---

## 🔄 Data Flow Architecture

```
User Input (CLI)
    ↓
Command Parser (commander.js)
    ↓
Agent Dispatcher
    ├→ Universal Agent
    ├→ React Agent
    ├→ Backend Agent
    ├→ DevOps Agent
    ├→ Code Review Agent
    └→ Optimization Agent
    ↓
Context Interceptor SDK
    ├→ Workspace Analysis
    ├→ Semantic Indexing
    ├→ Vector Search
    └→ Context Retrieval
    ↓
AI Provider Layer
    ├→ OpenAI
    ├→ Anthropic Claude
    ├→ Google Gemini
    ├→ Ollama (Local)
    └→ OpenRouter
    ↓
StreamTTY Framework
    ├→ Stream Protocol
    ├→ Terminal Rendering
    ├→ Event Management
    └→ Performance Monitoring
    ↓
Output Display
    ├→ Rich Terminal UI
    ├→ Code Highlighting
    ├→ Markdown Rendering
    └→ Real-time Updates
```

---

## 🔐 Security Architecture

**Key Security Features**:

1. **Encrypted API Keys** - AES-256-GCM encryption
2. **Approval System** - Interactive confirmation for sensitive operations
3. **Local-First** - Works entirely on user's machine
4. **Input Validation** - Comprehensive validation of all inputs
5. **Output Sanitization** - Safe rendering of untrusted content
6. **No Data Collection** - Privacy-first design

**Security Files**:

- `SECURITY.md` - Security guidelines
- `security/` subdirectories in streamtty and context-interceptor-sdk

---

## 🚀 Build & Release Pipeline

**Build Targets**:

```
Source (TypeScript)
    ↓
ESBuild Compilation
    ├→ CommonJS (Node.js)
    ├→ Bun Standalone
    ├→ PKG Binaries
    │   ├→ macOS ARM64
    │   ├→ macOS x64
    │   ├→ Linux x64
    │   └→ Windows x64
    └→ Distribution Output
    ↓
npm Registry
```

**Release Commands**:

- `pnpm run build` - Development build
- `pnpm run build:binary` - PKG binaries
- `pnpm run build:bun:all` - All Bun targets
- `pnpm run build:release` - Full release pipeline

---

## 📊 Key Metrics

| Metric                       | Value                |
| ---------------------------- | -------------------- |
| **Total Files**              | 20+ root files       |
| **Directories**              | 15 major directories |
| **Production Dependencies**  | 74 packages          |
| **Development Dependencies** | 15 packages          |
| **Total Dependencies**       | 89 packages          |
| **TypeScript Files**         | 50+ .ts files        |
| **Test Files**               | 13+ test files       |
| **Node.js Requirement**      | ≥22.0.0              |
| **TypeScript Version**       | 5.9.2                |

---

## 🎯 Key Modules Summary

### **Tier 1: Core Systems**

- `bin/cli.ts` - Entry point
- `streamtty/` - Terminal UI framework
- `context-interceptor-sdk/` - RAG/Context system

### **Tier 2: Agent System**

- Universal Agent with 64+ capabilities
- Specialized agents (React, Backend, DevOps, Code Review, Optimization)

### **Tier 3: Services**

- AI provider integration
- Tool registry and management
- Planning and orchestration

### **Tier 4: Utilities**

- File operations
- Git integration
- Package management
- Build systems

---

## 📖 Documentation Resources

- **Main Documentation**: https://nikcli.mintlify.app
- **Getting Started**: https://nikcli.mintlify.app/quickstart/installation
- **CLI Reference**: https://nikcli.mintlify.app/cli-reference/commands-overview
- **Agent System**: https://nikcli.mintlify.app/agent-system/overview
- **Development Guide**: https://nikcli.mintlify.app/contributing/development

---

**Last Updated**: October 16, 2025  
**Version**: 0.3.0  
**Status**: Production Ready
