# NikCLI Project Architecture Documentation

**Project**: @nicomatt69/nikcli v0.3.0  
**Type**: Node.js CLI Application  
**Description**: Context-Aware AI Development Assistant  
**License**: MIT  
**Repository**: https://github.com/nikomatt69/nikcli-main.git

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Core Modules](#core-modules)
4. [Technology Stack](#technology-stack)
5. [Build & Distribution](#build--distribution)
6. [Development Scripts](#development-scripts)
7. [Dependencies Analysis](#dependencies-analysis)
8. [Project Statistics](#project-statistics)

---

## Project Overview

**NikCLI** is a sophisticated context-aware AI development assistant built with Node.js. It provides autonomous development capabilities with support for multiple AI providers, intelligent code generation, and comprehensive development tools.

### Key Capabilities

- **Multi-AI Provider Support**: OpenAI, Anthropic, Google, Vercel AI, OpenRouter
- **CLI Interface**: Command-line tools for development automation
- **Web Dashboard**: Next.js-based web interface for visualization
- **Daemon Mode**: Background service capabilities
- **Context Interception**: SDK for workspace context awareness
- **Stream Processing**: Advanced terminal streaming and rendering
- **Database Support**: Integration with Supabase and Redis
- **Docker Support**: Containerized deployment options

### Target Environment

- **Node Version**: ≥22.0.0
- **Package Managers**: npm, yarn, pnpm, bun
- **Platforms**: macOS (arm64, x64), Linux (x64), Windows (x64)

---

## Directory Structure

```
nikcli-main/
├── 📁 src/                          # Source code (TypeScript)
│   ├── cli/                         # CLI entry points
│   │   ├── index.ts                 # Main CLI entry
│   │   ├── nikctl.ts                # Control utility
│   │   └── nikd.ts                  # Daemon service
│   └── [other modules]              # Core functionality
│
├── 📁 streamtty/                    # Terminal streaming module
│   ├── src/                         # Source files (8 files)
│   ├── dist/                        # Compiled output (16 files)
│   ├── test/                        # Test files
│   ├── examples/                    # Usage examples (3 files)
│   └── vitest.config.ts            # Test configuration
│
├── 📁 context-interceptor-sdk/      # Context interception SDK
│   ├── src/                         # Source files (4 files)
│   ├── examples/                    # Examples (9 files)
│   ├── tests/                       # Test suite
│   └── vitest.config.ts            # Test configuration
│
├── 📁 web/                          # Web dashboard
│   ├── app/                         # Next.js app directory
│   ├── tailwind.config.js          # Tailwind CSS config
│   ├── next.config.js              # Next.js config
│   └── postcss.config.js           # PostCSS config
│
├── 📁 database/                     # Database files (2 files)
├── 📁 bin/                          # Binary entry points (2 files)
├── 📁 dist/                         # Compiled distribution
├── 📁 tests/                        # Test suite (6 files)
├── 📁 docs/                         # Documentation (7 files)
├── 📁 nikcli-academic-docs/         # Academic documentation (7 files)
├── 📁 public/                       # Public assets
├── 📁 .nikcli/                      # Configuration cache (5 files)
│
├── 📄 Configuration Files
│   ├── package.json                 # Project metadata & scripts
│   ├── tsconfig.base.json          # Base TypeScript config
│   ├── tsconfig.cli.json           # CLI TypeScript config
│   ├── tsconfig.json               # Root TypeScript config
│   ├── tsconfig.vercel.json        # Vercel TypeScript config
│   ├── biome.json                  # Biome linter config
│   ├── vitest.config.ts            # Test framework config
│   ├── vercel.json                 # Vercel deployment config
│   ├── docker-compose.yml          # Docker compose config
│   ├── Dockerfile                  # Docker image definition
│   ├── bunfig.toml                 # Bun runtime config
│   └── pkg-config.json             # PKG binary config
│
├── 📄 Environment & Security
│   ├── .env                         # Environment variables
│   ├── .env.production              # Production environment
│   ├── nikcli.2025-09-25.private-key.pem  # Private key
│   ├── .gitignore                  # Git ignore rules
│   └── .editorconfig               # Editor configuration
│
└── 📄 Documentation
    ├── README.md                    # Main documentation
    ├── README_EN.md                 # English version
    ├── README_IT.md                 # Italian version
    ├── SECURITY.md                  # Security guidelines
    ├── NIKOCLI.md                   # NikCLI documentation
    ├── LICENSE                      # MIT License
    └── todo.md                      # Development tasks
```

---

## Core Modules

### 1. **CLI Module** (`src/cli/`)

**Purpose**: Command-line interface entry points  
**Files**:

- `index.ts` - Main CLI application
- `nikctl.ts` - Control utility for managing services
- `nikd.ts` - Daemon service for background operations

**Key Features**:

- Command parsing and execution
- Interactive prompts
- Service management
- Background task handling

### 2. **StreamTTY Module** (`streamtty/`)

**Purpose**: Advanced terminal streaming and rendering  
**Statistics**: 8 source files, 16 compiled files, 3 examples  
**Key Components**:

- Stream protocol implementation
- AI SDK adapter for streaming responses
- Multiple renderers (Shiki ANSI, Table, Mermaid)
- Terminal display optimization

**Test Coverage**:

- Unit tests for stream protocol
- AI SDK adapter tests
- Mock implementations for testing

### 3. **Context Interceptor SDK** (`context-interceptor-sdk/`)

**Purpose**: Workspace context interception and management  
**Statistics**: 4 source files, 9 examples  
**Key Features**:

- Context capture and analysis
- Workspace awareness
- IDE integration
- Development environment awareness

### 4. **Web Dashboard** (`web/`)

**Purpose**: Web-based user interface  
**Framework**: Next.js with Tailwind CSS  
**Structure**:

- `app/` - Next.js application pages
- `tailwind.config.js` - Styling configuration
- `next.config.js` - Next.js build configuration

**Features**:

- Real-time dashboard
- Configuration management
- Service monitoring
- Task visualization

### 5. **Database Module** (`database/`)

**Purpose**: Data persistence layer  
**Integrations**:

- Supabase (PostgreSQL)
- Redis (caching)
- Local file storage

### 6. **Tests** (`tests/`)

**Files**: 6 test files  
**Coverage**:

- `verify-coherence.js` - System coherence verification
- `verify-system.js` - System integrity tests
- Unit tests with Vitest
- Integration tests

---

## Technology Stack

### Core Runtime

- **Node.js**: ≥22.0.0
- **Bun**: ≥1.3.0 (alternative runtime)
- **TypeScript**: ^5.9.2

### AI & LLM Integration

| Provider   | Package                     | Version |
| ---------- | --------------------------- | ------- |
| OpenAI     | @ai-sdk/openai              | ^1.0.66 |
| Anthropic  | @ai-sdk/anthropic           | ^1.0.0  |
| Google     | @ai-sdk/google              | ^1.0.0  |
| Vercel AI  | @ai-sdk/vercel              | ^1.0.10 |
| OpenRouter | @openrouter/ai-sdk-provider | ^1.2.0  |
| Ollama     | ollama-ai-provider          | ^1.2.0  |

### Framework & Server

- **Express**: 5.1.0 (HTTP server)
- **Next.js**: Web framework (in web/)
- **Vercel**: Deployment platform

### Data & Storage

| Package               | Version | Purpose            |
| --------------------- | ------- | ------------------ |
| @supabase/supabase-js | ^2.55.0 | PostgreSQL backend |
| @upstash/redis        | ^1.35.3 | Serverless Redis   |
| @vercel/kv            | ^1.0.1  | Key-value storage  |
| ioredis               | ^5.7.0  | Redis client       |

### Terminal & UI

| Package         | Version | Purpose             |
| --------------- | ------- | ------------------- |
| blessed         | ^0.1.81 | Terminal UI         |
| chalk           | ^5.3.0  | Terminal colors     |
| inquirer        | ^9.2.12 | Interactive prompts |
| ora             | ^8.0.1  | Spinners            |
| cli-progress    | ^3.12.0 | Progress bars       |
| gradient-string | ^3.0.0  | Gradient text       |
| boxen           | ^7.1.1  | Boxes               |

### Code Processing

| Package         | Version  | Purpose             |
| --------------- | -------- | ------------------- |
| shiki           | ^3.13.0  | Syntax highlighting |
| marked          | ^15.0.7  | Markdown parsing    |
| marked-terminal | ^7.3.0   | Terminal markdown   |
| highlight.js    | ^11.11.1 | Code highlighting   |
| diff            | ^8.0.2   | Diff generation     |

### Utilities & Tools

| Package   | Version | Purpose               |
| --------- | ------- | --------------------- |
| commander | ^13.1.0 | CLI framework         |
| axios     | ^1.12.2 | HTTP client           |
| dotenv    | ^17.2.1 | Environment variables |
| js-yaml   | ^4.1.0  | YAML parsing          |
| zod       | ^3.22.4 | Schema validation     |
| zustand   | ^4.4.7  | State management      |

### Development Tools

| Package        | Version | Purpose            |
| -------------- | ------- | ------------------ |
| @biomejs/biome | ^2.2.4  | Linter & formatter |
| TypeScript     | ^5.9.2  | Type system        |
| Vitest         | ^3.2.4  | Test runner        |
| pkg            | ^5.8.1  | Binary packaging   |
| esbuild        | ^0.25.9 | Build tool         |

---

## Build & Distribution

### Build Targets

The project supports multiple distribution formats:

#### 1. **Node.js Distribution**

```bash
npm run build
# Output: dist/cli/index.js (CommonJS)
```

#### 2. **Binary Packages (pkg)**

```bash
npm run build:pkg:all
# Outputs:
# - nikcli-aarch64-apple-darwin (macOS ARM64)
# - nikcli-x86_64-apple-darwin (macOS x64)
# - nikcli-x86_64-linux (Linux x64)
# - nikcli-x86_64-windows.exe (Windows x64)
```

#### 3. **Bun Compiled Binaries**

```bash
npm run build:bun:all
# Outputs: Pre-compiled Bun binaries for all platforms
```

#### 4. **Vercel Deployment**

```bash
npm run build:vercel
# Serverless function deployment
```

#### 5. **Docker Container**

```bash
npm run docker:build
npm run docker:up
# Containerized deployment
```

### Build Configuration

**Primary Build Tool**: Bun  
**Source**: `src/cli/index.ts`  
**Output**: `dist/cli/index.js`  
**Format**: CommonJS  
**Options**:

- External dependencies (not bundled)
- Sourcemaps enabled
- Node.js compiler target

---

## Development Scripts

### Core Development

```bash
npm start              # Start development server
npm run dev           # Alias for start
npm run build         # Build for production
npm run build:start   # Build and run
```

### CLI Tools

```bash
npm run nikctl        # Control utility
npm run nikd          # Daemon service
npm run daemon:start  # Start background service
npm run daemon:status # Check daemon status
```

### Background Operations

```bash
npm run bg:start      # Start background job
npm run bg:list       # List background jobs
npm run bg:stats      # Show background statistics
```

### Web Interface

```bash
npm run web:dev       # Start web dev server
npm run web:build     # Build web for production
npm run web:start     # Start web server
```

### Docker Operations

```bash
npm run docker:build  # Build Docker image
npm run docker:up     # Start containers
npm run docker:down   # Stop containers
npm run docker:logs   # View container logs
```

### Testing

```bash
npm test              # Run all tests
npm run test:run      # Run tests once
npm run test:watch    # Watch mode
npm run test:coherence # Verify system coherence
npm run test:system   # System integration tests
```

### Code Quality

```bash
npm run lint          # Lint source code
npm run format        # Format code
npm run check         # Full code check
```

### Configuration & Diagnostics

```bash
npm run config:check  # Verify configuration
npm run db:init       # Initialize database
npm run system:diagnose # System diagnostics
```

---

## Dependencies Analysis

### Production Dependencies: 74 packages

**AI & LLM** (7 packages)

- Multi-provider AI SDK integration
- Token counting and management
- Streaming support

**Backend & Server** (8 packages)

- Express.js framework
- Database clients (Supabase, Redis)
- Rate limiting and security

**Terminal & UI** (11 packages)

- Rich terminal rendering
- Interactive prompts
- Progress visualization

**Code Processing** (8 packages)

- Syntax highlighting
- Markdown parsing
- Diff generation

**Utilities** (15+ packages)

- HTTP clients
- YAML/JSON parsing
- UUID generation
- Crypto operations

### Development Dependencies: 15 packages

**Linting & Formatting**

- Biome (linter & formatter)
- TypeScript ESLint

**Testing**

- Vitest (test runner)
- Vitest UI

**Build Tools**

- TypeScript compiler
- esbuild
- pkg (binary packaging)
- ts-node

**Type Definitions**

- @types/node, @types/express, @types/blessed, etc.

### Dependency Statistics

- **Total Dependencies**: 89
- **Production**: 74
- **Development**: 15
- **Node Engine**: ≥22.0.0

---

## Project Statistics

### Code Organization

| Category                       | Count | Details                  |
| ------------------------------ | ----- | ------------------------ |
| Root Files                     | 20    | Configuration, docs, env |
| Directories                    | 17    | Source, tests, examples  |
| Source Files (streamtty)       | 8     | Core streaming logic     |
| Compiled Files (streamtty)     | 16    | Distribution output      |
| Examples (context-interceptor) | 9     | SDK usage examples       |
| Tests                          | 6+    | Unit & integration       |
| Documentation                  | 7+    | Docs directory           |

### Build Outputs

| Format   | Location          | Purpose                |
| -------- | ----------------- | ---------------------- |
| Node.js  | dist/cli/index.js | NPM package            |
| Binaries | public/bin/       | Standalone executables |
| Docker   | Dockerfile        | Container image        |
| Web      | web/app/          | Next.js application    |

### Git Repository

- **Branch**: master
- **Remote**: https://github.com/nikomatt69/nikcli-main.git
- **Status**: 11 files modified (uncommitted changes)
- **Last Modified**: 2025-10-16

---

## Architecture Patterns

### Modular Design

- **Separation of Concerns**: CLI, SDK, Web, Core
- **Independent Modules**: Each can be developed/deployed separately
- **Shared Dependencies**: Common utilities and configurations

### Multi-Runtime Support

- Node.js native execution
- Bun runtime optimization
- Compiled binaries for distribution
- Containerized deployment

### Extensibility

- Plugin system via Commander.js
- Custom AI provider support
- Configurable renderers
- Middleware pattern in Express

### Quality Assurance

- Comprehensive testing framework
- Linting and formatting rules
- Type safety with TypeScript
- Security scanning and validation

---

## Key Features Summary

✅ **Multi-Provider AI Integration** - OpenAI, Anthropic, Google, and more  
✅ **CLI-First Design** - Powerful command-line interface  
✅ **Web Dashboard** - Next.js-based UI  
✅ **Daemon Mode** - Background service capabilities  
✅ **Context Awareness** - Workspace intelligence  
✅ **Terminal Streaming** - Advanced TTY rendering  
✅ **Database Support** - Multiple storage backends  
✅ **Docker Ready** - Container deployment  
✅ **Cross-Platform** - macOS, Linux, Windows  
✅ **Type Safe** - Full TypeScript support

---

## Getting Started

### Prerequisites

- Node.js ≥22.0.0
- npm, yarn, pnpm, or bun
- Git

### Installation

```bash
git clone https://github.com/nikomatt69/nikcli-main.git
cd nikcli-main
npm install
```

### Configuration

```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

### Development

```bash
npm run dev
```

### Build & Deploy

```bash
npm run build
npm run build:pkg:all  # For binary distribution
npm run docker:build   # For container deployment
```

---

**Last Updated**: October 16, 2025  
**Version**: 0.3.0  
**Maintainer**: @nikomatt69
