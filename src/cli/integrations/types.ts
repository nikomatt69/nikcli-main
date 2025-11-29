// Shared integration types for GitHub/Slack orchestration

export interface SlackConfig {
  token: string
  signingSecret: string
  botToken: string
  webhookUrl?: string
}

export interface SlackMessage {
  channel: string
  text: string
  threadTs?: string
  blocks?: any[]
  username?: string
  iconEmoji?: string
}

export interface SlackCommand {
  command: string
  text?: string
  user_id: string
  channel_id: string
  team_id?: string
  trigger_id?: string
  response_url?: string
}

export interface GitHubBotConfig {
  token: string
  appId: string
  privateKey: string
  webhookSecret: string
  installationId: number
}

export interface IntegrationConfig {
  defaultChannel: string
  devChannel: string
  securityChannel: string
}

export interface WorkflowEvent<T = any> {
  type: string
  data?: T
  timestamp: number
  source: 'github' | 'slack' | 'system' | 'manual'
  correlationId?: string
}

export interface SyncAction {
  id: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  details?: any
}
