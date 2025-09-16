# NikCLI v Release

**Context-Aware AI Development Assistant with Multi-Agent System**

## 📦 Download Binaries

### 🐧 Linux (x64)

- **File**: `nikcli-linux-x64`
- **Size**: ~45MB
- **SHA256**: `[checksum]`
- **Install**: `chmod +x nikcli-linux-x64 && ./nikcli-linux-x64`

### 🍎 macOS (Intel)

- **File**: `nikcli-macos-x64`
- **Size**: ~45MB
- **SHA256**: `[checksum]`
- **Install**: `chmod +x nikcli-macos-x64 && ./nikcli-macos-x64`

### 🍎 macOS (Apple Silicon)

- **File**: `nikcli-macos-arm64`
- **Size**: ~45MB
- **SHA256**: `[checksum]`
- **Install**: `chmod +x nikcli-macos-arm64 && ./nikcli-macos-arm64`

### 🪟 Windows (x64)

- **File**: `nikcli-win-x64.exe`
- **Size**: ~45MB
- **SHA256**: `[checksum]`
- **Install**: Double-click or run from command line

## 🔧 Installation

### Quick Install

```bash
# Download the appropriate binary for your platform
# Make executable (Linux/macOS)
chmod +x nikcli-[platform]

# Run
./nikcli-[platform]
```

### Global Installation

```bash
# Move to a directory in your PATH
sudo mv nikcli-[platform] /usr/local/bin/nikcli

# Run from anywhere
nikcli
```

## ✨ What's New in v0.5.6-beta

### 🤖 Enhanced Multi-Agent System

- **Universal Agent**: Single comprehensive agent with 64+ capabilities
- **Smart Agent Selection**: Automatic routing based on task type
- **Agent Mode**: Focused conversations with specific agents
- **Direct Agent Calls**: `@agent task` syntax for quick execution

### 🔧 Advanced Tool Integration

- **Real-time File Operations**: Read, write, edit files in chat
- **Command Execution**: Safe command running with confirmations
- **Workspace Analysis**: Automatic project structure detection
- **Live Streaming**: Real-time response streaming

### 🎯 Multi-Model AI Support

- **OpenAI**: GPT-4, GPT-3.5 Turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Haiku
- **Google**: Gemini Pro, Gemini 1.5 Flash
- **Ollama**: Local model support
- **Runtime Model Switching**: `/model` command

### 🛡️ Security & Privacy

- **Local First**: Works entirely on your machine
- **Encrypted API Keys**: AES-256-GCM encryption
- **Approval System**: Interactive confirmations for sensitive operations
- **No Data Collection**: Your code stays private

## 🚀 Key Features

### Autonomous Development

```bash
# Start autonomous mode
/auto "create a React login component with validation"

# Use specific agent
/agent universal-agent "optimize this API for performance"

# Direct agent call
@universal-agent "set up CI/CD pipeline"
```

### Interactive Commands

```bash
# Help and navigation
/help
/agents
/cd /path/to/project
/pwd
/ls

# Configuration
/config
/model claude-3.5-sonnet
```

### File Operations

```bash
# Read files
read_file src/components/App.tsx

# Edit files
edit_file src/components/App.tsx "Add new feature"

# Execute commands
run_command npm install
```

## 📋 System Requirements

- **Node.js**: 18+ (for development)
- **OS**: Linux, macOS, Windows
- **Architecture**: x64, ARM64 (macOS)
- **Memory**: 512MB RAM minimum
- **Storage**: 100MB free space

## 🔍 Verification

### Verify Checksums

```bash
# Linux/macOS
sha256sum nikcli-[platform]

# Windows (PowerShell)
Get-FileHash nikcli-win-x64.exe -Algorithm SHA256
```

### Compare with Release Checksums

Check the `checksums.json` file in this release for the correct SHA256 values.

## 🐛 Known Issues

- **macOS Gatekeeper**: You may need to allow the app in Security & Privacy settings
- **Windows Defender**: May flag as suspicious (false positive)
- **ARM64 Linux**: Not yet supported (use x64 with emulation)

## 🔄 Migration from Previous Versions

### From v0.3.1-beta

- No breaking changes
- Enhanced agent capabilities
- Improved error handling
- Better streaming performance

### From v0.2.x

- New agent system architecture
- Updated configuration format
- Enhanced security features

## 📚 Documentation

- **Complete Docs**: [nikcli.mintifly.app](https://nikcli.mintlify.app)
- **Quick Start**: [Installation Guide](https://nikcli.mintlify.app/quickstart/installation)
- **CLI Reference**: [Commands Overview](https://nikcli.mintlify.app/cli-reference/commands-overview)
- **Agent System**: [Agent Documentation](https://nikcli.mintlify.app/agent-system/overview)

## 🤝 Support

- **GitHub Issues**: [Bug reports and feature requests](https://github.com/nikomatt69/nikcli-main/issues)
- **Documentation**: [Complete guides](https://nikcli.mintlify.app)
- **Community**: [Discussions and help](https://github.com/nikomatt69/nikcli-main/discussions)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**🎯 Ready to transform your development workflow? Download and start building with AI-powered agents!**

**Visit [nikcli.mintifly.app](https://nikcli.mintlify.app) for complete documentation and tutorials.**
