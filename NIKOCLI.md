# NikCLI - Universal Agent Developer CLI

## 🎯 Overview

NikCLI is an advanced AI-powered CLI tool designed for autonomous software development and intelligent task orchestration. It provides production-ready development workflows with minimal user intervention and maximum automation.

**Key Features:**

- **Universal Agent System** - AI agents for every domain (universal, react, backend, devops, code-review, optimization)
- **Cognitive Orchestration** - Smart task planning and execution strategies
- **Full-Stack Development** - Complete project lifecycle management
- **Web3/DeFi Integration** - Native blockchain operations with GOAT SDK
- **Vim Integration** - Advanced editing with AI assistance
- **Comprehensive Tooling** - 50+ specialized tools and utilities

## 🚀 Core Philosophy

**For the Agent (How to use NikCLI effectively):**

1. **Production-First Mindset** - Always deliver production-ready code, never TODOs, MOCKS, or placeholders
2. **Minimal Progressive Edits** - Edit existing files rather than creating new ones when possible
3. **Cognitive Planning** - Use TaskMaster AI for complex task breakdown
4. **Adaptive Execution** - Choose optimal execution strategies based on task complexity
5. **Quality Assurance** - Validate, test, and ensure best practices
6. **Context Awareness** - Leverage workspace intelligence and RAG systems

## 📋 Command Reference

### Core Agent Commands

#### `/agent <agent-name> [task] [options]`

Activates specialized AI agents for domain-specific tasks.

**Available Agents:**

- `universal-agent` - Primary coordinator and fallback executor
- `react-agent` - Frontend development and component creation
- `backend-agent` - API development and server architecture
- `devops-agent` - Infrastructure, deployment, CI/CD
- `code-review-agent` - Quality assurance and code analysis
- `optimization-agent` - Performance tuning and efficiency

**Options:**

- `--auto` - Autonomous execution without confirmation
- `--plan` - Generate task breakdown before execution
- `--parallel` - Execute subtasks in parallel when possible

**Examples:**

```bash
/agent universal-agent "analyze and optimize this React app"
/agent react-agent "create a new dashboard component with TypeScript"
/agent backend-agent "implement user authentication API with JWT"
/agent devops-agent "set up CI/CD pipeline for staging environment"
```

#### `/analyze [path] [options]`

Comprehensive project and code analysis with intelligent insights.

**Options:**

- `--metrics` - Code complexity and quality metrics
- `--dependencies` - Dependency analysis and security scan
- `--security` - Security vulnerability assessment
- `--performance` - Performance bottleneck identification
- `--patterns` - Code pattern and architecture analysis

**Examples:**

```bash
/analyze src/ --metrics --security
/analyze . --dependencies --performance
/analyze components/ --patterns
```

#### `/plan [task description]`

Generate comprehensive task breakdown using TaskMaster AI.

**Features:**

- Intelligent complexity assessment (1-10 scale)
- Dependency mapping and execution strategies
- Fallback planning for failed operations
- Priority ranking and resource estimation

**Examples:**

```bash
/plan "migrate React app to TypeScript with new design system"
/plan "build DeFi dashboard with wallet integration"
```

### Development Workflow Commands

#### `/build [options]`

Automated project building with smart dependency management.

**Options:**

- `--prod` - Production build with optimizations
- `--watch` - Development build with file watching
- `--analyze` - Bundle analysis for optimization
- `--test` - Run tests after successful build

**Examples:**

```bash
/build --prod
/build --watch --analyze
/build --test --prod
```

#### `/deploy [options]`

Intelligent deployment with environment management.

**Options:**

- `--env <environment>` - Target environment (dev, staging, prod)
- `--rollback` - Rollback to previous deployment
- `--dry-run` - Test deployment without actual execution
- `--monitor` - Enable post-deployment monitoring

**Examples:**

```bash
/deploy --env production
/deploy --env staging --dry-run
/deploy --env production --rollback
```

#### `/test [options]`

