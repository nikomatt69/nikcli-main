#!/bin/bash
# Universal NikCLI Installation Script
# Supports npm, yarn, pnpm, and bun

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Package managers to try in order of preference
PACKAGE_MANAGERS=("pnpm" "bun" "yarn" "npm")

echo -e "${BLUE}🚀 NikCLI Universal Installer${NC}"
echo -e "${BLUE}================================${NC}"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to get package manager version
get_version() {
    case $1 in
        "npm")
            npm --version 2>/dev/null
            ;;
        "yarn")
            yarn --version 2>/dev/null
            ;;
        "pnpm")
            pnpm --version 2>/dev/null
            ;;
        "bun")
            bun --version 2>/dev/null
            ;;
    esac
}

# Function to install with specific package manager
install_with_manager() {
    local manager=$1
    echo -e "${GREEN}📦 Installing NikCLI with ${manager}...${NC}"

    case $manager in
        "npm")
            npm install -g @nicomatt69/nikcli
            ;;
        "yarn")
            yarn global add @nicomatt69/nikcli
            ;;
        "pnpm")
            pnpm install -g @nicomatt69/nikcli
            ;;
        "bun")
            bun install -g @nicomatt69/nikcli
            ;;
    esac
}

# Check for Node.js
if ! command_exists node; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+ first.${NC}"
    echo -e "${BLUE}Visit: https://nodejs.org/${NC}"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required. Current version: $(node --version)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version) detected${NC}"

# Check available package managers
echo -e "\n${BLUE}🔍 Checking available package managers...${NC}"
available_managers=()

for manager in "${PACKAGE_MANAGERS[@]}"; do
    if command_exists "$manager"; then
        version=$(get_version "$manager")
        echo -e "${GREEN}✅ ${manager} ${version}${NC}"
        available_managers+=("$manager")
    else
        echo -e "${YELLOW}⚠️  ${manager} not found${NC}"
    fi
done

if [ ${#available_managers[@]} -eq 0 ]; then
    echo -e "${RED}❌ No supported package managers found!${NC}"
    echo -e "${BLUE}Please install one of: npm, yarn, pnpm, or bun${NC}"
    exit 1
fi

# Use the first available package manager
preferred_manager=${available_managers[0]}

# Allow user to override
if [ "$1" ]; then
    user_choice="$1"
    if [[ " ${available_managers[@]} " =~ " ${user_choice} " ]]; then
        preferred_manager="$user_choice"
        echo -e "${BLUE}📋 Using user-specified package manager: ${preferred_manager}${NC}"
    else
        echo -e "${YELLOW}⚠️  ${user_choice} not available. Using ${preferred_manager} instead.${NC}"
    fi
fi

echo -e "\n${BLUE}📦 Installing with ${preferred_manager}...${NC}"

# Install NikCLI
if install_with_manager "$preferred_manager"; then
    echo -e "\n${GREEN}🎉 NikCLI installed successfully!${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🚀 Get started with: ${YELLOW}nikcli${NC}"
    echo -e "${GREEN}📚 For help: ${YELLOW}nikcli --help${NC}"
    echo -e "${GREEN}🔧 Configuration: ${YELLOW}nikcli /config${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
else
    echo -e "\n${RED}❌ Installation failed with ${preferred_manager}${NC}"

    # Try other managers
    echo -e "${YELLOW}🔄 Trying alternative package managers...${NC}"
    for manager in "${available_managers[@]}"; do
        if [ "$manager" != "$preferred_manager" ]; then
            echo -e "${BLUE}Trying ${manager}...${NC}"
            if install_with_manager "$manager"; then
                echo -e "\n${GREEN}🎉 NikCLI installed successfully with ${manager}!${NC}"
                exit 0
            fi
        fi
    done

    echo -e "\n${RED}❌ Installation failed with all available package managers.${NC}"
    echo -e "${BLUE}Please try manual installation:${NC}"
    echo -e "${YELLOW}npm install -g @nicomatt69/nikcli${NC}"
    exit 1
fi