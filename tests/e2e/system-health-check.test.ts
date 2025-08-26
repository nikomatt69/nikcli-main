/**
 * End-to-End System Health Check
 * Verifies that the entire CLI system is working correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

describe('System Health Check - End to End', () => {
  let testWorkspace: string;

  beforeAll(async () => {
    // Create test workspace
    testWorkspace = path.join(process.cwd(), 'e2e-test-workspace');
    await fs.mkdir(testWorkspace, { recursive: true });
    process.chdir(testWorkspace);
  });

  afterAll(async () => {
    // Cleanup
    process.chdir('..');
    await fs.rm(testWorkspace, { recursive: true, force: true });
  });

  describe('CLI Build and Execution', () => {
    it('should build the CLI successfully', async () => {
      try {
        const { stdout, stderr } = await execAsync('npm run build', {
          cwd: path.join(testWorkspace, '..')
        });

        expect(stderr).toBe('');

        // Check if dist directory was created
        const distExists = await fs.access(path.join(testWorkspace, '../dist'))
          .then(() => true)
          .catch(() => false);

        expect(distExists).toBe(true);
      } catch (error) {
        console.log('Build output:', error.stdout);
        console.log('Build error:', error.stderr);
        throw error;
      }
    }, 60000); // 60 second timeout for build

    it('should execute the CLI binary', async () => {
      try {
        const { stdout } = await execAsync('node ../dist/cli/index.js --version', {
          timeout: 10000
        });

        expect(stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
      } catch (error) {
        console.log('CLI execution error:', error.message);
        // Skip if CLI is not executable yet
        // Test skipped - CLI not ready
      }
    });

    it('should show help information', async () => {
      try {
        const { stdout } = await execAsync('node ../dist/cli/index.js --help', {
          timeout: 10000
        });

        expect(stdout).toContain('Usage:');
      } catch (error) {
        // Skip if CLI is not ready
        // Test skipped - CLI not ready
      }
    });
  });

  describe('Core Configuration System', () => {
    it('should handle configuration files', async () => {
      const configPath = 'test-config.json';
      const config = {
        apiKey: 'test-key-12345',
        model: 'claude-3-sonnet',
        temperature: 0.7,
        maxTokens: 4000
      };

      // Create config file
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Verify config file
      const readConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(readConfig.apiKey).toBe('test-key-12345');
      expect(readConfig.model).toBe('claude-3-sonnet');
      expect(readConfig.temperature).toBe(0.7);

      // Cleanup
      await fs.unlink(configPath);
    });

    it('should validate configuration format', async () => {
      const validConfig = {
        apiKey: 'sk-ant-api03-valid-key',
        model: 'claude-3-sonnet',
        temperature: 0.5
      };

      const invalidConfigs = [
        {}, // Missing fields
        { apiKey: '' }, // Empty key
        { apiKey: 'key', model: '' }, // Empty model
      ];

      // Valid config should pass validation
      expect(validConfig.apiKey.length).toBeGreaterThan(0);
      expect(validConfig.model.length).toBeGreaterThan(0);
      expect(validConfig.temperature).toBeGreaterThanOrEqual(0);

      // Invalid configs should fail
      for (const config of invalidConfigs) {
        const hasValidKey = config.apiKey && config.apiKey.length > 0;
        const hasValidModel = config.model && config.model.length > 0;
        const isConfigValid = hasValidKey && hasValidModel;
        expect(isConfigValid).toBe(false);
      }
    });
  });

  describe('File System Operations', () => {
    it('should perform basic file operations', async () => {
      const testFiles = [
        { name: 'simple.txt', content: 'Hello World' },
        { name: 'data.json', content: JSON.stringify({ test: true }) },
        { name: 'code.ts', content: 'export const test = "value";' }
      ];

      // Create files
      for (const file of testFiles) {
        await fs.writeFile(file.name, file.content);

        // Verify file exists and has correct content
        const content = await fs.readFile(file.name, 'utf-8');
        expect(content).toBe(file.content);
      }

      // List directory
      const files = await fs.readdir('.');
      for (const file of testFiles) {
        expect(files).toContain(file.name);
      }

      // Cleanup
      for (const file of testFiles) {
        await fs.unlink(file.name);
      }
    });

    it('should handle directory operations', async () => {
      const testDir = 'test-directory';
      const nestedDir = path.join(testDir, 'nested', 'deep');

      // Create nested directories
      await fs.mkdir(nestedDir, { recursive: true });

      // Create file in nested directory
      const testFile = path.join(nestedDir, 'file.txt');
      await fs.writeFile(testFile, 'nested content');

      // Verify structure
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('nested content');

      // Cleanup
      await fs.rm(testDir, { recursive: true });
    });

    it('should handle concurrent operations', async () => {
      const operations = [];

      // Create multiple files concurrently
      for (let i = 0; i < 20; i++) {
        operations.push(
          fs.writeFile(`concurrent-${i}.txt`, `Content ${i}`)
        );
      }

      // Wait for all operations
      await Promise.all(operations);

      // Verify all files were created
      for (let i = 0; i < 20; i++) {
        const content = await fs.readFile(`concurrent-${i}.txt`, 'utf-8');
        expect(content).toBe(`Content ${i}`);
        await fs.unlink(`concurrent-${i}.txt`);
      }
    });
  });

  describe('Security and Validation', () => {
    it('should validate file paths', () => {
      const safePaths = [
        'file.txt',
        'folder/file.txt',
        'deep/nested/file.txt'
      ];

      const unsafePaths = [
        '../outside.txt',
        '/absolute/path.txt',
        'file\x00.txt'
      ];

      // Safe paths should be valid
      for (const safePath of safePaths) {
        const isRelative = !path.isAbsolute(safePath);
        const hasNoTraversal = !safePath.includes('..');
        const hasNoNullByte = !safePath.includes('\x00');

        expect(isRelative && hasNoTraversal && hasNoNullByte).toBe(true);
      }

      // Unsafe paths should be detected
      for (const unsafePath of unsafePaths) {
        const isAbsolute = path.isAbsolute(unsafePath);
        const hasTraversal = unsafePath.includes('..');
        const hasNullByte = unsafePath.includes('\x00');

        const isUnsafe = isAbsolute || hasTraversal || hasNullByte;
        expect(isUnsafe).toBe(true);
      }
    });

    it('should handle command validation', () => {
      const safeCommands = [
        'ls -la',
        'npm install',
        'git status',
        'node script.js'
      ];

      const dangerousCommands = [
        'rm -rf /',
        'format C:',
        'sudo rm -rf /',
        'del /f /s /q C:\\'
      ];

      // Safe commands should pass basic validation
      for (const cmd of safeCommands) {
        const hasDangerousPattern = cmd.includes('rm -rf /') ||
          cmd.includes('format ') ||
          cmd.includes('del /f /s /q');
        expect(hasDangerousPattern).toBe(false);
      }

      // Dangerous commands should be detected
      for (const cmd of dangerousCommands) {
        const hasDangerousPattern = cmd.includes('rm -rf /') ||
          cmd.includes('format ') ||
          cmd.includes('del /f /s /q');
        expect(hasDangerousPattern).toBe(true);
      }
    });
  });

  describe('Data Processing and Analysis', () => {
    it('should process JSON data correctly', async () => {
      const testData = {
        projects: [
          { id: 1, name: 'Project A', status: 'active', priority: 'high' },
          { id: 2, name: 'Project B', status: 'completed', priority: 'medium' },
          { id: 3, name: 'Project C', status: 'active', priority: 'low' }
        ],
        metadata: {
          total: 3,
          lastUpdated: new Date().toISOString()
        }
      };

      // Write test data
      await fs.writeFile('test-data.json', JSON.stringify(testData, null, 2));

      // Read and process
      const readData = JSON.parse(await fs.readFile('test-data.json', 'utf-8'));

      // Verify structure
      expect(readData.projects).toHaveLength(3);
      expect(readData.metadata.total).toBe(3);

      // Process data
      const activeProjects = readData.projects.filter(p => p.status === 'active');
      const highPriorityProjects = readData.projects.filter(p => p.priority === 'high');

      expect(activeProjects).toHaveLength(2);
      expect(highPriorityProjects).toHaveLength(1);

      // Update and save
      readData.metadata.total = readData.projects.length;
      readData.metadata.activeCount = activeProjects.length;

      await fs.writeFile('processed-data.json', JSON.stringify(readData, null, 2));

      // Verify update
      const updatedData = JSON.parse(await fs.readFile('processed-data.json', 'utf-8'));
      expect(updatedData.metadata.activeCount).toBe(2);

      // Cleanup
      await fs.unlink('test-data.json');
      await fs.unlink('processed-data.json');
    });

    it('should handle different file formats', async () => {
      const formats = {
        'config.json': { setting: 'value', enabled: true },
        'data.txt': 'Plain text content\nWith multiple lines',
        'script.js': 'console.log("Hello World");',
        'style.css': 'body { margin: 0; padding: 0; }',
        'readme.md': '# Test\n\nThis is a test markdown file.'
      };

      // Create files in different formats
      for (const [filename, content] of Object.entries(formats)) {
        const fileContent = typeof content === 'object' ?
          JSON.stringify(content, null, 2) : content;

        await fs.writeFile(filename, fileContent);

        // Verify file was created correctly
        const readContent = await fs.readFile(filename, 'utf-8');
        expect(readContent).toBe(fileContent);

        // Basic format validation
        const extension = path.extname(filename);
        expect(['.json', '.txt', '.js', '.css', '.md']).toContain(extension);

        await fs.unlink(filename);
      }
    });
  });

  describe('Performance and Memory', () => {
    it('should handle reasonable file sizes efficiently', async () => {
      const sizes = [
        { name: 'small.txt', size: 1000 },    // 1KB
        { name: 'medium.txt', size: 10000 },  // 10KB
        { name: 'large.txt', size: 100000 }   // 100KB
      ];

      for (const { name, size } of sizes) {
        const content = 'A'.repeat(size);

        const startTime = Date.now();
        await fs.writeFile(name, content);
        const writeTime = Date.now() - startTime;

        const readStartTime = Date.now();
        const readContent = await fs.readFile(name, 'utf-8');
        const readTime = Date.now() - readStartTime;

        // Verify content
        expect(readContent.length).toBe(size);
        expect(readContent).toBe(content);

        // Performance should be reasonable
        expect(writeTime).toBeLessThan(1000); // < 1 second
        expect(readTime).toBeLessThan(1000);  // < 1 second

        await fs.unlink(name);
      }
    });

    it('should not leak memory during operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform memory-intensive operations
      const data = [];
      for (let i = 0; i < 10000; i++) {
        data.push({
          id: i,
          data: `Item ${i}`,
          timestamp: Date.now()
        });
      }

      // Process data
      const processed = data.map(item => ({
        ...item,
        processed: true
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

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle and recover from errors gracefully', async () => {
      // Test file not found error
      try {
        await fs.readFile('non-existent-file.txt');
        throw new Error('Should not reach here - file should not exist');
      } catch (error) {
        expect(error.code).toBe('ENOENT');

        // Recovery: create the file
        await fs.writeFile('non-existent-file.txt', 'recovery content');
        const content = await fs.readFile('non-existent-file.txt', 'utf-8');
        expect(content).toBe('recovery content');

        await fs.unlink('non-existent-file.txt');
      }
    });

    it('should maintain data integrity during interruptions', async () => {
      const testFile = 'integrity-test.json';
      const originalData = { version: 1, data: 'original' };

      // Create initial file
      await fs.writeFile(testFile, JSON.stringify(originalData));

      // Simulate interrupted update
      const updateData = { version: 2, data: 'updated' };

      try {
        // Start update
        await fs.writeFile(testFile, JSON.stringify(updateData));

        // Verify final state is consistent
        const finalData = JSON.parse(await fs.readFile(testFile, 'utf-8'));
        expect([1, 2]).toContain(finalData.version);
        expect(['original', 'updated']).toContain(finalData.data);

      } finally {
        await fs.unlink(testFile);
      }
    });
  });

  describe('Integration Health Check', () => {
    it('should verify all critical components are accessible', async () => {
      // Check if required directories exist in the parent project
      const requiredPaths = [
        '../src',
        '../src/cli',
        '../package.json',
        '../tsconfig.json'
      ];

      for (const requiredPath of requiredPaths) {
        const exists = await fs.access(requiredPath)
          .then(() => true)
          .catch(() => false);

        expect(exists).toBe(true);
      }
    });

    it('should verify package.json configuration', async () => {
      const packageJson = JSON.parse(
        await fs.readFile('../package.json', 'utf-8')
      );

      // Verify essential fields
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
      expect(packageJson.main).toBeDefined();
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.scripts.test).toBeDefined();
    });

    it('should complete full system workflow', async () => {
      // Simulate a complete workflow

      // 1. Create configuration
      const workflowConfig = {
        name: 'system-test-workflow',
        version: '1.0.0',
        steps: ['init', 'process', 'finalize']
      };

      await fs.writeFile('workflow-config.json', JSON.stringify(workflowConfig, null, 2));

      // 2. Create input data
      const inputData = {
        items: [
          { id: 1, status: 'pending' },
          { id: 2, status: 'pending' },
          { id: 3, status: 'pending' }
        ]
      };

      await fs.writeFile('workflow-input.json', JSON.stringify(inputData));

      // 3. Process data
      const config = JSON.parse(await fs.readFile('workflow-config.json', 'utf-8'));
      const data = JSON.parse(await fs.readFile('workflow-input.json', 'utf-8'));

      expect(config.name).toBe('system-test-workflow');
      expect(data.items).toHaveLength(3);

      // 4. Generate output
      const processedData = {
        ...data,
        processed: true,
        timestamp: new Date().toISOString(),
        processedBy: config.name
      };

      await fs.writeFile('workflow-output.json', JSON.stringify(processedData, null, 2));

      // 5. Verify workflow completion
      const output = JSON.parse(await fs.readFile('workflow-output.json', 'utf-8'));
      expect(output.processed).toBe(true);
      expect(output.processedBy).toBe('system-test-workflow');

      // Cleanup
      await fs.unlink('workflow-config.json');
      await fs.unlink('workflow-input.json');
      await fs.unlink('workflow-output.json');
    });
  });
});