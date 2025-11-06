// TODO: Consider refactoring for reduced complexity
# 🚀 Dependency Remediation - Action Plan

**Project**: @nicomatt69/nikcli v0.5.0  
**Generated**: 2025-11-06  
**Total Tasks**: 45 | **Critical**: 8 | **High**: 12 | **Medium**: 25

---

## 📋 PHASE 1: EMERGENCY SECURITY FIXES (TODAY - 2 hours)

### Task 1.1: Fix Axios Critical Vulnerability 🔴 CRITICAL

**Time**: 15 minutes | **Impact**: High | **Risk**: Low

```bash
# Step 1: Backup current state
cp package.json package.json.backup
cp package-lock.json package-lock.json.backup 2>/dev/null || true

# Step 2: Update axios
npm install axios@latest --save

# Step 3: Verify version
npm ls axios

# Step 4: Run security check
npm audit

# Step 5: Test
npm run test:run

# Step 6: Verify in code
grep -r "axios" src/ | head -5
```

**Expected Output**:

```
axios@1.7.7+ installed
npm audit: 0 vulnerabilities (from axios)
Tests: PASS
```

**Rollback Plan** (if needed):

```bash
cp package.json.backup package.json
cp package-lock.json.backup package-lock.json
npm ci
```

---

### Task 1.2: Remove Private Key from Repository 🔴 CRITICAL

**Time**: 20 minutes | **Impact**: Critical | **Risk**: Medium

```bash
# Step 1: Remove from current index
git rm --cached nikcli.2025-09-25.private-key.pem

# Step 2: Add to .gitignore
cat >> .gitignore << 'EOF'

# Private keys
*.private-key.pem
*.key
*.pem
.env
.env.local
.env.*.local
EOF

# Step 3: Commit removal
git add .gitignore
git commit -m "chore: exclude private keys from repository"

# Step 4: Verify removal
git ls-files | grep -i key  # Should return nothing
git ls-files | grep -i pem  # Should return nothing

# Step 5: Check recent commits
git log --oneline -5 | grep -i key

# Step 6: If key was in recent commits, force push
# ⚠️  DANGEROUS - Only if absolutely necessary
# git push --force-with-lease origin onchain
```

**Verification**:

```bash
# Ensure key is no longer accessible
file nikcli.2025-09-25.private-key.pem  # Should still exist locally
git show HEAD:nikcli.2025-09-25.private-key.pem 2>&1  # Should fail
```

**Critical Next Step**:

- [ ] Rotate all credentials that used this key
- [ ] Notify security team
- [ ] Check access logs for unauthorized use
- [ ] Update CI/CD secrets

---

### Task 1.3: Update Playwright 🟠 HIGH

**Time**: 15 minutes | **Impact**: Medium | **Risk**: Low

```bash
# Step 1: Update
npm install playwright@latest --save-dev

# Step 2: Verify version jump
npm ls playwright

# Step 3: Run e2e tests
npm run test:run -- --grep "playwright|e2e"

# Step 4: Install browsers if needed
npx playwright install
```

**Expected**:

```
playwright@1.48.2+ installed
E2E Tests: PASS
```

---

### Task 1.4: Update OpenTelemetry Suite 🟠 HIGH

**Time**: 20 minutes | **Impact**: Medium | **Risk**: Low

```bash
# Step 1: Update all OpenTelemetry packages
npm install \
  @opentelemetry/sdk-node@^0.210.0 \
  @opentelemetry/exporter-metrics-otlp-http@^0.210.0 \
  @opentelemetry/exporter-trace-otlp-http@^0.210.0 \
  --save

# Step 2: Verify versions
npm ls | grep opentelemetry

# Step 3: Test observability pipeline
npm run test:run

# Step 4: Check for breaking changes
npm ls @opentelemetry/api
npm ls @opentelemetry/resources
```

---

### Task 1.5: Update Sentry SDKs 🟠 HIGH

**Time**: 15 minutes | **Impact**: Medium | **Risk**: Low

```bash
npm install @sentry/node@latest @sentry/profiling-node@latest --save

# Verify
npm ls @sentry/node

# Test error tracking
npm run test:run
```

