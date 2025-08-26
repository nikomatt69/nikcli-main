# CLI Source Code

Core NikCLI implementation with modular architecture.

## Key Components

### Entry Points
- **`index.ts`** - System orchestrator and startup
- **`nik-cli.ts`** - Main CLI interface (422KB+)
- **`register-agents.ts`** - Agent system initialization

### Major Modules
- **`automation/`** - AI agent system and orchestration
- **`chat/`** - Interactive chat and command handling
- **`core/`** - Configuration, memory, and core services
- **`services/`** - Service layer (agent, tool, planning services)
- **`tools/`** - Secure tool registry and implementations
- **`ui/`** - Terminal UI components

## Architecture

NikCLI follows a service-oriented architecture with:
- Stream-based message processing
- Event-driven agent communication
- Secure tool execution with approval system
- Modular service layer with clear separation of concerns

See [nikcli.mintifly.app/contributing](https://nikcli.mintifly.app/contributing/development) for detailed architecture documentation.