Comprehensive testing with intelligent test generation.

**Options:**

- `--unit` - Unit tests with coverage
- `--integration` - Integration test suite
- `--e2e` - End-to-end testing
- `--generate` - Generate missing test cases

**Examples:**

```bash
/test --unit --coverage
/test --e2e --generate
/test --integration --watch
```

### File Operations & Code Management

#### `/grep <pattern> [path] [options]`

Advanced pattern search with intelligent filtering.

**Options:**

- `--files <pattern>` - File type filtering (e.g., "_.ts", "_.tsx")
- `--context <lines>` - Show context around matches
- `--regex` - Enable regular expression search
- `--whole-word` - Match whole words only

**Examples:**

```bash
/grep "export function" src/ --files "*.ts"
/grep "TODO" . --context 3
/grep "^import" components/ --regex
```

#### `/vim [subcommand] [options]`

Integrated Vim editor with AI assistance and session management.

**Subcommands:**

- `setup` - Install NikCLI-optimized .vimrc with plugins
- `open <file>` - Open file with session tracking
- `quick-edit <file> [content]` - Quick edit and save
- `diff <file1> <file2>` - Side-by-side diff viewer
- `config [action]` - Manage Vim configuration
- `sessions` - List active Vim sessions

**Examples:**

```bash
/vim setup
/vim open src/index.ts --line 42
/vim quick-edit notes.md "Add implementation notes"
/vim diff old.js new.js
/vim config get
```

**Advanced Features:**

- Auto-generated .vimrc with 10+ plugins
- Custom mappings (jj to Esc, leader keys)
- Session saving/loading
- AI-assisted editing integration

### Web3 & DeFi Integration

#### `/goat [action] [options]`

Native GOAT SDK integration for blockchain operations.

**Actions:**

- `init` - Initialize wallet and chain configuration
- `wallet-info` - Display wallet address and capabilities
- `status` - Check SDK initialization status
- `chat <message>` - Natural language blockchain operations
- `markets` - List Polymarket prediction markets
- `transfer` - Transfer ERC20 tokens

**Supported Networks:**

- Polygon (137) - DeFi protocols and NFT markets
- Base (8453) - Ethereum L2 with low fees

**Supported Plugins:**

- Polymarket - Prediction markets and trading
- ERC20 - Token operations and transfers

**Environment Variables Required:**