---

### Phase 1 Summary

**Total Time**: ~85 minutes | **Tests Required**: YES | **Deployment**: Safe

```bash
# Run all Phase 1 in one go
npm install axios@latest playwright@latest --save
npm install @sentry/node@latest @sentry/profiling-node@latest --save
npm install @opentelemetry/sdk-node@^0.210.0 --save
npm run test:run
```

✅ **Phase 1 Completion Criteria**:

- [ ] Axios updated to latest
- [ ] Private key removed from repo
- [ ] Playwright updated to latest
- [ ] OpenTelemetry updated to ^0.210.0
- [ ] Sentry updated to latest
- [ ] All tests passing
- [ ] No npm audit security issues from these packages

---

## 📋 PHASE 2: CONSOLIDATION & CLEANUP (This Week - 4 hours)

### Task 2.1: Consolidate Linting Tools 🟡 HIGH

**Time**: 90 minutes | **Impact**: Medium | **Risk**: Medium

#### Option A: Keep Biome (RECOMMENDED)

```bash
# Step 1: Backup current config
cp package.json package.json.linting.backup

# Step 2: Remove ESLint and TypeScript-ESLint
npm uninstall \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-plugin-unused-imports \
  --save-dev

# Step 3: Update Biome to latest
npm install @biomejs/biome@^2.4.0 --save-dev

# Step 4: Verify Biome config exists
cat biome.json

# Step 5: Test linting
npm run lint

# Step 6: Update package.json scripts
# Already configured: "lint": "biome lint src/"
# Already configured: "format": "biome format --write src/"
# Already configured: "check": "biome check --write src/"

# Step 7: Run linter on entire codebase
npm run check
```

**Expected Output**:

```
✔ Linting with Biome: PASS
✔ Formatting: PASS
✔ Type checking: PASS
```

**Biome Configuration** (if needed):

```json
{
  "version": "1.0",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false
  }
}
```

---

### Task 2.2: Consolidate YAML Libraries 🟡 MEDIUM

**Time**: 30 minutes | **Impact**: Low | **Risk**: Low

```bash
# Step 1: Audit YAML usage
grep -r "import.*yaml\|require.*yaml" src/ | head -20

# Step 2: Check which is more used
npm ls yaml
npm ls js-yaml

# Step 3: Keep only one (prefer 'yaml')
npm uninstall js-yaml --save

# Step 4: Update imports if needed
# Replace: const yaml = require('js-yaml')
# With: import * as yaml from 'yaml'

# Step 5: Test
npm run typecheck
npm run test:run
```

---

### Task 2.3: Consolidate ID Generation 🟡 MEDIUM

**Time**: 30 minutes | **Impact**: Low | **Risk**: Low

```bash
# Step 1: Audit usage
grep -r "nanoid\|uuid" src/ | wc -l

# Step 2: Pick one (nanoid is smaller)
npm uninstall uuid --save

# Step 3: Replace all imports
# OLD: import { v4 as uuidv4 } from 'uuid'
# NEW: import { nanoid } from 'nanoid'

# Step 4: Test
npm run test:run
```

---

### Task 2.4: Update TypeScript Configuration 🟡 MEDIUM

**Time**: 45 minutes | **Impact**: Medium | **Risk**: Low

```bash
# Step 1: Review all tsconfig files
ls -la tsconfig*.json

# Step 2: Consolidate to 3:
# - tsconfig.json (base)
# - tsconfig.cli.json (CLI overrides)
# - tsconfig.background-agents.json (if needed)

# Step 3: Merge tsconfig.base.json into tsconfig.json
# Copy base content to tsconfig.json

# Step 4: Update references
grep -r "tsconfig" package.json *.ts *.js

# Step 5: Delete redundant files
rm -f tsconfig.base.json tsconfig.vercel.json

# Step 6: Verify build
npm run build

# Step 7: Typecheck
npm run typecheck:strict
```

---

### Task 2.5: Create .env Template 🟡 MEDIUM

**Time**: 20 minutes | **Impact**: High | **Risk**: Low

