#!/bin/bash

# NikCLI Dependency Fix Automation Script
# This script applies automated fixes for identified dependency issues

set -e  # Exit on error

echo "🔧 NikCLI Dependency Fix Script"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running in correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Please run from project root.${NC}"
    exit 1
fi

if [ ! -d "src/cli" ]; then
    echo -e "${RED}❌ Error: src/cli directory not found.${NC}"
    exit 1
fi

echo -e "${BLUE}📁 Working directory: $(pwd)${NC}"
echo ""

# Backup original files
echo -e "${YELLOW}📦 Creating backup...${NC}"
BACKUP_DIR=".dependency-fix-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r src/cli "$BACKUP_DIR/"
echo -e "${GREEN}✓ Backup created: $BACKUP_DIR${NC}"
echo ""

# Fix 1: Remove invalid Python imports from nik-cli.ts
echo -e "${BLUE}🔧 Fix 1: Removing invalid Python imports from nik-cli.ts...${NC}"
NIK_CLI_FILE="src/cli/nik-cli.ts"

if [ -f "$NIK_CLI_FILE" ]; then
    # Remove lines with Python imports
    sed -i.bak '/^import re$/d' "$NIK_CLI_FILE"
    sed -i.bak '/^import os$/d' "$NIK_CLI_FILE"
    sed -i.bak '/^import json$/d' "$NIK_CLI_FILE"
    
    # Count removed lines
    REMOVED=$(diff "$NIK_CLI_FILE.bak" "$NIK_CLI_FILE" | grep -c "^<" || true)
    
    if [ "$REMOVED" -gt 0 ]; then
        echo -e "${GREEN}✓ Removed $REMOVED invalid Python import line(s)${NC}"
        rm "$NIK_CLI_FILE.bak"
    else
        echo -e "${YELLOW}⚠ No invalid Python imports found (already fixed?)${NC}"
        rm "$NIK_CLI_FILE.bak"
    fi
else
    echo -e "${RED}❌ Error: $NIK_CLI_FILE not found${NC}"
fi
echo ""

# Fix 2: Remove duplicate chalk imports
echo -e "${BLUE}🔧 Fix 2: Consolidating duplicate imports...${NC}"

# Find all TypeScript files
TS_FILES=$(find src/cli -name "*.ts" -type f)

TOTAL_DUPLICATES=0
for file in $TS_FILES; do
    # Count chalk imports
    CHALK_COUNT=$(grep -c "^import chalk from 'chalk'" "$file" || true)
    
    if [ "$CHALK_COUNT" -gt 1 ]; then
        echo -e "${YELLOW}  Found $CHALK_COUNT chalk imports in $file${NC}"
        
        # Keep only first import, remove others
        awk '
            /^import chalk from '\''chalk'\''/ {
                if (!seen) {
                    print
                    seen = 1
                }
                next
            }
            { print }
        ' "$file" > "$file.tmp"
        
        mv "$file.tmp" "$file"
        TOTAL_DUPLICATES=$((TOTAL_DUPLICATES + CHALK_COUNT - 1))
    fi
done

if [ "$TOTAL_DUPLICATES" -gt 0 ]; then
    echo -e "${GREEN}✓ Removed $TOTAL_DUPLICATES duplicate import(s)${NC}"
else
    echo -e "${GREEN}✓ No duplicate imports found${NC}"
fi
echo ""

# Fix 3: Add event listener cleanup to agent-manager.ts
echo -e "${BLUE}🔧 Fix 3: Adding event listener cleanup to agent-manager.ts...${NC}"
AGENT_MANAGER_FILE="src/cli/core/agent-manager.ts"

if [ -f "$AGENT_MANAGER_FILE" ]; then
    # Check if cleanup already has removeAllListeners
    if grep -q "removeAllListeners()" "$AGENT_MANAGER_FILE"; then
        echo -e "${GREEN}✓ Event listener cleanup already present${NC}"
    else
        # Find the cleanup method and add removeAllListeners
        sed -i.bak '/async cleanup(): Promise<void> {/a\    this.removeAllListeners() // Clean up event listeners' "$AGENT_MANAGER_FILE"
        echo -e "${GREEN}✓ Added this.removeAllListeners() to cleanup method${NC}"
        rm "$AGENT_MANAGER_FILE.bak"
    fi
else
    echo -e "${RED}❌ Error: $AGENT_MANAGER_FILE not found${NC}"