```bash
GOAT_EVM_PRIVATE_KEY=your_64_char_hex_key
POLYGON_RPC_URL=https://polygon-rpc.com
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**Examples:**

```bash
/goat init --chains polygon,base --plugins polymarket,erc20
/goat chat "show me trending prediction markets on Polymarket"
/goat transfer --token USDC --amount 100 --to 0x1234... --chain base
/goat markets --category sports
```

### Web3 Toolchain System

#### `/web3-toolchain <action> [options]`

Automated blockchain operation sequences with safety features.

**Available Toolchains:**

1. **DeFi Analysis** - Protocol analysis and yield optimization
2. **Polymarket Strategy** - Prediction market automation
3. **Portfolio Management** - Cross-chain portfolio tracking
4. **NFT Analysis** - Collection analytics and trends
5. **Smart Contract Audit** - Security analysis
6. **Yield Optimizer** - Automated farming strategies
7. **Bridge Analysis** - Cross-chain security
8. **MEV Protection** - MEV analysis and protection
9. **Governance Analysis** - DAO proposal analysis
10. **Protocol Integration** - Automated DeFi integration

**Actions:**

- `list` - Show available toolchains
- `run <name>` - Execute toolchain sequence
- `status` - Show active executions
- `cancel <id>` - Cancel running execution

**Safety Features:**

- **Dry Run Mode** - Test without transactions
- **Risk Assessment** - Built-in risk evaluation
- **Gas Monitoring** - Track gas usage and costs
- **Transaction Tracking** - Monitor all blockchain operations
- **Error Handling** - Comprehensive error reporting

**Execution Patterns:**

- **Sequential** - One tool after another
- **Parallel** - Multiple tools simultaneously
- **Conditional** - Based on conditions
- **Iterative** - Until convergence

**Examples:**

```bash
/web3-toolchain list
/web3-toolchain run "DeFi Analysis" --dry-run
/web3-toolchain run "Yield Optimizer" --chains polygon,base
/web3-toolchain status
```

### Configuration & Provider Management

#### `/config [subcommand] [options]`

Comprehensive configuration management for providers and settings.

**Subcommands:**

- `show` - Display current configuration
- `model <name>` - Set active AI model
- `provider <name>` - Set default provider
- `key <provider> <key>` - Set API key for provider
- `validate` - Validate configuration

**Supported Providers:**

- `openai` - OpenAI GPT models
- `anthropic` - Claude models
- `google` - Gemini models
- `openrouter` - Aggregated model routing
- `local` - Local model support

**Examples:**

```bash
/config show
/config model openrouter-gpt-4o
/config provider openrouter
/config key openai sk-xxxxx
/config validate
```

#### `/complete "partial input"`

AI-powered completion for commands, code, and configuration.

**Examples:**

```bash
/complete "npm run "
/complete "const fetchData = async (url: string) => "
/complete "/agent universal-agent "
```

## 🧠 Cognitive Orchestration Framework

### Task Understanding & Analysis

**Intent Classification:**

- **Create** - New files, components, projects
- **Read** - File analysis, code review, documentation
- **Update** - Modify existing code, refactoring
- **Delete** - Remove files, clean up code
- **Analyze** - Performance, security, architecture review
- **Optimize** - Performance improvements, efficiency
- **Deploy** - Build, test, deploy workflows
- **Test** - Generate, run, validate test suites
- **Debug** - Identify and fix issues
- **Refactor** - Code restructuring and improvements

**Complexity Assessment (1-10 scale):**

- **1-3 (Simple)** - Single file operations, basic commands
- **4-6 (Medium)** - Multi-step workflows, multiple files
- **7-8 (Complex)** - Full project operations, multiple systems
- **9-10 (Extreme)** - Cross-system integration, enterprise scale

### Execution Strategy Selection

**Sequential Strategy** (Complexity ≤ 3)

- Linear workflow with dependencies
- Used for simple file operations and basic commands

**Parallel Strategy** (Complexity 4-6)

- Independent tasks running concurrently
- Optimal for multiple file operations and analysis

**Hybrid Strategy** (Complexity 7-8)

- Mixed approach for complex projects
- Combines sequential and parallel execution

**Adaptive Strategy** (Complexity 9-10)

- Dynamic strategy adjustment based on conditions
- Fallback planning and error recovery

### Agent Coordination System

**Universal Agent (Primary)**

- Cognitive orchestration and task coordination
- Fallback execution for all domains
- Strategic planning and resource allocation

**Specialized Agents**

- **React Agent**: Frontend development, component architecture
- **Backend Agent**: API development, server architecture
- **DevOps Agent**: Infrastructure, deployment, CI/CD
- **Code Review Agent**: Quality assurance, security analysis
- **Optimization Agent**: Performance tuning, efficiency improvements

## 🛠️ Advanced Tooling System

### File Operations

- **read_file** - Read with metadata and structure analysis
- **write_file** - Write with LSP validation and auto-fix
- **edit_file** - Edit with diff preview and backup
- **multi_edit** - Batch atomic operations with rollback

### Git Integration

- **git_tools** - Safe git operations (status, diff, commit, applyPatch)
- **git_workflow** - Repository analysis and workflow suggestions

### Package Management

- **manage_packages** - Autonomous dependency management
- **dependency_analysis** - Security and optimization analysis

### Build Systems

- **execute_command** - Context-aware command execution
- **bash** - Advanced shell operations with streaming

### AI Integration

- **generate_code** - Context-aware code generation
- **code_analysis** - Quality, patterns, security analysis

### Search & Discovery

- **grep** - Advanced pattern search with filtering
- **semantic_search** - Embedding-based content search
- **rag_search** - Context-aware semantic search

### Browser Automation

- **browserbase** - Web browsing automation
- **browser_navigate, browser_click, browser_type** - Element interaction
- **browser_screenshot** - Visual state capture

## 📁 Workspace Organization

### Recommended Project Structure

```
project-root/
├── src/                 # Source code
│   ├── components/      # React components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom hooks
│   ├── utils/          # Utility functions
│   ├── services/       # API services
│   └── types/          # TypeScript definitions
├── public/             # Static assets
├── docs/              # Documentation
├── tests/             # Test suites
├── scripts/           # Build and deployment scripts
└── config/            # Configuration files
```

### File Naming Conventions

- **Components**: PascalCase (UserProfile.tsx)
- **Hooks**: camelCase with "use" prefix (useAuth.ts)
- **Services**: camelCase (authService.ts)
- **Utils**: camelCase (dateUtils.ts)
- **Types**: PascalCase (UserType.ts)
- **Constants**: UPPER_SNAKE_CASE (API_ENDPOINTS.ts)

## 🔧 Environment Setup

### Required Tools

```bash
# Core dependencies
npm install -g nikcli

