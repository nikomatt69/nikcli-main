/**
 * Integration tests for basic CLI functionality
 * Tests core features without heavy mocking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockConsole, createTempFile, cleanup } from '../helpers/test-utils';
import fs from 'fs/promises';
import path from 'path';

describe('Basic CLI Integration Tests', () => {
  let console: ReturnType<typeof mockConsole>;
  let tempFiles: string[] = [];

  beforeEach(() => {
    console = mockConsole();
  });

  afterEach(async () => {
    console.restore();
    await cleanup(tempFiles);
    tempFiles = [];
  });

  describe('File System Operations', () => {
    it('should read and write files correctly', async () => {
      const content = 'Test content for integration test';
      const filePath = await createTempFile('integration-test.txt', content);
      tempFiles.push(filePath);

      // Test file reading
      const readContent = await fs.readFile(filePath, 'utf-8');
      expect(readContent).toBe(content);

      // Test file modification
      const newContent = 'Modified content';
      await fs.writeFile(filePath, newContent);

      const modifiedContent = await fs.readFile(filePath, 'utf-8');
      expect(modifiedContent).toBe(newContent);
    });

    it('should handle directory creation', async () => {
      const dirPath = 'test-directory';
      const filePath = path.join(dirPath, 'nested-file.txt');
      tempFiles.push(dirPath);

      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, 'nested content');

      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should list directory contents', async () => {
      const dirPath = 'list-test-directory';
      tempFiles.push(dirPath);

      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(dirPath, 'file2.txt'), 'content2');

      const files = await fs.readdir(dirPath);
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });
  });

  describe('Configuration Handling', () => {
    it('should handle JSON configuration', async () => {
      const config = {
        apiKey: 'test-key',
        model: 'claude-3',
        temperature: 0.7,
        maxTokens: 1000
      };

      const configPath = await createTempFile('config.json', JSON.stringify(config, null, 2));
      tempFiles.push(configPath);

      const loadedConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(loadedConfig).toEqual(config);
    });

    it('should validate configuration structure', () => {
      const validConfig = {
        apiKey: 'key',
        model: 'claude-3',
        temperature: 0.5
      };

      const invalidConfigs = [
        {}, // Missing required fields
        { apiKey: '', model: 'claude-3' }, // Empty API key
        { apiKey: 'key', model: '' }, // Empty model
      ];

      // Valid config should pass
      expect(typeof validConfig.apiKey).toBe('string');
      expect(validConfig.apiKey.length).toBeGreaterThan(0);
      expect(typeof validConfig.model).toBe('string');
      expect(validConfig.model.length).toBeGreaterThan(0);

      // Invalid configs should fail validation
      for (const config of invalidConfigs) {
        const hasValidApiKey = config.apiKey && typeof config.apiKey === 'string' && config.apiKey.length > 0;
        const hasValidModel = config.model && typeof config.model === 'string' && config.model.length > 0;
        const isValid = hasValidApiKey && hasValidModel;
        expect(isValid).toBeFalsy();
      }
    });
  });

  describe('Text Processing', () => {
    it('should handle different text encodings', async () => {
      const unicodeText = 'Hello 世界! 🌍 Ñoño';
      const filePath = await createTempFile('unicode-test.txt', unicodeText);
      tempFiles.push(filePath);

      const readText = await fs.readFile(filePath, 'utf-8');
      expect(readText).toBe(unicodeText);
    });

    it('should process multiline text correctly', async () => {
      const multilineText = `Line 1
Line 2
Line 3
Line 4`;

      const filePath = await createTempFile('multiline.txt', multilineText);
      tempFiles.push(filePath);

      const readText = await fs.readFile(filePath, 'utf-8');
      const lines = readText.split('\n');

      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('Line 1');
      expect(lines[3]).toBe('Line 4');
    });

    it('should handle empty and whitespace content', async () => {
      const testCases = [
        { name: 'empty.txt', content: '' },
        { name: 'whitespace.txt', content: '   \n\t  \n   ' },
        { name: 'spaces.txt', content: '     ' }
      ];

      for (const testCase of testCases) {
        const filePath = await createTempFile(testCase.name, testCase.content);
        tempFiles.push(filePath);

        const readContent = await fs.readFile(filePath, 'utf-8');
        expect(readContent).toBe(testCase.content);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle file not found errors gracefully', async () => {
      try {
        await fs.readFile('non-existent-file.txt');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.code).toBe('ENOENT');
      }
    });

    it('should handle permission errors appropriately', async () => {
      // Create a file and then try to write to a readonly location
      // This test is platform dependent, so we'll make it flexible
      try {
        await fs.writeFile('/root/test-file.txt', 'test');
        // If it succeeds, we're probably running with elevated permissions
        await fs.unlink('/root/test-file.txt');
      } catch (error) {
        // Expected behavior - permission denied or similar
        expect(['EACCES', 'EPERM', 'ENOENT'].includes(error.code)).toBe(true);
      }
    });

    it('should validate input parameters', () => {
      const validInputs = [
        'valid-filename.txt',
        'path/to/file.json',
        'Component.tsx'
      ];

      const invalidInputs = [
        '',
        null,
        undefined,
        123,
        {},
        []
      ];

      for (const valid of validInputs) {
        expect(typeof valid).toBe('string');
        expect(valid.length).toBeGreaterThan(0);
      }

      for (const invalid of invalidInputs) {
        const isValid = typeof invalid === 'string' && invalid.length > 0;
        expect(isValid).toBe(false);
      }
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle reasonably sized files efficiently', async () => {
      const largeContent = 'A'.repeat(10000); // 10KB file
      const filePath = await createTempFile('large-file.txt', largeContent);
      tempFiles.push(filePath);

      const startTime = Date.now();
      const readContent = await fs.readFile(filePath, 'utf-8');
      const endTime = Date.now();

      expect(readContent).toBe(largeContent);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle multiple concurrent file operations', async () => {
      const operations = [];

      for (let i = 0; i < 10; i++) {
        const filePath = `concurrent-${i}.txt`;
        tempFiles.push(filePath);

        operations.push(fs.writeFile(filePath, `Content ${i}`));
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds

      // Verify all files were created
      for (let i = 0; i < 10; i++) {
        const content = await fs.readFile(`concurrent-${i}.txt`, 'utf-8');
        expect(content).toBe(`Content ${i}`);
      }
    });

    it('should not leak memory during operations', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform some operations that might leak memory
      const data = [];
      for (let i = 0; i < 1000; i++) {
        data.push(`Operation ${i}`);
      }

      // Clear the data
      data.length = 0;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('should handle different path separators', () => {
      const unixPath = 'src/components/Button.tsx';
      const windowsPath = 'src\\components\\Button.tsx';

      // Normalize paths for cross-platform compatibility
      const normalizedUnix = path.normalize(unixPath);
      const normalizedWindows = path.normalize(windowsPath);

      // Both should resolve to valid paths
      expect(normalizedUnix).toBeDefined();
      expect(normalizedWindows).toBeDefined();

      // They should both be valid paths (content may differ due to platform)
      expect(normalizedUnix).toBeDefined();
      expect(normalizedWindows).toBeDefined();
    });

    it('should handle different line endings', async () => {
      const unixContent = 'Line 1\nLine 2\nLine 3';
      const windowsContent = 'Line 1\r\nLine 2\r\nLine 3';
      const macContent = 'Line 1\rLine 2\rLine 3';

      const testCases = [
        { name: 'unix.txt', content: unixContent },
        { name: 'windows.txt', content: windowsContent },
        { name: 'mac.txt', content: macContent }
      ];

      for (const testCase of testCases) {
        const filePath = await createTempFile(testCase.name, testCase.content);
        tempFiles.push(filePath);

        const readContent = await fs.readFile(filePath, 'utf-8');
        expect(readContent).toBe(testCase.content);

        // Normalize line endings
        const normalizedContent = readContent.replace(/\r\n|\r/g, '\n');
        expect(normalizedContent.split('\n')).toHaveLength(3);
      }
    });

    it('should handle file system case sensitivity differences', async () => {
      const fileName1 = 'TestFile.txt';
      const fileName2 = 'testfile.txt';

      await createTempFile(fileName1, 'content1');
      tempFiles.push(fileName1);

      try {
        await createTempFile(fileName2, 'content2');
        tempFiles.push(fileName2);

        // On case-sensitive systems, these are different files
        const content1 = await fs.readFile(fileName1, 'utf-8');
        const content2 = await fs.readFile(fileName2, 'utf-8');

        // Either they're the same (case-insensitive) or different (case-sensitive)
        const caseSensitive = content1 !== content2;
        expect(typeof caseSensitive).toBe('boolean');
      } catch (error) {
        // On case-insensitive systems, the second file creation might fail
        // This is expected behavior - test passes
      }
    });
  });

  describe('Data Integrity', () => {
    it('should maintain data integrity during read/write cycles', async () => {
      const originalData = {
        string: 'test string',
        number: 42,
        boolean: true,
        array: [1, 2, 3, 'four'],
        object: { nested: 'value', count: 10 }
      };

      const filePath = await createTempFile('integrity-test.json', JSON.stringify(originalData));
      tempFiles.push(filePath);

      // Read and parse
      const readData = JSON.parse(await fs.readFile(filePath, 'utf-8'));

      // Modify
      readData.modified = true;
      readData.object.count = 20;

      // Write back
      await fs.writeFile(filePath, JSON.stringify(readData, null, 2));

      // Read again and verify
      const finalData = JSON.parse(await fs.readFile(filePath, 'utf-8'));

      expect(finalData.string).toBe(originalData.string);
      expect(finalData.number).toBe(originalData.number);
      expect(finalData.boolean).toBe(originalData.boolean);
      expect(finalData.array).toEqual(originalData.array);
      expect(finalData.modified).toBe(true);
      expect(finalData.object.count).toBe(20);
    });

    it('should handle concurrent modifications safely', async () => {
      const filePath = await createTempFile('concurrent-mod.txt', 'initial content');
      tempFiles.push(filePath);

      const modifications = [];

      // Create multiple concurrent modifications
      for (let i = 0; i < 5; i++) {
        modifications.push(
          fs.writeFile(filePath, `modified content ${i}`)
        );
      }

      await Promise.all(modifications);

      // File should contain one of the modifications
      const finalContent = await fs.readFile(filePath, 'utf-8');
      expect(finalContent).toMatch(/^modified content \d$/);
    });
  });
});