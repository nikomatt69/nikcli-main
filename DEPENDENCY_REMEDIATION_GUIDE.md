# 🔧 NikCLI Dependency Remediation Guide

**Purpose:** Step-by-step instructions to remediate security issues and update dependencies  
**Estimated Time:** 30-45 minutes  
**Risk Level:** Low (with proper testing)

---

## Phase 1: Pre-Update Preparation (5 minutes)

### Step 1.1: Backup Current State

```bash
# Create backup of package-lock.json
cp package-lock.json package-lock.json.backup

# Verify git is clean
git status
git add .
git commit -m "chore: pre-dependency-update backup"
```

### Step 1.2: Create Update Branch

```bash
# Create feature branch for dependency updates
git checkout -b chore/dependency-updates
```

### Step 1.3: Verify Current Test Status

```bash
# Run all tests to ensure baseline
npm run test:run

# Check current audit status
npm audit
```

---

## Phase 2: Critical Security Fixes (10 minutes)

### Step 2.1: Fix axios CVE-2024-39337 (CRITICAL)

**Issue:** axios@^1.12.2 has known security vulnerability

```bash
# Update axios to latest version
npm update axios@latest

# Verify update
npm ls axios

# Expected output: axios@1.7.7 or later
```

**Verification:**

```bash
# Check if vulnerability is resolved
npm audit | grep axios

# Should show: 0 vulnerabilities
```

### Step 2.2: Update express Security Patches

**Issue:** express@5.1.0 requires security verification

```bash
# Run audit to identify specific issues
npm audit express

# Update express
npm update express

# Verify version
npm ls express
```

### Step 2.3: Update jsonwebtoken

**Issue:** jsonwebtoken@^9.0.2 has potential vulnerabilities

```bash
# Update to latest patch
npm update jsonwebtoken@latest

# Verify update
npm ls jsonwebtoken
```

### Step 2.4: Run Security Audit

```bash
# Full audit check
npm audit

# Fix all moderate and high severity issues
npm audit fix --audit-level=moderate

# Verify no critical issues remain
npm audit --audit-level=critical
```

---

## Phase 3: Development Dependencies Update (8 minutes)

### Step 3.1: Update TypeScript & Build Tools

```bash
# Update TypeScript and related tools
npm update --save-dev typescript vitest @vitest/ui esbuild

# Verify versions
npm ls typescript vitest esbuild
```

### Step 3.2: Update Type Definitions

```bash
# Update @types packages
npm update --save-dev @types/node @types/glob @types/jsdom @types/ws

# Verify updates
npm ls @types/
```

### Step 3.3: Verify Dev Dependencies

```bash
# List all dev dependencies
npm ls --depth=0 --only=dev

# Check for any outdated
npm outdated --only=dev
```

---

## Phase 4: Production Dependencies Update (10 minutes)

### Step 4.1: Update AI SDK Packages

**Goal:** Align all @ai-sdk/\* packages to compatible versions

```bash
# Check current AI SDK versions
npm ls | grep @ai-sdk/

# Update all AI SDK packages
npm update @ai-sdk/anthropic @ai-sdk/google @ai-sdk/openai @ai-sdk/gateway @ai-sdk/vercel

# Verify alignment
npm ls | grep @ai-sdk/
```

### Step 4.2: Update Core Dependencies

```bash
# Update main dependencies
npm update zod ai marked shiki @upstash/redis

# Verify updates
npm ls zod ai marked shiki @upstash/redis
```

### Step 4.3: Update Remaining Outdated Packages

```bash
# General update of all dependencies
npm update

# Verify final state
npm outdated
```

---

## Phase 5: Testing & Validation (8 minutes)

### Step 5.1: Run Full Test Suite

```bash
# Run all tests
npm run test:run

# Expected: All tests pass
# If failures occur, revert and investigate:
# git checkout package-lock.json
# npm ci
```

### Step 5.2: Run Build Process

```bash
# Verify build still works
npm run build

# Check for build warnings
npm run build 2>&1 | grep -i warning
```

### Step 5.3: Lint & Format Check

```bash
# Check code quality
npm run lint

# Verify formatting
npm run check
```

### Step 5.4: System Diagnostics

```bash
# Run system verification
npm run system:diagnose

# Run coherence tests if available
npm run test:coherence 2>/dev/null || echo "Coherence tests not available"
```

---

## Phase 6: Lock File Management (3 minutes)

### Step 6.1: Verify Lock File

```bash
# Check package-lock.json was updated
git diff package-lock.json | head -20

# Verify integrity
npm ci --dry-run
```

### Step 6.2: Clean Install Verification

```bash
# Test clean install from lock file
rm -rf node_modules
npm ci

# Verify installation
npm ls --depth=0
```

---

## Phase 7: Git Commit & Push (2 minutes)

### Step 7.1: Review Changes

