// src/cli/config/notification-defaults.ts

import { z } from 'zod'
import type { NotificationConfig } from '../types/notifications'
import { NotificationProvider } from '../types/notifications'

/**
 * Zod schemas for notification configuration validation
 */

const SlackProviderSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().url().optional(),
  channel: z.string().optional(),
  username: z.string().default('NikCLI Bot'),
  iconEmoji: z.string().default(':robot_face:'),
})

const DiscordProviderSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().url().optional(),
  username: z.string().default('NikCLI Bot'),
  avatarUrl: z.string().url().optional(),
})

const LinearProviderSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  teamId: z.string().optional(),
  createIssues: z.boolean().default(false),
})

const ProviderConfigsSchema = z.object({
  slack: SlackProviderSchema.optional(),
  discord: DiscordProviderSchema.optional(),
  linear: LinearProviderSchema.optional(),
})

export const NotificationConfigSchema = z.object({
  enabled: z.boolean(),
  providers: ProviderConfigsSchema,
  deduplication: z
    .object({
      enabled: z.boolean(),
      windowMs: z.number().min(1000).max(600000), // 1s to 10min
    })
    .optional(),
  rateLimit: z
    .object({
      enabled: z.boolean(),
      maxPerMinute: z.number().min(1).max(100),
    })
    .optional(),
  retry: z
    .object({
      enabled: z.boolean(),
      maxAttempts: z.number().min(1).max(5),
      backoffMs: z.number().min(100).max(10000),
    })
    .optional(),
  timeout: z
    .object({
      requestTimeoutMs: z.number().min(1000).max(30000),
    })
    .optional(),
})

/**
 * Default notification configuration
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true, // Opt-in by default
  providers: {
    slack: {
      enabled: true,
      username: 'NikCLI Bot',
      iconEmoji: ':robot_face:',
    },
    discord: {
      enabled: false,
      username: 'NikCLI Bot',
    },
    linear: {
      enabled: false,
      createIssues: false,
    },
  },
  deduplication: {
    enabled: true,
    windowMs: 300000, // 5 minutes
  },
  rateLimit: {
    enabled: true,
    maxPerMinute: 10,
  },
  retry: {
    enabled: true,
    maxAttempts: 3,
    backoffMs: 1000, // Start with 1s, exponential backoff
  },
  timeout: {
    requestTimeoutMs: 5000, // 5 seconds
  },
}

/**
 * Message templates for different notification types
 */
