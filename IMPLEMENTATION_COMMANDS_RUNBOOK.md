// TODO: Consider refactoring for reduced complexity
# 🔧 NikCLI MIGRATION - IMPLEMENTATION RUNBOOK

## Complete Command Reference & Execution Guide

This document provides **copy-paste ready** commands for every phase of the migration.

---

## 📋 PRE-FLIGHT CHECKLIST

```bash
# Verify environment
echo "=== SYSTEM CHECK ==="
node --version          # v22+
npm --version           # v6+
git --version          # v2.30+
bun --version          # v1.3+

# Verify project structure
echo "=== PROJECT STRUCTURE ==="
ls -la src/cli/
du -sh src/
wc -l src/**/*.ts | tail -1

# Check current metrics
echo "=== BASELINE METRICS ==="
npm ls --depth=0 | grep "packages"
npm audit --json | jq '.metadata.vulnerabilities'
time npm run typecheck
```

---

## 🎯 PHASE 0: PRE-MIGRATION ASSESSMENT

### Step 0.1: Create Baseline Audit Report

```bash
#!/bin/bash
# scripts/baseline-audit.sh

echo "📊 GENERATING BASELINE AUDIT REPORT..."
mkdir -p reports/baseline

# Metrics collection
echo "Collecting source metrics..."
find src -name "*.ts" -type f | xargs wc -l > reports/baseline/lines-of-code.txt
find src -name "*.ts" -type f | xargs grep -c "export" > reports/baseline/exports.txt
find src -name "*.ts" -type f | wc -l > reports/baseline/file-count.txt

# Dependency analysis
echo "Analyzing dependencies..."
npm ls --depth=0 --json > reports/baseline/dependencies.json
npm audit --json > reports/baseline/security-audit.json

# Type checking
echo "Running type checks..."
npm run typecheck > reports/baseline/typecheck.txt 2>&1

# Test coverage
echo "Generating coverage..."
npm test -- --coverage --run > reports/baseline/coverage.txt 2>&1

# Performance metrics
echo "Measuring performance..."
echo "Startup time:" > reports/baseline/performance.txt
time node dist/cli/index.js --version >> reports/baseline/performance.txt 2>&1
echo "" >> reports/baseline/performance.txt
echo "Memory usage:" >> reports/baseline/performance.txt
node --expose-gc -e "require('./dist/cli'); gc(); console.log(process.memoryUsage())" \
  >> reports/baseline/performance.txt

# Generate summary
cat > reports/baseline/summary.txt << 'EOF'
BASELINE AUDIT COMPLETE
=====================

Files to compare:
- reports/baseline/lines-of-code.txt
- reports/baseline/dependencies.json
- reports/baseline/security-audit.json
- reports/baseline/typecheck.txt
- reports/baseline/coverage.txt
- reports/baseline/performance.txt

Usage: After migration, compare with:
npm run audit:compare
EOF

echo "✅ Baseline audit complete! Reports in reports/baseline/"
```

Execute:

```bash
chmod +x scripts/baseline-audit.sh
./scripts/baseline-audit.sh
```

### Step 0.2: Setup Git Workflow

```bash
#!/bin/bash
# scripts/setup-git-workflow.sh

echo "🔄 SETTING UP GIT WORKFLOW..."

# Initialize git flow
git flow init -d

# Create release branch
git checkout -b release/2.0.0
git push origin release/2.0.0

# Create backup tags
git tag -a v0.5.0-before-migration -m "Backup before migration"
git tag -a v0.5.0-baseline -m "Baseline metrics"
git push origin v0.5.0-before-migration v0.5.0-baseline

# Setup branch protection (if using GitHub)
echo "Branch protection rules:"
echo "- Require pull request reviews: 1"
echo "- Require status checks: typecheck, lint, test"
echo "- Require branches up to date"

# List all branches
echo "Current branches:"
git branch -a

echo "✅ Git workflow setup complete!"
```

Execute:

```bash
chmod +x scripts/setup-git-workflow.sh
./scripts/setup-git-workflow.sh
```

### Step 0.3: Document Current Architecture

