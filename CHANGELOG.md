# 📝 Changelog - Nikcli

All notable changes to Nikcli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2025-01-27

### 🔗 **Coinbase AgentKit Integration**

#### ✨ **Added**

##### **Blockchain Operations Support**

- **Coinbase AgentKit Provider**: New provider for blockchain operations and Web3 integration

  - Support for Ethereum, Polygon, and other EVM-compatible networks
  - Wallet management and transaction handling
  - Smart contract interaction capabilities
  - DeFi protocol integration
  - NFT operations support

- **Coinbase AgentKit Tool**: Comprehensive tool for blockchain operations
  - `coinbase-agentkit-tool.ts` with 595 lines of functionality
  - Secure wallet operations with key management
  - Transaction signing and broadcasting
  - Smart contract deployment and interaction
  - Token operations (ERC-20, ERC-721, ERC-1155)
  - DeFi protocol interactions (Uniswap, Aave, Compound)

##### **Enhanced AI Provider Configuration**

- **Updated Modern AI Provider**: Enhanced with maxTokens configuration
  - Improved token management for better response quality
  - Optimized AI model responses with proper token limits
  - Better handling of long-form content and complex queries

##### **Repository Cleanup**

- **Clean Git History**: Removed large binary files from repository
  - Eliminated 187MB binary file that exceeded GitHub limits
  - Fresh Git initialization for clean history
  - Updated .gitignore to prevent future binary commits
  - Optimized repository size and performance

#### 🔧 **Technical Improvements**

##### **Blockchain Integration Architecture**

- **Provider Pattern**: Modular blockchain provider system
- **Tool Registry Integration**: Seamless integration with existing tool system
- **Security First**: Secure key management and transaction handling
- **Multi-Network Support**: Extensible architecture for multiple blockchains

##### **Build System**

- **Clean Build Process**: Optimized build without binary dependencies
- **Package Optimization**: Reduced package size and improved distribution
- **GitHub Integration**: Proper repository structure for collaboration

#### 📦 **Dependencies**

- **Coinbase AgentKit**: Blockchain operations and Web3 integration
- **Enhanced AI SDK**: Updated AI provider configurations
- **Security Libraries**: Secure key management and encryption

#### 🛡️ **Security**

- **Secure Key Storage**: Encrypted wallet key management
- **Transaction Validation**: Comprehensive transaction security checks
- **Path Sanitization**: Secure file and path handling
- **API Key Protection**: Secure storage of blockchain API keys

#### 📚 **Documentation**

- **Integration Guide**: Comprehensive documentation for blockchain operations
- **API Reference**: Complete API documentation for Coinbase AgentKit
- **Security Guidelines**: Best practices for blockchain operations
- **Examples**: Real-world usage examples and workflows

---

## [1.0.0] - 2025-09-09

### 🔄 **Repository & Packaging**

#### ✨ **Changed**

- Bumped package version to **1.0.0** (see package.json).
- Configured package publishing for the `beta` tag via `publishConfig`.
- `main` and `bin` now point to `dist/cli/index.js` (packaged CLI entry).
- `files` field limits published files to `dist/**` and `README.md` to reduce package size.
- Increased engines requirement: Node >= 18.

#### ✨ **Added / Improved**

- New and refined build / release scripts in package.json:
  - `build`, `build:start`, `build:binary`, `build:release`, `prepublishOnly` and related helpers.
  - Included `create-release.sh` and release tooling in `installer`/`scripts` for automated packaging.
- Improved developer scripts: `start`, `dev`, `test:run`, `test:watch`, `test:system` and linting commands.
- Packaging improvements to produce a clean `dist/` CLI bundle suitable for publishing.

### 🆕 **Diff Viewer**

#### ✨ **Added**

- Added an interactive Diff Viewer for reviewing changes directly in the CLI and UI:
  - Side-by-side (affiancata) and inline diff views.
  - Support for unified diffs and contextual hunks.
  - Syntax highlighting for common languages (JavaScript/TypeScript, JSON, Markdown, Python, etc.).
  - Automatic detection of renamed and moved files.
  - Hunk- and line-level staging: select and stage individual hunks/lines.
  - Export diffs to patch formats (.diff / .patch).
  - Support for large files via virtualized/lazy rendering for improved performance.
  - Keyboard shortcuts for main actions: jump between hunks, stage/unstage, toggle views.
  - Integration with project file tree: select a file and preview its diff from the sidebar.
  - Public programmatic API: getDiff(fileA, fileB), applyPatch(patch, options), exportPatch(diff).
  - Unit and integration tests covering core diff workflows.

#### 🔁 **Changed**

- Improved revision viewing UX: asynchronous loading, placeholders and progress indicators for diffs.
- Optimized diff parsing to handle CRLF vs LF, UTF-8 and files with special characters.

#### 🐛 **Fixed**

- Fixed scroll sync issues in side-by-side view for long lines.
- Corrected off-by-one row indices when applying hunks that caused visual misalignment.

