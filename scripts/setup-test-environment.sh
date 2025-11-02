#!/bin/bash

#####################################
# NikCLI Test Environment Setup Script
# 
# Usage:
#   ./scripts/setup-test-environment.sh [preset]
#   ./scripts/setup-test-environment.sh default
#   ./scripts/setup-test-environment.sh benchmark
#####################################

set -e

PRESET=${1:-default}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=========================================="
echo "🚀 NikCLI Test Environment Setup"
echo "=========================================="
echo ""
echo "📍 Preset: $PRESET"
echo "📁 Project Root: $PROJECT_ROOT"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Step 1: Check prerequisites
log_info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js >= 22.0.0"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    log_error "npm not found. Please install npm"
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)

log_success "Node.js: $NODE_VERSION"
log_success "npm: $NPM_VERSION"

# Step 2: Create directory structure
log_info "Creating directory structure..."

mkdir -p "$PROJECT_ROOT/tests/config"
mkdir -p "$PROJECT_ROOT/tests/setup"
mkdir -p "$PROJECT_ROOT/tests/data/benchmarks"
mkdir -p "$PROJECT_ROOT/tests/data/benchmarks/humaneval/problems"
mkdir -p "$PROJECT_ROOT/tests/data/benchmarks/mbpp/problems"
mkdir -p "$PROJECT_ROOT/tests/data/benchmarks/codexglue/problems"
mkdir -p "$PROJECT_ROOT/tests/data/custom"
mkdir -p "$PROJECT_ROOT/tests/helpers"
mkdir -p "$PROJECT_ROOT/tests/fixtures"
mkdir -p "$PROJECT_ROOT/test-results/logs"
mkdir -p "$PROJECT_ROOT/test-results/metrics"
mkdir -p "$PROJECT_ROOT/test-results/benchmark-metrics"
mkdir -p "$PROJECT_ROOT/test-results/benchmark-logs"
mkdir -p "$PROJECT_ROOT/.test-env"

log_success "Created test environment directories"

# Step 3: Install dependencies
log_info "Verifying and installing dependencies..."

cd "$PROJECT_ROOT"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    log_warning "node_modules not found, installing dependencies..."
    npm install
    log_success "Dependencies installed"
else
    log_success "Dependencies already installed"
    npm install --save-dev vitest @vitest/ui typescript @types/node --save-optional
fi

# Step 4: Build TypeScript files
log_info "Building TypeScript setup files..."

npx tsc tests/setup/environment-validator.ts --target es2020 --module commonjs --skipLibCheck --outDir tests/setup/dist --declaration || true
npx tsc tests/setup/benchmark-dataset-manager.ts --target es2020 --module commonjs --skipLibCheck --outDir tests/setup/dist --declaration || true

log_success "TypeScript files processed"

# Step 5: Run setup
log_info "Running test environment setup with preset: $PRESET..."

npx tsx tests/setup/test-environment-setup.ts $PRESET

# Step 6: Validate setup
log_info "Validating test environment setup..."

if [ -f "test-results/environment-report.md" ]; then
    log_success "Environment report generated"
    cat test-results/environment-report.md
else
    log_warning "Environment report not found"
fi

echo ""
echo "=========================================="
echo "✅ Test Environment Setup Complete!"
echo "=========================================="
echo ""
echo "📋 Next Steps:"
echo "  1. Review environment report:"
echo "     cat test-results/environment-report.md"
echo ""
echo "  2. Validate environment:"
echo "     npm run test:system"
echo ""
echo "  3. Run quick benchmark:"
echo "     npm run benchmark:quick"
echo ""
echo "  4. Run full test suite:"
echo "     npm test"
echo ""
echo "📚 Documentation: tests/README.md"
echo ""
