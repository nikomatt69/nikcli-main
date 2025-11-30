#!/bin/bash
# NikCLI Standalone Installer
# Downloads and installs pre-built binary with bundled dependencies

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/usr/local"
BIN_DIR="$INSTALL_DIR/bin"
LIB_DIR="$INSTALL_DIR/lib/nikcli"

# GitHub release URL (update with your repository)
GITHUB_REPO="nikomatt69/nikcli-main"
RELEASE_URL="https://github.com/${GITHUB_REPO}/releases/latest/download"

echo -e "${BLUE}🚀 NikCLI Standalone Installer${NC}"
echo -e "${BLUE}================================${NC}\n"

# Detect platform and architecture
detect_platform() {
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$os" in
        darwin)
            case "$arch" in
                arm64|aarch64)
                    echo "macos-arm64"
                    ;;
                x86_64)
                    echo "macos-x64"
                    ;;
                *)
                    echo -e "${RED}❌ Unsupported architecture: $arch${NC}"
                    exit 1
                    ;;
            esac
            ;;
        linux)
            case "$arch" in
                x86_64|amd64)
                    echo "linux-x64"
                    ;;
                *)
                    echo -e "${RED}❌ Unsupported architecture: $arch${NC}"
                    exit 1
                    ;;
            esac
            ;;
        *)
            echo -e "${RED}❌ Unsupported OS: $os${NC}"
            exit 1
            ;;
    esac
}

PLATFORM=$(detect_platform)
echo -e "${GREEN}✅ Detected platform: ${PLATFORM}${NC}"

# Check if running as root/sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}⚠️  This script requires sudo privileges to install to ${INSTALL_DIR}${NC}"
    echo -e "${BLUE}Re-running with sudo...${NC}\n"
    exec sudo bash "$0" "$@"
fi

# Download package
PACKAGE_NAME="nikcli-${PLATFORM}.tar.gz"
DOWNLOAD_URL="${RELEASE_URL}/${PACKAGE_NAME}"
TMP_DIR=$(mktemp -d)
TMP_FILE="${TMP_DIR}/${PACKAGE_NAME}"

echo -e "${BLUE}📥 Downloading NikCLI...${NC}"
echo -e "${BLUE}URL: ${DOWNLOAD_URL}${NC}"

if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$TMP_FILE" "$DOWNLOAD_URL" || {
        echo -e "${RED}❌ Download failed${NC}"
        rm -rf "$TMP_DIR"
        exit 1
    }
elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$TMP_FILE" "$DOWNLOAD_URL" || {
        echo -e "${RED}❌ Download failed${NC}"
        rm -rf "$TMP_DIR"
        exit 1
    }
else
    echo -e "${RED}❌ Neither curl nor wget found. Please install one of them.${NC}"
    rm -rf "$TMP_DIR"
    exit 1
fi

echo -e "${GREEN}✅ Downloaded${NC}"

# Extract package
echo -e "${BLUE}📦 Extracting package...${NC}"
tar -xzf "$TMP_FILE" -C "$TMP_DIR" || {
    echo -e "${RED}❌ Extraction failed${NC}"
    rm -rf "$TMP_DIR"
    exit 1
}

# Install binary
echo -e "${BLUE}🔧 Installing to ${INSTALL_DIR}...${NC}"

# Create lib directory for dependencies
mkdir -p "$LIB_DIR"

# Copy node_modules
if [ -d "${TMP_DIR}/nikcli-${PLATFORM}/lib/node_modules" ]; then
    echo -e "${BLUE}   Copying dependencies...${NC}"
    cp -R "${TMP_DIR}/nikcli-${PLATFORM}/lib/node_modules" "$LIB_DIR/"
    echo -e "${GREEN}   ✅ Dependencies installed${NC}"
fi

# Copy wrapper script
if [ -f "${TMP_DIR}/nikcli-${PLATFORM}/bin/nikcli" ]; then
    cp "${TMP_DIR}/nikcli-${PLATFORM}/bin/nikcli" "$BIN_DIR/nikcli"
    chmod +x "$BIN_DIR/nikcli"
    echo -e "${GREEN}   ✅ Wrapper script installed${NC}"
fi

# Copy binary
BINARY_NAME="nikcli-${PLATFORM/macos/aarch64-apple-darwin}"
BINARY_NAME="${BINARY_NAME/linux/x86_64-linux}"
BINARY_NAME="${BINARY_NAME/-arm64/-aarch64-apple-darwin}"
BINARY_NAME="${BINARY_NAME/-x64/-x86_64}"

if [ -f "${TMP_DIR}/nikcli-${PLATFORM}/bin/${BINARY_NAME}" ]; then
    cp "${TMP_DIR}/nikcli-${PLATFORM}/bin/${BINARY_NAME}" "$BIN_DIR/${BINARY_NAME}"
    chmod +x "$BIN_DIR/${BINARY_NAME}"
    echo -e "${GREEN}   ✅ Binary installed${NC}"
fi

# Cleanup
rm -rf "$TMP_DIR"

echo -e "\n${GREEN}🎉 NikCLI installed successfully!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🚀 Get started with: ${YELLOW}nikcli${NC}"
echo -e "${GREEN}📚 For help: ${YELLOW}nikcli --help${NC}"
echo -e "${GREEN}🗑️  To uninstall: ${YELLOW}curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/installer/uninstall.sh | bash${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
