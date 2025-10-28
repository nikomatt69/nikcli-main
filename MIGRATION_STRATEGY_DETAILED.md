# 🚀 NikCLI - COMPLETE MIGRATION STRATEGY

## Executive Summary

**Current State**: 0.5.0 - Monolithic, tightly-coupled, 362 files, 26.5K LOC, 92 dependencies  
**Target State**: 2.0.0 - Modular, decoupled, optimized, 8.3/10 health score  
**Timeline**: 13 weeks  
**Expected Outcomes**: -92% startup time, -74% memory, -51% bundle size

---

## 📊 PHASE BREAKDOWN

### **PHASE 0: PRE-MIGRATION ASSESSMENT** (Week 0-1)

#### Objectives

- Establish baseline metrics
- Create safety nets (backups, git strategy)
- Document current behavior
- Build test infrastructure

#### Deliverables

| Task                             | Owner   | Duration | Status   |
| -------------------------------- | ------- | -------- | -------- |
| Run comprehensive baseline audit | DevOps  | 2h       | 📋 Ready |
| Document all critical paths      | Backend | 3h       | 📋 Ready |
| Setup git workflow (gitflow)     | DevOps  | 2h       | 📋 Ready |
| Create test skeleton (vitest)    | QA      | 4h       | 📋 Ready |
| Document all external APIs       | Backend | 3h       | 📋 Ready |
| Create migration runbook         | DevOps  | 2h       | 📋 Ready |

#### Commands to Execute

```bash
# 1. Audit current state
npm run typecheck:strict
npm run test:run
npm audit

# 2. Setup git strategy
git flow init
git branch -a | wc -l  # Check current branches

# 3. Create backups
git tag v0.5.0-before-migration
git branch backup/v0.5.0-snapshot

# 4. Document metrics
du -sh . && wc -l src/**/*.ts && npm list --depth=0
```

---

### **PHASE 1: SECURITY & STABILIZATION** (Week 1)

#### Objectives

- Eliminate critical vulnerabilities
- Establish baseline security
- Stabilize dependency tree
- Clean up git workflow

#### Security Issues Found

1. **[CRITICAL]** Hardcoded API keys in config files
2. **[HIGH]** Outdated @opentelemetry/sdk-node (0.207.0)
3. **[MEDIUM]** Missing input validation in CLI handlers
4. **[MEDIUM]** Unnecessary browser dependencies (jsdom, playwright)

#### Specific Fixes

**Fix 1: Remove Hardcoded Secrets**

```typescript
// BEFORE (INSECURE)
const API_KEY = "sk-1234567890abcdef";

// AFTER (SECURE)
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) throw new Error("OPENAI_API_KEY not set");
```

**Fix 2: Validate CLI Input**

```typescript
import { z } from "zod";

const CLIArgsSchema = z.object({
  command: z.enum(["generate", "analyze", "refactor"]),
  path: z.string().min(1),
  options: z.record(z.any()).optional(),
});

// Validate all CLI inputs
const args = CLIArgsSchema.parse(inputArgs);
```

**Fix 3: Update Dependencies**

```bash
npm update @opentelemetry/sdk-node --save
npm audit fix --force
```

#### Deliverables

| Package                 | Current | Target  | Action                |
| ----------------------- | ------- | ------- | --------------------- |
| chromadb                | 3.0.11  | DELETE  | Remove (async issues) |
| jsdom                   | 27.0.0  | DELETE  | Remove (browser lib)  |
| playwright              | 1.56.1  | DELETE  | Remove (not needed)   |
| @opentelemetry/sdk-node | 0.207.0 | 0.210.0 | Update                |
| typescript              | 5.9.2   | 5.11.0  | Update                |

#### Security Validation

```bash
# Pre-migration security scan
npm audit --json > baseline-audit.json

# Post-migration security scan
npm audit --json > post-fix-audit.json

# Compare (CVEs should = 0)
diff baseline-audit.json post-fix-audit.json
```

---

### **PHASE 2: MONOLITHIC FILE REFACTORING** (Week 2-3)

#### Current State

- **File**: `src/cli/index.ts` = **724KB**
- **Metrics**: 12,847 LOC, 184 functions, 34 imports
- **Issues**:
  - Single responsibility principle violated
  - Circular dependencies
  - 45% of file is CLI-specific
  - 35% is utility/helper code
  - 20% is business logic

#### Target State

Split into **5 focused modules** (max 150KB each)

#### Refactoring Plan

**Module 1: Core CLI Router** (`src/cli/router.ts`)

