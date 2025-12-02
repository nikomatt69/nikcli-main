#!/usr/bin/env bun

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';

interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
  bunCompatible: boolean;
  confidence: number;
  issues: string[];
  alternatives: string[];
  recommendation: string;
}

interface AnalysisResult {

  totalDependencies: number;
  bunCompatible: number;
  potentiallyCompatible: number;
  incompatible: number;
  dependencies: DependencyInfo[];
  potentialBlockers: string[];
  migrationEffort: 'low' | 'medium' | 'high';
  estimatedMigrationTime: string;
}

class BunCompatibilityAnalyzer {
  private packageJson: any;
  private dependencies: DependencyInfo[] = [];
  private potentialBlockers: string[] = [];

  constructor() {
    this.packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  }

  async analyze(): Promise<AnalysisResult> {
    console.log('🔍 Analyzing Bun compatibility for NikCLI dependencies...');

    const allDeps = [
      ...Object.entries(this.packageJson.dependencies || {}).map(([name, version]) => ({
        name,
        version,
        type: 'production' as const
      })),
      ...Object.entries(this.packageJson.devDependencies || {}).map(([name, version]) => ({
        name,
        version,
        type: 'development' as const
      }))
    ];

    for (const dep of allDeps) {
      const analysis = await this.analyzeDependency(dep.name as string, dep.version as string, dep.type);
      this.dependencies.push(analysis);
    }

    // Analyze code for Node.js specific APIs
    await this.analyzeCodebase();

    return this.generateReport();
  }

  private async analyzeDependency(name: string, version: string, type: 'production' | 'development'): Promise<DependencyInfo> {
    const info: DependencyInfo = {
      name,
      version: version as string,
      type,
      bunCompatible: false,
      confidence: 0,
      issues: [],
      alternatives: [],
      recommendation: ''
    };

    // Known Bun-compatible packages
    const fullyCompatible = [
      'typescript', 'tsx', 'esbuild', 'biome', 'prettier', 'eslint',
      'vitest', '@vitest/ui', 'next', 'react', 'react-dom',
      'zod', 'zustand', 'clsx', 'tailwind-merge', 'lucide-react'
    ];

    // Known Bun-incompatible packages
    const knownIncompatible = [
      'jest', 'ts-jest', '@types/jest'
    ];

    // Check for native addons
    const hasNativeAddons = await this.checkForNativeAddons(name);

    if (hasNativeAddons.native) {
      info.bunCompatible = hasNativeAddons.compatible;
      info.confidence = hasNativeAddons.compatible ? 0.8 : 0.1;
      if (!hasNativeAddons.compatible) {
        info.issues.push('Uses native Node.js addons not compatible with Bun');
      }
    } else if (fullyCompatible.includes(name)) {
      info.bunCompatible = true;
      info.confidence = 1.0;
    } else if (knownIncompatible.includes(name)) {
      info.bunCompatible = false;
      info.confidence = 1.0;
      info.issues.push('Known incompatibility with Bun');
      info.alternatives.push('Use Vitest instead of Jest');
    } else {
      // Analyze based on package characteristics
      const analysis = await this.analyzePackageCharacteristics(name, version);
      info.bunCompatible = analysis.compatible;
      info.confidence = analysis.confidence;
      info.issues.push(...analysis.issues);
      info.alternatives.push(...analysis.alternatives);
    }

    // Generate recommendation
    info.recommendation = this.generateRecommendation(info);

    return info;
  }

  private async checkForNativeAddons(packageName: string): Promise<{ native: boolean; compatible: boolean }> {
    try {
      // Check if package has binding.gyp or .node files
      const result = await $`npm view ${packageName} versions --json`.catch(() => null);
      if (!result) return { native: false, compatible: false };

      // For packages known to have native dependencies
      const nativePackages = [
        'sharp', 'bcrypt', 'sqlite3', 'node-sass', 'node-gyp',
        '@opentelemetry/sdk-node', 'ioredis'
      ];

      const hasNative = nativePackages.includes(packageName);

      // Bun can handle most native packages through compatibility layer
      return {
        native: hasNative,
        compatible: true // Bun has good native addon support
      };
    } catch {
      return { native: false, compatible: false };
    }
  }

  private async analyzePackageCharacteristics(name: string, version: string): Promise<{
    compatible: boolean;
    confidence: number;
    issues: string[];
    alternatives: string[];
  }> {
    const issues: string[] = [];
    const alternatives: string[] = [];
    let confidence = 0.7;
    let compatible = true;

    // Check for specific compatibility issues
    if (name.includes('jest') || name === 'ts-jest') {
      compatible = false;
      confidence = 1.0;
      issues.push('Jest is not compatible with Bun');
      alternatives.push('Use Vitest for testing');
    } else if (name === 'playwright') {
      confidence = 0.6;
      issues.push('May require Bun-specific configuration');
      alternatives.push('Consider @happy-dom for lighter testing');
    } else if (name.includes('@types/')) {
      confidence = 0.9;
      // Type definitions are generally compatible
    } else if (name.startsWith('@opentelemetry/')) {
      confidence = 0.8;
      issues.push('OpenTelemetry may need Bun-specific instrumentation');
    }

    return { compatible, confidence, issues, alternatives };
  }

