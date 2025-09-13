# Documentation

Complete NikCLI documentation source files for the documentation website at [nikcli.mintifly.app](https://nikcli.mintlify.app).

## Structure

```
docs/
├── quickstart/              # Getting started guides
├── cli-reference/           # Command reference documentation
├── agent-system/            # Agent architecture and usage
├── configuration/           # Configuration guides
├── api-reference/           # API documentation
├── user-guide/              # User workflows and patterns
├── examples/                # Code examples and tutorials
├── troubleshooting/         # Common issues and solutions
├── contributing/            # Development and contribution guides
└── images/                  # Documentation assets
```

## Key Files

- **`introduction.mdx`** - Main documentation homepage
- **`mint.json`** - Mintlify configuration
- **`ide-diagnostic-server.md`** - IDE integration documentation

## Documentation Framework

- **Framework**: Mintlify
- **Format**: MDX (Markdown with React components)
- **Components**: Cards, Tabs, Accordions, Code blocks
- **Icons**: Lucide icon library

## Local Development

```bash
# Install Mintlify CLI
npm install -g mintlify

# Start local server
mintlify dev

# Build for production
mintlify build
```

## Contributing

See [contributing guidelines](https://nikcli.mintlify.app/contributing/development) for documentation standards and review process.