```bash
# Create .env.example
cat > .env.example << 'EOF'
# AI Providers
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GOOGLE_AI_API_KEY=your_key_here

# Services
SUPABASE_URL=your_url_here
SUPABASE_ANON_KEY=your_key_here

# Monitoring
SENTRY_DSN=your_dsn_here
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Redis
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=your_db_url_here

# Environment
NODE_ENV=development
LOG_LEVEL=debug
EOF

# Add to git
git add .env.example
git commit -m "docs: add .env.example template"

# Update .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

---

### Phase 2 Summary

**Total Time**: ~215 minutes | **Savings**: 15-20MB bundle

```bash
# All Phase 2 commands in order
npm uninstall eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-unused-imports js-yaml uuid --save-dev
npm install @biomejs/biome@^2.4.0 --save-dev
npm run check
npm run test:run
npm run typecheck:strict
npm run build
```

---

## 📋 PHASE 3: OPTIMIZATION (Next 2 Weeks - 6 hours)

### Task 3.1: Implement AI Provider Lazy-Loading 🟡 HIGH IMPACT

**Time**: 2 hours | **Impact**: 50-70MB savings | **Risk**: Medium

**File**: `src/providers/factory.ts`

```typescript
// Lazy-load AI providers to reduce bundle size
type ProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "gateway"
  | "openrouter"
  | "ollama";

const providerLoaders = {
  openai: async () => {
    const { openai } = await import("@ai-sdk/openai");
    return openai;
  },
  anthropic: async () => {
    const { claude } = await import("@ai-sdk/anthropic");
    return claude;
  },
  google: async () => {
    const { google } = await import("@ai-sdk/google");
    return google;
  },
  gateway: async () => {
    const module = await import("@ai-sdk/gateway");
    return module.default;
  },
  openrouter: async () => {
    const module = await import("@openrouter/ai-sdk-provider");
    return module.default;
  },
  ollama: async () => {
    const module = await import("ollama-ai-provider");
    return module.default;
  },
};

// Cache loaded providers
const cache = new Map();

export async function getProvider(name: ProviderName) {
  if (!providerLoaders[name]) {
    throw new Error(`Unknown provider: ${name}`);
  }

  if (cache.has(name)) {
    return cache.get(name);
  }

  const provider = await providerLoaders[name]();
  cache.set(name, provider);
  return provider;
}
```

**Usage**:

```typescript
// Instead of importing all providers at top:
// import { openai } from '@ai-sdk/openai';
// import { claude } from '@ai-sdk/anthropic';

// Use factory:
const provider = await getProvider("openai");
const model = provider("gpt-4");
```

**Testing**:

```bash
# Bundle size before
npm run build
du -sh dist/

# After optimization (should be 50-70MB smaller)
du -sh dist/
```

---

### Task 3.2: Implement Code Splitting 🟡 MEDIUM IMPACT

**Time**: 1.5 hours | **Impact**: 20-40MB conditional savings

**Strategy**: Split by feature area

```typescript
// src/index.ts
export async function initializeCLI(features: string[]) {
  const modules = {};

  if (features.includes("web")) {
    modules.web = await import("./web/index");
  }

  if (features.includes("database")) {
    modules.db = await import("./database/index");
  }

  if (features.includes("blockchain")) {
    modules.blockchain = await import("./blockchain/index");
  }

  return modules;
}
```

---

### Task 3.3: Update All Remaining Packages 🟡 MEDIUM

**Time**: 45 minutes | **Impact**: Bug fixes, security

```bash
# Step 1: Update all patch versions
npm update

# Step 2: Update dev dependencies
npm install --save-dev \
  @types/node@latest \
  typescript@latest \
  vitest@^3.4.1 \
  esbuild@^0.26.0

# Step 3: Audit
npm audit --fix

# Step 4: Test thoroughly
npm run test:run
npm run typecheck:strict
npm run build

# Step 5: Verify everything works
npm start
```

---

### Task 3.4: Update Remaining Minor Versions 🟡 LOW-MEDIUM

**Time**: 1 hour | **Impact**: Minor

```bash
# Update minor versions with testing
npm install \
  marked@^15.1.0 \
  zod@^3.24.1 \
  pino@^10.2.0 \
  ai@^3.5.0 \
  viem@^2.21.0 \
  bun@^1.4.0 \
  --save