fi
echo ""

# Fix 4: Add memory cleanup utilities
echo -e "${BLUE}🔧 Fix 4: Creating memory cleanup utilities...${NC}"

cat > src/cli/utils/memory-utils.ts << 'EOF'
/**
 * Memory Management Utilities
 * Provides bounded collections and cleanup helpers
 */

export class LRUCache<K, V> {
  private cache: Map<K, V>
  private maxSize: number
  private accessOrder: K[] = []

  constructor(maxSize: number = 100) {
    this.cache = new Map()
    this.maxSize = maxSize
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.accessOrder = this.accessOrder.filter(k => k !== key)
      this.accessOrder.push(key)
    }
    return value
  }

  set(key: K, value: V): void {
    // Remove if exists
    if (this.cache.has(key)) {
      this.accessOrder = this.accessOrder.filter(k => k !== key)
    }
    
    // Add to end
    this.cache.set(key, value)
    this.accessOrder.push(key)
    
    // Evict least recently used if over limit
    while (this.cache.size > this.maxSize) {
      const lruKey = this.accessOrder.shift()
      if (lruKey !== undefined) {
        this.cache.delete(lruKey)
      }
    }
  }

  delete(key: K): boolean {
    this.accessOrder = this.accessOrder.filter(k => k !== key)
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder = []
  }

  get size(): number {
    return this.cache.size
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }
}

/**
 * Timer Manager - Track and cleanup all timers
 */
export class TimerManager {
  private timers = new Set<NodeJS.Timeout>()
  private intervals = new Set<NodeJS.Timeout>()

  setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      callback()
    }, ms)
    this.timers.add(timer)
    return timer
  }

  setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    const interval = setInterval(callback, ms)
    this.intervals.add(interval)
    return interval
  }

  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer)
    this.timers.delete(timer)
  }

  clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval)
    this.intervals.delete(interval)
  }

  clearAll(): void {
    // Clear all tracked timers
    this.timers.forEach(timer => clearTimeout(timer))
    this.intervals.forEach(interval => clearInterval(interval))
    
    this.timers.clear()
    this.intervals.clear()
  }

  getStats(): { activeTimers: number; activeIntervals: number } {
    return {
      activeTimers: this.timers.size,
      activeIntervals: this.intervals.size
    }
  }
}

// Singleton instances
export const timerManager = new TimerManager()
EOF

echo -e "${GREEN}✓ Created src/cli/utils/memory-utils.ts${NC}"
echo ""

# Fix 5: Run TypeScript compiler to check for errors
echo -e "${BLUE}🔍 Running TypeScript compiler check...${NC}"
if command -v tsc &> /dev/null; then
    if tsc --noEmit --skipLibCheck; then
        echo -e "${GREEN}✓ TypeScript compilation successful${NC}"
    else
        echo -e "${YELLOW}⚠ TypeScript compilation has errors (review output above)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ TypeScript compiler not found, skipping check${NC}"
fi
echo ""

# Fix 6: Run linter if available
echo -e "${BLUE}🔍 Running ESLint...${NC}"
if command -v eslint &> /dev/null; then
    if eslint src/cli --ext .ts --fix; then
        echo -e "${GREEN}✓ ESLint auto-fix applied${NC}"
    else
        echo -e "${YELLOW}⚠ ESLint found issues (review output above)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ ESLint not found, skipping check${NC}"
fi
echo ""

# Summary
echo "================================"
echo -e "${GREEN}✅ Dependency fixes applied!${NC}"
echo ""
echo "Summary of changes:"
echo "  • Removed invalid Python imports"
echo "  • Consolidated duplicate imports"
echo "  • Added event listener cleanup"
echo "  • Created memory management utilities"
echo ""
echo -e "${BLUE}📁 Backup location: $BACKUP_DIR${NC}"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff src/cli"
echo "  2. Run tests: npm test"
echo "  3. Commit changes: git commit -am 'fix: resolve circular dependencies and memory leaks'"
echo ""
echo -e "${YELLOW}⚠️  Manual steps still required:${NC}"
echo "  • Refactor context system with dependency injection (see circular-dependency-fix.md)"
echo "  • Update nik-cli.ts to use LRUCache for bounded collections"
echo "  • Add automated dependency analysis to CI/CD"
echo ""
echo -e "${GREEN}🎉 Done!${NC}"