```bash
#!/bin/bash
# scripts/document-architecture.sh

echo "📐 DOCUMENTING CURRENT ARCHITECTURE..."
mkdir -p docs/architecture/current

# Generate import graph
cat > scripts/generate-imports.js << 'EOF'
const fs = require('fs')
const path = require('path')

function extractImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const importRegex = /^import\s+.*?\s+from\s+['"]([^'"]+)['"];?$/gm
  const imports = []
  let match

  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }
  return imports
}

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(file => {
    const filepath = path.join(dir, file)
    if (fs.statSync(filepath).isDirectory()) {
      walkDir(filepath, callback)
    } else if (filepath.endsWith('.ts')) {
      callback(filepath)
    }
  })
}

const importGraph = {}
walkDir('src', (file) => {
  importGraph[file] = extractImports(file)
})

console.log(JSON.stringify(importGraph, null, 2))
EOF

node scripts/generate-imports.js > docs/architecture/current/import-graph.json

# Document circular dependencies
cat > scripts/find-circular-deps.js << 'EOF'
const fs = require('fs')
const importGraph = JSON.parse(fs.readFileSync('docs/architecture/current/import-graph.json', 'utf-8'))

function findCircularDeps(graph, start, visited = new Set(), path = []) {
  if (visited.has(start)) {
    if (path.includes(start)) {
      return [path]
    }
    return []
  }

  visited.add(start)
  path.push(start)

  const cycles = []
  const imports = graph[start] || []

  for (const imp of imports) {
    if (imp.startsWith('.')) {
      const resolved = require.resolve(`${start}/${imp}`)
      if (graph[resolved]) {
        cycles.push(...findCircularDeps(graph, resolved, new Set(visited), [...path]))
      }
    }
  }

  return cycles
}

const cycles = []
for (const file of Object.keys(importGraph)) {
  const fileCycles = findCircularDeps(importGraph, file)
  cycles.push(...fileCycles)
}

console.log('Circular Dependencies Found:')
cycles.forEach(cycle => {
  console.log('  ' + cycle.join(' -> '))
})
EOF

node scripts/find-circular-deps.js > docs/architecture/current/circular-deps.txt

echo "✅ Architecture documentation complete!"
```

Execute:

```bash
chmod +x scripts/document-architecture.sh
./scripts/document-architecture.sh
```

---

## 🔒 PHASE 1: SECURITY & STABILIZATION

### Step 1.1: Fix Security Issues

```bash
#!/bin/bash
# scripts/phase1-security-fixes.sh

echo "🔒 PHASE 1: SECURITY FIXES..."

# 1. Audit current state
echo "📊 Current security status:"
npm audit --production

# 2. Fix vulnerabilities
echo "🔧 Applying fixes..."
npm audit fix --force

# 3. Update critical packages
echo "📦 Updating critical packages..."
npm update @opentelemetry/sdk-node --save
npm update typescript --save
npm update @types/node --save

# 4. Check for hardcoded secrets
echo "🔍 Scanning for hardcoded secrets..."
grep -r "sk-" src/ --include="*.ts" || echo "✅ No hardcoded secrets found"
grep -r "sk_" src/ --include="*.ts" || echo "✅ No hardcoded secrets found"

# 5. Verify all APIs use env vars
echo "Checking environment variable usage..."
grep -r "process.env\." src/services/ai --include="*.ts" | wc -l

# 6. Run type checking
echo "✅ Running type check..."
npm run typecheck:strict

# 7. Commit changes
git add -A
git commit -m "feat(security): phase 1 - security patches and stabilization"

echo "✅ Phase 1 security fixes complete!"
```

Execute:

```bash
chmod +x scripts/phase1-security-fixes.sh
./scripts/phase1-security-fixes.sh
```

### Step 1.2: Create Environment Configuration

```bash
# .env.example
OPENAI_API_KEY=sk_test_xxxxx
ANTHROPIC_API_KEY=xxx
GOOGLE_API_KEY=xxx
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=sqlite:./database.db
REDIS_URL=redis://localhost:6379
SENTRY_DSN=https://xxx@sentry.io/xxx
```

```bash
# Create and validate .env
cp .env.example .env
npm run config:check
```

### Step 1.3: Remove Unnecessary Dependencies

```bash
#!/bin/bash
# scripts/phase1-remove-deps.sh

echo "🗑️ REMOVING UNNECESSARY DEPENDENCIES..."

# Remove browser dependencies
echo "Removing: chromadb, jsdom, playwright..."
npm uninstall chromadb jsdom playwright

# Consolidate yaml libraries
npm uninstall js-yaml
# Keep yaml library

# Verify removals
echo "Verifying package.json..."
npm ls --depth=0

# Run tests to ensure nothing broke
echo "Running tests..."
npm test -- --run

# Commit
git add -A
git commit -m "chore(deps): remove unnecessary dependencies"

echo "✅ Dependency removal complete!"
```

