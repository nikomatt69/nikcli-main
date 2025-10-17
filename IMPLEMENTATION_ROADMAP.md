// TODO: Consider refactoring for reduced complexity
# Implementation Roadmap: Code Quality Improvements

## Executive Summary

This document provides a concrete implementation roadmap for addressing the code quality issues identified in the comprehensive analysis. It translates findings into executable tasks with estimated effort and dependencies.

---

## Phase 1: Security Hardening (Immediate - 2-4 hours)

### Task 1.1: Update Critical Security Packages

**Priority:** CRITICAL | **Effort:** 30 mins | **Risk:** LOW

```bash
# Commands to execute
npm update axios@latest
npm update jsonwebtoken@latest
npm update express@latest
npm audit fix --force (if needed)

# Verification
npm audit --audit-level=moderate
npm test
```

**Validation:**

- [ ] axios version >= 1.7.7
- [ ] No critical vulnerabilities in npm audit
- [ ] All tests pass
- [ ] Commit: "security: update vulnerable dependencies"

### Task 1.2: Implement Security Audit Script

**Priority:** HIGH | **Effort:** 1 hour | **Risk:** LOW

**Create:** `scripts/security-audit.js`

```javascript
#!/usr/bin/env node
const { execSync } = require("child_process");

console.log("🔒 Running security audit...\n");

try {
  execSync("npm audit --audit-level=moderate", { stdio: "inherit" });
  console.log("\n✅ Security audit passed");
  process.exit(0);
} catch (error) {
  console.log("\n❌ Security issues found");
  process.exit(1);
}
```

**Update:** `package.json`

```json
{
  "scripts": {
    "security:audit": "node scripts/security-audit.js",
    "security:fix": "npm audit fix"
  }
}
```

**Validation:**

- [ ] Script executes without errors
- [ ] Detects vulnerabilities correctly
- [ ] Can be integrated into CI/CD

---

## Phase 2: Build System Consolidation (Week 1 - 2-3 days)

### Task 2.1: Create Build Configuration File

**Priority:** HIGH | **Effort:** 4 hours | **Risk:** MEDIUM

**Create:** `build.config.ts`

```typescript
export const buildConfig = {
  platforms: {
    "macos-arm64": {
      arch: "arm64",
      os: "macos",
      targets: ["pkg", "bun"],
    },
    "macos-x64": {
      arch: "x64",
      os: "macos",
      targets: ["pkg", "bun"],
    },
    "linux-x64": {
      arch: "x64",
      os: "linux",
      targets: ["pkg", "bun"],
    },
    "windows-x64": {
      arch: "x64",
      os: "windows",
      targets: ["pkg", "bun"],
    },
  },

  buildProfiles: {
    dev: {
      minify: false,
      sourcemap: true,
      optimization: "none",
      nodeEnv: "development",
    },
    staging: {
      minify: true,
      sourcemap: true,
      optimization: "partial",
      nodeEnv: "staging",
    },
    production: {
      minify: true,
      sourcemap: false,
      optimization: "full",
      nodeEnv: "production",
    },
  },

  packageManagers: {
    pkg: { enabled: true, command: "pkg" },
    bun: { enabled: true, command: "bun build" },
    npm: { enabled: false, reason: "Use pkg or bun for binaries" },
  },
};

export function getPlatformConfig(platform: string) {
  return buildConfig.platforms[platform as keyof typeof buildConfig.platforms];
}

export function getProfileConfig(profile: string) {
  return buildConfig.buildProfiles[
    profile as keyof typeof buildConfig.buildProfiles
  ];
}
```

**Create:** `scripts/build.ts`

```typescript
#!/usr/bin/env node
import {
  buildConfig,
  getPlatformConfig,
  getProfileConfig,
} from "../build.config";

const args = process.argv.slice(2);
const platform = args[0] || "macos-x64";
const profile = args[1] || "production";

console.log(`🔨 Building for ${platform} with ${profile} profile...\n`);

const platformConfig = getPlatformConfig(platform);
const profileConfig = getProfileConfig(profile);

if (!platformConfig) {
  console.error(`❌ Unknown platform: ${platform}`);
  process.exit(1);
}

if (!profileConfig) {
  console.error(`❌ Unknown profile: ${profile}`);
  process.exit(1);
}

// Build logic here
console.log("Platform config:", platformConfig);
console.log("Profile config:", profileConfig);
```

