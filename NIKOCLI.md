# NikCLI Commands Reference

## Overview
NikCLI is an advanced AI-powered CLI tool for software development. Use slash commands (starting with `/`) in chat mode to interact. Commands are case-insensitive. For full usage, type `/help` in the CLI. This file is auto-generated from codebase analysis.

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
- **Description**: Builds the project using npm/yarn. Options: `--prod` for production build, `--watch` for development.
- **Example**: `/build --prod`
- **Provider**: All (uses execute_command tool).

### /complete "partial command"
- **Description**: Generates AI completions for partial input (e.g., code, commands). Uses current model for suggestions.
- **Example**: `/complete "npm run "`
- **Provider**: All.

### /config [subcommand]
- **Description**: Manages configuration. Subcommands: `show` to display current config, `model <name>` to set model, `key <provider> <key>` to set API key.
- **Example**: `/config show` or `/config model openrouter-gpt-4o`
- **Provider**: All.

### /deploy [options]
- **Description**: Deploys the project (uses npm run deploy or custom). Options: `--env production`.
- **Example**: `/deploy --env staging`
- **Provider**: All (uses execute_command).

### /grep <pattern> [path]
- **Description**: Searches files for pattern (uses grep tool). Options: `--files "*.ts"` for filter.
- **Example**: `/grep "function add" src/`
- **Provider**: All.

### /help
- **Description**: Shows this help with all commands listed alphabetically.
- **Example**: `/help`
- **Provider**: N/A.

### /init [options]
- **Description**: Initializes project context (creates NIKOCLI.md). Options: `--force` to overwrite.
- **Example**: `/init --force`
- **Provider**: N/A.

### /list [subcommand]
- **Description**: Lists resources. Subcommands: `models` for AI models with status, `files` for workspace files, `agents` for available agents, `tools` for tools.
- **Example**: `/list models` (shows OpenRouter prefixed models if set).
- **Provider**: All.

### /plan [options]
- **Description**: Generates execution plan for a task. Options: `--execute` to run immediately, `--save <file>` to save plan.
- **Example**: `/plan "add authentication"`
- **Provider**: All (uses planning service).

### /read-file <path>
- **Description**: Reads and displays file content (safe read-only).
- **Example**: `/read-file src/main.ts`
- **Provider**: All.

### /search <query> [options]
- **Description**: Semantic search in codebase. Options: `--limit 10` for results count.
- **Example**: `/search "login function"`
- **Provider**: All (uses semantic_search tool).

### /set-key <provider> <key>
- **Description**: Sets API key for a provider (e.g., OpenRouter). Key is encrypted in config.
- **Example**: `/set-key openrouter sk-or-v1-...`
- **Provider**: All.

### /set-model <model-name>
- **Description**: Switches to a specific AI model (e.g., openrouter-claude-3-7-sonnet-20250219 for routed via OpenRouter).
- **Example**: `/set-model openrouter-gpt-4o`
- **Provider**: All.

### /set-provider <provider>
- **Description**: Sets the AI provider (e.g., openrouter for multi-model routing). Prompts for API key if needed.
- **Example**: `/set-provider openrouter`
- **Provider**: All (new integration).

### /test [options]
- **Description**: Runs project tests (npm test). Options: `--watch` for continuous.
- **Example**: `/test`
- **Provider**: All.

### /todo [subcommand]
- **Description**: Manages todos. Subcommands: `list` to show, `add <item>` to add, `complete <id>` to mark done.
- **Example**: `/todo add "Fix bug in login"`
- **Provider**: All.

### /vm [subcommand]
- **Description**: Manages VM/containers. Subcommands: `start <agent>` to start VM, `stop <id>` to stop, `list` for status.
- **Example**: `/vm start universal-agent`
- **Provider**: All.

### /write-file <path> "content"
- **Description**: Writes content to file (requires approval for safety).
- **Example**: `/write-file newfile.ts "console.log('Hello');"`
- **Provider**: All.

## Notes
- **OpenRouter Specific**: After `/set-provider openrouter`, usa modelli prefixed (es. openrouter-gpt-4o). Router dinamico usa baseModel dal config senza hardcoding.
- **Approval**: Comandi risky (write, execute) richiedono conferma.
- **Help in CLI**: Digita `/help` per vedere questa lista in chat.
- **Dynamic Routing**: Per OpenRouter, il router usa modelli configurati (es. openrouter-claude-3-7-sonnet-20250219) automaticamente.

Generated from codebase analysis (all slash commands in SlashCommandHandler). Run `/help` to see in CLI.

**Generated**: $(date +%Y-%m-%dT%H:%M:%S.%3NZ)