# System requirements
# - Node.js 18+
# - Git
# - Vim (optional, for vim integration)

# Environment variables
GOAT_EVM_PRIVATE_KEY=your_private_key_here
POLYGON_RPC_URL=https://polygon-rpc.com
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### Optional Integrations

- **VS Code**: Use NikCLI as integrated terminal
- **Vim**: Full integration with custom configuration
- **Docker**: Containerized development environments
- **Git Hooks**: Automated code quality checks

## 🎯 Best Practices

### Code Quality

- **Always validate** with TypeScript strict mode
- **Write tests first** for new functionality
- **Use semantic versioning** for releases
- **Document public APIs** with JSDoc or TypeDoc
- **Follow existing patterns** in the codebase

### Development Workflow

1. **Plan the task** using `/plan` for complex operations
2. **Analyze existing code** with `/analyze`
3. **Create task breakdown** with TaskMaster AI
4. **Execute with appropriate agent** using `/agent`
5. **Validate results** with `/test`
6. **Review changes** with code review agent

### Error Handling

- **Use fallback strategies** for critical operations
- **Log all actions** for debugging
- **Validate inputs** before processing
- **Handle edge cases** gracefully
- **Provide clear feedback** to users

### Security

- **Never expose secrets** in logs or code
- **Validate all inputs** and sanitize outputs
- **Use secure coding practices** and patterns
- **Implement proper error handling** and logging

## 🚀 Getting Started

### Basic Workflow

```bash
# 1. Initialize project
nikcli init my-project --template react-typescript

# 2. Plan your task
nikcli plan "build user authentication system"

# 3. Execute with appropriate agent
nikcli agent backend-agent "implement authentication API"

# 4. Test and validate
nikcli test --unit --coverage

# 5. Deploy
nikcli deploy --env staging
```

### Advanced Usage

```bash
# Complex project analysis
nikcli analyze . --metrics --security --performance

# Web3 integration
nikcli goat init --chains polygon,base

# Parallel development
nikcli agent universal-agent "build dashboard" --parallel

# AI-assisted editing
nikcli vim open src/App.tsx --line 1
# Inside vim: :call NikCliAgent("optimize this component")
```

## 📊 Monitoring & Metrics

### Built-in Metrics

- **Task Completion Rate** - Successful vs failed tasks
- **Execution Time** - Average time per command type
- **Code Quality** - Lint score, test coverage, complexity
- **Error Patterns** - Common failure points
- **Resource Usage** - Memory, CPU, disk utilization

### Performance Optimization

- **Cache frequently used data** and results
- **Use parallel execution** for independent tasks
- **Optimize file operations** with batch processing
- \*\*
