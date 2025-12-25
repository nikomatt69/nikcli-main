/**
 * Native Skill Tool for NikCLI
 *
 * Provides OpenCode-style skill loading as a CoreTool.
 * Skills are loaded from .nikcli/skills/, ~/.nikcli/skills/, and .claude/skills/
 */

import { tool } from 'ai'
import chalk from 'chalk'
import { z } from 'zod'
import { getSkillsNativeProvider, type SkillsNativeProvider } from '../providers/skills/skills-native-provider'

export const createSkillNativeTool = (provider: SkillsNativeProvider) => {
  const skills = provider.getAvailableSkills()
  const skillsList =
    skills.length > 0
      ? skills
          .map(
            (s) => `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`
          )
          .join('\n')
      : '  (no skills available)'

  return tool({
    description: `Load and use specialized skills from local files.

Available skills:
<available_skills>
${skillsList}
</available_skills>

To use a skill, call this tool with the skill name. The skill's instructions will be loaded and used to guide the AI agent.

Skills are discovered from:
- .nikcli/skills/<name>/SKILL.md (project-local)
- ~/.nikcli/skills/<name>/SKILL.md (global)
- .claude/skills/<name>/SKILL.md (Claude-compatible)

Each skill has a SKILL.md file with YAML frontmatter containing:
- name (required): Skill identifier (lowercase, hyphens allowed)
- description (required): 1-1024 character description
- license (optional): License information
- compatibility (optional): Compatibility notes
- metadata (optional): Additional key-value pairs`,

    parameters: z.object({
      name: z.string().describe('Name of skill to load (e.g., "git-release", "test-generation")'),
    }),

    execute: async ({ name }) => {
      try {
        console.log(chalk.blue(`📦 Loading skill: ${name}`))

        const permission = provider.checkPermission(name)

        if (permission === 'deny') {
          return {
            success: false,
            error: `Skill '${name}' is denied by permissions configuration`,
            permission: 'deny',
          }
        }

        if (permission === 'ask') {
          console.log(chalk.yellow(`⚠️  Skill '${name}' requires user approval`))
          return {
            success: false,
            error: `Skill '${name}' requires user approval`,
            permission: 'ask',
          }
        }

        const skill = await provider.loadSkill(name)

        return {
          success: true,
          skill: {
            name: skill.metadata.name,
            description: skill.metadata.description,
            instructions: skill.instructions,
            license: skill.metadata.license,
            compatibility: skill.metadata.compatibility,
            metadata: skill.metadata.metadata,
          },
          loaded: true,
          message: `Skill '${name}' loaded successfully`,
        }
      } catch (error: any) {
        console.error(chalk.red(`✖ Failed to load skill '${name}': ${error.message}`))

        return {
          success: false,
          error: error.message,
          availableSkills: provider.getAvailableSkills().map((s) => ({ name: s.name, description: s.description })),
        }
      }
    },
  })
}

export const listSkillsNativeTool = tool({
  description: 'List all available skills and their descriptions',

  parameters: z.object({}).optional(),

  execute: async () => {
    const provider = getSkillsNativeProvider()
    const skills = provider.getAvailableSkills()

    return {
      count: skills.length,
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        license: s.license,
        compatibility: s.compatibility,
        loaded: provider.isLoaded(s.name),
        permission: provider.checkPermission(s.name),
      })),
      message: `Found ${skills.length} available skills`,
    }
  },
})
