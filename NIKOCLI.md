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

### Additional Commands (from base)

... (other commands remain as previously documented)

**Note**: This reference now includes recent Vim integration from commits 0afbf9c and 1e64398. For full list, use `/help` in NikCLI.
