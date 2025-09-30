# NikCLI Commands Reference

## Overview

NikCLI is an advanced AI-powered CLI tool for software dev. Use slash commands (starting with `/`) in chat mode to interact. Commands are case-insensitive. For full usage, type `/help` in the CLI.

This file is auto-generated from codebase analysis.

## Commands (Alphabetical)

### /agent &lt;agent-name&gt; [options]

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

- **Description**: Manages config. Subcommands: `show` to display current config, `model &lt;name&gt;` to set model, `key &lt;provider&gt; &lt;key&gt;` to set API key.
- **Example**: `/config show` or `/config model openrouter-gpt-4o`
- **Provider**: All.

### /deploy [options]

- **Description**: Deploys the project (uses npm run deploy or custom). Options: `--env production`.
- **Example**: `/deploy --env staging`
- **Provider**: All (uses execute_command).

### /grep &lt;pattern&gt; [path]

- **Description**: Searches files for pattern (uses grep tool). Options: `--files "*.ts"` for filt...
