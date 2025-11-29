// src/cli/github-bot/types.ts

/**
 * GitHub webhook event payload
 */
export interface GitHubWebhookEvent {
  action: string
  repository: {
    id: number
    name: string
    full_name: string
    owner: {
      login: string
      id: number
    }
    private: boolean
    html_url: string
    clone_url: string
    ssh_url: string
    default_branch: string
  }
  sender: {
    login: string
    id: number
    avatar_url: string
  }
  issue?: GitHubIssue
  comment?: GitHubComment
  pull_request?: GitHubPullRequest
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string
  user: GitHubUser
  state: 'open' | 'closed'
  labels: GitHubLabel[]
  html_url: string
  created_at: string
  updated_at: string
}

export interface GitHubComment {
  id: number
  body: string
  user: GitHubUser
  html_url: string
  created_at: string
  updated_at: string
}

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  body: string
  user: GitHubUser
  state: 'open' | 'closed' | 'merged'
  head: {
    ref: string
    sha: string
    repo: GitHubRepository
  }
  base: {
    ref: string
    sha: string
    repo: GitHubRepository
  }
  html_url: string
  diff_url: string
  patch_url: string
  created_at: string
  updated_at: string
}

export interface GitHubUser {
  login: string
  id: number
  avatar_url: string
  html_url: string
}

export interface GitHubLabel {
  id: number
  name: string
  color: string
  description: string | null
}

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  owner: GitHubUser
  private: boolean
  html_url: string
  clone_url: string
  ssh_url: string
  default_branch: string
}

/**
 * NikCLI mention detected in comment
 */
export interface NikCLIMention {
  command: string // The command after @nikcli
  fullText: string // The full comment text
  args: string[] // Parsed command arguments
  context?: {
    files?: string[] // Mentioned files
    lineNumbers?: number[] // Mentioned line numbers
    codeBlocks?: string[] // Code blocks in comment
  }
}

/**
 * Processing job for @nikcli mention
 */
export interface ProcessingJob {
  id: string
  repository: string // owner/repo format
  issueNumber: number // Issue or PR number
  commentId: number // Comment ID
  mention: NikCLIMention
  status: JobStatus
  author: string // GitHub username who mentioned @nikcli
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  result?: TaskResult
  error?: string
  isPR?: boolean // Is this a PR comment?
  isIssue?: boolean // Is this an issue body?
  isPRReview?: boolean // Is this a PR review comment?
  pullRequest?: GitHubPullRequest // Full PR data if available
  slackThreadTs?: string // Slack thread timestamp for GitHub ↔ Slack sync
}

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

/**
 * Result of task execution
 */
export interface TaskResult {
  success: boolean
  summary: string // Human readable summary
  analysis?: string // Code analysis results
  files: string[] // Modified files
  prUrl?: string // Created PR URL
  shouldComment: boolean // Whether to post result comment
  details?: {
    branch?: string // Created branch name
    commits?: string[] // Commit SHAs
    testsRun?: boolean // Whether tests were executed
    linting?: boolean // Whether linting was applied
    jobId?: string // Background job ID if using background agent
    containerId?: string // Container ID if using VM execution
    executionTime?: number // Execution time in milliseconds
    tokenUsage?: number // Token usage for AI operations
  }
}

/**
 * Repository context for task execution
 */
export interface RepositoryContext {
  owner: string
  repo: string
  defaultBranch: string
  clonePath: string // Local clone path
  languages: string[] // Detected programming languages
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun'
  framework?: string // Detected framework (React, Vue, etc.)
  hasTests: boolean // Whether repository has tests
  hasCI: boolean // Whether repository has CI setup
}

/**
 * Task execution context
 */
export interface TaskContext {
  job: ProcessingJob
  repository: RepositoryContext
  workingDirectory: string
  tempBranch: string
  originalIssue?: GitHubIssue
  originalPR?: GitHubPullRequest
}

/**
 * Supported NikCLI commands via GitHub mentions
 */
export type NikCLICommand =
  | 'fix' // Fix issues/errors
  | 'add' // Add new functionality
  | 'optimize' // Performance optimization
  | 'refactor' // Code refactoring
  | 'test' // Add/fix tests
  | 'doc' // Add/update documentation
  | 'security' // Security improvements
  | 'accessibility' // A11y improvements
  | 'analyze' // Code analysis only
  | 'review' // Code review suggestions

/**
 * Command parsing result
 */
export interface CommandParseResult {
  command: NikCLICommand
  target?: string // Target file/directory/component
  description: string // What to do
  options?: {
    createTests?: boolean
    updateDocs?: boolean
    preserveFormatting?: boolean
    includeComments?: boolean
  }
}

/**
 * Configuration for GitHub Bot
 */
export interface GitHubBotConfig {
  githubToken: string
  webhookSecret: string
  appId: string
  privateKey: string
  installationId: string
}

/**
 * GitHub API wrapper for bot operations
 */
export interface GitHubBotAPI {
  createBranch(repo: string, branchName: string, fromSha: string): Promise<void>
  createCommit(
    repo: string,
    branch: string,
    message: string,
    files: Array<{ path: string; content: string }>
  ): Promise<string>
  createPullRequest(repo: string, branch: string, baseBranch: string, title: string, body: string): Promise<string>
  addReaction(repo: string, commentId: number, reaction: string): Promise<void>
  createComment(repo: string, issueNumber: number, body: string): Promise<void>
  getFileContent(repo: string, path: string, branch?: string): Promise<string>
  updateFileContent(repo: string, path: string, content: string, message: string, branch: string): Promise<void>
}