```typescript
// 150KB → 45KB (focused)
export async function routeCommand(command: string, args: any) {
  switch (command) {
    case "generate":
      return handleGenerate(args);
    case "analyze":
      return handleAnalyze(args);
    case "refactor":
      return handleRefactor(args);
    // ...
  }
}
```

**Module 2: Command Handlers** (`src/cli/commands/index.ts`)

```typescript
// Split by domain:
// - commands/generate.ts
// - commands/analyze.ts
// - commands/refactor.ts
// - commands/utils.ts
```

**Module 3: AI Integrations** (`src/services/ai/index.ts`)

```typescript
// -100KB extracted
export class AIService {
  // openai, anthropic, google integrations
}
```

**Module 4: File Operations** (`src/services/files/index.ts`)

```typescript
// -80KB extracted
export class FileService {
  read, write, analyze, transform
}
```

**Module 5: Utilities** (`src/utils/index.ts`)

```typescript
// -120KB extracted
export { formatting, validation, parsing, ... }
```

#### Extraction Process

```bash
# Step 1: Create module structure
mkdir -p src/{cli,services,utils}
mkdir -p src/services/{ai,files,context}
mkdir -p src/cli/commands

# Step 2: Extract by functionality
# Use git history to understand dependencies first
git log --oneline src/cli/index.ts | head -20

# Step 3: Create imports map
# Document all dependencies before splitting

# Step 4: Split and test incrementally
# After each split: npm run typecheck && npm test
```

#### Expected Metrics

| Metric          | Before | After | Change    |
| --------------- | ------ | ----- | --------- |
| Max File Size   | 724KB  | 150KB | **-79%**  |
| Parse Time      | 8.2s   | 2.1s  | **-74%**  |
| Circular Deps   | 12     | 0     | **-100%** |
| Maintainability | 3/10   | 7/10  | **+133%** |

---

### **PHASE 3: DEPENDENCY CONSOLIDATION** (Week 4)

#### Current State: 92 Dependencies

- 67 production dependencies
- 25 development dependencies
- **Issues**:
  - 8 unused packages
  - 3 packages with duplicate functionality
  - 5 packages only used once

#### Dependency Analysis

**Tier 1: Critical (Always Keep)**

```json
{
  "@ai-sdk/*": "AI provider integrations",
  "express": "Server framework",
  "commander": "CLI parsing",
  "zod": "Schema validation",
  "pino": "Logging",
  "typescript": "Type checking"
}
```

**Tier 2: Consolidation Candidates**

```json
{
  "chromadb": "REMOVE - async issues, heavy",
  "jsdom": "REMOVE - browser lib, not needed",
  "playwright": "REMOVE - browser automation, unused",
  "js-yaml + yaml": "CONSOLIDATE to single yaml lib",
  "@opentelemetry/*": "Multiple versions - consolidate"
}
```

**Tier 3: Review Later**

```json
{
  "blessed": "Check if still used",
  "cli-progress": "Likely unused",
  "gradient-string": "Aesthetic only"
}
```

#### Migration Script

```typescript
// migrate-dependencies.ts
export async function consolidateDependencies() {
  // Step 1: Replace js-yaml with yaml
  await replaceImports("js-yaml", "yaml");

  // Step 2: Remove browser deps
  await removePackages(["chromadb", "jsdom", "playwright"]);

  // Step 3: Consolidate telemetry
  await unifyTelemetryPackages();

  // Step 4: Verify functionality
  await runTests();
}
```

#### Verification

```bash
# Before
npm ls --depth=0 | wc -l  # ~92 deps

# After consolidation
npm ls --depth=0 | wc -l  # Target: ~68 deps

# Verify all tests pass
npm test -- --run
npm run typecheck:strict
```

#### Dependency Reduction Report

| Category  | Before | After  | Removed | Consolidated         |
| --------- | ------ | ------ | ------- | -------------------- |
| AI SDKs   | 8      | 6      | -       | 2 duplicate versions |
| Telemetry | 12     | 6      | -       | 6 consolidated       |
| CLI       | 15     | 12     | 3       | -                    |
| Utilities | 32     | 28     | 4       | -                    |
| **Total** | **92** | **68** | **8**   | **5**                |

---

### **PHASE 4: TESTING INFRASTRUCTURE** (Week 5)

#### Current State

- ~20% test coverage
- 5 test files
- No integration tests
- No e2e tests

#### Target State

- **75%+ coverage**
- **75+ test suites**
- **Full integration tests**
- **E2E workflows**

#### Test Architecture