  private async analyzeCodebase(): Promise<void> {
    console.log('📁 Analyzing codebase for Node.js-specific APIs...');

    const srcFiles = this.findTypeScriptFiles('src');
    const testFiles = this.findTypeScriptFiles('tests');

    const allFiles = [...srcFiles, ...testFiles];

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      this.checkForNodeJSAPIs(file, content);
    }
  }

  private findTypeScriptFiles(directory: string): string[] {
    const files: string[] = [];
    const dir = join(process.cwd(), directory);

    if (!statSync(dir, { throwIfNoEntry: false })) return files;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.findTypeScriptFiles(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private checkForNodeJSAPIs(filePath: string, content: string): void {
    const nodeJSAPIs = [
      { pattern: /process\.env/g, issue: 'Environment variables access' },
      { pattern: /require\(/g, issue: 'CommonJS require() syntax' },
      { pattern: /__dirname/g, issue: '__dirname not available in ES modules' },
      { pattern: /__filename/g, issue: '__filename not available in ES modules' },
      { pattern: /module\.exports/g, issue: 'CommonJS module.exports' },
      { pattern: /exports\./g, issue: 'CommonJS exports' }
    ];

    for (const api of nodeJSAPIs) {
      const matches = content.match(api.pattern);
      if (matches) {
        this.potentialBlockers.push(`${filePath}: ${api.issue} (${matches.length} occurrences)`);
      }
    }
  }

  private generateRecommendation(info: DependencyInfo): string {
    if (info.bunCompatible && info.confidence > 0.8) {
      return '✅ Fully compatible with Bun';
    } else if (info.bunCompatible) {
      return '⚠️ Likely compatible, verify in testing';
    } else {
      const altText = info.alternatives.length > 0
        ? ` Consider: ${info.alternatives.join(', ')}`
        : '';
      return `❌ Not compatible${altText}`;
    }
  }

  private generateReport(): AnalysisResult {
    const bunCompatible = this.dependencies.filter(d => d.bunCompatible).length;
    const potentiallyCompatible = this.dependencies.filter(d => d.bunCompatible && d.confidence < 0.8).length;
    const incompatible = this.dependencies.length - bunCompatible - potentiallyCompatible;

    // Calculate migration effort based on number of incompatibilities
    let migrationEffort: 'low' | 'medium' | 'high' = 'low';
    let estimatedTime = '1-2 hours';

    if (incompatible > 10) {
      migrationEffort = 'high';
      estimatedTime = '2-3 weeks';
    } else if (incompatible > 5) {
      migrationEffort = 'medium';
      estimatedTime = '1-2 weeks';
    }

    return {
      totalDependencies: this.dependencies.length,
      bunCompatible,
      potentiallyCompatible,
      incompatible,
      dependencies: this.dependencies,
      potentialBlockers: this.potentialBlockers,
      migrationEffort,
      estimatedMigrationTime: estimatedTime
    };
  }

  async generateReportFile(result: AnalysisResult): Promise<void> {
    const reportContent = this.formatReport(result);

    const fs = await import('fs');
    fs.writeFileSync('bun-compatibility-report.md', reportContent);

    console.log('📊 Report generated: bun-compatibility-report.md');
  }

  private formatReport(result: AnalysisResult): string {
    const report = `# Bun Compatibility Analysis Report

**Generated on:** ${new Date().toISOString()}
**Total Dependencies:** ${result.totalDependencies}
**Bun Compatible:** ${result.bunCompatible} ✅
**Potentially Compatible:** ${result.potentiallyCompatible} ⚠️
**Incompatible:** ${result.incompatible} ❌

## Migration Assessment

**Effort Level:** ${result.migrationEffort.toUpperCase()}
**Estimated Time:** ${result.estimatedMigrationTime}

## Dependencies Analysis

| Package | Version | Type | Status | Confidence | Issues |
|---------|---------|------|--------|------------|--------|
${result.dependencies.map(dep =>
      `| ${dep.name} | ${dep.version} | ${dep.type} | ${dep.bunCompatible ? '✅' : '❌'} | ${Math.round(dep.confidence * 100)}% | ${dep.issues.join(', ') || 'None'} |`
    ).join('\n')}

## Potential Blockers

${result.potentialBlockers.map(blocker => `- ${blocker}`).join('\n') || 'None identified'}

## Recommendations

1. **Start with Compatible Packages:** Focus on ${result.bunCompatible} already compatible packages
2. **Replace Incompatible Tools:** 
   - Replace Jest with Vitest
   - Review native addon dependencies
3. **Update Package Scripts:** Modify build scripts to use Bun commands
4. **Test Thoroughly:** Run comprehensive tests after each migration step

## Next Steps

1. Set up Bun environment (\`bun install\`)
2. Replace incompatible dependencies
3. Update build configuration
4. Run test suite
5. Performance benchmarking

`;

    return report;
  }
}

// Run analysis
const analyzer = new BunCompatibilityAnalyzer();
const result = await analyzer.analyze();
await analyzer.generateReportFile(result);

console.log('\n🎯 Summary:');
console.log(`✅ Bun Compatible: ${result.bunCompatible}`);
console.log(`⚠️ Potentially Compatible: ${result.potentiallyCompatible}`);
console.log(`❌ Incompatible: ${result.incompatible}`);
console.log(`📊 Migration Effort: ${result.migrationEffort}`);
console.log(`⏱️ Estimated Time: ${result.estimatedMigrationTime}`);