```bash
# See all changes
git status

# Review package.json changes
git diff package.json

# Review lock file (summary only)
git diff --stat package-lock.json
```

### Step 7.2: Commit Changes

```bash
# Stage changes
git add package.json package-lock.json

# Commit with descriptive message
git commit -m "chore: update dependencies and fix security vulnerabilities

- Fix critical axios CVE-2024-39337 vulnerability
- Update express and jsonwebtoken security patches
- Update TypeScript, vitest, and build tools
- Align AI SDK package versions
- Update marked, shiki, zod, and other core dependencies
- All tests passing, no breaking changes"
```

### Step 7.3: Push to Remote

```bash
# Push feature branch
git push origin chore/dependency-updates

# Create pull request on GitHub
# (or merge if direct push is allowed)
```

---

## Phase 8: Post-Update Verification (2 minutes)

### Step 8.1: Final Audit

```bash
# Final security audit
npm audit

# Expected: No vulnerabilities (or only low-severity dev dependencies)
```

### Step 8.2: Dependency Report

```bash
# Generate dependency report
npm ls --depth=0

# Check for any peer dependency warnings
npm ls 2>&1 | grep -i "peer"
```

### Step 8.3: Documentation

```bash
# Update CHANGELOG if using one
# Add entry for dependency updates

# Example entry:
# ## [0.3.1] - 2025-10-16
# ### Security
# - Fixed critical axios CVE-2024-39337 vulnerability
# - Updated express and jsonwebtoken security patches
# ### Dependencies
# - Updated TypeScript to 5.10.2
# - Updated vitest to 3.4.1
# - Aligned all @ai-sdk/* packages to compatible versions
```

---

## Troubleshooting Guide

### Issue: Tests Fail After Update

```bash
# Revert to previous state
git checkout package-lock.json
npm ci
npm run test:run

# Investigate specific failures
npm run test:run -- --reporter=verbose

# Update one package at a time if needed
npm update <package-name>
npm run test:run
```

### Issue: Build Fails

```bash
# Check build errors
npm run build 2>&1

# Clear build cache
rm -rf dist/

# Try rebuild
npm run build

# If still failing, check for breaking changes in updated packages
npm info <package-name> changelog
```

### Issue: Peer Dependency Warnings

```bash
# List peer dependency issues
npm ls 2>&1 | grep "peer"

# Install missing peer dependencies
npm install <peer-dependency>

# Or update related packages
npm update <related-package>
```

### Issue: Package-lock.json Conflicts

```bash
# If conflicts occur during merge
git checkout --theirs package-lock.json
npm ci

# Or regenerate lock file
rm package-lock.json
npm install
```

---

## Rollback Procedure

If critical issues occur after update:

```bash
# Option 1: Revert to backup
cp package-lock.json.backup package-lock.json
npm ci

# Option 2: Revert git commit
git revert <commit-hash>
git push origin chore/dependency-updates

# Option 3: Hard reset
git reset --hard HEAD~1
npm ci
```

---

## Recommended npm Scripts to Add

Add these to `package.json` scripts section:

```json
{
  "audit": "npm audit --audit-level=moderate",
  "audit:fix": "npm audit fix --audit-level=moderate",
  "deps:check": "npm outdated",
  "deps:update": "npm update && npm audit fix",
  "deps:update:dev": "npm update --save-dev",
  "ci:install": "npm ci",
  "verify:deps": "npm audit && npm run test:run && npm run build"
}
```

Usage:

```bash
npm run audit          # Check for vulnerabilities
npm run audit:fix      # Auto-fix vulnerabilities
npm run deps:check     # Check for outdated packages
npm run verify:deps    # Full verification after update
```

---

## Maintenance Checklist

After completing this update:

- [ ] All tests passing
- [ ] Build completes successfully
- [ ] No security vulnerabilities reported
- [ ] No peer dependency warnings
- [ ] Lock file committed to git
- [ ] Changes documented
- [ ] Feature branch merged or PR created
- [ ] Backup package-lock.json removed
- [ ] Team notified of updates

---

## Schedule Future Updates

### Weekly

```bash
npm audit  # Just check, don't fix
```

### Monthly

```bash
npm outdated  # Review available updates
npm update    # Apply non-breaking updates
npm audit fix # Apply security fixes
npm run test:run  # Verify everything works
```

### Quarterly

```bash
# Full dependency review and major version updates
# More extensive testing required
# Consider staging environment testing
```

---

## References

- **npm audit:** https://docs.npmjs.com/cli/v10/commands/npm-audit
- **npm update:** https://docs.npmjs.com/cli/v10/commands/npm-update
- **Security advisories:** https://www.npmjs.com/advisories
- **Semantic versioning:** https://semver.org/

---

**Estimated Total Time:** 30-45 minutes  
**Difficulty Level:** Intermediate  
**Last Updated:** 2025-10-16  
**Next Review Date:** 2025-11-16