#### 📚 **Docs**

- Added documentation for Diff Viewer usage under "Features → Diff Viewer" with API examples and keyboard shortcuts.
- Updated CLI examples for exporting and applying patches from the viewer.

### 📦 **Dependencies & Tooling**

#### ✨ **Updated / Consolidated**

- Updated AI SDK and related provider integrations (see package.json):
  - @ai-sdk/anthropic, @ai-sdk/gateway, @ai-sdk/google, @ai-sdk/openai, @ai-sdk/vercel
  - Core user-facing `ai` package
- Chroma/embeddings, Supabase, Keytar and other runtime libs present for workspace analysis and persistence.
- Dev tooling includes TypeScript, ts-node, vitest, eslint, esbuild and pkg for binary distribution.

### 🔧 **Technical Improvements**

- Focused on robust packaging and release pipeline to make beta releases reproducible and small.
- CLI entrypoints and shebangs maintained to ensure proper executable behavior once distributed.
- Documentation and helper files are present (README, BUILD.md, RELEASE.md) to guide contributors and release maintainers.

### 🐛 **Fixes**

- Minor packaging and publish configuration issues addressed (reducing files included on publish, aligning main/bin paths).

---

(The entries above are generated by scanning package.json and repository root files. If you want a more fine-grained changelog generated from commit messages or specific file diffs, I can parse the git history or analyze a provided range of commits.)

## [0.4.2-beta] - 2025-01-27

### 🚀 **esbuild Build System Integration**

#### ✨ **Added**

##### **Modern Build System**

- **esbuild Configuration**: Comprehensive build configuration with `esbuild.config.js`
- **Fast Compilation**: Significantly faster builds compared to TypeScript compiler
- **Bundle Optimization**: Tree shaking and dead code elimination
- **Path Alias Support**: Full support for TypeScript path mapping
- **Multiple Build Modes**: Development and production configurations
- **Watch Mode**: Automatic rebuilds during development

##### **Build Commands**

- **Development Build**: `npm run build:esbuild:dev` with sourcemaps
- **Production Build**: `npm run build:esbuild:prod` with minification
- **Watch Mode**: `npm run build:esbuild:watch` for development
- **Direct Usage**: `node esbuild.config.js [mode]` for custom builds

##### **Build Features**

- **External Dependencies**: All node_modules excluded from bundle
- **Shebang Support**: Proper CLI executable with `#!/usr/bin/env node`
- **File Copying**: Essential files copied to dist directory
- **Executable Permissions**: Automatic chmod 755 for CLI binary
- **Bundle Analysis**: Metafile generation for build insights

##### **Configuration Management**

- **Path Aliases**: Matches `tsconfig.cli.json` configuration
- **Loader Support**: TypeScript, TSX, JavaScript, and JSON files
- **Environment Variables**: Production environment configuration
- **Tree Shaking**: Unused code elimination for smaller bundles

#### 🔧 **Technical Improvements**

##### **Build Architecture**

- **esbuild Integration**: Replaces TypeScript compiler for production builds
- **Plugin System**: Custom plugins for file copying and shebang handling
- **Error Handling**: Comprehensive build error reporting
- **Performance**: Optimized build times and bundle sizes

##### **File Structure**

```
├── esbuild.config.js      # Main build configuration
├── BUILD.md               # Build system documentation
├── package.json           # Updated build scripts
└── dist/
    └── cli/
        └── index.js       # Built executable
```

##### **Build Scripts**

```json
{
  "scripts": {
    "build:esbuild": "node esbuild.config.js",
    "build:esbuild:dev": "node esbuild.config.js dev",
    "build:esbuild:prod": "node esbuild.config.js prod",
    "build:esbuild:watch": "node esbuild.config.js dev --watch"
  }
}
```

#### 📦 **Dependencies**

- **esbuild-plugin-copy**: File copying during build process
- **Enhanced Build Tools**: Improved build pipeline and optimization

#### 📚 **Documentation**

- **BUILD.md**: Comprehensive build system documentation
- **Usage Examples**: Development and production build workflows
- **Troubleshooting**: Common build issues and solutions
- **Migration Guide**: From TypeScript compiler to esbuild

---

## [2.0.0] - 2025-08-07

### 🚀 **Initial Release - Nikcli**n

This is the first major release transforming the original AI Agents CLI into a true Claude Code clone with terminal velocity.

#### ✨ **Added**

##### **Multi-Agent AI System**

- **6 Specialized Agents**: Full-stack developer, React expert, Backend engineer, DevOps specialist, Testing expert, Code reviewer
- **Smart Agent Selection**: `/auto` command automatically selects best agent for tasks
- **Agent Mode**: `/use <agent>` switches to focused agent conversation
- **Direct Agent Calls**: `@<agent> <task>` for single-task execution
- **Execution History**: Track and review all agent activities
- **Agent Suggestions**: AI suggests relevant agents based on task description

