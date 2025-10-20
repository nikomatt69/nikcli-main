# NikCLI Rust - Advanced AI-powered CLI Assistant

A Rust implementation of NikCLI, providing a powerful command-line interface for interacting with various AI models.

## Features

- **Interactive Chat Interface**: Engage in conversations with AI models using an intuitive CLI
- **Multiple AI Providers**: Support for Claude, GPT-4, and other models via OpenRouter
- **Agent System**: Specialized agents for different tasks (coding, planning, documentation, testing)
- **Planning Mode**: Break down complex tasks into actionable plans
- **Slash Commands**: Quick access to common operations
- **Token Tracking**: Monitor token usage and estimated costs
- **Session Management**: Save and restore conversation sessions
- **Configuration Management**: Easy setup and customization

## Installation

### Prerequisites

- Rust 1.70 or later
- An API key for OpenRouter, Anthropic, or OpenAI

### Build from Source

```bash
cd nikcli-rust
cargo build --release
```

The binary will be available at `target/release/nikcli`

### Install

```bash
cargo install --path .
```

## Configuration

NikCLI will look for configuration in the following locations:
- Linux: `~/.config/nikcli-rust/config.json`
- macOS: `~/Library/Application Support/com.nikcli.nikcli-rust/config.json`
- Windows: `%APPDATA%\nikcli\nikcli-rust\config\config.json`

### Environment Variables

Set your API key using environment variables:

```bash
export OPENROUTER_API_KEY="your-api-key"
# Or for direct API access:
export ANTHROPIC_API_KEY="your-api-key"
export OPENAI_API_KEY="your-api-key"
```

You can also set the default model:

```bash
export NIKCLI_MODEL="anthropic/claude-3.5-sonnet"
```

## Usage

### Start Interactive Chat

```bash
nikcli
# or
nikcli chat
```

### Use a Specific Model

```bash
nikcli --model "anthropic/claude-3.5-sonnet"
nikcli -m "openai/gpt-4"
```

### Use an Agent

```bash
nikcli agent code "Review my Rust code for performance issues"
nikcli agent plan "Design a microservices architecture"
```

### Generate a Plan

```bash
nikcli plan "Build a REST API with authentication"
nikcli plan "Refactor legacy codebase" --execute
```

### Manage Configuration

```bash
nikcli config --show
nikcli config --model "anthropic/claude-3-opus"
```

### Other Commands

```bash
nikcli status        # Show system status
nikcli agents        # List available agents
nikcli models        # List available models
```

## Slash Commands

While in interactive chat mode, you can use these slash commands:

- `/help` - Show help information
- `/exit` - Exit the CLI
- `/clear` - Clear chat history
- `/model <name>` - Switch AI model
- `/agent <name> <task>` - Execute a specific agent
- `/plan <description>` - Create an execution plan
- `/status` - Show current status
- `/config` - Show configuration
- `/agents` - List available agents
- `/models` - List available models

## Available Agents

- **general** - General purpose AI assistant
- **code** - Code-focused development agent
- **plan** - Planning and architecture agent
- **docs** - Documentation specialist
- **test** - Testing and quality assurance agent

## Supported Models

NikCLI supports various models through OpenRouter:

- **Claude 3.5 Sonnet** (`anthropic/claude-3.5-sonnet`)
- **Claude 3 Opus** (`anthropic/claude-3-opus`)
- **GPT-4** (`openai/gpt-4`)
- **GPT-3.5 Turbo** (`openai/gpt-3.5-turbo`)

And many more available through OpenRouter.

## Architecture

```
nikcli-rust/
├── src/
│   ├── main.rs              # Entry point and CLI argument parsing
│   ├── cli/                 # CLI interface and session management
│   │   ├── mod.rs
│   │   ├── nik_cli.rs       # Main NikCLI structure
│   │   └── options.rs       # Command options
│   ├── core/                # Core functionality
│   │   ├── mod.rs
│   │   ├── agent_manager.rs # Agent registration and execution
│   │   ├── chat_manager.rs  # Chat session management
│   │   ├── config_manager.rs# Configuration handling
│   │   ├── planning_manager.rs # Plan creation and execution
│   │   ├── session_context.rs  # Session state management
│   │   ├── token_manager.rs    # Token tracking and cost estimation
│   │   └── ai_provider.rs      # AI API integration
│   ├── commands/            # Command handlers
│   │   ├── mod.rs
│   │   └── slash_commands.rs   # Slash command implementation
│   └── ui/                  # UI components
│       ├── mod.rs
│       ├── ui_manager.rs    # Terminal UI utilities
│       └── banner.rs        # Welcome banner
└── Cargo.toml
```

## Development

### Running Tests

```bash
cargo test
```

### Code Formatting

```bash
cargo fmt
```

### Linting

```bash
cargo clippy
```

## Comparison with TypeScript Version

This Rust implementation provides core functionality from the original TypeScript NikCLI:

| Feature | TypeScript | Rust |
|---------|-----------|------|
| Interactive Chat | ✓ | ✓ |
| AI Providers | ✓ | ✓ |
| Agent System | ✓ | ✓ |
| Planning Mode | ✓ | ✓ |
| Slash Commands | ✓ | ✓ |
| Token Tracking | ✓ | ✓ |
| Session Management | ✓ | ✓ |
| Configuration | ✓ | ✓ |
| Streaming Responses | ✓ | ⏳ (TODO) |
| MCP Integration | ✓ | ⏳ (TODO) |
| Browser Automation | ✓ | ⏳ (TODO) |
| VM System | ✓ | ⏳ (TODO) |

## Performance Benefits

The Rust implementation offers several advantages:

- **Speed**: Faster startup time and lower memory usage
- **Safety**: Memory safety guarantees and no garbage collection pauses
- **Concurrency**: Built-in async/await with Tokio for efficient I/O
- **Binary Distribution**: Single binary with no runtime dependencies

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT

## Acknowledgments

This is a Rust port of the original NikCLI TypeScript implementation.