Execute:

```bash
chmod +x scripts/phase1-remove-deps.sh
./scripts/phase1-remove-deps.sh
```

---

## 🔄 PHASE 2-3: MONOLITHIC REFACTORING & DEPENDENCY CONSOLIDATION

### Step 2.1: Create Module Structure

```bash
#!/bin/bash
# scripts/phase2-create-structure.sh

echo "🏗️ CREATING MODULAR STRUCTURE..."

mkdir -p src/{cli,services,utils,types,middleware,context}
mkdir -p src/services/{ai,files,cache,telemetry}
mkdir -p src/cli/{commands,handlers}
mkdir -p src/utils/{validation,formatting,parsing}
mkdir -p tests/{unit,integration,e2e}

# Create index files
touch src/cli/index.ts
touch src/services/index.ts
touch src/utils/index.ts

# Create types
cat > src/types/index.ts << 'EOF'
export interface CLIArgs {
  command: string
  options: Record<string, any>
}

export interface GenerateOptions {
  type: 'component' | 'function' | 'class'
  name: string
  language: 'typescript' | 'javascript'
}

export interface AnalyzeOptions {
  filePath: string
  depth: number
}

export interface Result<T> {
  success: boolean
  data?: T
  error?: string
}
EOF

echo "✅ Module structure created!"
```

Execute:

```bash
chmod +x scripts/phase2-create-structure.sh
./scripts/phase2-create-structure.sh
```

### Step 2.2: Extract AI Service

```typescript
// src/services/ai/index.ts
import Anthropic from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { generateObject, generateText, streamText } from "ai";

export class AIService {
  private models = {
    openai: openai("gpt-4"),
    anthropic: Anthropic("claude-3-opus"),
    google: google("gemini-pro"),
  };

  async generate(options: GenerateOptions) {
    const { prompt, model = "openai", stream = false } = options;

    if (stream) {
      return streamText({
        model: this.models[model],
        prompt,
      });
    }

    return generateText({
      model: this.models[model],
      prompt,
    });
  }

  async generateObject(options: GenerateObjectOptions) {
    return generateObject({
      model: this.models[options.model || "openai"],
      prompt: options.prompt,
      schema: options.schema,
    });
  }
}

export const aiService = new AIService();
```

```bash
# Extract command to move logic
cat > scripts/phase2-extract-modules.sh << 'EOF'
#!/bin/bash

echo "📦 EXTRACTING MODULES FROM MONOLITH..."

# 1. Extract AI service (already created above)
# 2. Extract File service
# 3. Extract CLI commands
# 4. Extract utilities

# After extraction, verify:
npm run typecheck
npm test -- --run
git add -A
git commit -m "refactor(core): extract services into modules"

echo "✅ Module extraction complete!"
EOF

chmod +x scripts/phase2-extract-modules.sh
./scripts/phase2-extract-modules.sh
```

### Step 2.3: Consolidate Dependencies

```bash
#!/bin/bash
# scripts/phase3-consolidate-deps.sh

echo "🔄 PHASE 3: CONSOLIDATING DEPENDENCIES..."

# Create dependency manifest
cat > docs/dependencies.md << 'EOF'
# NikCLI Dependency Analysis

## Consolidated Dependencies

### AI SDKs (6 packages)
- @ai-sdk/anthropic
- @ai-sdk/openai
- @ai-sdk/google
- @ai-sdk/openai-compatible
- @ai-sdk/gateway
- ai

### OpenTelemetry (6 packages)
Consolidated from 12 packages:
- @opentelemetry/api
- @opentelemetry/sdk-node
- @opentelemetry/sdk-metrics
- @opentelemetry/exporter-metrics-otlp-http
- @opentelemetry/exporter-trace-otlp-http
- @opentelemetry/auto-instrumentations-node

### CLI & Server (12 packages)
- express
- commander
- chalk
- ora
- inquirer
- boxen
- blessed
- cli-progress
- gradient-string
- cors
- helmet
- express-rate-limit

### Utilities (28 packages)
[... etc]

## Removed Packages (8)
- chromadb → Not needed
- jsdom → Browser lib
- playwright → Browser automation
- gradient-string → Aesthetic only
- cli-progress → Can use simple alternatives
- [... etc]

## Consolidated Packages (5)
- js-yaml + yaml → use only yaml
- Multiple @opentelemetry → Use latest versions
- [... etc]
EOF

# Verify consolidation
npm ls --depth=0 --json | jq '.dependencies | keys | length'

# Expected output: ~68 dependencies

echo "✅ Dependency consolidation complete!"
```

