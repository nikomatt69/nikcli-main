# NikCLI Codebase Map & Module Reference

**Document Type**: Detailed Module Registry  
**Project**: NikCLI v0.3.0  
**Last Updated**: October 16, 2025  
**Total Modules**: 17+ core modules

---

## 📍 Quick Navigation

- [File Structure Overview](#file-structure-overview)
- [Core Modules](#core-modules)
- [Source Code Organization](#source-code-organization)
- [Build & Distribution](#build--distribution)
- [Configuration Files](#configuration-files)
- [Testing Infrastructure](#testing-infrastructure)
- [Dependencies Map](#dependencies-map)
- [Key Entry Points](#key-entry-points)

---

## File Structure Overview

### Root Level Files (20 files)

```
nikcli-main/
├── 🔧 Configuration & Build
│   ├── package.json                 # Project metadata (165 lines, 6.7KB)
│   ├── tsconfig.base.json          # Base TypeScript config
│   ├── tsconfig.cli.json           # CLI TypeScript config
│   ├── tsconfig.json               # Root TypeScript config
│   ├── tsconfig.vercel.json        # Vercel TypeScript config
│   ├── biome.json                  # Biome linter config
│   ├── vitest.config.ts            # Vitest test config
│   ├── vercel.json                 # Vercel deployment config
│   ├── docker-compose.yml          # Docker compose
│   ├── Dockerfile                  # Container definition
│   ├── bunfig.toml                 # Bun runtime config
│   └── pkg-config.json             # PKG binary config
│
├── 🔐 Environment & Security
│   ├── .env                         # Local environment variables
│   ├── .env.production              # Production environment
│   ├── nikcli.2025-09-25.private-key.pem  # Private key
│   ├── .gitignore                  # Git ignore rules
│   ├── .editorconfig               # Editor config
│   └── SECURITY.md                 # Security guidelines
│
└── 📚 Documentation
    ├── README.md                    # Main documentation
    ├── README_EN.md                 # English documentation
    ├── README_IT.md                 # Italian documentation
    ├── NIKOCLI.md                   # NikCLI guide
    ├── LICENSE                      # MIT License
    ├── todo.md                      # Development tasks
    └── .DS_Store                    # macOS metadata
```

---

## Core Modules

### 1️⃣ **CLI Module** - `src/cli/`

**Purpose**: Command-line interface and entry points  
**Status**: Active  
**Key Files**:

- `index.ts` - Main CLI application entry point
- `nikctl.ts` - Control utility for service management
- `nikd.ts` - Daemon service implementation

**Responsibilities**:

- Command parsing and routing
- Interactive user interface
- Service lifecycle management
- Background task execution

**Dependencies**:

- commander.js (CLI framework)
- inquirer (interactive prompts)
- chalk (terminal colors)
- ora (spinners)

**Main Commands**:

- `nikctl` - Control service
- `nikd` - Daemon operations
- `bg` - Background tasks
- `web` - Web interface
- `config` - Configuration

---

### 2️⃣ **StreamTTY Module** - `streamtty/`

**Purpose**: Advanced terminal streaming and rendering  
**Status**: Core component  
**Location**: `./streamtty/`

#### Directory Structure

```
streamtty/
├── src/                             # Source code (8 files)
│   ├── stream-protocol.ts          # Stream protocol implementation
│   ├── ai-sdk-adapter.ts           # AI SDK integration
│   ├── renderers/
│   │   ├── shiki-ansi.ts          # Syntax highlighting renderer
│   │   ├── table-renderer.ts       # Table rendering
│   │   ├── mermaid-renderer.ts     # Diagram rendering
│   │   └── [other renderers]
│   └── [core modules]
│
├── dist/                            # Compiled output (16 files)
│   ├── *.js                         # JavaScript output
│   ├── *.d.ts                       # TypeScript definitions
│   └── *.map                        # Source maps
│
├── test/                            # Test files
│   ├── mocks/
│   │   ├── blessed.ts              # Terminal UI mock
│   │   └── ai-streams.ts           # Stream mock
│   └── unit/
│       ├── stream-protocol.test.ts  # Protocol tests
│       ├── ai-sdk-adapter.test.ts   # Adapter tests
│       └── demo-changelog.ts        # Demo tests
│
├── examples/                        # Usage examples (3 files)
│   ├── basic-streaming.ts
│   ├── advanced-rendering.ts
│   └── custom-renderer.ts
│
└── Configuration
    ├── vitest.config.ts            # Test framework config
    ├── tsconfig.json               # TypeScript config
    └── package.json                # Package metadata
```

#### Key Features

- **Stream Protocol**: Real-time data streaming
- **AI SDK Adapter**: Integration with Vercel AI SDK
- **Multiple Renderers**: Shiki, Table, Mermaid, Markdown
- **Terminal Optimization**: ANSI color support, formatting
- **Testing**: Comprehensive unit tests with Vitest

#### Exports

```typescript
export { StreamProtocol };
export { AISDKAdapter };
export { ShikiRenderer, TableRenderer, MermaidRenderer };
export { TerminalStreamer };
```

---

### 3️⃣ **Context Interceptor SDK** - `context-interceptor-sdk/`

**Purpose**: Workspace context capture and management  
**Status**: Active  
**Location**: `./context-interceptor-sdk/`

#### Directory Structure

```
context-interceptor-sdk/
├── src/                             # Source code (4 files)
│   ├── interceptor.ts              # Main interceptor class
│   ├── context-analyzer.ts         # Context analysis engine
│   ├── workspace-scanner.ts        # Workspace scanning
│   └── index.ts                    # Module exports
│
├── examples/                        # Usage examples (9 files)
│   ├── basic-usage.ts
│   ├── ide-integration.ts
│   ├── workspace-analysis.ts
│   ├── context-extraction.ts
│   └── [more examples]
│
├── tests/                           # Test suite
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
└── Configuration
    ├── vitest.config.ts            # Test config
    ├── tsconfig.json               # TypeScript config
    └── package.json                # Package metadata
```

#### Key Capabilities

- **Context Capture**: Extract workspace information
- **IDE Integration**: VSCode, WebStorm compatibility
- **File Analysis**: Parse project structure
- **Dependency Analysis**: Map dependencies
- **Environment Detection**: Detect development environment

#### Main Classes

```typescript
class ContextInterceptor {
  captureContext(): Promise<WorkspaceContext>;
  analyzeProject(): Promise<ProjectAnalysis>;
  scanFiles(pattern: string): Promise<FileInfo[]>;
  extractDependencies(): Promise<DependencyMap>;
}
```

---

### 4️⃣ **Web Dashboard** - `web/`

**Purpose**: Web-based user interface  
**Framework**: Next.js + Tailwind CSS  
**Status**: Active  
**Location**: `./web/`

#### Directory Structure

```
web/
├── app/                             # Next.js app directory
│   ├── page.tsx                    # Home page
│   ├── layout.tsx                  # Root layout
│   ├── dashboard/                  # Dashboard pages
│   │   ├── page.tsx
│   │   └── [id]/
│   └── [other routes]
│
├── components/                      # React components
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   ├── Dashboard.tsx
│   └── [other components]
│
├── styles/                          # Styling
│   ├── globals.css
│   └── [component styles]
│
├── Configuration
│   ├── next.config.js              # Next.js config
│   ├── tailwind.config.js          # Tailwind CSS
│   ├── postcss.config.js           # PostCSS config
│   └── tsconfig.json               # TypeScript config
│
└── public/                          # Static assets
    ├── images/
    ├── icons/
    └── [other assets]
```

#### Features

- **Real-time Dashboard**: Service monitoring
- **Configuration UI**: Settings management
- **Task Visualization**: Progress tracking
- **Responsive Design**: Mobile-friendly
- **Dark Mode**: Theme support

---

### 5️⃣ **Database Module** - `database/`

**Purpose**: Data persistence layer  
**Status**: Active  
**Location**: `./database/`

#### Supported Backends

1. **Supabase** (PostgreSQL)
   - Primary database
   - Real-time updates
   - Authentication

2. **Redis** (Caching)
   - Session storage
   - Cache layer
   - Message queue

3. **Upstash** (Serverless Redis)
   - Cloud-based caching
   - No infrastructure

4. **Vercel KV**
   - Serverless key-value
   - Vercel integration

#### Integration Points

```typescript
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { kv } from "@vercel/kv";
```

---

### 6️⃣ **Tests** - `tests/`

**Purpose**: Test suite and verification  
**Status**: Active  
**Location**: `./tests/`

#### Test Files (6 files)

```
tests/
├── verify-coherence.js              # System coherence verification
├── verify-system.js                 # System integrity tests
├── unit/                            # Unit tests
│   ├── cli.test.ts
│   ├── core.test.ts
│   └── [other tests]
├── integration/                     # Integration tests
│   ├── api.test.ts
│   └── [other tests]
└── fixtures/                        # Test data
    ├── mock-data.ts
    └── [fixtures]
```

#### Test Framework

- **Runner**: Vitest
- **UI**: Vitest UI
- **Coverage**: Built-in
- **Mocking**: Vitest mocks

#### Test Scripts

```bash
npm test              # Run all tests
npm run test:run      # Single run
npm run test:watch    # Watch mode
npm run test:coherence # Coherence check
npm run test:system   # System tests
```

---

### 7️⃣ **Documentation** - `docs/` & `nikcli-academic-docs/`

**Purpose**: Project documentation  
**Status**: Active  
**Location**: `./docs/` and `./nikcli-academic-docs/`

#### Documentation Files (7+ files)

- API documentation
- User guides
- Architecture overview
- Code examples
- Academic papers
- Tutorial guides

---

### 8️⃣ **Binary Entry Points** - `bin/`

**Purpose**: Executable entry points  
**Status**: Active  
**Location**: `./bin/`

#### Files (2 files)

```
bin/
├── nikcli.js                        # Main executable
└── nikctl.js                        # Control utility
```

#### Usage

```bash
./bin/nikcli.js [command] [options]
./bin/nikctl.js [command] [options]
```

---

### 9️⃣ **Distribution** - `dist/`

**Purpose**: Compiled output  
**Status**: Build artifact  
**Location**: `./dist/`

#### Structure

```
dist/
└── cli/
    ├── index.js                     # Compiled main entry
    ├── index.js.map                 # Source map
    └── [other compiled files]
```

#### Generation

```bash
npm run build
# Produces CommonJS output with source maps
```

---

## Source Code Organization

### TypeScript Configuration Hierarchy

```
tsconfig.base.json (root)
    ├── tsconfig.json (extends base)
    ├── tsconfig.cli.json (CLI-specific)
    ├── tsconfig.vercel.json (Vercel deployment)
    └── streamtty/tsconfig.json
    └── context-interceptor-sdk/tsconfig.json
    └── web/tsconfig.json
```

### Compiler Options

- **Target**: ES2020
- **Module**: ESNext
- **Lib**: ES2020, DOM
- **Strict**: true
- **Esmoduleinterop**: true
- **Resolvedjsonmodule**: true
- **Declaration**: true
- **Declarationmap**: true
- **Sourcemap**: true

---

## Build & Distribution

### Build Pipeline

```
Source Code (TypeScript)
         ↓
    TypeScript Compiler
         ↓
    JavaScript Output (CommonJS)
         ↓
    ┌─────────────────────────────┐
    │  Distribution Formats       │
    ├─────────────────────────────┤
    │ • NPM Package               │
    │ • Standalone Binaries (pkg) │
    │ • Bun Compiled              │
    │ • Docker Container          │
    │ • Vercel Serverless         │
    └─────────────────────────────┘
```

### Build Outputs

| Format          | Command                         | Output                                   | Target       |
| --------------- | ------------------------------- | ---------------------------------------- | ------------ |
| Node.js         | `npm run build`                 | `dist/cli/index.js`                      | NPM registry |
| macOS ARM64     | `npm run pkg:macos:arm64`       | `public/bin/nikcli-aarch64-apple-darwin` | M1/M2 Mac    |
| macOS x64       | `npm run pkg:macos:x64`         | `public/bin/nikcli-x86_64-apple-darwin`  | Intel Mac    |
| Linux x64       | `npm run pkg:linux:x64`         | `public/bin/nikcli-x86_64-linux`         | Linux        |
| Windows x64     | `npm run pkg:win:x64`           | `public/bin/nikcli-x86_64-windows.exe`   | Windows      |
| Bun macOS ARM64 | `npm run build:bun:macos:arm64` | `public/bin/nikcli-aarch64-apple-darwin` | M1/M2 Mac    |
| Docker          | `npm run docker:build`          | `nikcli-bg:latest`                       | Container    |

---

## Configuration Files

### Package Management

**package.json** (165 lines, 6.7KB)

```json
{
  "name": "@nicomatt69/nikcli",
  "version": "0.3.0",
  "main": "dist/cli/index.js",
  "bin": "dist/cli/index.js",
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=6.0.0",
    "pnpm": ">=8.0.0",
    "bun": ">=1.3.0"
  }
}
```

### Build Configuration

**Bun Configuration** (`bunfig.toml`)

```toml
[build]
target = "node"
format = "cjs"
```

**Vercel Configuration** (`vercel.json`)

```json
{
  "buildCommand": "npm run build:vercel",
  "outputDirectory": "dist"
}
```

### Docker Configuration

**Dockerfile**

- Node.js base image
- Dependency installation
- Application build
- Service exposure

**docker-compose.yml**

- Service orchestration
- Volume management
- Environment configuration
- Network setup

---

## Testing Infrastructure

### Test Configuration

**vitest.config.ts**

```typescript
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
    },
  },
});
```

### Test Organization

```
tests/
├── unit/                # Unit tests
│   ├── *.test.ts
│   └── mocks/
├── integration/         # Integration tests
│   ├── *.test.ts
│   └── fixtures/
└── e2e/                # End-to-end tests
    └── *.test.ts
```

### Mock Files

**streamtty/test/mocks/**

- `blessed.ts` - Terminal UI mock
- `ai-streams.ts` - Stream mock

**Mocking Strategy**

- Vitest mocking utilities
- Fixture-based testing
- Spy functions
- Mock implementations

---

## Dependencies Map

### Dependency Graph

```
nikcli (root)
├── streamtty (local package)
│   └── [shared dependencies]
├── context-interceptor-sdk (local package)
│   └── [shared dependencies]
└── web (Next.js app)
    └── [React dependencies]

Shared Dependencies:
├── AI Providers (7 packages)
├── Terminal UI (11 packages)
├── Data Processing (8 packages)
└── Utilities (15+ packages)
```

### Dependency Categories

#### AI & LLM (7 packages)

```
@ai-sdk/openai
@ai-sdk/anthropic
@ai-sdk/google
@ai-sdk/vercel
@openrouter/ai-sdk-provider
ollama-ai-provider
ai (Vercel AI SDK)
```

#### Terminal & UI (11 packages)

```
blessed (Terminal UI)
chalk (Colors)
inquirer (Prompts)
ora (Spinners)
cli-progress (Progress bars)
gradient-string (Gradients)
boxen (Boxes)
cli-highlight (Syntax highlighting)
terminal-image (Image display)
marked-terminal (Terminal markdown)
cli-progress (Progress tracking)
```

#### Code Processing (8 packages)

```
shiki (Syntax highlighting)
marked (Markdown)
highlight.js (Code highlighting)
diff (Diff generation)
@mozilla/readability (Content extraction)
katex (Math rendering)
js-yaml (YAML parsing)
yaml (YAML support)
```

#### Database & Storage (5 packages)

```
@supabase/supabase-js
@upstash/redis
@vercel/kv
ioredis
chromadb
```

#### Framework & Server (8 packages)

```
express
@vercel/node
cors
helmet
express-rate-limit
ws (WebSockets)
vscode-jsonrpc
commander
```

---

## Key Entry Points

### CLI Entry Points

**Main Entry** (`src/cli/index.ts`)

```bash
npm start
bun run src/cli/index.ts
node dist/cli/index.js
```

**Control Utility** (`src/cli/nikctl.ts`)

```bash
npm run nikctl
```

**Daemon Service** (`src/cli/nikd.ts`)

```bash
npm run nikd
npm run daemon:start
npm run daemon:status
```

### Web Entry Points

**Development**

```bash
npm run web:dev
# http://localhost:3000
```

**Production**

```bash
npm run web:build
npm run web:start
```

### Package Entry Points

**NPM Package**

```javascript
const nikcli = require("@nicomatt69/nikcli");
```

**Binary Entry**

```bash
./public/bin/nikcli [command] [options]
```

---

## File Statistics

### Code Files

- **Source Files**: 8+ (streamtty)
- **Compiled Files**: 16+ (streamtty dist)
- **Test Files**: 6+ (tests directory)
- **Example Files**: 9+ (context-interceptor examples)
- **Configuration Files**: 12+

### Documentation Files

- **Main Docs**: 7+
- **Academic Docs**: 7+
- **README Files**: 3 (EN, IT, Main)
- **Guides**: Multiple

### Total Files

- **Root Level**: 20
- **Total Directories**: 17+
- **Total Tracked Files**: 100+

---

## Development Workflow

### Setup

```bash
git clone https://github.com/nikomatt69/nikcli-main.git
cd nikcli-main
npm install
```

### Development

```bash
npm run dev
npm run test:watch
npm run format
```

### Build

```bash
npm run build
npm run build:pkg:all
npm run docker:build
```

### Deploy

```bash
npm run build:vercel
npm run docker:up
```

---

## Performance Considerations

### Build Optimization

- **Bun Runtime**: 5-10x faster builds
- **Sourcemaps**: Development debugging
- **External Dependencies**: Not bundled
- **Tree Shaking**: Enabled

### Runtime Optimization

- **Lazy Loading**: On-demand imports
- **Caching**: Redis/Upstash
- **Connection Pooling**: Database
- **Stream Processing**: Memory efficient

### Distribution

- **Binary Size**: ~40-60MB (pkg)
- **Bun Size**: ~15-25MB (compiled)
- **Docker Size**: ~200-300MB
- **NPM Size**: ~5-10MB

---

## Security Considerations

### Environment Management

- `.env` for local development
- `.env.production` for production
- Private key management
- Secret rotation

### Code Security

- Helmet.js for HTTP headers
- Rate limiting (express-rate-limit)
- Input validation (Zod)
- CORS configuration

### Dependencies

- Regular audits (npm audit)
- Dependency updates
- Security scanning
- Vulnerability management

---

## Related Documentation

- **Architecture**: See PROJECT_ARCHITECTURE.md
- **API Reference**: See docs/ directory
- **User Guide**: See README.md
- **Security**: See SECURITY.md
- **Contributing**: See NIKOCLI.md

---

**Document Version**: 1.0  
**Last Updated**: October 16, 2025  
**Project Version**: 0.3.0  
**Maintainer**: @nikomatt69
