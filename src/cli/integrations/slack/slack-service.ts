// src/cli/integrations/slack/slack-service.ts

import { IncomingWebhook } from '@slack/webhook';
import { WebClient } from '@slack/web-api';
import type { SlackConfig as SlackConfigType, SlackMessage, SlackCommand } from '../types';

export interface SlackConfig {
  token: string;
  signingSecret: string;
  botToken: string;
  webhookUrl?: string;
}

export interface SlackCommandHandler {
  command: string;
  description: string;
  usage: string;
  handler: (args: string[], user: string, channel: string) => Promise<void>;
}

export interface NotificationTemplate {
  title: string;
  message: string;
  color?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  actions?: Array<{
    text: string;
    url: string;
    style?: 'primary' | 'danger';
  }>;
}

export class EnhancedSlackService {
  private webClient: WebClient;
  private webhook?: IncomingWebhook;
  private commandHandlers: Map<string, SlackCommandHandler> = new Map();
  private userSessions: Map<string, any> = new Map();
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
    this.webClient = new WebClient(config.botToken);

    if (config.webhookUrl) {
      this.webhook = new IncomingWebhook(config.webhookUrl);
    }

    this.setupCommandHandlers();
  }

  private setupCommandHandlers(): void {
    // NikCLI commands for Slack
    this.commandHandlers.set('analyze', {
      command: 'nikcli analyze',
      description: 'Analyze a GitHub repository',
      usage: 'nikcli analyze <repo-owner>/<repo-name>',
      handler: this.handleAnalyzeCommand.bind(this),
    });

    this.commandHandlers.set('deploy', {
      command: 'nikcli deploy',
      description: 'Deploy an application',
      usage: 'nikcli deploy <app-name> [--env <environment>]',
      handler: this.handleDeployCommand.bind(this),
    });

    this.commandHandlers.set('debug', {
      command: 'nikcli debug',
      description: 'Debug application issues',
      usage: 'nikcli debug <app-name>',
      handler: this.handleDebugCommand.bind(this),
    });

    this.commandHandlers.set('status', {
      command: 'nikcli status',
      description: 'Check system status',
      usage: 'nikcli status',
      handler: this.handleStatusCommand.bind(this),
    });

    this.commandHandlers.set('notify', {
      command: 'nikcli notify',
      description: 'Send notifications',
      usage: 'nikcli notify <channel> <message>',
      handler: this.handleNotifyCommand.bind(this),
    });

    this.commandHandlers.set('workflow', {
      command: 'nikcli workflow',
      description: 'Trigger automation workflows',
      usage: 'nikcli workflow <workflow-name>',
      handler: this.handleWorkflowCommand.bind(this),
    });
  }

  // Process slash commands from Slack
  async processSlashCommand(command: SlackCommand): Promise<void> {
    const { command: cmd, text, user_id, channel_id } = command;

    try {
      // Find matching handler
      const handler = this.findCommandHandler(cmd);
      if (!handler) {
        await this.sendErrorResponse(channel_id, `Unknown command: ${cmd}`);
        return;
      }

      // Parse arguments
      const args = this.parseCommandArgs(text || '');

      // Set user session
      this.setUserSession(user_id, {
        lastCommand: cmd,
        timestamp: Date.now(),
        channel: channel_id,
      });

      // Execute command
      await handler.handler(args, user_id, channel_id);
    } catch (error) {
      console.error('Error processing slash command:', error);
      await this.sendErrorResponse(channel_id, 'Failed to process command');
    }
  }

  // Enhanced notification system
  async sendRichNotification(
    channel: string,
    template: NotificationTemplate,
    options?: {
      threadTs?: string;
      username?: string;
      iconEmoji?: string;
    },
  ): Promise<void> {
    try {
      const blocks = this.buildRichMessageBlocks(template);

      await this.webClient.chat.postMessage({
        channel,
        text: template.title,
        blocks,
        thread_ts: options?.threadTs,
        username: options?.username,
        icon_emoji: options?.iconEmoji,
      });
    } catch (error) {
      console.error('Failed to send rich notification:', error);
      // Fallback to simple webhook
      if (this.webhook) {
        await this.webhook.send({
          text: `${template.title}\n${template.message}`,
        });
      }
    }
  }

  // Repository Analysis Notification Template
  async notifyRepositoryAnalysis(
    channel: string,
    analysis: {
      repo: string;
      score: number;
      issues: string[];
      suggestions: string[];
      link: string;
    },
  ): Promise<void> {
    const template: NotificationTemplate = {
      title: `📊 Repository Analysis: ${analysis.repo}`,
      message: `Overall Score: ${analysis.score}/100`,
      color:
        analysis.score > 80
          ? 'good'
          : analysis.score > 60
            ? 'warning'
            : 'danger',
      fields: [
        {
          title: 'Score',
          value: `${analysis.score}/100`,
          short: true,
        },
        {
          title: 'Issues Found',
          value: `${analysis.issues.length}`,
          short: true,
        },
        {
          title: 'Suggestions',
          value: analysis.suggestions.join('\n') || 'No suggestions',
          short: false,
        },
      ],
      actions: [
        {
          text: 'View Full Report',
          url: analysis.link,
          style: 'primary',
        },
      ],
    };

    await this.sendRichNotification(channel, template);
  }

  // Deployment Status Notification
  async notifyDeploymentStatus(
    channel: string,
    status: {
      app: string;
      environment: string;
      status: 'success' | 'failure' | 'in_progress';
      duration?: number;
      url?: string;
      logs?: string;
    },
  ): Promise<void> {
    const emojis = {
      success: '✓',
      failure: '✖',
      in_progress: '🔄',
    };

    const colors = {
      success: 'good',
      failure: 'danger',
      in_progress: 'warning',
    };

    const template: NotificationTemplate = {
      title: `${emojis[status.status]} Deployment ${status.status === 'success'
        ? 'Completed'
        : status.status === 'failure'
          ? 'Failed'
          : 'In Progress'
        }`,
      message: `${status.app} to ${status.environment}`,
      color: colors[status.status],
      fields: [
        {
          title: 'Application',
          value: status.app,
          short: true,
        },
        {
          title: 'Environment',
          value: status.environment,
          short: true,
        },
      ],
      actions: status.url
        ? [
          {
            text: 'View App',
            url: status.url,
            style: status.status === 'success' ? 'primary' : undefined,
          },
        ]
        : undefined,
    };

    if (status.duration) {
      template.fields?.push({
        title: 'Duration',
        value: `${Math.round(status.duration / 1000)}s`,
        short: true,
      });
    }

    await this.sendRichNotification(channel, template);
  }

  // Error Alert System
  async sendErrorAlert(
    channel: string,
    error: {
      title: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      context?: any;
      stackTrace?: string;
    },
  ): Promise<void> {
    const severityColors = {
      low: 'good',
      medium: 'warning',
      high: 'warning',
      critical: 'danger',
    };

    const severityEmojis = {
      low: '⚠︎',
      medium: '🔶',
      high: '🔴',
      critical: '🚨',
    };

    const template: NotificationTemplate = {
      title: `${severityEmojis[error.severity]} Error Alert: ${error.title}`,
      message: error.description,
      color: severityColors[error.severity],
      fields: error.context
        ? [
          {
            title: 'Context',
            value: this.formatContext(error.context),
            short: false,
          },
        ]
        : undefined,
    };

    if (error.stackTrace && error.severity === 'critical') {
      template.fields?.push({
        title: 'Stack Trace',
        value: `\`\`\`${error.stackTrace}\`\`\``,
        short: false,
      });
    }

    await this.sendRichNotification(channel, template);
  }

  // Command Handlers Implementation
  private async handleAnalyzeCommand(
    args: string[],
    user: string,
    channel: string,
  ): Promise<void> {
    if (args.length !== 1) {
      await this.sendUsage(channel, 'analyze', 'nikcli analyze <owner>/<repo>');
      return;
    }

    const repo = args[0];
    await this.sendLoading(channel, 'Analyzing repository...');

    try {
      // This would integrate with the GitHub service
      const analysis = await this.performRepositoryAnalysis(repo);

      await this.notifyRepositoryAnalysis(channel, {
        repo,
        score: analysis.score,
        issues: analysis.analysis.security.vulnerabilities || [],
        suggestions: analysis.suggestions || [],
        link: `https://github.com/${repo}`,
      });
    } catch (error) {
      await this.sendErrorResponse(
        channel,
        `Failed to analyze ${repo}: ${error}`,
      );
    }
  }

  private async handleDeployCommand(
    args: string[],
    user: string,
    channel: string,
  ): Promise<void> {
    // Implementation for deployment command
    await this.sendResponse(channel, 'Deployment command received');
  }

  private async handleDebugCommand(
    args: string[],
    user: string,
    channel: string,
  ): Promise<void> {
    // Implementation for debug command
    await this.sendResponse(channel, 'Debug command received');
  }

  private async handleStatusCommand(
    args: string[],
    user: string,
    channel: string,
  ): Promise<void> {
    // Get system status
    const status = await this.getSystemStatus();

    await this.sendRichNotification(channel, {
      title: '📊 NikCLI System Status',
      message: 'Current system health',
      color: status.healthy ? 'good' : 'warning',
      fields: [
        {
          title: 'Status',
          value: status.healthy ? 'Healthy' : 'Issues Detected',
          short: true,
        },
        {
          title: 'Uptime',
          value: status.uptime,
          short: true,
        },
        {
          title: 'Active Users',
          value: status.activeUsers.toString(),
          short: true,
        },
        {
          title: 'Recent Activity',
          value: status.recentActivity,
          short: false,
        },
      ],
    });
  }

  private async handleNotifyCommand(
    args: string[],
    user: string,
    channel: string,
  ): Promise<void> {
    if (args.length < 2) {
      await this.sendUsage(
        channel,
        'notify',
        'nikcli notify <channel> <message>',
      );
      return;
    }

    const targetChannel = args[0];
    const message = args.slice(1).join(' ');

    await this.sendResponse(
      targetChannel,
      `📢 Notification from ${user}:\n${message}`,
    );
  }

  private async handleWorkflowCommand(
    args: string[],
    user: string,
    channel: string,
  ): Promise<void> {
    if (args.length === 0) {
      const availableWorkflows = await this.getAvailableWorkflows();
      await this.sendResponse(
        channel,
        `Available workflows:\n${availableWorkflows.join('\n')}`,
      );
      return;
    }

    const workflowName = args[0];
    await this.sendLoading(channel, `Triggering workflow: ${workflowName}...`);

    try {
      await this.triggerWorkflow(workflowName, { triggeredBy: user });
      await this.sendResponse(
        channel,
        `✓ Workflow '${workflowName}' triggered successfully!`,
      );
    } catch (error) {
      await this.sendErrorResponse(
        channel,
        `Failed to trigger workflow: ${error}`,
      );
    }
  }

  // Utility Methods
  private findCommandHandler(command: string): SlackCommandHandler | undefined {
    // Remove /nikcli prefix if present
    const cleanCommand = command.replace(/^\/nikcli\s*/, '');
    return this.commandHandlers.get(cleanCommand);
  }

  private parseCommandArgs(text: string): string[] {
    // Simple argument parsing - could be enhanced with proper quote handling
    return text
      .trim()
      .split(/\s+/)
      .filter((arg) => arg.length > 0);
  }

  private setUserSession(userId: string, session: any): void {
    this.userSessions.set(userId, session);
  }

  private buildRichMessageBlocks(template: NotificationTemplate): any[] {
    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: template.title,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: template.message,
        },
      },
    ];

    if (template.fields && template.fields.length > 0) {
      blocks.push({
        type: 'section',
        fields: template.fields.map((field) => ({
          type: 'mrkdwn',
          text: `*${field.title}:*\n${field.value}`,
        })),
      });
    }

    if (template.actions && template.actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: template.actions.map((action) => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: action.text,
          },
          url: action.url,
          style: action.style,
        })),
      });
    }

    return blocks;
  }

  private formatContext(context: any): string {
    try {
      return JSON.stringify(context, null, 2);
    } catch {
      return String(context);
    }
  }

  // Helper methods for stub implementations
  private async performRepositoryAnalysis(repo: string): Promise<any> {
    // Integration with GitHub service
    return {
      score: 85,
      suggestions: ['Consider adding more tests', 'Update dependencies'],
    };
  }

  private async getSystemStatus(): Promise<any> {
    return {
      healthy: true,
      uptime: '5d 14h',
      activeUsers: 24,
      recentActivity:
        'Recent deployments, code reviews, and system health checks',
    };
  }

  private async getAvailableWorkflows(): Promise<string[]> {
    return [
      'build-and-deploy',
      'security-scan',
      'performance-test',
      'documentation-update',
    ];
  }

  private async triggerWorkflow(
    workflowName: string,
    context: any,
  ): Promise<void> {
    // Integration with workflow engine
    console.log(`Triggering workflow: ${workflowName}`, context);
  }

  // Basic response methods
  private async sendResponse(channel: string, message: string): Promise<void> {
    await this.webClient.chat.postMessage({
      channel,
      text: message,
    });
  }

  private async sendErrorResponse(
    channel: string,
    error: string,
  ): Promise<void> {
    await this.sendResponse(channel, `✖ ${error}`);
  }

  private async sendUsage(
    channel: string,
    command: string,
    usage: string,
  ): Promise<void> {
    await this.sendResponse(
      channel,
      `Usage: \`${usage}\`\n\nExample: \`/${command} example.com\``,
    );
  }

  private async sendLoading(channel: string, message: string): Promise<void> {
    await this.sendResponse(channel, `⏳︎ ${message}`);
  }

  // ========== @nikcli MENTION HANDLING ==========

  private threadSessions: Map<string, any> = new Map();

  /**
   * Handle app_mention event from Slack
   */
  async handleAppMention(event: {
    user: string;
    text: string;
    channel: string;
    ts: string;
    thread_ts?: string;
  }): Promise<void> {
    const threadTs = event.thread_ts || event.ts;
    const sessionKey = `${event.channel}:${threadTs}`;

    // Security check
    if (!(await this.checkChannelWhitelist(event.channel))) {
      console.warn(`✖ Channel ${event.channel} not in whitelist`);
      return;
    }

    // Extract prompt after @nikcli mention
    let rawPrompt = event.text.replace(/<@[A-Z0-9]+>/, '').trim();

    // Parse inline keywords (like GitHub Copilot)
    const parsedCommand = this.parseInlineKeywords(rawPrompt);

    if (!parsedCommand.prompt && !parsedCommand.command) {
      await this.webClient.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: `👋 Hi! I'm NikCLI. Ask me anything about your code, deployments, or GitHub repositories.\n\n**Examples:**\n• \`@nikcli analyze the performance of this code\`\n• \`@nikcli repo=owner/repo add error handling to login function\`\n• \`@nikcli settings\` - Configure default repository\n• \`@nikcli repo=owner/repo branch=main update user model\``,
      });
      return;
    }

    console.log(`📥 @nikcli mention: "${parsedCommand.prompt}" in channel ${event.channel}`, parsedCommand.metadata);

    // Get or create session
    let session = this.threadSessions.get(sessionKey);
    if (!session) {
      session = {
        id: `slack_${Date.now()}`,
        repo: parsedCommand.metadata.repo || 'slack-integration',
        branch: parsedCommand.metadata.branch || 'main',
        jobId: `slack_job_${Date.now()}`,
        channel: event.channel,
        threadTs,
        userId: event.user,
        messages: [],
        fileChanges: [],
        createdAt: new Date(),
      };
      this.threadSessions.set(sessionKey, session);
    } else {
      // Update session with new metadata if provided
      if (parsedCommand.metadata.repo) session.repo = parsedCommand.metadata.repo;
      if (parsedCommand.metadata.branch) session.branch = parsedCommand.metadata.branch;
    }

    // Handle special commands
    if (parsedCommand.command === 'settings') {
      await this.handleSettingsCommand(event.channel, threadTs, session);
      return;
    }

    // Add user message
    session.messages.push({ role: 'user', content: parsedCommand.prompt });

    // Stream AI response with context
    await this.streamAIResponse(session, parsedCommand.prompt, parsedCommand.metadata);
  }

  /**
   * Parse inline keywords from prompt (GitHub Copilot style)
   * Examples:
   * - "@nikcli repo=owner/repo add error handling"
   * - "@nikcli repo=owner/repo branch=dev update user model"
   * - "@nikcli settings"
   */
  private parseInlineKeywords(text: string): {
    prompt: string;
    command?: string;
    metadata: {
      repo?: string;
      branch?: string;
    };
  } {
    const metadata: { repo?: string; branch?: string } = {};
    let command: string | undefined;

    // Check for special commands
    if (text.trim() === 'settings') {
      return { prompt: '', command: 'settings', metadata };
    }

    // Parse repo=owner/repo
    const repoMatch = text.match(/repo=([^\s]+)/);
    if (repoMatch) {
      metadata.repo = repoMatch[1];
      text = text.replace(/repo=[^\s]+\s*/, '');
    }

    // Parse branch=branch-name
    const branchMatch = text.match(/branch=([^\s]+)/);
    if (branchMatch) {
      metadata.branch = branchMatch[1];
      text = text.replace(/branch=[^\s]+\s*/, '');
    }

    return {
      prompt: text.trim(),
      command,
      metadata,
    };
  }

  /**
   * Handle settings command
   */
  private async handleSettingsCommand(
    channel: string,
    threadTs: string,
    session: any
  ): Promise<void> {
    const settingsText = `⚙️ **Current Settings**

**Repository:** \`${session.repo || 'Not set'}\`
**Branch:** \`${session.branch || 'main'}\`

**To change settings:**
• Set repository: \`@nikcli repo=owner/repo [your task]\`
• Set branch: \`@nikcli branch=branch-name [your task]\`
• Set both: \`@nikcli repo=owner/repo branch=dev [your task]\`

**Examples:**
• \`@nikcli repo=nicomatt69/nikcli-main analyze the codebase\`
• \`@nikcli repo=facebook/react branch=main explain the useEffect hook\``;

    await this.webClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: settingsText,
    });
  }

  /**
   * Stream AI response to Slack thread
   */
  private async streamAIResponse(session: any, prompt: string, metadata?: { repo?: string; branch?: string }): Promise<void> {
    try {
      // Import AI chat service dynamically
      const { AIChatService } = await import('../../background-agents/services/ai-chat-service');
      const aiChatService = new AIChatService();

      // Enrich prompt with repository context if provided
      let enrichedPrompt = prompt;
      if (metadata?.repo) {
        enrichedPrompt = `Repository: ${metadata.repo}\nBranch: ${metadata.branch || 'main'}\n\nTask: ${prompt}`;
      }

      let accumulatedText = '';
      let messageTs: string | undefined;
      let lastUpdateTime = Date.now();

      await aiChatService.generateResponse(
        session,
        enrichedPrompt,
        (delta: string) => {
          accumulatedText += delta;

          // Update message every 1 second or 150 chars
          const now = Date.now();
          if (!messageTs || accumulatedText.length % 150 === 0 || now - lastUpdateTime > 1000) {
            this.updateOrPostMessage(
              session.channel,
              accumulatedText,
              session.threadTs,
              messageTs,
            )
              .then((ts) => {
                messageTs = ts;
                lastUpdateTime = now;
              })
              .catch((err) => console.error('Error updating message:', err));
          }
        },
      );

      // Final update
      if (accumulatedText) {
        await this.updateOrPostMessage(
          session.channel,
          accumulatedText,
          session.threadTs,
          messageTs,
        );
        session.messages.push({ role: 'assistant', content: accumulatedText });
      }
    } catch (error: any) {
      console.error('✖ Error streaming AI response:', error);
      await this.webClient.chat.postMessage({
        channel: session.channel,
        thread_ts: session.threadTs,
        text: `✖ Sorry, I encountered an error: ${error.message}`,
      });
    }
  }

  /**
   * Update existing message or post new one
   */
  private async updateOrPostMessage(
    channel: string,
    text: string,
    threadTs: string,
    messageTs?: string,
  ): Promise<string> {
    try {
      if (messageTs) {
        // Update existing message
        await this.webClient.chat.update({
          channel,
          ts: messageTs,
          text,
        });
        return messageTs;
      } else {
        // Post new message
        const result = await this.webClient.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text,
        });
        return result.ts!;
      }
    } catch (error: any) {
      console.error('Error updating/posting message:', error);
      throw error;
    }
  }

  /**
   * Notify Slack about GitHub mention
   */
  async notifyGitHubMention(
    channel: string,
    mention: {
      repository: string;
      issueNumber: number;
      commentUrl: string;
      author: string;
      command: string;
    },
  ): Promise<string> {
    try {
      const result = await this.webClient.chat.postMessage({
        channel,
        text: `🔗 @nikcli mentioned on GitHub`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*GitHub Mention Detected* 🔗\n\`@nikcli ${mention.command}\``,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Repository*\n${mention.repository}`,
              },
              {
                type: 'mrkdwn',
                text: `*Issue/PR*\n#${mention.issueNumber}`,
              },
              {
                type: 'mrkdwn',
                text: `*Author*\n@${mention.author}`,
              },
              {
                type: 'mrkdwn',
                text: `*Command*\n\`${mention.command}\``,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '👁️ View on GitHub',
                },
                url: mention.commentUrl,
                style: 'primary',
              },
            ],
          },
        ],
      });

      console.log(`✓ GitHub mention notified to Slack channel ${channel}`);
      return result.ts!;
    } catch (error: any) {
      console.error('✖ Error notifying GitHub mention:', error);
      throw error;
    }
  }

  /**
   * Check if channel is in whitelist
   */
  private async checkChannelWhitelist(channel: string): Promise<boolean> {
    const allowedChannels = (process.env.SLACK_ALLOWED_CHANNELS || '').split(',').filter(Boolean);

    // No whitelist configured = allow all
    if (allowedChannels.length === 0) {
      return true;
    }

    return allowedChannels.includes(channel);
  }
}