##### **Real-Time Tool Integration**n

- **File Operations**: `read_file`, `write_file`, `list_directory` tools integrated in chat
- **Command Execution**: `execute_command` tool with safety confirmations
- **Workspace Analysis**: `analyze_workspace` tool for automatic project understanding
- **Live Streaming**: Real-time response streaming with tool execution feedback
- **Context Awareness**: Automatic project structure detection and analysis

##### **Multi-Model Support**

- **OpenAI Integration**: GPT-4, GPT-3.5 Turbo support
- **Anthropic Integration**: Claude 3.5 Sonnet, Claude 3 Haiku support
- **Google Integration**: Gemini Pro, Gemini 1.5 Flash support
- **Model Switching**: `/model` command for runtime model changes
- **API Key Management**: Secure storage and environment variable fallback

##### **Modern CLI Experience**

- **Beautiful Interface**: Colored output, gradient prompts, formatted responses
- **Interactive Commands**: Rich slash command system (`/help`, `/agents`, `/auto`, etc.)
- **Session Management**: Persistent chat history and context
- **Working Directory**: `/cd`, `/pwd`, `/ls` commands for navigation
- **Configuration**: Comprehensive config system with `nikcli config`

##### **Developer Experience**

- **TypeScript First**: Full TypeScript support with proper types
- **Yarn Integration**: Uses Yarn for all package management (never npm)
- **Modern Dependencies**: Latest Vercel AI SDK, TypeScript 5.7+, modern tooling
- **Build System**: Optimized TypeScript compilation and distribution
- **Testing**: Comprehensive test suite with `yarn test:system`

##### **Setup & Installation**

- **One-Line Setup**: `yarn setup` handles complete installation
- **Interactive Configuration**: Guided API key setup
- **Global Installation**: `yarn link` for system-wide access
- **Cross-Platform**: macOS, Linux, Windows support
- **Desktop Shortcuts**: Optional shortcuts for easy access

##### **Documentation**

- **Comprehensive README**: Detailed usage guide and examples
- **Installation Guide**: Step-by-step setup instructions
- **Examples Collection**: Real-world usage patterns and workflows
- **System Testing**: Automated test suite for validation

#### 🔧 **Technical Improvements**n

- **ModernAIProvider**: New AI provider with tool calling support
- **ModernAgentSystem**: Specialized agent capabilities and orchestration
- **ClaudeCodeInterface**: Enhanced chat interface with streaming
- **ModernConfigManager**: Robust configuration with validation

##### **Tool System**

- **Function Definitions**: Proper Zod schemas for all tools
- **Error Handling**: Comprehensive error management and user feedback
- **Security**: Path sanitization and command validation
- **Performance**: Optimized file operations and streaming

##### **Build & Deployment**

- **Automated Build**: `build.sh` script for consistent compilation
- **Package Management**: Yarn-first approach with proper lockfiles
- **Binary Distribution**: Optimized CLI binary with proper entry points
- **Validation**: System tests ensure functionality before release

#### 📦 **Package Updates**

```json
{
  "dependencies": {
    "@ai-sdk/anthropic": "^0.0.56",
    "@ai-sdk/google": "^0.0.61",
    "@ai-sdk/openai": "^0.0.74",
    "ai": "^4.0.7",
    "boxen": "^8.0.1",
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "conf": "^13.0.1",
    "execa": "^9.4.0",
    "fast-glob": "^3.3.2",
    "gradient-string": "^3.0.0",
    "inquirer": "^12.1.0",
    "listr2": "^8.2.7",
    "marked": "^14.1.3",
    "nanoid": "^5.0.9",
    "typescript": "^5.7.4",
    "zod": "^3.24.1"
  }
}
```

#### 🗂️ **New File Structure**

```
nikcli/
├── src/cli/
│   ├── ai/modern-ai-provider.ts         # New AI provider with tools
│   ├── agents/modern-agent-system.ts    # Multi-agent orchestration
│   ├── chat/claude-code-interface.ts    # Enhanced chat interface
│   ├── config/config-manager.ts         # Modern configuration
│   └── index.ts                         # Updated CLI entry
├── setup.sh                             # Automated setup script
├── build.sh                             # Build automation
├── test-system.js                       # System validation
├── INSTALL.md                           # Installation guide
├── EXAMPLES.md                          # Usage examples
└── README.md                            # Comprehensive documentation
```

#### 💬 **Command Reference**

- `/help` - Show all available commands
- `/agents` - List all specialized agents
- `/use <agent>` - Switch to agent mode
- `/auto <task>` - Auto-select best agent
- `@<agent> <task>` - Direct agent execution
- `/exit-agent` - Exit agent mode
- `/history` - Show agent execution history
- `/cd <dir>` - Change working directory
- `/pwd` - Show current directory
- `/ls` - List directory contents

... (rest of changelog preserved)
