// src/cli/background-agents/core/playbook-parser.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import * as yaml from 'yaml';
import { NikPlaybook, PlaybookLimits, PlaybookPolicy, PlaybookStep, CommitConfig } from '../types';

// Zod schemas for validation
const PlaybookLimitsSchema = z.object({
  max_tool_calls: z.number().positive().max(200).default(50),
  max_time_minutes: z.number().positive().max(120).default(30),
  max_memory_mb: z.number().positive().optional().default(2048),
});

const PlaybookPolicySchema = z.object({
  approve_commands: z.boolean().default(false),
  network_allow: z.array(z.string()).default([]),
  file_restrictions: z.array(z.string()).optional(),
  safe_mode: z.boolean().optional().default(true),
});

const PlaybookStepSchema = z.object({
  run: z.string().min(1),
  condition: z.string().optional(),
  retry_on_failure: z.boolean().optional().default(false),
  timeout_minutes: z.number().positive().optional().default(5),
});

const CommitConfigSchema = z.object({
  message: z.string().min(1),
  open_pr: z.boolean().default(true),
  reviewers: z.array(z.string()).optional().default([]),
  labels: z.array(z.string()).optional().default([]),
  draft: z.boolean().optional().default(false),
});

const NikPlaybookSchema = z.object({
  name: z.string().min(1),
  agent: z.string().min(1).default('universal-agent'),
  goals: z.array(z.string().min(1)).min(1),
  limits: PlaybookLimitsSchema,
  policy: PlaybookPolicySchema,
  steps: z.array(PlaybookStepSchema).min(1),
  commit: CommitConfigSchema,
});

export interface PlaybookParseResult {
  success: boolean;
  playbook?: NikPlaybook;
  errors?: string[];
  warnings?: string[];
}