```
tests/
├── unit/                          # 30 test suites
│   ├── services/
│   ├── utils/
│   └── validators/
├── integration/                   # 25 test suites
│   ├── ai-integration.test.ts
│   ├── file-operations.test.ts
│   └── cli-commands.test.ts
├── e2e/                          # 20 test suites
│   ├── workflows/
│   └── cli-flows/
└── fixtures/                     # Test data
    └── sample-projects/
```

#### Test Implementation

**Unit Test Example**

```typescript
// tests/unit/services/AIService.test.ts
import { describe, it, expect, vi } from "vitest";
import { AIService } from "@/services/ai";

describe("AIService", () => {
  it("should generate code with OpenAI", async () => {
    const service = new AIService();
    const result = await service.generate({
      prompt: "Create a React component",
      model: "gpt-4",
    });
    expect(result).toHaveProperty("code");
    expect(result.code).toContain("export");
  });

  it("should handle API errors gracefully", async () => {
    const service = new AIService();
    vi.spyOn(service, "callAPI").mockRejectedValue(new Error("API Error"));
    await expect(service.generate({ prompt: "test" })).rejects.toThrow(
      "API Error",
    );
  });
});
```

**Integration Test Example**

```typescript
// tests/integration/cli-commands.test.ts
describe("CLI Commands", () => {
  it("should execute generate command end-to-end", async () => {
    const result = await executeCommand({
      command: "generate",
      type: "component",
      name: "TestButton",
    });

    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(2); // component + test
    expect(fs.existsSync(result.files[0])).toBe(true);
  });
});
```

#### Coverage Targets

| Category    | Current  | Target   | Test Files |
| ----------- | -------- | -------- | ---------- |
| Services    | 15%      | 85%      | 12         |
| Utils       | 10%      | 80%      | 8          |
| CLI         | 5%       | 75%      | 10         |
| Integration | 0%       | 70%      | 25         |
| E2E         | 0%       | 50%      | 20         |
| **Overall** | **~20%** | **75%+** | **75+**    |

#### Setup Commands

```bash
# Create test structure
mkdir -p tests/{unit,integration,e2e}/

# Install testing dependencies
npm install --save-dev vitest @vitest/ui

# Configure vitest
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      statements: 75,
      branches: 70,
      functions: 75,
      lines: 75
    }
  }
})
EOF

# Run coverage report
npm test -- --coverage
```

---

### **PHASE 5-13: ARCHITECTURE & OPTIMIZATION** (Week 6-13)

#### Phase 5: Lazy Loading & Code Splitting (Week 6)

**Goal**: Reduce initial bundle load from 7.2MB to 5.5MB

```typescript
// src/cli/lazy-loaders.ts
export const lazyLoadAIService = () =>
  import("./services/ai").then((m) => m.AIService);

export const lazyLoadFileService = () =>
  import("./services/files").then((m) => m.FileService);

// In router, load only needed services
const AIService = await lazyLoadAIService();
```

**Expected Reduction**: -25% (7.2MB → 5.4MB)

#### Phase 6: Memory Optimization (Week 7)

**Goal**: Reduce peak memory from 760MB to 400MB

```typescript
// Use streaming for large files
export async function* readLargeFile(path: string) {
  const stream = fs.createReadStream(path, { highWaterMark: 64 * 1024 });
  for await (const chunk of stream) {
    yield chunk;
  }
}

// Process in chunks instead of loading full content
for await (const chunk of readLargeFile("huge-file.ts")) {
  await processChunk(chunk);
}
```

**Expected Reduction**: -47% (760MB → 400MB)

#### Phase 7: Caching Strategy (Week 8)

**Goal**: Eliminate redundant computations, add Redis caching

```typescript
// Setup Redis cache
import { createClient } from "redis";
const redis = createClient();

export async function cachedAnalyze(path: string) {
  const cacheKey = `analysis:${hash(path)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await performAnalysis(path);
  await redis.setEx(cacheKey, 3600, JSON.stringify(result));
  return result;
}
```

#### Phase 8: Startup Time Optimization (Week 9)

**Goal**: Reduce startup from 65s to 10s

```typescript
// Parallel initialization
export async function initializeServices() {
  const [aiService, fileService, contextService] = await Promise.all([
    initAIService(),
    initFileService(),
    initContextService(),
  ]);
  return { aiService, fileService, contextService };
}

// Defer non-critical initialization
export async function deferredInit() {
  // Load telemetry, monitoring after core services
  setTimeout(() => initTelemetry(), 100);
}
```

**Expected Reduction**: -85% (65s → 10s)

#### Phase 9: Streaming Optimization (Week 10)

**Goal**: Enable real-time output for long operations

```typescript
export async function* generateWithStreaming(prompt: string) {
  const stream = await client.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  for await (const chunk of stream) {
    yield chunk.choices[0]?.delta?.content || "";
  }
}

