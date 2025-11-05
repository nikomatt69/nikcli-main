import { apiClient } from './api-client'
import { SlackConfig, SlackConnection, SlackTestMessageRequest, SlackTestMessageResponse } from '@/types/slack'

/**
 * Slack API Client
 */

/**
 * Get Slack configuration
 */
export async function getSlackConfig() {
  return apiClient.get<SlackConfig>('/v1/slack/config')
}

/**
 * Get Slack connection status
 */
export async function getSlackConnection() {
  return apiClient.get<SlackConnection>('/v1/slack/status')
}

/**
 * Update Slack configuration
 */
export async function updateSlackConfig(config: Partial<SlackConfig>) {
  return apiClient.post<SlackConfig>('/v1/slack/config', config)
}

/**
 * Send test message to Slack
 */
export async function sendSlackTestMessage(request: SlackTestMessageRequest) {
  return apiClient.post<SlackTestMessageResponse>('/v1/slack/test', request)
}

/**
 * Disconnect Slack integration
 */
export async function disconnectSlack() {
  return apiClient.delete('/v1/slack/disconnect')
}
