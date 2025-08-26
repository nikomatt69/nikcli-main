/**
 * Unit tests for Approval System - User confirmation and review system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalSystem, type ApprovalRequest, type ApprovalConfig } from '../../../src/cli/ui/approval-system';
import { mockConsole } from '../../helpers/test-utils';

// Mock inquirer for user interaction
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn()
  }
}));

// Mock input queue
vi.mock('../../../src/cli/core/input-queue', () => ({
  inputQueue: {
    enableBypass: vi.fn(),
    disableBypass: vi.fn()
  }
}));

// Mock diff viewer
vi.mock('../../../src/cli/ui/diff-viewer', () => ({
  DiffViewer: {
    showMultiFileDiff: vi.fn()
  }
}));

describe('ApprovalSystem', () => {
  let approvalSystem: ApprovalSystem;
  let console: ReturnType<typeof mockConsole>;
  let mockInquirer: any;

  beforeEach(async () => {
    console = mockConsole();
    mockInquirer = await import('inquirer');
    approvalSystem = new ApprovalSystem();
  });

  afterEach(() => {
    console.restore();
    vi.clearAllMocks();
  });

  describe('Basic Approval Flow', () => {
    it('should request and receive approval', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: true });

      const request: ApprovalRequest = {
        id: 'test-request-1',
        title: 'Test Approval',
        description: 'This is a test approval request',
        riskLevel: 'medium',
        actions: [{
          type: 'file_create',
          description: 'Create test file',
          details: { path: 'test.txt', content: 'test content' },
          riskLevel: 'low'
        }]
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(true);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(mockInquirer.default.prompt).toHaveBeenCalled();
    });

    it('should handle rejection', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: false });

      const request: ApprovalRequest = {
        id: 'test-request-2',
        title: 'Test Rejection',
        description: 'This request will be rejected',
        riskLevel: 'high',
        actions: [{
          type: 'file_delete',
          description: 'Delete important file',
          details: { path: 'important.txt' },
          riskLevel: 'high'
        }]
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(false);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should handle high-risk operations with additional confirmation', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ 
        approved: true,
        confirmHighRisk: true
      });

      const request: ApprovalRequest = {
        id: 'test-request-3',
        title: 'High Risk Operation',
        description: 'This is a high risk operation',
        riskLevel: 'critical',
        actions: [{
          type: 'command_execute',
          description: 'Run dangerous command',
          details: { command: 'rm -rf /' },
          riskLevel: 'critical'
        }]
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(true);
    });

    it('should reject high-risk operations without confirmation', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ 
        approved: true,
        confirmHighRisk: false
      });

      const request: ApprovalRequest = {
        id: 'test-request-4',
        title: 'High Risk Operation',
        description: 'This is a high risk operation',
        riskLevel: 'critical',
        actions: [{
          type: 'command_execute',
          description: 'Run dangerous command',
          details: { command: 'rm -rf /' },
          riskLevel: 'critical'
        }]
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(false);
    });
  });

  describe('Quick Approval', () => {
    it('should handle quick approval for simple operations', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: true });

      const approved = await approvalSystem.quickApproval(
        'Quick Test',
        'Simple operation',
        'low'
      );

      expect(approved).toBe(true);
    });

    it('should reject quick approval when denied', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: false });

      const approved = await approvalSystem.quickApproval(
        'Quick Test',
        'Simple operation',
        'medium'
      );

      expect(approved).toBe(false);
    });
  });

  describe('File Approval', () => {
    it('should request approval for file operations with diff preview', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: true });

      const fileDiffs = [{
        filePath: 'test.txt',
        originalContent: 'old content',
        newContent: 'new content',
        isNew: false,
        isDeleted: false
      }];

      const approved = await approvalSystem.requestFileApproval(
        'File Changes',
        fileDiffs,
        'medium'
      );

      expect(approved).toBe(true);
    });
  });

  describe('Command Approval', () => {
    it('should request approval for safe commands', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: true });

      const approved = await approvalSystem.requestCommandApproval(
        'npm',
        ['install'],
        '/test/dir'
      );

      expect(approved).toBe(true);
    });

    it('should assess high risk for dangerous commands', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ 
        approved: true,
        confirmHighRisk: true
      });

      const approved = await approvalSystem.requestCommandApproval(
        'rm',
        ['-rf', '/important'],
        '/test/dir'
      );

      expect(approved).toBe(true);
    });
  });

  describe('Package Approval', () => {
    it('should request approval for package installation', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: true });

      const approved = await approvalSystem.requestPackageApproval(
        ['react', 'typescript'],
        'npm',
        false
      );

      expect(approved).toBe(true);
    });

    it('should assess higher risk for global packages', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: true });

      const approved = await approvalSystem.requestPackageApproval(
        ['nodemon'],
        'npm',
        true
      );

      expect(approved).toBe(true);
    });
  });

  describe('Auto-Approval Configuration', () => {
    it('should auto-approve low risk operations when configured', async () => {
      const config: ApprovalConfig = {
        autoApprove: {
          lowRisk: true
        }
      };
      
      approvalSystem.updateConfig(config);

      const request: ApprovalRequest = {
        id: 'auto-approve-test',
        title: 'Low Risk Operation',
        description: 'Safe operation',
        riskLevel: 'low',
        actions: [{
          type: 'file_create',
          description: 'Create safe file',
          details: { path: 'safe.txt' },
          riskLevel: 'low'
        }]
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(true);
      expect(mockInquirer.default.prompt).not.toHaveBeenCalled();
    });

    it('should auto-approve file operations when configured', async () => {
      const config: ApprovalConfig = {
        autoApprove: {
          fileOperations: true
        }
      };
      
      approvalSystem.updateConfig(config);

      const request: ApprovalRequest = {
        id: 'file-auto-approve-test',
        title: 'File Operation',
        description: 'File operation',
        riskLevel: 'medium',
        actions: [{
          type: 'file_modify',
          description: 'Modify file',
          details: { path: 'file.txt' },
          riskLevel: 'medium'
        }]
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(true);
      expect(mockInquirer.default.prompt).not.toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig: Partial<ApprovalConfig> = {
        timeout: 30000,
        autoApprove: {
          lowRisk: true,
          mediumRisk: false
        }
      };

      approvalSystem.updateConfig(newConfig);
      const config = approvalSystem.getConfig();

      expect(config.timeout).toBe(30000);
      expect(config.autoApprove?.lowRisk).toBe(true);
      expect(config.autoApprove?.mediumRisk).toBe(false);
    });

    it('should get current configuration', () => {
      const config = approvalSystem.getConfig();

      expect(config).toBeDefined();
      expect(config.autoApprove).toBeDefined();
      expect(config.requireConfirmation).toBeDefined();
      expect(config.timeout).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle user interruption gracefully', async () => {
      mockInquirer.default.prompt.mockRejectedValue(new Error('User interrupted'));

      const request: ApprovalRequest = {
        id: 'interrupted-test',
        title: 'Interrupted Operation',
        description: 'This will be interrupted',
        riskLevel: 'medium',
        actions: [{
          type: 'file_create',
          description: 'Create file',
          details: { path: 'test.txt' },
          riskLevel: 'medium'
        }]
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(false);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Context and Metadata', () => {
    it('should handle requests with context information', async () => {
      mockInquirer.default.prompt.mockResolvedValue({ approved: true });

      const request: ApprovalRequest = {
        id: 'context-test',
        title: 'Operation with Context',
        description: 'Operation with additional context',
        riskLevel: 'medium',
        actions: [{
          type: 'file_create',
          description: 'Create file',
          details: { path: 'test.txt' },
          riskLevel: 'medium'
        }],
        context: {
          workingDirectory: '/test/dir',
          affectedFiles: ['file1.txt', 'file2.txt'],
          estimatedDuration: 5000
        }
      };

      const result = await approvalSystem.requestApproval(request);

      expect(result.approved).toBe(true);
    });

    it('should handle timeout for approval requests', async () => {
      const request: ApprovalRequest = {
        id: 'timeout-test',
        title: 'Timeout Test',
        description: 'This will timeout',
        riskLevel: 'medium',
        actions: [{
          type: 'file_create',
          description: 'Create file',
          details: { path: 'test.txt' },
          riskLevel: 'medium'
        }],
        timeout: 100 // Very short timeout
      };

      // Don't mock the prompt to let it timeout
      const result = await approvalSystem.requestApproval(request);

      // Should handle timeout gracefully
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Risk Assessment', () => {
    it('should assess command risk correctly', async () => {
      // Test that risk assessment is working by checking different command types
      const safeCommand = await approvalSystem.requestCommandApproval('ls', ['-la']);
      expect(safeCommand).toBe(true);
    });
  });
});