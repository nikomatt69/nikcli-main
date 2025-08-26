/**
 * System Coherence Tests
 * Verifies that all components work together consistently
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentManager } from '../../src/cli/automation/agents/agent-manager';
import { SecureToolsRegistry } from '../../src/cli/tools/secure-tools-registry';
import { mockConsole, createTempFile, cleanup } from '../helpers/test-utils';

describe('System Coherence', () => {
    let agentManager: AgentManager;
    let toolsRegistry: SecureToolsRegistry;
    let console: ReturnType<typeof mockConsole>;
    let tempFiles: string[] = [];

    beforeEach(() => {
        console = mockConsole();
        agentManager = new AgentManager();
        toolsRegistry = new SecureToolsRegistry();
    });

    afterEach(async () => {
        console.restore();
        await cleanup(tempFiles);
        tempFiles = [];
    });

    describe('Agent-Tool Integration', () => {
        it('should allow agents to use tools consistently', async () => {
            // Create a test file
            const testContent = 'Test content for agent-tool integration';
            const filePath = await createTempFile('agent-test.txt', testContent);
            tempFiles.push(filePath);

            // Agent should be able to read file through tools
            const readResult = await toolsRegistry.readFile('agent-test.txt');
            expect(readResult.success).toBe(true);
            expect(readResult.data?.content).toBe(testContent);

            // Agent should be able to write file through tools
            const newContent = 'Updated content by agent';
            const writeResult = await toolsRegistry.writeFile('agent-update.txt', newContent, {
                skipConfirmation: true
            });
            tempFiles.push('agent-update.txt');
            expect(writeResult.success).toBe(true);

            // Verify the written content
            const verifyResult = await toolsRegistry.readFile('agent-update.txt');
            expect(verifyResult.success).toBe(true);
            expect(verifyResult.data?.content).toBe(newContent);
        });

        it('should maintain consistent error handling across components', async () => {
            // Test that both agent manager and tools registry handle errors consistently
            const nonExistentFile = 'non-existent-file.txt';

            // Tools registry should handle missing file
            try {
                await toolsRegistry.readFile(nonExistentFile);
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain('ENOENT');
            }

            // Agent manager should handle invalid agent operations
            try {
                await agentManager.executeAgentTask('non-existent-agent', {});
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain('not found');
            }
        });
    });

    describe('Configuration Consistency', () => {
        it('should maintain consistent configuration across components', async () => {
            // Test that configuration is handled consistently
            const testConfig = {
                apiKey: 'test-key',
                model: 'claude-3-sonnet',
                temperature: 0.7
            };

            // Both components should handle configuration updates
            expect(() => agentManager.updateConfiguration(testConfig)).not.toThrow();
            expect(() => toolsRegistry.updateConfiguration(testConfig)).not.toThrow();
        });

        it('should validate configuration consistently', () => {
            const invalidConfig = {
                apiKey: '', // Empty key should be invalid
                model: '',  // Empty model should be invalid
                temperature: -1 // Invalid temperature
            };

            // Both components should reject invalid configuration
            expect(() => agentManager.updateConfiguration(invalidConfig)).toThrow();
            expect(() => toolsRegistry.updateConfiguration(invalidConfig)).toThrow();
        });
    });

    describe('Security Policy Consistency', () => {
        it('should enforce security policies consistently', async () => {
            // Test dangerous path
            const dangerousPath = '../../../etc/passwd';

            // Tools registry should reject dangerous paths
            try {
                await toolsRegistry.readFile(dangerousPath);
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain('traversal');
            }

            // Agent manager should also reject dangerous operations
            try {
                await agentManager.executeAgentTask('test-agent', {
                    action: 'read',
                    path: dangerousPath
                });
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(error.message).toContain('security');
            }
        });

        it('should handle safe operations consistently', async () => {
            // Create a safe test file
            const safeContent = 'Safe content';
            const safePath = await createTempFile('safe-test.txt', safeContent);
            tempFiles.push(safePath);

            // Both components should allow safe operations
            const toolsResult = await toolsRegistry.readFile('safe-test.txt');
            expect(toolsResult.success).toBe(true);

            // Agent should also be able to perform safe operations
            const agentResult = await agentManager.executeAgentTask('test-agent', {
                action: 'read',
                path: 'safe-test.txt'
            });
            expect(agentResult.success).toBe(true);
        });
    });

    describe('Performance Consistency', () => {
        it('should maintain consistent performance characteristics', async () => {
            const startTime = Date.now();

            // Test tools registry performance
            const toolsStart = Date.now();
            await toolsRegistry.readFile('non-existent.txt').catch(() => { });
            const toolsTime = Date.now() - toolsStart;

            // Test agent manager performance
            const agentStart = Date.now();
            await agentManager.executeAgentTask('non-existent-agent', {}).catch(() => { });
            const agentTime = Date.now() - agentStart;

            // Both should complete within reasonable time
            expect(toolsTime).toBeLessThan(1000); // 1 second
            expect(agentTime).toBeLessThan(1000); // 1 second

            const totalTime = Date.now() - startTime;
            expect(totalTime).toBeLessThan(2000); // 2 seconds total
        });

        it('should handle concurrent operations consistently', async () => {
            const operations = [];

            // Create multiple concurrent operations
            for (let i = 0; i < 5; i++) {
                operations.push(
                    toolsRegistry.readFile(`concurrent-${i}.txt`).catch(() => ({ success: false }))
                );
                operations.push(
                    agentManager.executeAgentTask(`agent-${i}`, {}).catch(() => ({ success: false }))
                );
            }

            const results = await Promise.all(operations);
            expect(results).toHaveLength(10);

            // All operations should complete (even if they fail)
            results.forEach(result => {
                expect(result).toBeDefined();
            });
        });
    });

    describe('Error Recovery Consistency', () => {
        it('should recover from errors consistently', async () => {
            // Test that both components can recover from errors
            const testFile = await createTempFile('recovery-test.txt', 'test content');
            tempFiles.push(testFile);

            // Simulate error and recovery
            try {
                await toolsRegistry.readFile('non-existent.txt');
            } catch (error) {
                // Should recover and read existing file
                const recoveryResult = await toolsRegistry.readFile('recovery-test.txt');
                expect(recoveryResult.success).toBe(true);
            }

            try {
                await agentManager.executeAgentTask('non-existent-agent', {});
            } catch (error) {
                // Should recover and handle valid operations
                expect(() => agentManager.getActiveAgents()).not.toThrow();
            }
        });

        it('should maintain state consistency after errors', async () => {
            // Test that components maintain consistent state after errors
            const initialState = {
                agents: agentManager.getActiveAgents().length,
                tools: toolsRegistry.getAvailableTools().length
            };

            // Trigger some errors
            await toolsRegistry.readFile('non-existent.txt').catch(() => { });
            await agentManager.executeAgentTask('non-existent-agent', {}).catch(() => { });

            // State should remain consistent
            const finalState = {
                agents: agentManager.getActiveAgents().length,
                tools: toolsRegistry.getAvailableTools().length
            };

            expect(finalState.agents).toBe(initialState.agents);
            expect(finalState.tools).toBe(initialState.tools);
        });
    });

    describe('Logging and Monitoring Consistency', () => {
        it('should log operations consistently', async () => {
            // Test that both components log operations consistently
            await toolsRegistry.readFile('non-existent.txt').catch(() => { });
            await agentManager.executeAgentTask('non-existent-agent', {}).catch(() => { });

            // Both should have logged their operations
            expect(console.logs.length).toBeGreaterThan(0);
            expect(console.errors.length).toBeGreaterThan(0);
        });

        it('should provide consistent metrics', async () => {
            // Test that both components provide consistent metrics
            const toolsMetrics = toolsRegistry.getExecutionMetrics();
            const agentMetrics = agentManager.getMetrics();

            // Both should provide metrics with consistent structure
            expect(toolsMetrics).toHaveProperty('totalExecutions');
            expect(agentMetrics).toHaveProperty('totalTasks');
            expect(typeof toolsMetrics.totalExecutions).toBe('number');
            expect(typeof agentMetrics.totalTasks).toBe('number');
        });
    });
});