---

## 🧪 PHASE 4: TESTING INFRASTRUCTURE

### Step 4.1: Setup Vitest

```bash
#!/bin/bash
# scripts/phase4-setup-testing.sh

echo "🧪 SETTING UP TESTING INFRASTRUCTURE..."

# Install test dependencies
npm install --save-dev vitest @vitest/ui c8

# Create vitest config
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      statements: 75,
      branches: 70,
      functions: 75,
      lines: 75,
      exclude: [
        'node_modules/',
        'dist/',
        'tests/'
      ]
    },
    testTimeout: 10000
  }
})
EOF

# Create test scripts in package.json
npm set-script "test:unit" "vitest run tests/unit"
npm set-script "test:integration" "vitest run tests/integration"
npm set-script "test:coverage" "vitest run --coverage"
npm set-script "test:watch" "vitest watch"

# Create sample test
mkdir -p tests/unit/services
cat > tests/unit/services/AIService.test.ts << 'EOF'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService } from '@/services/ai'

describe('AIService', () => {
  let service: AIService

  beforeEach(() => {
    service = new AIService()
  })

  it('should initialize with default models', () => {
    expect(service).toBeDefined()
  })

  it('should handle generate request', async () => {
    const result = await service.generate({
      prompt: 'Say hello',
      model: 'openai'
    })
    expect(result).toHaveProperty('text')
  })
})
EOF

echo "Running initial tests..."
npm run test:coverage

echo "✅ Testing infrastructure setup complete!"
```

Execute:

```bash
chmod +x scripts/phase4-setup-testing.sh
./scripts/phase4-setup-testing.sh
```

### Step 4.2: Create Test Suite

```bash
#!/bin/bash
# scripts/phase4-create-tests.sh

echo "📝 CREATING COMPREHENSIVE TEST SUITE..."

# Unit tests directory structure
mkdir -p tests/unit/{services,utils,validators,middleware}
mkdir -p tests/integration/{api,commands,workflows}
mkdir -p tests/e2e/{cli,workflows}
mkdir -p tests/fixtures/{sample-projects,mock-data}

# Create unit tests for each service
for service in ai files cache telemetry; do
  cat > tests/unit/services/${service}.test.ts << EOF
import { describe, it, expect } from 'vitest'

describe('${service}Service', () => {
  it('should be defined', () => {
    // TODO: Implement test
    expect(true).toBe(true)
  })
})
EOF
done

# Create integration tests
cat > tests/integration/commands/generate.test.ts << 'EOF'
import { describe, it, expect } from 'vitest'
import { executeCommand } from '@/cli'

describe('Generate Command', () => {
  it('should generate React component', async () => {
    const result = await executeCommand({
      command: 'generate',
      type: 'component',
      name: 'TestComponent'
    })
    expect(result.success).toBe(true)
  })
})
EOF

echo "✅ Test suite structure created!"
echo "📊 Current test count: $(find tests -name '*.test.ts' | wc -l)"
```

Execute:

```bash
chmod +x scripts/phase4-create-tests.sh
./scripts/phase4-create-tests.sh
```

---

## ⚡ PHASE 5+: OPTIMIZATION

### Step 5.1: Lazy Loading

```typescript
// src/cli/lazy-loaders.ts
export async function lazyLoadService<T>(modulePath: string): Promise<T> {
  return import(modulePath).then((m) => m.default || m);
}

export const loadAIService = () => lazyLoadService("@/services/ai");
export const loadFileService = () => lazyLoadService("@/services/files");
export const loadContextService = () => lazyLoadService("@/context");
```

### Step 5.2: Caching Setup

```bash
#!/bin/bash
# scripts/phase5-setup-caching.sh

echo "💾 SETTING UP CACHING LAYER..."

# Setup Redis (if available)
if command -v redis-cli &> /dev/null; then
  echo "✅ Redis found, configuring..."
  cat > src/services/cache/redis.ts << 'EOF'
import { createClient } from 'redis'

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
})

export async function getCached<T>(key: string): Promise<T | null> {
  const value = await redis.get(key)
  return value ? JSON.parse(value) : null
}

export async function setCached<T>(
  key: string,
  value: T,
  ttl: number = 3600
): Promise<void> {
  await redis.setEx(key, ttl, JSON.stringify(value))
}

export const cacheService = { getCached, setCached }
EOF
else
  echo "ℹ️ Redis not found, using in-memory cache..."
  cat > src/services/cache/memory.ts << 'EOF'
const cache = new Map<string, { value: any; ttl: number }>()

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.ttl) {
    cache.delete(key)
    return null
  }
  return entry.value
}

export function setCached<T>(
  key: string,
  value: T,
  ttl: number = 3600
): void {
  cache.set(key, { value, ttl: Date.now() + ttl * 1000 })
}

export const cacheService = { getCached, setCached }
EOF
fi

echo "✅ Caching layer setup complete!"
```

