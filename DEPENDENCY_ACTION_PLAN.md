// TODO: Consider refactoring for reduced complexity
# 🚀 Dependency Update Action Plan

**Project**: @nicomatt69/nikcli v0.5.0  
**Created**: November 6, 2025  
**Priority**: 🔴 CRITICAL

---

## Quick Reference: What To Do Right Now

### ⚡ Emergency Actions (Today - 30 mins)

1. **Check for Active Vulnerabilities**

   ```bash
   npm audit --audit-level=moderate
   ```

2. **Update Critical Package**

   ```bash
   npm install axios@latest --save
   ```

3. **Verify No Breaking Changes**

   ```bash
   npm test:run
   npm run typecheck:strict
   ```

4. **Commit & Document**
   ```bash
   git add package.json package-lock.json
   git commit -m "fix(security): update axios to patch critical CVE"
   git push
   ```

---

## Phased Update Schedule

### 🔴 Phase 1: Critical Security (This Week)

**Objective**: Patch critical vulnerabilities before deployment

#### Step-by-Step:

```bash
# 1. Backup current state
git status
git stash  # if needed

# 2. Update axios (CRITICAL)
npm install axios@latest --save

# 3. Full audit check
npm audit

# 4. Run all tests
npm test:run
npm run typecheck:strict
npm run lint

# 5. Create test build
npm run build

# 6. Commit
git add package.json package-lock.json
git commit -m "fix(security): update axios CVE, run full test suite"

# 7. Push to feature branch for review
git push origin fix/security-updates
```

**Estimated Time**: 45 minutes  
**Risk Level**: ✅ Low (security patch)  
**Rollback**: Easy (revert commit)

---

### 🟠 Phase 2: High Priority Updates (This Week - Next Week)

**Objective**: Update important dependencies for stability & performance

#### Step 1: Playwright Update

```bash
npm install playwright@latest --save

# Verify browser compatibility
npm test:run

# Update playwright binaries if needed
npx playwright install
```

#### Step 2: OpenTelemetry Stack Update

```bash
# Update all OpenTelemetry packages
npm install \
  @opentelemetry/sdk-node@latest \
  @opentelemetry/exporter-metrics-otlp-http@latest \
  @opentelemetry/exporter-trace-otlp-http@latest \
  @opentelemetry/api@latest \
  @opentelemetry/auto-instrumentations-node@latest \
  --save

# Test observability
npm test:system
npm run test:coherence

# Monitor for tracing pipeline issues
npm run dev  # Watch logs
```

#### Step 3: Type System Updates

```bash
npm install \
  typescript@latest \
  @types/node@latest \
  --save-dev

# Strict type checking
npm run typecheck:strict
```

**Estimated Time**: 2-3 hours  
**Risk Level**: 🟡 Medium (test thoroughly)  
**Monitoring**: Check logs for tracing/observability issues

---

### 🟡 Phase 3: Medium Priority (This Month)

**Objective**: Modernize development tools & dependencies

#### Step 1: Build Tools

```bash
npm install \
  @biomejs/biome@latest \
  esbuild@latest \
  --save-dev

# Update config if needed (check biome changelog)
npm run check  # Biome formatting
npm run lint   # Biome linting
```

#### Step 2: Testing Framework

```bash
npm install \
  vitest@latest \
  @vitest/ui@latest \
  --save-dev

# Test runner still works
npm test:watch

# Test UI still responsive
npm test -- --ui
```

#### Step 3: Sentry Updates

```bash
npm install \
  @sentry/node@latest \
  @sentry/profiling-node@latest \
  --save

# Verify error tracking still works
npm run dev  # Trigger test error
```

**Estimated Time**: 4-5 hours  
**Risk Level**: 🟡 Medium  
**Testing**: Full test suite + manual verification

---

### 🟢 Phase 4: Low Priority (Next Month)

**Objective**: Keep dependencies fresh

#### Step 1: AI & SDK Updates

```bash
npm install \
  ai@latest \
  @ai-sdk/anthropic@latest \
  @ai-sdk/openai@latest \
  @ai-sdk/google@latest \
  --save

# Test AI provider integrations
npm run test:run -- tests/ai-providers
```

#### Step 2: Utility Updates

```bash
npm install \
  zod@latest \
  viem@latest \
  marked@latest \
  --save

# Type validation tests
npm test:run -- tests/validation
```

#### Step 3: Runtime Updates

```bash
npm install \
  bun@latest \
  --save

# Update build process if needed
npm run build
npm run build:bun
```

**Estimated Time**: 3-4 hours  
**Risk Level**: 🟢 Low  
**Testing**: Standard test suite

---

## Dependency Consolidation Strategy

### Remove Duplicate Linting Tools

**Current State** (Redundant):

- ESLint + TypeScript ESLint plugins
- Biome (more modern, faster)

**Action Plan**:

```bash
# 1. Verify Biome config covers all ESLint rules
cat biome.json  # Review configuration

# 2. Remove ESLint (keep Biome)
npm remove \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-plugin-unused-imports \
  --save-dev

# 3. Update npm scripts in package.json
# Remove: "lint": "eslint src/"
# Keep: "lint": "biome lint src/"

# 4. Verify linting still works
npm run lint
npm run format
```

**Estimated Time**: 30 minutes  
**Savings**: -4 dev dependencies, faster CI/CD

---

### Lazy-Load AI Providers

**Current Issue**: All AI providers loaded statically = larger bundle

**Implementation Pattern**:

