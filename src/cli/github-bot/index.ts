// src/cli/github-bot/index.ts

/**
 * GitHub Bot Integration for NikCLI
 *
 * Main entry point for the GitHub bot functionality
 */

export { CommentProcessor } from './comment-processor'
export { PRReviewExecutor } from './pr-review-executor'
export { TaskExecutor } from './task-executor'
export type {
  CommandParseResult,
  GitHubBotAPI,
  GitHubBotConfig,
  GitHubComment,
  GitHubIssue,
  GitHubLabel,
  GitHubPullRequest,
  GitHubRepository,
  GitHubUser,
  GitHubWebhookEvent,
  JobStatus,
  NikCLICommand,
  NikCLIMention,
  ProcessingJob,
  RepositoryContext,
  TaskContext,
  TaskResult,
} from './types'
export { GitHubWebhookHandler } from './webhook-handler'
