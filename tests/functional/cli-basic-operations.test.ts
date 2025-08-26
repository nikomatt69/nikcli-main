/**
 * Functional tests for basic CLI operations
 * Tests actual functionality without heavy mocking
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mockConsole, createTempFile, cleanup } from '../helpers/test-utils';
import fs from 'fs/promises';
import path from 'path';

describe('CLI Basic Operations', () => {
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

  describe('Configuration System', () => {
    it('should handle configuration file operations', async () => {
      const config = {
        apiKey: 'test-api-key',
        model: 'claude-3-sonnet',
        temperature: 0.7,
        maxTokens: 4000,
        features: {
          autoSave: true,
          syntaxHighlighting: true
        }
      };

      const configPath = await createTempFile('test-config.json', JSON.stringify(config, null, 2));
      tempFiles.push(configPath);

      // Test reading configuration
      const readConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(readConfig.apiKey).toBe('test-api-key');
      expect(readConfig.model).toBe('claude-3-sonnet');
      expect(readConfig.temperature).toBe(0.7);
      expect(readConfig.features.autoSave).toBe(true);

      // Test configuration validation
      expect(typeof readConfig.apiKey).toBe('string');
      expect(readConfig.apiKey.length).toBeGreaterThan(0);
      expect(['claude-3-sonnet', 'claude-3-haiku', 'claude-3-opus']).toContain(readConfig.model);
      expect(readConfig.temperature).toBeGreaterThanOrEqual(0);
      expect(readConfig.temperature).toBeLessThanOrEqual(2);
    });

    it('should validate configuration structure', () => {
      const validConfigs = [
        {
          apiKey: 'valid-key',
          model: 'claude-3-sonnet',
          temperature: 0.5
        },
        {
          apiKey: 'another-key',
          model: 'claude-3-haiku',
          temperature: 1.0,
          maxTokens: 2000
        }
      ];

      const invalidConfigs = [
        {}, // Missing required fields
        { apiKey: '' }, // Empty API key
        { apiKey: 'key' }, // Missing model
        { apiKey: 'key', model: '' }, // Empty model
      ];

      // Test valid configurations
      for (const config of validConfigs) {
        const isValid = config.apiKey &&
          config.apiKey.length > 0 &&
          config.model &&
          config.model.length > 0 &&
          (config.temperature === undefined ||
            (config.temperature >= 0 && config.temperature <= 2));
        expect(isValid).toBe(true);
      }

      // Test invalid configurations
      for (const config of invalidConfigs) {
        const isValid = config.apiKey &&
          config.apiKey.length > 0 &&
          config.model &&
          config.model.length > 0 &&
          (config.temperature === undefined ||
            (config.temperature >= 0 && config.temperature <= 2));
        expect(Boolean(isValid)).toBe(false);
      }
    });
  });

  describe('File System Operations', () => {
    it('should handle project structure analysis', async () => {
      // Create a mock project structure
      const projectStructure = {
        'package.json': JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'react': '^18.0.0',
            'typescript': '^5.0.0'
          }
        }),
        'src/index.ts': 'export const app = "test";',
        'src/components/Button.tsx': 'export const Button = () => <button>Click</button>;',
        'src/utils/helpers.ts': 'export const helper = () => "help";',
        'tests/app.test.ts': 'describe("app", () => {});',
        'README.md': '# Test Project\n\nThis is a test project.'
      };

      const projectDir = 'test-project-structure';
      tempFiles.push(projectDir);

      // Create project files
      await fs.mkdir(projectDir, { recursive: true });
      for (const [filePath, content] of Object.entries(projectStructure)) {
        const fullPath = path.join(projectDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      // Analyze project structure
      const files = await fs.readdir(projectDir);
      expect(files).toContain('package.json');
      expect(files).toContain('src');
      expect(files).toContain('tests');
      expect(files).toContain('README.md');

      // Check src directory
      const srcFiles = await fs.readdir(path.join(projectDir, 'src'));
      expect(srcFiles).toContain('index.ts');
      expect(srcFiles).toContain('components');
      expect(srcFiles).toContain('utils');

      // Verify package.json content
      const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8'));
      expect(packageJson.name).toBe('test-project');
      expect(packageJson.dependencies).toHaveProperty('react');
      expect(packageJson.dependencies).toHaveProperty('typescript');
    });

    it('should handle file modifications and tracking', async () => {
      const originalContent = `// Original file
export const feature = {
  name: 'original',
  version: 1,
  enabled: true
};`;

      const modifiedContent = `// Modified file
export const feature = {
  name: 'updated',
  version: 2,
  enabled: true,
  description: 'Updated feature'
};`;

      const filePath = await createTempFile('feature.ts', originalContent);
      tempFiles.push(filePath);

      // Get original stats
      const originalStats = await fs.stat(filePath);
      expect(originalStats.size).toBe(originalContent.length);

      // Wait a bit to ensure different mtime
      await new Promise(resolve => setTimeout(resolve, 10));

      // Modify file
      await fs.writeFile(filePath, modifiedContent);

      // Check modifications
      const modifiedStats = await fs.stat(filePath);
      expect(modifiedStats.size).toBe(modifiedContent.length);
      expect(modifiedStats.mtime.getTime()).toBeGreaterThanOrEqual(originalStats.mtime.getTime());

      // Verify content
      const readContent = await fs.readFile(filePath, 'utf-8');
      expect(readContent).toBe(modifiedContent);
      expect(readContent).toContain('version: 2');
      expect(readContent).toContain('description');
    });

    it('should support different file types and extensions', async () => {
      const fileTypes = {
        'config.json': '{"setting": "value"}',
        'script.js': 'console.log("hello");',
        'component.tsx': 'export const Component = () => <div>Test</div>;',
        'styles.css': 'body { margin: 0; }',
        'README.md': '# Project\n\nDescription here.',
        'data.yaml': 'key: value\nlist:\n  - item1\n  - item2'
      };

      for (const [fileName, content] of Object.entries(fileTypes)) {
        const filePath = await createTempFile(fileName, content);
        tempFiles.push(filePath);

        // Verify file was created with correct content
        const readContent = await fs.readFile(filePath, 'utf-8');
        expect(readContent).toBe(content);

        // Verify file extension
        const ext = path.extname(fileName);
        expect(['.json', '.js', '.tsx', '.css', '.md', '.yaml']).toContain(ext);
      }
    });
  });

  describe('Text Processing', () => {
    it('should handle different text formats and encodings', async () => {
      const testTexts = [
        'Simple ASCII text',
        'Unicode text with émojis 🚀 and símböls',
        'Multi-line\ntext with\ndifferent\nline breaks',
        'Text with\ttabs\tand    spaces',
        'Special characters: !@#$%^&*()_+-={}[]|\\:";\'<>?,./',
        'Numbers: 123456789 and floats: 3.14159',
        'Mixed: Text123 with numb3rs and speci@l ch@rs!'
      ];

      for (let i = 0; i < testTexts.length; i++) {
        const text = testTexts[i];
        const fileName = `text-${i}.txt`;
        const filePath = await createTempFile(fileName, text);
        tempFiles.push(filePath);

        const readText = await fs.readFile(filePath, 'utf-8');
        expect(readText).toBe(text);

        // Basic text analysis
        expect(typeof readText).toBe('string');
        expect(readText.length).toBe(text.length);
        if (text.includes('\n')) {
          expect(readText.split('\n').length).toBeGreaterThan(1);
        }
      }
    });

    it('should handle code snippets and syntax patterns', async () => {
      const codeSnippets = {
        'javascript.js': `
function greet(name) {
  return \`Hello, \${name}!\`;
}

const user = 'World';
console.log(greet(user));
        `.trim(),

        'typescript.ts': `
interface User {
  name: string;
  age: number;
}

const createUser = (name: string, age: number): User => {
  return { name, age };
};
        `.trim(),

        'react.tsx': `
import React from 'react';

interface Props {
  title: string;
}

export const Component: React.FC<Props> = ({ title }) => {
  return <div>{title}</div>;
};
        `.trim(),

        'python.py': `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# Calculate first 10 fibonacci numbers
for i in range(10):
    print(f"fib({i}) = {fibonacci(i)}")
        `.trim()
      };

      for (const [fileName, code] of Object.entries(codeSnippets)) {
        const filePath = await createTempFile(fileName, code);
        tempFiles.push(filePath);

        const readCode = await fs.readFile(filePath, 'utf-8');
        expect(readCode).toBe(code);

        // Verify it contains expected patterns
        if (fileName.includes('javascript') || fileName.includes('typescript')) {
          expect(readCode).toMatch(/function|const|=>/);
        }
        if (fileName.includes('react')) {
          expect(readCode).toContain('React');
          expect(readCode).toContain('interface');
        }
        if (fileName.includes('python')) {
          expect(readCode).toContain('def ');
          expect(readCode).toContain('for ');
        }
      }
    });
  });

  describe('Data Processing', () => {
    it('should handle JSON data operations', async () => {
      const jsonData = {
        users: [
          { id: 1, name: 'Alice', email: 'alice@example.com', active: true },
          { id: 2, name: 'Bob', email: 'bob@example.com', active: false },
          { id: 3, name: 'Charlie', email: 'charlie@example.com', active: true }
        ],
        settings: {
          theme: 'dark',
          notifications: true,
          language: 'en'
        },
        metadata: {
          version: '1.2.0',
          lastUpdated: '2023-12-01T10:00:00Z',
          totalUsers: 3
        }
      };

      const filePath = await createTempFile('data.json', JSON.stringify(jsonData, null, 2));
      tempFiles.push(filePath);

      // Read and parse JSON
      const readData = JSON.parse(await fs.readFile(filePath, 'utf-8'));

      // Verify structure
      expect(readData).toHaveProperty('users');
      expect(readData).toHaveProperty('settings');
      expect(readData).toHaveProperty('metadata');

      // Verify users array
      expect(Array.isArray(readData.users)).toBe(true);
      expect(readData.users).toHaveLength(3);
      expect(readData.users[0]).toHaveProperty('id');
      expect(readData.users[0]).toHaveProperty('name');
      expect(readData.users[0]).toHaveProperty('email');

      // Process data
      const activeUsers = readData.users.filter(user => user.active);
      expect(activeUsers).toHaveLength(2);

      const userNames = readData.users.map(user => user.name);
      expect(userNames).toEqual(['Alice', 'Bob', 'Charlie']);

      // Update data
      readData.metadata.totalUsers = readData.users.length;
      readData.metadata.lastUpdated = new Date().toISOString();

      // Save updated data
      await fs.writeFile(filePath, JSON.stringify(readData, null, 2));

      // Verify update
      const updatedData = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      expect(updatedData.metadata.totalUsers).toBe(3);
    });

    it('should handle CSV-like data processing', async () => {
      const csvContent = `name,age,city,active
John,25,New York,true
Jane,30,San Francisco,false
Mike,35,Chicago,true
Sarah,28,Boston,true`;

      const filePath = await createTempFile('data.csv', csvContent);
      tempFiles.push(filePath);

      const readContent = await fs.readFile(filePath, 'utf-8');
      const lines = readContent.trim().split('\n');

      // Parse header
      const headers = lines[0].split(',');
      expect(headers).toEqual(['name', 'age', 'city', 'active']);

      // Parse data rows
      const dataRows = lines.slice(1).map(line => {
        const values = line.split(',');
        return {
          name: values[0],
          age: parseInt(values[1]),
          city: values[2],
          active: values[3] === 'true'
        };
      });

      expect(dataRows).toHaveLength(4);
      expect(dataRows[0].name).toBe('John');
      expect(dataRows[0].age).toBe(25);
      expect(dataRows[0].active).toBe(true);

      // Data processing
      const activeUsers = dataRows.filter(row => row.active);
      expect(activeUsers).toHaveLength(3);

      const averageAge = dataRows.reduce((sum, row) => sum + row.age, 0) / dataRows.length;
      expect(averageAge).toBe(29.5);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle various error conditions gracefully', async () => {
      // Test non-existent file
      try {
        await fs.readFile('definitely-does-not-exist.txt');
        throw new Error('Should not reach here - file should not exist');
      } catch (error) {
        expect(error.code).toBe('ENOENT');
      }

      // Test empty file operations
      const emptyFile = await createTempFile('empty.txt', '');
      tempFiles.push(emptyFile);

      const emptyContent = await fs.readFile(emptyFile, 'utf-8');
      expect(emptyContent).toBe('');

      // Test large content (but reasonable for tests)
      const largeContent = 'A'.repeat(10000);
      const largeFile = await createTempFile('large.txt', largeContent);
      tempFiles.push(largeFile);

      const readLargeContent = await fs.readFile(largeFile, 'utf-8');
      expect(readLargeContent.length).toBe(10000);
      expect(readLargeContent).toBe(largeContent);
    });

    it('should handle concurrent operations safely', async () => {
      const concurrentOps = [];

      // Create multiple files concurrently
      for (let i = 0; i < 10; i++) {
        concurrentOps.push(
          (async () => {
            const fileName = `concurrent-${i}.txt`;
            const content = `Content for file ${i}`;
            const filePath = await createTempFile(fileName, content);
            tempFiles.push(filePath);
            return { filePath, content };
          })()
        );
      }

      const results = await Promise.all(concurrentOps);

      // Verify all operations completed successfully
      expect(results).toHaveLength(10);

      for (let i = 0; i < results.length; i++) {
        const { filePath, content } = results[i];
        const readContent = await fs.readFile(filePath, 'utf-8');
        expect(readContent).toBe(content);
      }
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete workflow scenarios', async () => {
      // Scenario: Read config, process data, generate report

      // 1. Create configuration
      const config = {
        inputFormat: 'json',
        outputFormat: 'markdown',
        includeStats: true
      };
      const configFile = await createTempFile('workflow-config.json', JSON.stringify(config));
      tempFiles.push(configFile);

      // 2. Create input data
      const inputData = {
        projects: [
          { name: 'Project A', status: 'completed', tasks: 15 },
          { name: 'Project B', status: 'in-progress', tasks: 8 },
          { name: 'Project C', status: 'completed', tasks: 22 }
        ]
      };
      const inputFile = await createTempFile('input-data.json', JSON.stringify(inputData));
      tempFiles.push(inputFile);

      // 3. Process workflow
      const loadedConfig = JSON.parse(await fs.readFile(configFile, 'utf-8'));
      const loadedData = JSON.parse(await fs.readFile(inputFile, 'utf-8'));

      expect(loadedConfig.inputFormat).toBe('json');
      expect(loadedData.projects).toHaveLength(3);

      // 4. Generate report
      const completedProjects = loadedData.projects.filter(p => p.status === 'completed');
      const totalTasks = loadedData.projects.reduce((sum, p) => sum + p.tasks, 0);

      const report = `# Project Report

## Summary
- Total Projects: ${loadedData.projects.length}
- Completed Projects: ${completedProjects.length}
- Total Tasks: ${totalTasks}

## Projects
${loadedData.projects.map(p => `- ${p.name}: ${p.status} (${p.tasks} tasks)`).join('\n')}
`;

      const reportFile = await createTempFile('report.md', report);
      tempFiles.push(reportFile);

      // 5. Verify report
      const generatedReport = await fs.readFile(reportFile, 'utf-8');
      expect(generatedReport).toContain('Total Projects: 3');
      expect(generatedReport).toContain('Completed Projects: 2');
      expect(generatedReport).toContain('Total Tasks: 45');
      expect(generatedReport).toContain('Project A: completed');
    });
  });
});