```typescript
// src/core/providers/factory.ts
type ProviderName = "anthropic" | "openai" | "google" | "openrouter";

export async function loadProvider(name: ProviderName) {
  switch (name) {
    case "anthropic":
      return (await import("@ai-sdk/anthropic")).default;
    case "openai":
      return (await import("@ai-sdk/openai")).default;
    case "google":
      return (await import("@ai-sdk/google")).default;
    case "openrouter":
      return (await import("@openrouter/ai-sdk-provider")).default;
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

// Usage
const provider = await loadProvider("openai");
```

**Estimated Time**: 2-3 hours  
**Impact**: -10-15% bundle size reduction

---

## Testing & Validation Checklist

### Before Each Update Phase

- [ ] Run `npm test:run` (all tests pass)
- [ ] Run `npm run typecheck:strict` (no type errors)
- [ ] Run `npm run lint` (code style compliant)
- [ ] Run `npm run build` (build succeeds)
- [ ] Check `npm audit` (no new vulnerabilities)

### After Each Update Phase

- [ ] Verify no regressions in CI/CD
- [ ] Check application logs for errors
- [ ] Test critical user paths
- [ ] Monitor performance metrics
- [ ] Document any breaking changes

### Deployment Validation

- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Monitor error tracking (Sentry)
- [ ] Check observability dashboards
- [ ] Get team sign-off before production

---

## Automation: Set Up Continuous Updates

### Option 1: Dependabot (GitHub)

**File**: `.github/dependabot.yml`

```yaml
version: 2
updates:
  # Daily checks for npm dependencies
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: daily
      time: "04:00"
    open-pull-requests-limit: 5
    reviewers:
      - "@nicomatt69"
    allow:
      - dependency-type: "all"
    ignore:
      - dependency-name: "express"
        versions: [">5"]

  # Docker images
  - package-ecosystem: docker
    directory: "/"
    schedule:
      interval: weekly
      day: "monday"
      time: "04:00"
```

### Option 2: Renovate

**File**: `renovate.json`

```json
{
  "extends": ["config:base"],
  "schedule": ["before 3am"],
  "timezone": "UTC",
  "grouping": {
    "minor": "!0",
    "patch": ">0"
  },
  "automerge": true,
  "autoMergeType": "pr",
  "labels": ["dependencies", "automated"],
  "ignoreDeps": ["express"]
}
```

**Setup**:

```bash
# 1. Install Renovate app from GitHub Marketplace
# 2. Add renovate.json to repo
# 3. Create pull request via Renovate UI
```

---

## Troubleshooting Common Issues

### Issue: Tests Fail After Update

**Solution**:

```bash
# 1. Identify problematic package
git diff package.json

# 2. Revert the update
npm install package-name@previous-version

# 3. Check package changelog for breaking changes
# 4. Update code if needed
# 5. Test again
npm test:run
```

### Issue: Build Size Increased

**Solution**:

```bash
# 1. Check what changed
npm ls

# 2. Analyze bundle
npm run build -- --analyze

# 3. Consider lazy-loading for large packages
# 4. Revert if necessary
```

### Issue: Type Errors After TypeScript Update

**Solution**:

```bash
# 1. Run strict type check
npm run typecheck:strict

# 2. Fix type issues (usually straightforward)
# 3. Update type definitions if needed
npm install @types/package-name@latest
```

---

## Success Metrics

### Measure After Completing All Phases:

| Metric            | Target          | Measurement                |
| ----------------- | --------------- | -------------------------- |
| Security Issues   | 0               | `npm audit`                |
| Outdated Packages | ≤ 3             | `npm outdated`             |
| Test Coverage     | > 80%           | `npm test:run`             |
| Build Time        | < 2min          | CI/CD logs                 |
| Bundle Size       | < baseline + 5% | esbuild analysis           |
| TypeScript Strict | ✅ Pass         | `npm run typecheck:strict` |

---

## Timeline & Resource Allocation

### Week 1: Critical Security

- **Monday**: Run audit, update axios
- **Tuesday**: Test & verify
- **Wednesday**: Code review & QA
- **Thursday**: Deploy to staging
- **Friday**: Monitor production

### Week 2-3: High Priority

- **Monday**: Update Playwright & OpenTelemetry
- **Tuesday-Wednesday**: Testing & validation
- **Thursday**: Consolidate linting tools
- **Friday**: Deploy to production

### Week 4: Medium Priority

- **Ongoing**: Minor updates & housekeeping
- **Focus**: Lazy-load AI providers
- **Test**: Bundle size reduction

---

## Emergency Rollback Plan

If critical issues occur during updates:

```bash
# 1. Immediate rollback
git revert <commit-hash>
git push

# 2. Notify team
# 3. Revert deployment if necessary
# 4. Investigate issue
git log --oneline package.json

# 5. Fix issue on new branch
git checkout -b fix/dependency-issue

# 6. Test thoroughly before re-merge
npm test:run
npm run typecheck:strict
```

---

## Resources & Documentation

- **npm Security**: https://docs.npmjs.com/cli/audit
- **Dependency Advisories**: https://github.com/advisories
- **Package Changelogs**: https://www.npmjs.com (search + changelog tab)
- **Breaking Changes**: Check each package's CHANGELOG.md
- **Biome Docs**: https://biomejs.dev/
- **OpenTelemetry**: https://opentelemetry.io/docs/
- **Express v5**: https://expressjs.com/

---

## Sign-Off & Notes

**Prepared By**: NikCLI Universal Agent  
**Reviewed**: Automated security scanning & dependency analysis  
**Next Review Date**: December 6, 2025  
**Status**: Ready for Implementation

### Next Steps:

1. ✅ Review this plan with team
2. ✅ Approve Phase 1 (Critical Security)
3. ✅ Schedule update sessions
4. ✅ Set up automated dependency updates (Dependabot/Renovate)
5. ✅ Monitor results and adjust strategy

---

**Questions?** Refer to DEPENDENCY_ANALYSIS_REPORT.md for detailed findings.