export const MESSAGE_TEMPLATES = {
  taskStarted: {
    slack: (data: any) => ({
      text: `🚀 Task Started | nikcli`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚀 Task Started',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Task:*\n${data.taskTitle}` },
            { type: 'mrkdwn', text: `*Agent:*\n${data.agentName}` },
            data.planTitle
              ? { type: 'mrkdwn', text: `*Plan:*\n${data.planTitle}` }
              : { type: 'mrkdwn', text: `*Session:*\n${data.sessionId}` },
            { type: 'mrkdwn', text: `*Directory:*\n\`${data.workingDirectory}\`` },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${new Date(data.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    }),
    discord: (data: any) => ({
      embeds: [
        {
          title: '🚀 Task Started',
          color: 0x2db3ff,
          fields: [
            { name: '📝 Task', value: data.taskTitle, inline: false },
            { name: '🤖 Agent', value: data.agentName, inline: true },
            data.planTitle ? { name: '📋 Plan', value: data.planTitle, inline: true } : undefined,
            { name: '📂 Directory', value: `\`${data.workingDirectory}\``, inline: false },
          ].filter(Boolean),
          footer: { text: `Session: ${data.sessionId}` },
          timestamp: new Date(data.timestamp).toISOString(),
        },
      ],
    }),
    linear: (data: any) => `
## 🚀 Task Started

**Task:** ${data.taskTitle}
**Agent:** ${data.agentName}
${data.planTitle ? `**Plan:** ${data.planTitle}\n` : ''}
**Directory:** \`${data.workingDirectory}\`

**Session:** ${data.sessionId}
**Timestamp:** ${new Date(data.timestamp).toLocaleString()}
`,
  },

  taskCompleted: {
    slack: (data: any) => ({
      text: `🎯 *Task Completed* | nikcli`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎯 Task Completed',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Task:*\n${data.taskTitle}`,
            },
            {
              type: 'mrkdwn',
              text: `*Agent:*\n${data.agentName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Directory:*\n\`${data.workingDirectory}\``,
            },
            {
              type: 'mrkdwn',
              text: `*Duration:*\n${formatDuration(data.duration)}`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Session: ${data.sessionId} | ${new Date(data.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    }),
    discord: (data: any) => ({
      embeds: [
        {
          title: '🎯 Task Completed',
          color: 0x00ff00, // Green
          fields: [
            {
              name: '📝 Task',
              value: data.taskTitle,
              inline: false,
            },
            {
              name: '🤖 Agent',
              value: data.agentName,
              inline: true,
            },
            {
              name: '⏱️ Duration',
              value: formatDuration(data.duration),
              inline: true,
            },
            {
              name: '📂 Directory',
              value: `\`${data.workingDirectory}\``,
              inline: false,
            },
          ],
          footer: {
            text: `Session: ${data.sessionId}`,
          },
          timestamp: new Date(data.timestamp).toISOString(),
        },
      ],
    }),
    linear: (data: any) => `
## 🎯 Task Completed

**Task:** ${data.taskTitle}
**Agent:** ${data.agentName}
**Duration:** ${formatDuration(data.duration)}
**Directory:** \`${data.workingDirectory}\`

**Session:** ${data.sessionId}
**Timestamp:** ${new Date(data.timestamp).toLocaleString()}
`,
  },

  taskFailed: {
    slack: (data: any) => ({
      text: `❌ *Task Failed* | nikcli`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '❌ Task Failed',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Task:*\n${data.taskTitle}`,
            },
            {
              type: 'mrkdwn',
              text: `*Agent:*\n${data.agentName}`,
            },
            {
              type: 'mrkdwn',
              text: `*Directory:*\n\`${data.workingDirectory}\``,
            },
            {
              type: 'mrkdwn',
              text: `*Error:*\n${truncate(data.error, 200)}`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Session: ${data.sessionId} | ${new Date(data.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    }),
    discord: (data: any) => ({
      embeds: [
        {
          title: '❌ Task Failed',
          color: 0xff0000, // Red
          fields: [
            {
              name: '📝 Task',
              value: data.taskTitle,
              inline: false,
            },
            {
              name: '🤖 Agent',
              value: data.agentName,
              inline: true,
            },
            {
              name: '📂 Directory',
              value: `\`${data.workingDirectory}\``,
              inline: false,
            },
            {
              name: '⚠️ Error',
              value: truncate(data.error, 1024),
              inline: false,
            },
          ],
          footer: {
            text: `Session: ${data.sessionId}`,
          },
          timestamp: new Date(data.timestamp).toISOString(),
        },
      ],
    }),
    linear: (data: any) => `
## ❌ Task Failed

**Task:** ${data.taskTitle}
**Agent:** ${data.agentName}
**Directory:** \`${data.workingDirectory}\`

**Error:**
\`\`\`
${truncate(data.error, 500)}
\`\`\`

**Session:** ${data.sessionId}
**Timestamp:** ${new Date(data.timestamp).toLocaleString()}
`,
  },

  planStarted: {
    slack: (data: any) => ({
      text: `🚀 Plan Started | nikcli`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚀 Plan Started', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Plan:*\n${data.planTitle}` },
            { type: 'mrkdwn', text: `*Total Tasks:*\n${data.totalTasks}` },
            data.agents && data.agents.length
              ? { type: 'mrkdwn', text: `*Agents:*\n${data.agents.join(', ')}` }
              : { type: 'mrkdwn', text: `*Session:*\n${data.sessionId}` },
            { type: 'mrkdwn', text: `*Directory:*\n\`${data.workingDirectory}\`` },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `${new Date(data.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    }),
    discord: (data: any) => ({
      embeds: [
        {
          title: '🚀 Plan Started',
          color: 0x2db3ff,
          fields: [
            { name: '📋 Plan', value: data.planTitle, inline: false },
            { name: '🧩 Total Tasks', value: String(data.totalTasks), inline: true },
            data.agents && data.agents.length
              ? { name: '🤖 Agents', value: data.agents.join(', '), inline: true }
              : undefined,
            { name: '📂 Directory', value: `\`${data.workingDirectory}\``, inline: false },
          ].filter(Boolean),
          footer: { text: `Session: ${data.sessionId}` },
          timestamp: new Date(data.timestamp).toISOString(),
        },
      ],
    }),
    linear: (data: any) => `
## 🚀 Plan Started

**Plan:** ${data.planTitle}
**Total Tasks:** ${data.totalTasks}
${data.agents && data.agents.length ? `**Agents:** ${data.agents.join(', ')}\n` : ''}
**Directory:** \`${data.workingDirectory}\`

**Session:** ${data.sessionId}
**Timestamp:** ${new Date(data.timestamp).toLocaleString()}
`,
  },

  planCompleted: {
    slack: (data: any) => ({
      text: `🎉 *Plan Completed* | nikcli`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🎉 Plan Completed',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Plan:*\n${data.planTitle}`,
            },
            {
              type: 'mrkdwn',
              text: `*Total Tasks:*\n${data.totalTasks}`,
            },
            {
              type: 'mrkdwn',
              text: `*Completed:*\n✅ ${data.completedTasks}`,
            },
            {
              type: 'mrkdwn',
              text: `*Failed:*\n❌ ${data.failedTasks}`,
            },
            {
              type: 'mrkdwn',
              text: `*Agents:*\n${data.agents.join(', ')}`,
            },
            {
              type: 'mrkdwn',
              text: `*Total Duration:*\n${formatDuration(data.totalDuration)}`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Session: ${data.sessionId} | ${new Date(data.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    }),
    discord: (data: any) => ({
      embeds: [
        {
          title: '🎉 Plan Completed',
          color: 0x0099ff, // Blue
          fields: [
            {
              name: '📋 Plan',
              value: data.planTitle,
              inline: false,
            },
            {
              name: '✅ Completed',
              value: `${data.completedTasks}/${data.totalTasks}`,
              inline: true,
            },
            {
              name: '❌ Failed',
              value: String(data.failedTasks),
              inline: true,
            },
            {
              name: '⏱️ Total Duration',
              value: formatDuration(data.totalDuration),
              inline: true,
            },
            {
              name: '🤖 Agents',
              value: data.agents.join(', '),
              inline: false,
            },
          ],
          footer: {
            text: `Session: ${data.sessionId}`,
          },
          timestamp: new Date(data.timestamp).toISOString(),
        },
      ],
    }),
    linear: (data: any) => `
## 🎉 Plan Completed

**Plan:** ${data.planTitle}
**Total Tasks:** ${data.totalTasks}
**Completed:** ✅ ${data.completedTasks}
**Failed:** ❌ ${data.failedTasks}
**Total Duration:** ${formatDuration(data.totalDuration)}

**Agents:** ${data.agents.join(', ')}

**Session:** ${data.sessionId}
**Timestamp:** ${new Date(data.timestamp).toLocaleString()}
`,
  },
}

/**
 * Helper function to format duration
 */
function formatDuration(ms?: number): string {
  if (!ms) return 'N/A'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

/**
 * Helper function to truncate text
 */
function truncate(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

/**
 * Validate notification configuration
 */
export function validateNotificationConfig(config: any): {
  valid: boolean
  config?: NotificationConfig
  errors?: z.ZodError
} {
  const result = NotificationConfigSchema.safeParse(config)

  if (result.success) {
    return { valid: true, config: result.data }
  }

  return { valid: false, errors: result.error }
}

/**
 * Merge notification configurations with priority: local > env > supabase > defaults
 */
export function mergeNotificationConfigs(
  defaults: NotificationConfig,
  supabase?: Partial<NotificationConfig>,
  env?: Partial<NotificationConfig>,
  local?: Partial<NotificationConfig>
): NotificationConfig {
  return {
    ...defaults,
    ...supabase,
    ...env,
    ...local,
    providers: {
      ...defaults.providers,
      ...supabase?.providers,
      ...env?.providers,
      ...local?.providers,
    },
  }
}
