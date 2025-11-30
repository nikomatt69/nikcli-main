// src/cli/github-bot/bot-config.example.ts

/**
 * Example configuration for GitHub Bot
 *
 * Copy this file to bot-config.ts and fill in your credentials
 * Add bot-config.ts to .gitignore to keep secrets safe
 */

export const botConfig = {
  // GitHub App credentials
  githubToken: process.env.GITHUB_TOKEN || 'your_github_token',
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'your_webhook_secret',
  appId: process.env.GITHUB_APP_ID || 'your_app_id',
  privateKey: process.env.GITHUB_PRIVATE_KEY || 'your_private_key',
  installationId: process.env.GITHUB_INSTALLATION_ID || 'your_installation_id',

  // Bot behavior configuration
  executionMode: 'auto' as const, // 'auto' | 'background-agent' | 'local-execution'

  // Webhook endpoint
  webhookEndpoint: '/api/github/webhook',

  // Rate limiting
  maxConcurrentJobs: 5,
  jobTimeout: 30 * 60 * 1000, // 30 minutes

  // Feature flags
  features: {
    enablePRReview: true,
    enableAutoFix: true,
    enableTypeScriptChecks: true,
    enableESLintFixes: true,
    enableAIPoweredFixes: true,
  },

  // AI model configuration for fixes
  aiModel: {
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.2,
    maxTokens: 2000,
  },
}

export type BotConfig = typeof botConfig
