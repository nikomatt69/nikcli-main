#!/bin/bash

# NikCLI Rust Implementation Build Script
# This script helps build and test the Rust implementation

set -e

echo "🚀 Building NikCLI Rust Implementation"
echo "======================================"

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust is not installed. Please install Rust first:"
    echo "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "   source ~/.cargo/env"
    exit 1
fi

# Check Rust version
RUST_VERSION=$(rustc --version | cut -d' ' -f2)
echo "✅ Rust version: $RUST_VERSION"

# Check if version is sufficient (1.70+)
REQUIRED_VERSION="1.70.0"
if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$RUST_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ Rust version $RUST_VERSION is too old. Required: $REQUIRED_VERSION or later"
    echo "   Please update Rust: rustup update"
    exit 1
fi

echo ""
echo "🔍 Running checks..."
echo "==================="

# Format check
echo "📝 Checking code formatting..."
if ! cargo fmt -- --check; then
    echo "❌ Code formatting issues found. Run 'cargo fmt' to fix."
    exit 1
fi
echo "✅ Code formatting is correct"

# Clippy check
echo "🔍 Running clippy lints..."
if ! cargo clippy -- -D warnings; then
    echo "❌ Clippy found issues. Please fix them."
    exit 1
fi
echo "✅ Clippy checks passed"

# Compile check
echo "🔨 Checking compilation..."
if ! cargo check; then
    echo "❌ Compilation failed. Please fix the errors."
    exit 1
fi
echo "✅ Compilation successful"

echo ""
echo "🧪 Running tests..."
echo "=================="

# Run tests
if ! cargo test; then
    echo "❌ Tests failed. Please fix the issues."
    exit 1
fi
echo "✅ All tests passed"

echo ""
echo "📦 Building release binary..."
echo "============================="

# Build release
if ! cargo build --release; then
    echo "❌ Release build failed."
    exit 1
fi

echo "✅ Release build successful"

# Show binary info
BINARY_PATH="./target/release/nikcli"
if [ -f "$BINARY_PATH" ]; then
    BINARY_SIZE=$(du -h "$BINARY_PATH" | cut -f1)
    echo "📊 Binary size: $BINARY_SIZE"
    echo "📍 Binary location: $BINARY_PATH"
fi

echo ""
echo "🎉 Build completed successfully!"
echo "==============================="
echo ""
echo "To run NikCLI:"
echo "  $BINARY_PATH --help"
echo ""
echo "To install globally:"
echo "  cargo install --path ."
echo ""
echo "To run tests:"
echo "  cargo test"
echo ""
echo "To run with logging:"
echo "  RUST_LOG=debug $BINARY_PATH chat --verbose"