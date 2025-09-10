#!/bin/bash

# NikCLI Release Script
# Automates the complete release process

set -e

echo "🚀 NikCLI Release Process"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
print_status "Building release for version: $VERSION"

# Clean previous builds
print_status "Cleaning previous builds..."
rm -rf dist/
rm -rf releases/

# Install dependencies
print_status "Installing dependencies..."
npm install


# Build TypeScript
print_status "Building TypeScript..."
npm run build

# Build binaries
print_status "Building binaries with pkg..."
npm run build:release

# Check if binaries were created
if [ ! -d "releases" ]; then
    print_error "Release directory not created. Build failed."
    exit 1
fi

# Count binaries
BINARY_COUNT=$(ls releases/* 2>/dev/null | wc -l)
print_success "Created $BINARY_COUNT binary files"

# List created files
print_status "Created files:"
ls -la releases/

# Create release archive
print_status "Creating release archive..."
cd releases
tar -czf "nikcli-v${VERSION}-binaries.tar.gz" *
cd ..

# Create GitHub release notes
print_status "Creating GitHub release notes..."
cat > "github-release-notes.md" << EOF
# NikCLI v${VERSION} Release

## 🚀 What's New

- Enhanced Multi-Agent System with Universal Agent
- Advanced Tool Integration with real-time file operations
- Multi-Model AI Support (OpenAI, Anthropic, Google, Ollama)
- Improved Security & Privacy features
- Better streaming performance and error handling

## 📦 Downloads

### Binaries
- **Linux (x64)**: \`nikcli-linux-x64\`
- **macOS (Intel)**: \`nikcli-macos-x64\`
- **macOS (Apple Silicon)**: \`nikcli-macos-arm64\`
- **Windows (x64)**: \`nikcli-win-x64.exe\`

### Archive
- **All Platforms**: \`nikcli-v${VERSION}-binaries.tar.gz\`

## 🔧 Installation

\`\`\`bash
# Download and extract
tar -xzf nikcli-v${VERSION}-binaries.tar.gz

# Make executable (Linux/macOS)
chmod +x nikcli-[platform]

# Run
./nikcli-[platform]
\`\`\`

## 📋 System Requirements

- **OS**: Linux, macOS, Windows
- **Architecture**: x64, ARM64 (macOS)
- **Memory**: 512MB RAM minimum
- **Storage**: 100MB free space

## 🔍 Verification

Check \`checksums.json\` for SHA256 hashes of all binaries.

## 📚 Documentation

- **Complete Docs**: https://nikcli.mintlify.app
- **Quick Start**: https://nikcli.mintlify.app/quickstart/installation
- **CLI Reference**: https://nikcli.mintlify.app/cli-reference/commands-overview

## 🤝 Support

- **GitHub Issues**: https://github.com/nikomatt69/nikcli-main/issues
- **Documentation**: https://nikcli.mintlify.app
- **Community**: https://github.com/nikomatt69/nikcli-main/discussions

---

**🎯 Ready to transform your development workflow? Download and start building with AI-powered agents!**
EOF

print_success "Release process completed!"
print_status "Files created:"
echo "  📁 releases/ - Binary files"
echo "  📄 github-release-notes.md - GitHub release notes"
echo "  📦 releases/nikcli-v${VERSION}-binaries.tar.gz - Release archive"

print_warning "Next steps:"
echo "  1. Review the binaries in releases/"
echo "  2. Test the binaries on different platforms"
echo "  3. Create GitHub release with github-release-notes.md"
echo "  4. Upload binaries to GitHub release"
echo "  5. Update version in package.json for next release"

print_success "🎉 Release ready for GitHub!"