npm run test:run
```

---

### Phase 3 Summary

**Total Time**: ~360 minutes | **Savings**: 70-110MB bundle

---

## 📋 PHASE 4: ONGOING MAINTENANCE (Weekly)

### Task 4.1: Setup Dependabot 🟢 ONGOING

```bash
# Create .github/dependabot.yml
mkdir -p .github

cat > .github/dependabot.yml << 'EOF'
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    allow:
      - dependency-type: "production"
      - dependency-type: "development"
    reviewers:
      - "@nicomatt69"
    commit-message:
      prefix: "chore(deps):"
      include: "scope"
EOF

git add .github/dependabot.yml
git commit -m "chore: setup dependabot"
```

---

### Task 4.2: Weekly Security Audit 🟢 ONGOING

```bash
#!/bin/bash
# scripts/weekly-audit.sh

echo "🔒 Running weekly security audit..."

npm audit
npm outdated

echo "📊 Dependency health check complete!"
```

---

### Task 4.3: Monthly Update Schedule 🟢 ONGOING

```bash
#!/bin/bash
# scripts/monthly-update.sh

echo "📦 Running monthly dependency updates..."

# Check for updates
npm outdated

# Ask which to update
read -p "Update all patch versions? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npm update
  npm audit --fix
  npm run test:run
  echo "✅ Updates complete!"
fi
```

---

## 🎯 SUCCESS METRICS

### After Phase 1 (Today)

- [ ] 0 npm audit security issues
- [ ] All tests passing
- [ ] Private key removed
- [ ] Credentials rotated

### After Phase 2 (This Week)

- [ ] Linting consolidated (ESLint removed)
- [ ] Duplicate dependencies removed
- [ ] Reduced from 127 to 115 dependencies
- [ ] Package size: ~5-10MB reduction

### After Phase 3 (Next Sprint)

- [ ] AI providers lazy-loaded
- [ ] Reduced from 115 to 95+ dependencies
- [ ] Bundle size: 70-110MB reduction
- [ ] All tests passing
- [ ] Performance benchmarks established

### Ongoing

- [ ] Weekly security audits
- [ ] Monthly dependency updates
- [ ] Automated dependabot PRs
- [ ] No critical vulnerabilities

---

## ⏱️ Timeline Summary

| Phase       | Duration     | Priority    | Effort | Status          |
| ----------- | ------------ | ----------- | ------ | --------------- |
| **Phase 1** | 1-2 hours    | 🔴 CRITICAL | Low    | **DO TODAY**    |
| **Phase 2** | 3-4 hours    | 🟠 HIGH     | Medium | **THIS WEEK**   |
| **Phase 3** | 5-6 hours    | 🟡 MEDIUM   | High   | **NEXT SPRINT** |
| **Phase 4** | Ongoing      | 🟢 LOW      | Low    | **ALWAYS**      |
| **TOTAL**   | ~15-16 hours | -           | -      | **2-3 WEEKS**   |

---

## 🔄 Rollback Procedures

### Quick Rollback (if needed)

```bash
# Restore from backup
cp package.json.backup package.json
cp package-lock.json.backup package-lock.json
npm ci

# Or use git
git checkout package.json
npm ci
```

### Git Rollback (if issues after commit)

```bash
# Soft reset (keep changes)
git reset --soft HEAD~1

# Hard reset (discard changes)
git reset --hard HEAD~1
```

---

## 📞 Getting Help

If you encounter issues during remediation:

1. **Build Errors**: Check TypeScript compiler output

   ```bash
   npm run typecheck:strict
   npm run build
   ```

2. **Test Failures**: Run tests individually

   ```bash
   npm run test:watch
   ```

3. **Dependency Conflicts**: Check lock file

   ```bash
   npm ci --legacy-peer-deps
   ```

4. **Security Issues**: Use npm audit
   ```bash
   npm audit
   npm audit --fix --force
   ```

---

**Generated**: 2025-11-06  
**Version**: 1.0  
**Status**: Ready for Implementation  
**Next Step**: Execute Phase 1 TODAY
