// TODO: Consider refactoring for reduced complexity
# NikCLI Commands Reference

## Overview

NikCLI is an advanced AI-powered CLI tool for software dev. Use slash commands (starting with `/`) in chat mode to interact. Commands are case-insensitive. For full usage, type `/help` in the CLI.

This file is auto-generated from codebase analysis and manually updated to reflect recent implementations.

## Commands (Alphabetical)

### /agent <agent-name> [options]

- **Description**: Activates a specific AI agent for task execution (e.g., `/agent universal-agent "analyze code"`). Options: `--auto` for autonomous mode, `--plan` for planning first.
- **Example**: `/agent ai-analysis "review my code"`
- **Provider**: All (adapts to current provider, including OpenRouter for routed models).

### /analyze [path] [options]

- **Description**: Performs comprehensive project/code analysis. Options: `--metrics` for code metrics, `--dependencies` for deps scan, `--security` for basic security check.
- **Example**: `/analyze src/ --metrics --security`
- **Provider**: All.

### /build [options]

- **Description**: Builds the project using npm/yarn. Options: `--prod` for production build, `--watch` for dev.
- **Example**: `/build --prod`
- **Provider**: All (uses execute_command tool).

### /complete "partial command"

- **Description**: Generates AI completions for partial input (e.g., code, commands). Uses current model for suggestions.
- **Example**: `/complete "npm run "`
- **Provider**: All.

### /config [subcommand]

- **Description**: Manages config. Subcommands: `show` to display current config, `model <name>` to set model, `key <provider> <key>` to set API key.
- **Example**: `/config show` or `/config model openrouter-gpt-4o`
- **Provider**: All.

### /deploy [options]

- **Description**: Deploys the project (uses npm run deploy or custom). Options: `--env production`.
- **Example**: `/deploy --env staging`
- **Provider**: All (uses execute_command).

### /grep <pattern> [path]

- **Description**: Searches files for pattern (uses grep tool). Options: `--files "*.ts"` for filtering.
- **Example**: `/grep "function" src/`
- **Provider**: All.

### /vim [subcommand] [options]

- **New in v0.2.3**: Enables NikCLI's integrated Vim mode for enhanced editing within the CLI environment. Leverages system Vim with auto-configured .vimrc, plugins, and session management.

- **Subcommands**:
  - `setup`: Generates and installs NikCLI-optimized .vimrc with plugins (NERDTree, ALE, Gruvbox theme, etc.) and vim-plug. Run `:PlugInstall` in Vim after.
    - **Example**: `/vim setup`
  - `open <file>`: Opens file in Vim session with tracking. Supports `--readonly`, `--line <num>`, `--diff <other-file>`.
    - **Example**: `/vim open src/index.ts --line 42`
  - `quick-edit <file> [content]`: Writes content (if provided) and opens in Vim for quick edits.
    - **Example**: `/vim quick-edit notes.md "Add new task"`
  - `diff <file1> <file2>`: Opens side-by-side diff in Vim.
    - **Example**: `/vim diff old.js new.js`
  - `config [get|set|add-plugin|remove-plugin]`: Manages Vim config (themes, plugins, mappings).
    - **Examples**: `/vim config get`, `/vim config add-plugin 'vim-easymotion'`
  - `sessions`: Lists active Vim sessions managed by NikCLI.
    - **Example**: `/vim sessions`

- **Features Reflected**:
  - Auto-generates .vimrc with 10+ plugins, custom mappings (e.g., jj to Esc, leader keys).
  - Session saving/loading in ~/.vim/sessions.
  - Integration with NikCLI for AI-assisted editing (e.g., combine with /agent for code suggestions in Vim).
  - Requires system Vim installed; checks availability.

- **Provider**: All (uses child_process spawning for Vim).

### /goat [action] [options]

- **New Feature**: Native GOAT SDK integration for DeFi operations on Polygon and Base networks. Supports Polymarket prediction markets and ERC20 token operations.

- **Actions**:
  - `init`: Initialize GOAT SDK with wallet and chain configuration
    - **Example**: `/goat init --chains polygon,base --plugins polymarket,erc20`
  - `wallet-info`: Display wallet address and supported chains/plugins
    - **Example**: `/goat wallet-info`
  - `status`: Check GOAT SDK initialization and environment status
    - **Example**: `/goat status`
  - `chat <message>`: Natural language blockchain operations using GOAT tools
    - **Example**: `/goat chat "show me trending prediction markets"`
  - `markets`: List Polymarket prediction markets (Polymarket plugin)
    - **Example**: `/goat markets`
  - `transfer`: Transfer ERC20 tokens (ERC20 plugin)
    - **Example**: `/goat transfer --token USDC --amount 100 --to 0x... --chain base`

- **Required Environment Variables**:
  - `GOAT_EVM_PRIVATE_KEY`: 64-character hex private key (no 0x prefix)
  - `POLYGON_RPC_URL`: Polygon RPC endpoint (optional, defaults to public RPC)
  - `BASE_RPC_URL`: Base RPC endpoint (optional, defaults to public RPC)

- **Supported Networks**: Polygon (137), Base (8453)
- **Supported Plugins**: Polymarket (prediction markets), ERC20 (token operations)
- **Security**: All transactions require user confirmation with detailed previews
- **Provider**: All (uses AI SDK compatible tools via GOAT Vercel adapter)

## 🔗 Web3 Toolchains

NikCLI includes specialized Web3 toolchains for automated blockchain operations:

### Web3 Toolchain Commands
- `/web3-toolchain list` - List available Web3 toolchains
- `/web3-toolchain run <name>` - Execute a Web3 toolchain
- `/web3-toolchain status` - Show active executions
- `/web3-toolchain cancel <id>` - Cancel running execution

### DeFi Shortcuts
- `/defi-toolchain analyze` - DeFi protocol analysis
- `/defi-toolchain yield` - Yield farming optimization
- `/defi-toolchain portfolio` - Multi-chain portfolio management
- `/defi-toolchain bridge` - Cross-chain bridge analysis
- `/defi-toolchain mev` - MEV protection strategy
- `/defi-toolchain governance` - DAO governance analysis

### Available Toolchains
1. **DeFi Analysis** - Protocol analysis and yield optimization
2. **Polymarket Strategy** - Prediction market trading automation
3. **Portfolio Management** - Cross-chain portfolio tracking
4. **NFT Analysis** - Collection analytics and market trends
5. **Smart Contract Audit** - Security analysis and vulnerability detection
6. **Yield Optimizer** - Automated yield farming strategies
7. **Bridge Analysis** - Cross-chain bridge security and routing
8. **MEV Protection** - MEV analysis and protection strategies
9. **Governance Analysis** - DAO proposal analysis and voting
10. **Protocol Integration** - Automated DeFi protocol integration

### Execution Patterns
- **Sequential** - Tools executed one after another
- **Parallel** - Multiple tools run simultaneously
- **Conditional** - Tools executed based on conditions
- **Iterative** - Tools run until convergence

### Safety Features
- **Dry Run Mode** - Test without executing transactions
- **Risk Assessment** - Built-in risk evaluation
- **Gas Monitoring** - Track gas usage and costs
- **Transaction Tracking** - Monitor all blockchain transactions
- **Error Handling** - Comprehensive error reporting

### Additional Commands (from base)

... (other commands remain as previously documented)

**Note**: This reference now includes GOAT SDK integration for DeFi operations and recent Vim integration from commits 0afbf9c and 1e64398. For full list, use `/help` in NikCLI.