**Update:** `package.json` - Replace 15+ build scripts with:

```json
{
  "scripts": {
    "build": "ts-node scripts/build.ts",
    "build:all": "npm run build:all:platforms",
    "build:all:platforms": "npm run build macos-arm64 && npm run build macos-x64 && npm run build linux-x64 && npm run build windows-x64",
    "build:dev": "npm run build -- . dev",
    "build:staging": "npm run build -- . staging",
    "build:prod": "npm run build -- . production"
  }
}
```

**Validation:**

- [ ] build.config.ts compiles without errors
- [ ] build script executes successfully
- [ ] Supports all 4 platforms
- [ ] Reduces script count from 30+ to 5-7

### Task 2.2: Create Build Verification Script

**Priority:** HIGH | **Effort:** 2 hours | **Risk:** LOW

**Create:** `scripts/verify-builds.js`

```javascript
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const platforms = ["macos-arm64", "macos-x64", "linux-x64", "windows-x64"];

console.log("✅ Verifying build outputs...\n");

let failCount = 0;

platforms.forEach((platform) => {
  const binaryPath = path.join("dist", `nikcli-${platform}`);

  if (fs.existsSync(binaryPath)) {
    console.log(`✓ ${platform}: binary exists`);

    // Check file size
    const stats = fs.statSync(binaryPath);
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`✗ ${platform}: binary missing`);
    failCount++;
  }
});

if (failCount > 0) {
  console.log(`\n❌ ${failCount} build(s) failed`);
  process.exit(1);
} else {
  console.log("\n✅ All builds verified");
}
```

**Update:** `package.json`

```json
{
  "scripts": {
    "verify": "node scripts/verify-builds.js",
    "postbuild": "npm run verify"
  }
}
```

**Validation:**

- [ ] Script detects missing binaries
- [ ] Checks file sizes
- [ ] Integrates with postbuild hook

---

## Phase 3: Dependency Optimization (Week 1 - 2 days)

### Task 3.1: Remove Duplicate Dependencies

**Priority:** HIGH | **Effort:** 3 hours | **Risk:** MEDIUM

**Analysis:**

```
Current tokenizers (pick ONE):
- gpt-tokenizer (npm downloads: 10k/week)
- js-tiktoken (npm downloads: 500k/week) ✓ KEEP
- @anthropic-ai/tokenizer (npm downloads: 50k/week)

Current markdown/syntax (pick ONE):
- marked (npm downloads: 2M/week)
- shiki (npm downloads: 500k/week) ✓ KEEP (better for CLI)
- highlight.js (npm downloads: 1M/week)
- cli-highlight (npm downloads: 50k/week)
```

**Execute:**

```bash
# Remove redundant packages
npm uninstall gpt-tokenizer @anthropic-ai/tokenizer
npm uninstall highlight.js cli-highlight marked

# Verify replacements work
npm test
```

**Update:** `package.json` consolidation:

```json
{
  "dependencies": {
    "js-tiktoken": "^1.0.x",
    "shiki": "^3.15.0"
  }
}
```

**Validation:**

- [ ] Tests pass with consolidated packages
- [ ] Bundle size reduced by 15-25%
- [ ] No functionality lost
- [ ] Commit: "refactor: consolidate duplicate dependencies"

### Task 3.2: Pin AI SDK Versions

**Priority:** HIGH | **Effort:** 1 hour | **Risk:** LOW

**Update:** `package.json`

```json
{
  "dependencies": {
    "ai": "^3.5.0",
    "@ai-sdk/anthropic": "^0.0.x",
    "@ai-sdk/openai": "^0.0.x",
    "@ai-sdk/google": "^0.0.x"
  }
}
```

**Commands:**

```bash
npm ls @ai-sdk/*
npm update --save @ai-sdk/*
npm install
npm test
```

**Validation:**

- [ ] All @ai-sdk/\* versions are aligned
- [ ] No peer dependency warnings
- [ ] Tests pass

---

## Phase 4: Add Missing Lifecycle Scripts (Week 1 - 1 day)

### Task 4.1: Create Lifecycle Scripts

**Priority:** MEDIUM | **Effort:** 2 hours | **Risk:** LOW

**Create:** `scripts/clean.js`

