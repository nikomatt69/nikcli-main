# Source Code

This directory contains the complete NikCLI source code implementation.

## Structure

```
src/cli/
├── index.ts                  # Main entry point
├── nik-cli.ts               # Core CLI interface
├── automation/              # Agent system
├── chat/                    # Chat interface components
├── core/                    # Core functionality
├── services/                # Service layer
├── tools/                   # Tool implementations
├── ui/                      # Terminal UI
└── utils/                   # Utilities
```

## Key Files

- **`index.ts`** - Application entry point and system orchestrator
- **`nik-cli.ts`** - Main CLI interface with command handling
- **`register-agents.ts`** - Agent registration and configuration

## Development

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Build
npm run build

# Test
npm test
```

For complete development documentation, visit [nikcli.mintifly.app](https://nikcli.mintifly.app/contributing/development).