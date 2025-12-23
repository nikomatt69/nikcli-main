import { z } from 'zod/v3';
import { type AnthropicSkill, skillProvider } from '../providers/skills'
import { claudeAgentProvider, type SkillExecutionResult } from '../providers/claude-agents'
import { BaseTool, type ToolExecutionResult } from './base-tool'

// ====================== ZOD SCHEMAS ======================

export const SkillExecuteOptionsSchema = z.object({
  context: z.record(z.unknown()).optional(),
  stream: z.boolean().default(true),
})

export const SkillInstallOptionsSchema = z.object({
  force: z.boolean().default(false),
})

export const SkillToolResultSchema = z.object({
  success: z.boolean(),
  skillName: z.string(),
  output: z.string().optional(),
  error: z.string().optional(),
  metadata: z
    .object({
      tokensUsed: z.number().optional(),
      costUsd: z.number().optional(),
      duration: z.number().optional(),
      toolsCalled: z.array(z.string()).optional(),
    })
    .optional(),
})

export type SkillExecuteOptions = z.infer<typeof SkillExecuteOptionsSchema>
export type SkillInstallOptions = z.infer<typeof SkillInstallOptionsSchema>
export type SkillToolResult = z.infer<typeof SkillToolResultSchema>

// ====================== SKILL TOOL ======================

/**
 * Skill Tool - Execute Anthropic Skills from the official repository
 * Enables AI agents to use specialized skills for document creation, data analysis, and more
 */
export class SkillTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('skill-tool', workingDirectory)
  }

  /**
   * Execute a skill by name
   */
  async execute(
    skillName: string,
    options: SkillExecuteOptions = { stream: true }
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const result = await this.executeSkill(skillName, options)

      return {
        success: result.success,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { skillName, options },
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { skillName, options },
        },
      }
    }
  }

  private async executeSkill(
    skillName: string,
    options: SkillExecuteOptions
  ): Promise<SkillToolResult> {
    // Validate options
    const validatedOptions = SkillExecuteOptionsSchema.parse(options)

    // Check if skill is loaded, if not try to load it
    let skill = skillProvider.getSkill(skillName)
    if (!skill) {
      try {
        skill = await skillProvider.loadSkillFromRepo(skillName)
      } catch (error: any) {
        return {
          success: false,
          skillName,
          error: `Skill '${skillName}' not found. Available: ${skillProvider.listAvailableSkills().join(', ')}`,
        }
      }
    }

    // Execute skill via Claude Agent Provider
    const generator = claudeAgentProvider.executeSkill(skillName, validatedOptions.context || {})

    let result: SkillExecutionResult | undefined

    for await (const event of generator) {
      // Streaming events can be handled here if needed
      if (event.type === 'complete') {
        // Result will be returned from generator
      }
    }

    // Get the final result from the generator
    result = (await generator.next()).value as SkillExecutionResult

    if (!result) {
      return {
        success: false,
        skillName,
        error: 'Skill execution returned no result',
      }
    }

    return {
      success: result.success,
      skillName,
      output: result.output,
      error: result.success ? undefined : result.output,
      metadata: {
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        duration: result.duration,
        toolsCalled: result.toolsCalled,
      },
    }
  }

  /**
   * Install a skill from the Anthropic repository
   */
  async installSkill(
    skillName: string,
    options: SkillInstallOptions = { force: false }
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const validatedOptions = SkillInstallOptionsSchema.parse(options)

      // Check if already installed
      const existing = skillProvider.getSkill(skillName)
      if (existing && !validatedOptions.force) {
        return {
          success: true,
          data: {
            success: true,
            skillName,
            output: `Skill '${skillName}' already installed`,
            metadata: existing.metadata,
          },
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: { skillName, options },
          },
        }
      }

      const skill = await skillProvider.installSkill(skillName)

      return {
        success: true,
        data: {
          success: true,
          skillName,
          output: `Skill '${skillName}' installed successfully`,
          metadata: skill.metadata,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { skillName, options },
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { skillName, options },
        },
      }
    }
  }

  /**
   * List all installed skills
   */
  listSkills(): AnthropicSkill[] {
    return skillProvider.listSkills()
  }

  /**
   * List available skills from the repository
   */
  listAvailableSkills(): string[] {
    return skillProvider.listAvailableSkills()
  }

  /**
   * Get info about a specific skill
   */
  getSkillInfo(skillName: string): AnthropicSkill | undefined {
    return skillProvider.getSkill(skillName)
  }

  /**
   * Remove an installed skill
   */
  removeSkill(skillName: string): boolean {
    return skillProvider.removeSkill(skillName)
  }

  /**
   * Sync skills from the repository
   */
  async syncSkills(): Promise<void> {
    await skillProvider.syncSkills()
  }

  /**
   * Static help documentation
   */
  static getHelp(): string {
    return `
Skill Tool
==========

Execute specialized skills from the Anthropic Skills repository.
Skills provide task-specific capabilities for document creation, data analysis, and more.

Usage:
  execute(skillName: string, options?: SkillExecuteOptions)
  installSkill(skillName: string, options?: SkillInstallOptions)
  listSkills()
  listAvailableSkills()
  getSkillInfo(skillName: string)
  removeSkill(skillName: string)
  syncSkills()

Available Skills:
  - docx: Microsoft Word document creation and editing
  - pdf: PDF manipulation and creation
  - pptx: PowerPoint presentation creation
  - xlsx: Excel spreadsheet operations

Options:
  execute:
    - context: Record<string, unknown> - Additional context for skill execution
    - stream: boolean - Enable streaming output (default: true)

  install:
    - force: boolean - Force reinstall even if already installed (default: false)

Example:
  const skillTool = new SkillTool(workingDirectory);

  // Install a skill
  await skillTool.installSkill('docx');

  // Execute a skill
  const result = await skillTool.execute('docx', {
    context: {
      task: 'Create a business report',
      outputPath: './report.docx'
    }
  });

Repository: https://github.com/anthropics/skills
`
  }
}