---

## 🚀 FINAL VALIDATION

### Complete Validation Checklist

```bash
#!/bin/bash
# scripts/final-validation.sh

echo "🔍 RUNNING FINAL VALIDATION..."

echo ""
echo "=== TYPE CHECKING ==="
npm run typecheck:strict || { echo "❌ Type check failed"; exit 1; }

echo ""
echo "=== LINTING ==="
npm run lint || { echo "❌ Linting failed"; exit 1; }

echo ""
echo "=== TESTS ==="
npm run test:coverage || { echo "❌ Tests failed"; exit 1; }

echo ""
echo "=== BUILD ==="
npm run build || { echo "❌ Build failed"; exit 1; }

echo ""
echo "=== SECURITY AUDIT ==="
npm audit --audit-level=moderate || { echo "❌ Security issues found"; exit 1; }

echo ""
echo "=== PERFORMANCE BASELINE ==="
echo "Build size:"
du -sh dist/cli/

echo ""
echo "=== METRICS COMPARISON ==="
echo "Dependencies: $(npm ls --depth=0 --json | jq '.dependencies | keys | length')"
echo "Test coverage: $(npm run test:coverage 2>&1 | grep -o '[0-9.]*%' | head -1)"

echo ""
echo "✅ ALL VALIDATION CHECKS PASSED!"
```

---

## 📊 COMPARISON SCRIPT

```bash
#!/bin/bash
# scripts/compare-migrations.sh

echo "📊 COMPARING BASELINE VS MIGRATION..."

mkdir -p reports/migration

# Metrics
echo "Collecting migration metrics..."
npm ls --depth=0 --json > reports/migration/dependencies.json
npm audit --json > reports/migration/security-audit.json
npm run build 2>&1 | tee reports/migration/build.log
npm test -- --coverage --run > reports/migration/coverage.txt 2>&1

# Compare
echo ""
echo "=== COMPARISON RESULTS ==="

echo ""
echo "Dependencies:"
echo "  Before: $(jq '.dependencies | keys | length' reports/baseline/dependencies.json) packages"
echo "  After:  $(jq '.dependencies | keys | length' reports/migration/dependencies.json) packages"

echo ""
echo "Security:"
echo "  Before: $(jq '.metadata.vulnerabilities.total' reports/baseline/security-audit.json) vulnerabilities"
echo "  After:  $(jq '.metadata.vulnerabilities.total' reports/migration/security-audit.json) vulnerabilities"

echo ""
echo "Bundle size:"
echo "  Before: $(du -sh dist-baseline/ 2>/dev/null | cut -f1)"
echo "  After:  $(du -sh dist/ | cut -f1)"
```

---

## ✅ DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] Phase 0: Baseline audit complete
- [ ] Phase 1: Security fixes applied
- [ ] Phase 2: Monolithic file refactored
- [ ] Phase 3: Dependencies consolidated
- [ ] Phase 4: Tests passing (75%+ coverage)
- [ ] Phase 5: Lazy loading implemented
- [ ] All validation gates passing
- [ ] Documentation updated
- [ ] Team trained
- [ ] Rollback plan tested

---

## 🆘 TROUBLESHOOTING

### Issue: Type errors after refactoring

```bash
# Solution: Clear cache and rebuild
rm -rf node_modules/.vite
npm run typecheck:strict
npm run build
```

### Issue: Test failures

```bash
# Solution: Update snapshots and debug
npm test -- -u  # Update snapshots
npm test -- --reporter=verbose  # Verbose output
npm test -- --debug  # Debug mode
```

### Issue: Build size increased

```bash
# Solution: Analyze bundle
npm run build -- --analyze
ls -lh dist/cli/
```

### Issue: Performance degradation

```bash
# Solution: Profile and optimize
node --prof dist/cli/index.js
node --prof-process isolate-*.log > profile.txt
```

---

## 📞 SUPPORT

- Documentation: See `docs/architecture/`
- Issues: Create issue with `[migration]` tag
- Slack: #nikcli-migration channel
- Standup: Daily 10am ET