```javascript
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const dirs = ["dist", "build", ".turbo"];
const files = ["*.tgz", "*.tar.gz"];

console.log("🧹 Cleaning build artifacts...\n");

dirs.forEach((dir) => {
  const dirPath = path.join(process.cwd(), dir);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`✓ Removed ${dir}/`);
  }
});

console.log("\n✅ Clean complete");
```

**Update:** `package.json`

```json
{
  "scripts": {
    "clean": "node scripts/clean.js",
    "prebuild": "npm run clean && npm run lint",
    "postbuild": "npm run verify",
    "audit": "npm audit --audit-level=moderate",
    "deps:update": "npm update --save-dev",
    "deps:audit": "npm audit && npm audit fix"
  }
}
```

**Validation:**

- [ ] clean script removes artifacts
- [ ] prebuild runs before build
- [ ] postbuild runs after build
- [ ] audit scripts work correctly

---

## Phase 5: Update Node.js Compatibility (Week 1 - 30 mins)

### Task 5.1: Update Engine Requirements

**Priority:** MEDIUM | **Effort:** 30 mins | **Risk:** LOW

**Update:** `package.json`

```json
{
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

**Update:** `tsconfig.json` (if using ES2022+)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"]
  }
}
```

**Validation:**

- [ ] Update package.json
- [ ] Test on Node 18, 20, 22
- [ ] Update CI/CD matrix

---

## Implementation Timeline

```
Week 1:
├─ Day 1 (Sprint Start)
│  ├─ Phase 1: Security Hardening (2-4 hours)
│  └─ Phase 2.1: Build Config Creation (4 hours)
│
├─ Day 2
│  ├─ Phase 2.2: Build Verification (2 hours)
│  └─ Phase 3.1: Remove Duplicates (3 hours)
│
├─ Day 3
│  ├─ Phase 3.2: Pin AI SDK (1 hour)
│  ├─ Phase 4.1: Lifecycle Scripts (2 hours)
│  └─ Phase 5.1: Engine Update (30 mins)
│
└─ Day 4 (Testing & QA)
   ├─ Integration testing
   ├─ Platform-specific testing
   └─ Documentation updates

Total Effort: 3-5 developer days
```

---

## Success Criteria

### Build System

- [ ] Build scripts reduced from 30+ to 5-7 core commands
- [ ] All 4 platforms build successfully
- [ ] Build time < 5 minutes per platform
- [ ] Zero build failures in CI/CD

### Dependencies

- [ ] No critical security vulnerabilities
- [ ] npm audit score: 0 critical, 0 high
- [ ] Production deps: 74 → 60-65 (10-15% reduction)
- [ ] All tests pass

### Compatibility

- [ ] Supports Node 18, 20, 22
- [ ] Works on macOS, Linux, Windows
- [ ] npm, yarn, bun compatible

### Maintenance

- [ ] Build strategy documented
- [ ] New contributors can build in < 10 minutes
- [ ] Automated security scanning in place

---

## Rollback Plan

If any phase encounters critical issues:

1. **Revert to last stable commit:** `git reset --hard <commit-hash>`
2. **Restore package.json:** Keep backup of original
3. **Test thoroughly:** Run full test suite
4. **Document issue:** Add to lessons learned

---

## Dependencies & Blockers

- **Phase 1** → No dependencies (can start immediately)
- **Phase 2** → Requires Phase 1 completion
- **Phase 3** → Requires Phase 2 completion (for testing)
- **Phase 4** → Can run parallel with Phase 3
- **Phase 5** → No dependencies (can start immediately)

---

## Monitoring & Metrics

### Track These Metrics Post-Implementation

```javascript
// Build Performance
- Build time per platform (target: < 5 min)
- Binary size per platform (target: < 50MB)
- Cache hit rate (target: > 70%)

// Security
- npm audit score (target: 0 critical, 0 high)
- Dependency update frequency (target: < 30 days)
- Vulnerability resolution time (target: < 48 hours)

// Maintainability
- Build script count (target: 5-7)
- Duplicate dependency count (target: 0)
- Code coverage (target: > 80%)
```

---

**Last Updated:** 2025-10-16  
**Status:** Ready for Implementation  
**Assigned To:** Development Team  
**Estimated ROI:** 40% reduction in build maintenance time
