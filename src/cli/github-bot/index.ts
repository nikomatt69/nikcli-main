// src/cli/github-bot/index.ts

/**
 * GitHub Bot Integration for NikCLI
 * 
 * Main entry point for the GitHub bot functionality
 */

export { GitHubWebhookHandler } from './webhook-handler'
export { TaskExecutor } from './task-executor'
export { CommentProcessor } from './comment-processor'
export { PRReviewExecutor } from './pr-review-executor'

export type {
  GitHubWebhookEvent,
  GitHubIssue,
  GitHubComment,
  GitHubPullRequest,
  GitHubUser,
  GitHubLabel,
  GitHubRepository,
  NikCLIMention,
  ProcessingJob,
  JobStatus,
  TaskResult,
  RepositoryContext,
  TaskContext,
  NikCLICommand,
  CommandParseResult,
  GitHubBotConfig,
  GitHubBotAPI,
} from './types'