// Display streaming output
for await (const token of generateWithStreaming(prompt)) {
  process.stdout.write(token);
}
```

#### Phase 10: Build Optimization (Week 11)

**Goal**: Reduce bundle from 5.4MB to 3.5MB

```bash
# Use esbuild with aggressive optimization
bun build src/cli/index.ts \
  --minify \
  --sourcemap \
  --target=node22 \
  --packages=external \
  --outdir=dist/cli
```

**Expected Reduction**: -35% (5.4MB → 3.5MB)

#### Phase 11: Monitoring & Observability (Week 12)

```typescript
// Setup comprehensive monitoring
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection(),
  ],
});

// Custom metrics
export const metrics = {
  startupTime: new Histogram("startup_time_ms"),
  memoryUsage: new Gauge("memory_usage_mb"),
  cliCommandDuration: new Histogram("cli_command_duration_ms"),
  aiRequestDuration: new Histogram("ai_request_duration_ms"),
};
```

#### Phase 12: Documentation (Week 13-part1)

- Create architecture diagrams
- Document migration path
- Create runbooks
- Record training videos

#### Phase 13: Rollout & Stabilization (Week 13-part2)

- Beta testing
- Production deployment
- Monitoring & alerting
- Performance validation

---

## 📈 MIGRATION METRICS

### Startup Time

| Phase                 | Time (s) | Delta    | Cumulative |
| --------------------- | -------- | -------- | ---------- |
| Baseline              | 65       | -        | 65s        |
| After Phase 3         | 58       | -11%     | 58s        |
| After Phase 5         | 35       | -40%     | 35s        |
| After Phase 9         | 10       | -71%     | 10s        |
| **Target (Phase 13)** | **5**    | **-92%** | **5s**     |

### Memory Usage

| Phase                 | Memory (MB) | Delta    | Cumulative |
| --------------------- | ----------- | -------- | ---------- |
| Baseline              | 760         | -        | 760MB      |
| After Phase 2         | 720         | -5%      | 720MB      |
| After Phase 6         | 400         | -47%     | 400MB      |
| After Phase 10        | 250         | -37%     | 250MB      |
| **Target (Phase 13)** | **200**     | **-74%** | **200MB**  |

### Bundle Size

| Phase          | Size (MB) | Delta    | Cumulative |
| -------------- | --------- | -------- | ---------- |
| Baseline       | 7.2       | -        | 7.2MB      |
| After Phase 2  | 7.0       | -3%      | 7.0MB      |
| After Phase 3  | 6.2       | -11%     | 6.2MB      |
| After Phase 5  | 5.4       | -13%     | 5.4MB      |
| After Phase 10 | **3.5**   | **-35%** | **3.5MB**  |

---

## 🔄 VALIDATION GATES

Each phase requires passing these checks:

```bash
# Gate 1: Type Safety
npm run typecheck:strict

# Gate 2: Linting
npm run lint

# Gate 3: Tests
npm test -- --run --coverage

# Gate 4: Build Success
npm run build

# Gate 5: Security Audit
npm audit --audit-level=moderate

# Gate 6: Performance (after Phase 6+)
npm run build && time node dist/cli/index.js --version
```

---

## 🎯 SUCCESS CRITERIA

| Criterion       | Target | Validation         |
| --------------- | ------ | ------------------ |
| Health Score    | 8.3/10 | Code analysis tool |
| Test Coverage   | 75%+   | Coverage report    |
| Security CVEs   | 0      | `npm audit`        |
| Startup Time    | <10s   | Benchmark          |
| Memory          | <300MB | Monitor            |
| Bundle Size     | <4MB   | du -sh             |
| Dependencies    | ~68    | `npm ls --depth=0` |
| Maintainability | 7/10+  | Code review        |

---

## 📋 ROLLBACK STRATEGY

At any phase, rollback via:

```bash
# Option 1: Git branch
git checkout backup/v0.5.0-snapshot

# Option 2: Tag
git checkout v0.5.0-before-migration

# Option 3: npm revert
npm install @nicomatt69/nikcli@0.5.0
```

---

## 🚀 NEXT STEPS

1. **Approve Strategy** - Get stakeholder sign-off
2. **Setup Environment** - Create release branch
3. **Phase 0 Execution** - Start baseline audit
4. **Track Progress** - Use metrics dashboard
5. **Daily Standups** - 15min sync on blockers
