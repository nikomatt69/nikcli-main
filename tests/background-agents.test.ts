import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { BackgroundAgentService, BackgroundAgentType, BackgroundAgentStatus } from '../src/cli/services/background-agent-service';
import { backgroundAgentConfigManager } from '../src/cli/services/background-agent-config-manager';
import { backgroundAgentCommunication } from '../src/cli/services/background-agent-communication';
import { backgroundAgentMonitor } from '../src/cli/services/background-agent-monitor';

describe('Background Agents', () => {
  let testDir: string;
  let backgroundAgentService: BackgroundAgentService;

  beforeEach(async () => {
    // Create temporary directory for testing
    testDir = path.join(tmpdir(), `nikcli-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Initialize services with test directory
    backgroundAgentService = BackgroundAgentService.getInstance(testDir);
    await backgroundAgentService.initialize();
  });

  afterEach(async () => {
    // Cleanup
    try {
      await backgroundAgentService.shutdown();
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Background Agent Service', () => {
    it('should initialize successfully', async () => {
      expect(backgroundAgentService).toBeDefined();
      const agents = backgroundAgentService.getAgents();
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should create a background agent', async () => {
      const agent = await backgroundAgentService.createAgent({
        type: BackgroundAgentType.CODE_ANALYZER,
        name: 'Test Code Analyzer',
        description: 'Test agent for code analysis',
        enabled: false,
        workingDirectory: testDir,
        interval: 60000,
        autoStart: false
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.config.name).toBe('Test Code Analyzer');
      expect(agent.config.type).toBe(BackgroundAgentType.CODE_ANALYZER);
      expect(agent.status).toBe(BackgroundAgentStatus.STOPPED);
    });

    it('should start and stop an agent', async () => {
      const agent = await backgroundAgentService.createAgent({
        type: BackgroundAgentType.CODE_ANALYZER,
        name: 'Test Agent',
        description: 'Test agent',
        enabled: true,
        workingDirectory: testDir,
        interval: 60000,
        autoStart: false
      });

      // Start agent
      await backgroundAgentService.startAgent(agent.id);
      const startedAgent = backgroundAgentService.getAgent(agent.id);
      expect(startedAgent?.status).toBe(BackgroundAgentStatus.RUNNING);

      // Stop agent
      await backgroundAgentService.stopAgent(agent.id);
      const stoppedAgent = backgroundAgentService.getAgent(agent.id);
      expect(stoppedAgent?.status).toBe(BackgroundAgentStatus.STOPPED);
    });

    it('should list agents by type', async () => {
      // Create agents of different types
      await backgroundAgentService.createAgent({
        type: BackgroundAgentType.CODE_ANALYZER,
        name: 'Code Analyzer 1',
        description: 'First code analyzer',
        enabled: false,
        workingDirectory: testDir,
        autoStart: false
      });

      await backgroundAgentService.createAgent({
        type: BackgroundAgentType.FILE_WATCHER,
        name: 'File Watcher 1',
        description: 'First file watcher',
        enabled: false,
        workingDirectory: testDir,
        autoStart: false
      });

      const codeAnalyzers = backgroundAgentService.getAgentsByType(BackgroundAgentType.CODE_ANALYZER);
      const fileWatchers = backgroundAgentService.getAgentsByType(BackgroundAgentType.FILE_WATCHER);

      expect(codeAnalyzers).toHaveLength(1);
      expect(fileWatchers).toHaveLength(1);
      expect(codeAnalyzers[0].config.type).toBe(BackgroundAgentType.CODE_ANALYZER);
      expect(fileWatchers[0].config.type).toBe(BackgroundAgentType.FILE_WATCHER);
    });

    it('should delete an agent', async () => {
      const agent = await backgroundAgentService.createAgent({
        type: BackgroundAgentType.CODE_ANALYZER,
        name: 'Test Agent',
        description: 'Test agent',
        enabled: false,
        workingDirectory: testDir,
        autoStart: false
      });

      const agentId = agent.id;
      expect(backgroundAgentService.getAgent(agentId)).toBeDefined();

      await backgroundAgentService.deleteAgent(agentId);
      expect(backgroundAgentService.getAgent(agentId)).toBeUndefined();
    });
  });

  describe('Background Agent Configuration Manager', () => {
    it('should create default configurations', async () => {
      const configs = await backgroundAgentConfigManager.createDefaultConfigurations();
      
      expect(configs).toBeDefined();
      expect(configs.length).toBeGreaterThan(0);
      
      // Check that we have different types of agents
      const types = configs.map(config => config.type);
      expect(types).toContain(BackgroundAgentType.FILE_WATCHER);
      expect(types).toContain(BackgroundAgentType.CODE_ANALYZER);
      expect(types).toContain(BackgroundAgentType.DEPENDENCY_MONITOR);
    });

    it('should create custom configuration', () => {
      const config = backgroundAgentConfigManager.createCustomConfiguration(
        BackgroundAgentType.SECURITY_SCANNER,
        'Custom Security Scanner',
        'Custom security scanner for testing',
        { customSetting: 'test-value' }
      );

      expect(config).toBeDefined();
      expect(config.type).toBe(BackgroundAgentType.SECURITY_SCANNER);
      expect(config.name).toBe('Custom Security Scanner');
      expect(config.description).toBe('Custom security scanner for testing');
      expect(config.settings?.customSetting).toBe('test-value');
    });

    it('should validate configuration', () => {
      const validConfig = {
        id: 'test-id',
        type: BackgroundAgentType.CODE_ANALYZER,
        name: 'Test Agent',
        description: 'Test agent',
        enabled: true,
        workingDirectory: testDir,
        autoStart: false
      };

      const invalidConfig = {
        id: '',
        type: 'invalid-type' as any,
        name: '',
        description: '',
        enabled: true,
        workingDirectory: '/nonexistent/path',
        autoStart: false
      };

      const validResult = backgroundAgentConfigManager.validateConfiguration(validConfig);
      const invalidResult = backgroundAgentConfigManager.validateConfiguration(invalidConfig);

      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Background Agent Communication', () => {
    it('should subscribe and publish messages', async () => {
      const agentId1 = 'agent-1';
      const agentId2 = 'agent-2';
      const topic = 'test-topic';

      // Subscribe agents to topic
      backgroundAgentCommunication.subscribe(agentId1, topic);
      backgroundAgentCommunication.subscribe(agentId2, topic);

      // Publish message
      await backgroundAgentCommunication.publish(topic, { test: 'message' }, agentId1);

      // Check messages for agent2
      const messages = backgroundAgentCommunication.getMessages(agentId2);
      expect(messages).toHaveLength(1);
      expect(messages[0].topic).toBe(topic);
      expect(messages[0].message.test).toBe('message');
      expect(messages[0].fromAgentId).toBe(agentId1);
    });

    it('should send direct messages', async () => {
      const fromAgentId = 'agent-1';
      const toAgentId = 'agent-2';

      await backgroundAgentCommunication.sendDirectMessage(
        toAgentId,
        { direct: 'message' },
        fromAgentId
      );

      const messages = backgroundAgentCommunication.getMessages(toAgentId);
      expect(messages).toHaveLength(1);
      expect(messages[0].message.direct).toBe('message');
      expect(messages[0].fromAgentId).toBe(fromAgentId);
    });

    it('should get communication statistics', () => {
      const stats = backgroundAgentCommunication.getStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.totalMessages).toBe('number');
      expect(typeof stats.deliveredMessages).toBe('number');
      expect(typeof stats.pendingMessages).toBe('number');
      expect(typeof stats.deliveryRate).toBe('number');
    });
  });

  describe('Background Agent Monitor', () => {
    it('should start and stop monitoring', async () => {
      await backgroundAgentMonitor.startMonitoring(1000); // 1 second interval
      expect(backgroundAgentMonitor['isMonitoring']).toBe(true);

      await backgroundAgentMonitor.stopMonitoring();
      expect(backgroundAgentMonitor['isMonitoring']).toBe(false);
    });

    it('should record agent metrics', () => {
      const mockAgent = {
        id: 'test-agent',
        config: {
          name: 'Test Agent',
          enabled: true
        },
        status: BackgroundAgentStatus.RUNNING,
        taskCount: 10,
        errorCount: 1,
        lastError: 'Test error'
      } as any;

      backgroundAgentMonitor.recordAgentMetrics(mockAgent);
      const metrics = backgroundAgentMonitor.getAgentMetrics('test-agent');

      expect(metrics).toBeDefined();
      expect(metrics?.agentId).toBe('test-agent');
      expect(metrics?.taskCount).toBe(10);
      expect(metrics?.errorCount).toBe(1);
    });

    it('should generate system health summary', () => {
      const health = backgroundAgentMonitor.getSystemHealth();
      
      expect(health).toBeDefined();
      expect(typeof health.totalAgents).toBe('number');
      expect(typeof health.runningAgents).toBe('number');
      expect(typeof health.averageHealthScore).toBe('number');
      expect(['healthy', 'warning', 'critical']).toContain(health.systemStatus);
    });

    it('should generate monitoring report', async () => {
      const report = await backgroundAgentMonitor.generateReport();
      
      expect(report).toBeDefined();
      expect(report.id).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.systemHealth).toBeDefined();
      expect(report.agentMetrics).toBeDefined();
      expect(report.recentAlerts).toBeDefined();
      expect(report.summary).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should create and manage multiple agents', async () => {
      // Create multiple agents
      const agent1 = await backgroundAgentService.createAgent({
        type: BackgroundAgentType.CODE_ANALYZER,
        name: 'Code Analyzer',
        description: 'Analyzes code quality',
        enabled: true,
        workingDirectory: testDir,
        autoStart: false
      });

      const agent2 = await backgroundAgentService.createAgent({
        type: BackgroundAgentType.FILE_WATCHER,
        name: 'File Watcher',
        description: 'Watches file changes',
        enabled: true,
        workingDirectory: testDir,
        autoStart: false
      });

      // Start both agents
      await backgroundAgentService.startAgent(agent1.id);
      await backgroundAgentService.startAgent(agent2.id);

      // Verify both are running
      const runningAgents = backgroundAgentService.getRunningAgents();
      expect(runningAgents).toHaveLength(2);

      // Stop all agents
      await backgroundAgentService.stopAllAgents();
      
      const stoppedAgents = backgroundAgentService.getRunningAgents();
      expect(stoppedAgents).toHaveLength(0);
    });

    it('should handle agent communication and monitoring', async () => {
      const agent = await backgroundAgentService.createAgent({
        type: BackgroundAgentType.CODE_ANALYZER,
        name: 'Test Agent',
        description: 'Test agent for integration',
        enabled: true,
        workingDirectory: testDir,
        autoStart: false
      });

      // Start monitoring
      await backgroundAgentMonitor.startMonitoring(1000);

      // Start agent
      await backgroundAgentService.startAgent(agent.id);

      // Record metrics
      const agentInstance = backgroundAgentService.getAgent(agent.id);
      if (agentInstance) {
        backgroundAgentMonitor.recordAgentMetrics(agentInstance);
      }

      // Check metrics were recorded
      const metrics = backgroundAgentMonitor.getAgentMetrics(agent.id);
      expect(metrics).toBeDefined();

      // Cleanup
      await backgroundAgentMonitor.stopMonitoring();
      await backgroundAgentService.stopAgent(agent.id);
    });
  });
});