export class PlaybookParser {
  /**
   * Parse playbook from file path
   */
  static async parseFromFile(filePath: string): Promise<PlaybookParseResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return this.parseFromString(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          success: false,
          errors: [`Playbook file not found: ${filePath}`],
        };
      }

      return {
        success: false,
        errors: [`Failed to read playbook: ${error.message}`],
      };
    }
  }

  /**
   * Parse playbook from directory by name
   */
  static async parseFromDirectory(workingDirectory: string, playbookName: string): Promise<PlaybookParseResult> {
    // Try different locations
    const possiblePaths = [
      path.join(workingDirectory, '.nik', `${playbookName}.yaml`),
      path.join(workingDirectory, '.nik', 'playbooks', `${playbookName}.yaml`),
      path.join(workingDirectory, '.nik', 'templates', `${playbookName}.yaml`),
    ];

    for (const playbookPath of possiblePaths) {
      try {
        await fs.access(playbookPath);
        return await this.parseFromFile(playbookPath);
      } catch {
        // Continue to next path
      }
    }

    return {
      success: false,
      errors: [`Playbook '${playbookName}' not found in any expected location`],
    };
  }

  /**
   * Parse playbook from YAML string
   */
  static parseFromString(content: string): PlaybookParseResult {
    try {
      // Parse YAML
      const rawData = yaml.parse(content);

      if (!rawData || typeof rawData !== 'object') {
        return {
          success: false,
          errors: ['Invalid YAML: must be an object'],
        };
      }

      // Validate with Zod
      const result = NikPlaybookSchema.safeParse(rawData);

      if (!result.success) {
        return {
          success: false,
          errors: result.error.issues.map(issue => 
            `${issue.path.join('.')}: ${issue.message}`
          ),
        };
      }

      // Additional validation and warnings
      const warnings = this.validatePlaybook(result.data);

      return {
        success: true,
        playbook: result.data,
        warnings,
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [`YAML parse error: ${error.message}`],
      };
    }
  }

  /**
   * Validate playbook and return warnings
   */
  private static validatePlaybook(playbook: NikPlaybook): string[] {
    const warnings: string[] = [];

    // Check for potentially dangerous commands
    const dangerousPatterns = ['rm -rf', 'sudo', 'format', 'dd if='];
    playbook.steps.forEach((step, index) => {
      dangerousPatterns.forEach(pattern => {
        if (step.run.includes(pattern)) {
          warnings.push(`Potentially dangerous command in step ${index + 1}: "${pattern}"`);
        }
      });
    });

    // Check limits
    if (playbook.limits.max_tool_calls > 100) {
      warnings.push('High tool call limit may impact performance');
    }

    if (playbook.limits.max_time_minutes > 60) {
      warnings.push('Long execution time may impact resource usage');
    }

    // Check network policy
    if (playbook.policy.network_allow.length === 0 && playbook.policy.safe_mode) {
      warnings.push('No network domains allowed but steps may need network access');
    }

    // Check if nikcli commands are properly formatted
    playbook.steps.forEach((step, index) => {
      if (step.run.startsWith('nikcli')) {
        if (!step.run.includes('/auto') && !step.run.includes('/analyze-project')) {
          warnings.push(`Step ${index + 1}: nikcli command may need specific slash command`);
        }
      }
    });

    // Check commit configuration
    if (playbook.commit.open_pr && playbook.commit.reviewers?.length === 0) {
      warnings.push('PR will be opened but no reviewers specified');
    }

    return warnings;
  }

  /**
   * List available playbooks in directory
   */
  static async listPlaybooks(workingDirectory: string): Promise<string[]> {
    const playbookDirs = [
      path.join(workingDirectory, '.nik'),
      path.join(workingDirectory, '.nik', 'playbooks'),
      path.join(workingDirectory, '.nik', 'templates'),
    ];

    const playbooks: string[] = [];

    for (const dir of playbookDirs) {
      try {
        const files = await fs.readdir(dir);
        const yamlFiles = files
          .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
          .map(file => path.basename(file, path.extname(file)));
        
        playbooks.push(...yamlFiles);
      } catch {
        // Directory doesn't exist or can't be read
      }
    }

    return [...new Set(playbooks)]; // Remove duplicates
  }

  /**
   * Create default playbooks directory and templates
   */
  static async initializePlaybooks(workingDirectory: string): Promise<void> {
    const playbooksDir = path.join(workingDirectory, '.nik', 'playbooks');
    const templatesDir = path.join(workingDirectory, '.nik', 'templates');

    // Create directories
    await fs.mkdir(playbooksDir, { recursive: true });
    await fs.mkdir(templatesDir, { recursive: true });

    // Create default templates
    const templates = this.getDefaultTemplates();

    for (const [name, content] of Object.entries(templates)) {
      const templatePath = path.join(templatesDir, `${name}.yaml`);
      await fs.writeFile(templatePath, content, 'utf8');
    }
  }

  /**
   * Get default playbook templates
   */
  private static getDefaultTemplates(): Record<string, string> {
    return {
      'fix-tests': `name: "fix-tests"
agent: "universal-agent"
goals:
  - "Fix failing tests in the project"
  - "Ensure all tests pass"
  - "Maintain code quality"
limits:
  max_tool_calls: 50
  max_time_minutes: 25
policy:
  approve_commands: false
  network_allow: ["registry.npmjs.org"]
  safe_mode: true
steps:
  - run: "nikcli /analyze-project"
  - run: "yarn test"
  - run: "nikcli /auto 'fix failing tests while maintaining code style'"
  - run: "yarn test"
    retry_on_failure: true
commit:
  message: "fix: resolve failing tests (automated)"
  open_pr: true
  labels: ["automated", "tests"]`,

      'upgrade-deps': `name: "upgrade-deps"
agent: "universal-agent"
goals:
  - "Upgrade project dependencies"
  - "Fix any breaking changes"
  - "Ensure project still builds and tests pass"
limits:
  max_tool_calls: 80
  max_time_minutes: 40
policy:
  approve_commands: false
  network_allow: ["registry.npmjs.org", "github.com"]
  safe_mode: true
steps:
  - run: "nikcli /analyze-project"
  - run: "yarn upgrade-interactive --latest"
  - run: "nikcli /auto 'fix any breaking changes from dependency upgrades'"
  - run: "yarn build"
    retry_on_failure: true
  - run: "yarn test"
commit:
  message: "chore: upgrade dependencies (automated)"
  open_pr: true
  labels: ["dependencies", "automated"]`,

      'security-audit': `name: "security-audit"
agent: "code-reviewer"
goals:
  - "Run security audit"
  - "Fix vulnerabilities"
  - "Generate security report"
limits:
  max_tool_calls: 30
  max_time_minutes: 20
policy:
  approve_commands: true
  network_allow: ["registry.npmjs.org"]
  safe_mode: true
steps:
  - run: "yarn audit"
  - run: "yarn audit --fix"
  - run: "nikcli /auto 'review and document any remaining security issues'"
commit:
  message: "security: fix vulnerabilities (automated)"
  open_pr: true
  labels: ["security", "automated"]
  reviewers: ["@security-team"]`,
    };
  }

  /**
   * Validate playbook against environment capabilities
   */
  static validateAgainstEnvironment(
    playbook: NikPlaybook,
    environment: any
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check network restrictions
    if (environment.policies?.networkPolicy === 'deny' && playbook.policy.network_allow.length > 0) {
      errors.push('Playbook requires network access but environment denies network');
    }

    // Check timeout compatibility
    if (environment.policies?.timeoutMinutes && 
        playbook.limits.max_time_minutes > environment.policies.timeoutMinutes) {
      warnings.push('Playbook timeout exceeds environment limit');
    }

    // Check memory limits
    if (environment.policies?.maxMemoryMB && 
        playbook.limits.max_memory_mb && 
        playbook.limits.max_memory_mb > environment.policies.maxMemoryMB) {
      warnings.push('Playbook memory limit exceeds environment limit');
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
