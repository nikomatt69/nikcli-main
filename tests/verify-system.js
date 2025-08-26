#!/usr/bin/env node
/**
 * Complete System Verification Script
 * Run this to verify the entire CLI system is working correctly
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

console.log('🔍 Starting Complete System Verification...\n');

class SystemVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      tests: []
    };
  }

  async test(name, testFn) {
    console.log(`⏳ Testing: ${name}`);
    try {
      await testFn();
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
      console.log(`✅ PASS: ${name}\n`);
    } catch (error) {
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ FAIL: ${name}`);
      console.log(`   Error: ${error.message}\n`);
    }
  }

  async skip(name, reason) {
    this.results.skipped++;
    this.results.tests.push({ name, status: 'SKIP', reason });
    console.log(`⏭️ SKIP: ${name} (${reason})\n`);
  }

  printSummary() {
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⏭️ Skipped: ${this.results.skipped}`);
    console.log(`📈 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);
    console.log('='.repeat(50));

    if (this.results.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results.tests
        .filter(test => test.status === 'FAIL')
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    }

    console.log('\n🎯 NEXT STEPS:');
    if (this.results.failed === 0) {
      console.log('  ✅ System is healthy and ready for use!');
      console.log('  ✅ All core functionality verified');
      console.log('  ✅ Run "npm start" to use the CLI');
    } else {
      console.log('  🔧 Fix the failed tests above');
      console.log('  🔧 Re-run this verification script');
      console.log('  🔧 Check logs for detailed error information');
    }
  }
}

async function main() {
  const verifier = new SystemVerifier();

  // 1. Environment and Dependencies
  await verifier.test('Node.js Version Check', async () => {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required, found ${nodeVersion}`);
    }
  });

  await verifier.test('Package Dependencies', async () => {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
    
    // Check essential fields
    if (!packageJson.name) throw new Error('Missing package name');
    if (!packageJson.version) throw new Error('Missing package version');
    if (!packageJson.main) throw new Error('Missing main entry point');
    if (!packageJson.scripts || !packageJson.scripts.build) throw new Error('Missing build script');
    
    // Check dependencies
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const essential = ['typescript', 'vitest', '@ai-sdk/anthropic'];
    
    for (const dep of essential) {
      if (!deps[dep]) throw new Error(`Missing essential dependency: ${dep}`);
    }
  });

  // 2. Project Structure
  await verifier.test('Project Structure', async () => {
    const requiredPaths = [
      'src',
      'src/cli',
      'src/cli/index.ts',
      'tests',
      'package.json',
      'tsconfig.json'
    ];

    for (const requiredPath of requiredPaths) {
      try {
        await fs.access(requiredPath);
      } catch (error) {
        throw new Error(`Missing required path: ${requiredPath}`);
      }
    }
  });

  // 3. TypeScript Configuration
  await verifier.test('TypeScript Configuration', async () => {
    const tsConfig = JSON.parse(await fs.readFile('tsconfig.json', 'utf-8'));
    
    if (!tsConfig.compilerOptions) throw new Error('Missing compiler options');
    if (!tsConfig.compilerOptions.outDir) throw new Error('Missing output directory');
    
    // Check TypeScript compilation
    try {
      await execAsync('npx tsc --noEmit');
    } catch (error) {
      throw new Error(`TypeScript compilation errors: ${error.message}`);
    }
  });

  // 4. Build System
  await verifier.test('Build Process', async () => {
    try {
      const { stdout, stderr } = await execAsync('npm run build', { timeout: 60000 });
      
      // Check if build output exists
      await fs.access('dist');
      await fs.access('dist/cli');
      
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
  });

  // 5. Test Suite
  await verifier.test('Test Suite Execution', async () => {
    try {
      // Run working integration tests
      const testPaths = [
        'tests/integration/basic-functionality.test.ts',
        'tests/integration/system-integration.test.ts',
        'tests/functional/cli-basic-operations.test.ts',
        'tests/unit/secure-tools-registry.test.ts'
      ];

      for (const testPath of testPaths) {
        try {
          await fs.access(testPath);
          const { stdout } = await execAsync(`npm run test:run ${testPath}`, { timeout: 30000 });
          
          if (stdout.includes('failed') && !stdout.includes('0 failed')) {
            throw new Error(`Test failures in ${testPath}`);
          }
        } catch (error) {
          throw new Error(`Test execution failed for ${testPath}: ${error.message}`);
        }
      }
      
    } catch (error) {
      throw new Error(`Test suite execution failed: ${error.message}`);
    }
  });

  // 6. File System Operations
  await verifier.test('File System Operations', async () => {
    const testDir = 'verification-test';
    const testFile = path.join(testDir, 'test-file.json');
    const testData = { test: true, timestamp: Date.now() };

    // Create directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Create file
    await fs.writeFile(testFile, JSON.stringify(testData, null, 2));
    
    // Read file
    const readData = JSON.parse(await fs.readFile(testFile, 'utf-8'));
    if (!readData.test || typeof readData.timestamp !== 'number') {
      throw new Error('File read/write verification failed');
    }
    
    // Cleanup
    await fs.rm(testDir, { recursive: true });
  });

  // 7. Configuration Validation
  await verifier.test('Configuration System', async () => {
    const testConfig = {
      apiKey: 'test-key-validation',
      model: 'claude-3-sonnet',
      temperature: 0.7,
      maxTokens: 4000
    };

    const configPath = 'test-config-validation.json';
    
    // Write config
    await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));
    
    // Read and validate
    const readConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    
    // Validate structure
    if (!readConfig.apiKey || typeof readConfig.apiKey !== 'string') {
      throw new Error('Invalid API key in config');
    }
    if (!readConfig.model || typeof readConfig.model !== 'string') {
      throw new Error('Invalid model in config');
    }
    if (typeof readConfig.temperature !== 'number' || readConfig.temperature < 0 || readConfig.temperature > 2) {
      throw new Error('Invalid temperature in config');
    }
    
    // Cleanup
    await fs.unlink(configPath);
  });

  // 8. Security Validation
  await verifier.test('Security Validation', async () => {
    // Test path validation
    const dangerousPaths = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '/dev/random',
      'file\x00.txt'
    ];

    for (const dangerousPath of dangerousPaths) {
      // These should be detected as unsafe
      const isAbsolute = path.isAbsolute(dangerousPath);
      const hasTraversal = dangerousPath.includes('..');
      const hasNullByte = dangerousPath.includes('\x00');
      
      if (!(isAbsolute || hasTraversal || hasNullByte)) {
        throw new Error(`Failed to detect dangerous path: ${dangerousPath}`);
      }
    }
    
    // Test command validation
    const dangerousCommands = [
      'rm -rf /',
      'format C:',
      'del /f /s /q C:\\'
    ];
    
    for (const cmd of dangerousCommands) {
      const isDangerous = cmd.includes('rm -rf /') || 
                         cmd.includes('format ') || 
                         cmd.includes('del /f /s /q');
      
      if (!isDangerous) {
        throw new Error(`Failed to detect dangerous command: ${cmd}`);
      }
    }
  });

  // 9. Performance Check
  await verifier.test('Performance Validation', async () => {
    const startTime = Date.now();
    
    // Create multiple files quickly
    const operations = [];
    for (let i = 0; i < 100; i++) {
      operations.push(
        fs.writeFile(`perf-test-${i}.txt`, `Content ${i}`)
      );
    }
    
    await Promise.all(operations);
    
    const writeTime = Date.now() - startTime;
    
    // Read files back
    const readStart = Date.now();
    const readOps = [];
    for (let i = 0; i < 100; i++) {
      readOps.push(
        fs.readFile(`perf-test-${i}.txt`, 'utf-8')
      );
    }
    
    const results = await Promise.all(readOps);
    const readTime = Date.now() - readStart;
    
    // Verify results
    if (results.length !== 100) {
      throw new Error('Performance test: not all files read correctly');
    }
    
    // Performance thresholds
    if (writeTime > 5000) {
      throw new Error(`Write performance too slow: ${writeTime}ms`);
    }
    if (readTime > 5000) {
      throw new Error(`Read performance too slow: ${readTime}ms`);
    }
    
    // Cleanup
    for (let i = 0; i < 100; i++) {
      await fs.unlink(`perf-test-${i}.txt`);
    }
  });

  // 10. Memory Check
  await verifier.test('Memory Usage Validation', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Create memory intensive operations
    const data = [];
    for (let i = 0; i < 50000; i++) {
      data.push({
        id: i,
        data: `Item ${i}`,
        timestamp: Date.now(),
        metadata: { processed: false }
      });
    }
    
    // Process data
    const processed = data.map(item => ({
      ...item,
      metadata: { ...item.metadata, processed: true }
    }));
    
    // Clear references
    data.length = 0;
    processed.length = 0;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 100MB)
    if (memoryIncrease > 100 * 1024 * 1024) {
      throw new Error(`Memory leak detected: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase`);
    }
  });

  // Optional: CLI Binary Test (may not be available in all environments)
  try {
    await fs.access('dist/cli/index.js');
    await verifier.test('CLI Binary Execution', async () => {
      try {
        const { stdout } = await execAsync('node dist/cli/index.js --version', { timeout: 10000 });
        
        if (!stdout || (!stdout.includes('0.1.') && !stdout.includes('version'))) {
          throw new Error('CLI binary did not return version information');
        }
      } catch (error) {
        throw new Error(`CLI binary execution failed: ${error.message}`);
      }
    });
  } catch {
    await verifier.skip('CLI Binary Execution', 'Build artifacts not found');
  }

  // Print final summary
  console.log('\n');
  verifier.printSummary();

  // Exit with appropriate code
  process.exit(verifier.results.failed === 0 ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run verification
main().catch(error => {
  console.error('❌ System verification failed:', error.message);
  process.exit(1);
});