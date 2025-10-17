# 🚀 Dependency Update Action Plan

**Priority Level:** CRITICAL  
**Timeline:** Immediate - 30 Days  
**Estimated Effort:** 2-4 hours

---

## Phase 1: Critical Security Fixes (IMMEDIATE - Do Today)

### Step 1.1: Fix axios Vulnerability

```bash
# Update axios to latest version
npm update axios@latest

# Verify update
npm list axios
```

**Why:** CVE-2024-39337 is a known security vulnerability affecting HTTP request handling. This is critical for a CLI tool that makes HTTP requests.

### Step 1.2: Update jsonwebtoken

```bash
npm update jsonwebtoken@latest
npm list jsonwebtoken
```

**Why:** Potential security concerns in JWT token handling could expose authentication mechanisms.

### Step 1.3: Run Security Audit

```bash
npm audit

# Fix automatically fixable issues
npm audit fix

# Review manual fixes if needed
npm audit fix --dry-run
```

### Step 1.4: Verify express Security

```bash
npm audit | grep express

# If patches available:
npm update express@latest
```

**Checkpoint:** After Phase 1

```bash
npm audit  # Should show 0 vulnerabilities
```

---

## Phase 2: Generate Lock File (This Week)

### Step 2.1: Create package-lock.json

```bash
# Ensure you're in project root
npm install

# Verify lock file was created
ls -la package-lock.json
```

### Step 2.2: Commit Lock File

```bash
git add package-lock.json
git commit -m "chore: add package-lock.json for reproducible builds"
```

**Why:** Lock file ensures all installations are identical across environments.

---

## Phase 3: Update Development Dependencies (Week 1)

### Step 3.1: Update TypeScript & Types

```bash
npm update --save-dev @types/node typescript

# Verify no breaking changes
npm run lint
npm run test:run
```

### Step 3.2: Update Testing Tools

```bash
npm update --save-dev vitest @vitest/ui

# Run tests to verify compatibility
npm run test:run
```

### Step 3.3: Update Build Tools

```bash
npm update --save-dev esbuild

# Test build
npm run build
```

### Step 3.4: Verify All Tests Pass

```bash
npm run test:run
npm run lint
npm run format
```

---

## Phase 4: Update Production Dependencies (Week 2)

### Step 4.1: Update AI SDK Packages

```bash
# Check current versions
npm ls | grep @ai-sdk/

# Update all to latest
npm update @ai-sdk/*@latest

# Verify compatibility
npm run test:run
```

### Step 4.2: Update Other Production Packages

```bash
# Update all remaining outdated packages
npm update

# Check what was updated
npm outdated
```

### Step 4.3: Test Application

```bash
npm run build
npm run test:run
npm run lint
```

---

## Phase 5: Dependency Consolidation (Week 2-3)

### Step 5.1: Audit streamtty Local Dependency

```bash
# Check streamtty structure
ls -la streamtty/

# Option A: Publish to npm
# Option B: Add version tag
# Option C: Move to npm workspaces
```

**Recommendation:** Publish streamtty to npm for better management.

### Step 5.2: Evaluate Unused Dependencies

```bash
# Install depcheck (temporary)
npx depcheck

# Review and remove unused packages if any
npm uninstall <unused-package>
```

---

## Phase 6: CI/CD Integration (Week 3)

### Step 6.1: Add npm Audit Script

Update `package.json`:

```json
{
  "scripts": {
    "audit": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix && npm audit",
    "deps:check": "npm outdated",
    "deps:update": "npm update && npm audit fix"
  }
}
```

### Step 6.2: Update CI/CD Pipeline

Replace in `.github/workflows/ci.yml` or equivalent:

```yaml
# OLD
- run: npm install

# NEW
- run: npm ci # Use npm ci for reproducible builds
- run: npm run audit # Add security check
```

### Step 6.3: Add Pre-commit Hook

```bash
# Install husky (if not already installed)
npm install --save-dev husky

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run audit"
```

---

## Phase 7: Documentation & Maintenance (Week 4)

### Step 7.1: Document Dependency Policy

Create `DEPENDENCY_POLICY.md`:

```markdown
# Dependency Management Policy

## Update Schedule

- **Security Updates:** Immediate (within 24 hours)
- **Patch Updates:** Weekly
- **Minor Updates:** Monthly
- **Major Updates:** Quarterly (with testing)

## Process

1. Run `npm outdated` to check for updates
2. Review changelog for breaking changes
3. Update and run full test suite
4. Commit with clear message

## Security

- Run `npm audit` before every release
- Fix critical vulnerabilities immediately
- Review high-priority issues within 1 week
```

### Step 7.2: Create Update Script

Create `scripts/update-deps.sh`:

```bash
#!/bin/bash
echo "🔍 Checking for outdated packages..."
npm outdated

echo "🔐 Running security audit..."
npm audit

echo "📦 Updating packages..."
npm update

echo "🧪 Running tests..."
npm run test:run

echo "✅ Dependency update complete!"
```

### Step 7.3: Schedule Automated Checks

Add to `.github/workflows/deps-check.yml`:

```yaml
name: Dependency Check
on:
  schedule:
    - cron: "0 0 1 * *" # Monthly on 1st
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm audit
      - run: npm outdated
```

---

## Rollback Plan

If issues occur after updates:

```bash
# Restore from git
git checkout package.json package-lock.json

# Reinstall original versions
rm -rf node_modules
npm install

# Verify working state
npm run test:run
```

---

## Verification Checklist

### After Phase 1 (Security Fixes)

- [ ] `npm audit` shows 0 vulnerabilities
- [ ] axios updated to 1.7.7+
- [ ] jsonwebtoken updated to latest
- [ ] All security patches applied

### After Phase 2 (Lock File)

- [ ] package-lock.json exists and committed
- [ ] `npm ci` installs successfully
- [ ] All dependencies resolve correctly

### After Phase 3 (Dev Dependencies)

- [ ] TypeScript compiles without errors
- [ ] All tests pass (`npm run test:run`)
- [ ] Linting passes (`npm run lint`)

### After Phase 4 (Production Dependencies)

- [ ] Application builds successfully (`npm run build`)
- [ ] All tests pass
- [ ] No breaking changes detected

### After Phase 5 (Consolidation)

- [ ] No unused dependencies
- [ ] AI SDK packages aligned
- [ ] streamtty dependency resolved

### After Phase 6 (CI/CD)

- [ ] npm audit script runs in CI
- [ ] npm ci used in all CI pipelines
- [ ] Security checks automated

### After Phase 7 (Documentation)

- [ ] Dependency policy documented
- [ ] Update script created and tested
- [ ] Automated monthly checks scheduled

---

## Estimated Timeline

| Phase                   | Duration      | Complexity |
| ----------------------- | ------------- | ---------- |
| Phase 1 (Security)      | 30 min        | Low        |
| Phase 2 (Lock File)     | 15 min        | Low        |
| Phase 3 (Dev Deps)      | 1-2 hours     | Medium     |
| Phase 4 (Prod Deps)     | 1-2 hours     | Medium     |
| Phase 5 (Consolidation) | 1 hour        | Medium     |
| Phase 6 (CI/CD)         | 1 hour        | Medium     |
| Phase 7 (Documentation) | 1 hour        | Low        |
| **Total**               | **5-8 hours** | **Medium** |

---

## Success Metrics

✅ **Security**

- 0 vulnerabilities reported by `npm audit`
- All critical packages updated
- Security checks automated in CI/CD

✅ **Reproducibility**

- package-lock.json committed
- `npm ci` used in CI/CD
- Consistent builds across environments

✅ **Maintainability**

- All dev dependencies up-to-date
- Dependency policy documented
- Monthly update schedule established

✅ **Performance**

- No unused dependencies
- Optimized AI SDK versions
- Build time maintained or improved

---

## Support & Resources

- [npm audit documentation](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [npm update documentation](https://docs.npmjs.com/cli/v10/commands/npm-update)
- [npm ci documentation](https://docs.npmjs.com/cli/v10/commands/npm-ci)
- [Security best practices](https://docs.npmjs.com/policies/security)

---

**Action Plan Created:** October 16, 2025  
**Status:** Ready for Implementation  
**Next Step:** Execute Phase 1 immediately
