/**
 * GitHub PR Service
 * Creates pull requests from chat sessions
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Octokit } from '@octokit/rest'
import type { ChatSession, FileChange } from '../types'
import { AIChatService } from './ai-chat-service'

export interface CreatePRFromSessionRequest {
  session: ChatSession
  title?: string
  draft?: boolean
  reviewers?: string[]
  labels?: string[]
}

export interface CreatePRResponse {
  success: boolean
  prUrl?: string
  prNumber?: number
  error?: string
}

export class GitHubPRService {
  private octokit: Octokit
  private aiChatService: AIChatService

  constructor(githubToken?: string) {
    const token = githubToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    if (!token) {
      throw new Error('GitHub token is required for PR creation')
    }

    this.octokit = new Octokit({ auth: token })
    this.aiChatService = new AIChatService()
  }

  /**
   * Create a pull request from a chat session
   */
  async createPRFromSession(request: CreatePRFromSessionRequest): Promise<CreatePRResponse> {
    const { session, title, draft, reviewers, labels } = request

    try {
      // Parse repository owner and name
      const [owner, repo] = session.repo.split('/')
      if (!owner || !repo) {
        return {
          success: false,
          error: 'Invalid repository format. Expected: owner/repo',
        }
      }

      // Get the job
      const workspaceDir = this.getWorkspaceDir(session.jobId)
      if (!existsSync(workspaceDir)) {
        return {
          success: false,
          error: 'Workspace directory not found',
        }
      }

      // Generate PR title and description
      const prTitle = title || this.generatePRTitle(session)
      const prDescription = this.aiChatService.generatePRDescription(session)

      // Get the work branch from git
      const workBranch = this.getCurrentBranch(workspaceDir)
      const baseBranch = 'main' // TODO: Get from session

      // Push the branch
      this.pushBranch(workspaceDir, workBranch)

      // Create the PR
      const { data: pr } = await this.octokit.pulls.create({
        owner,
        repo,
        title: prTitle,
        head: workBranch,
        base: baseBranch,
        body: prDescription,
        draft: draft ?? false,
      })

      // Add reviewers if specified
      if (reviewers && reviewers.length > 0) {
        await this.octokit.pulls.requestReviewers({
          owner,
          repo,
          pull_number: pr.number,
          reviewers,
        })
      }

      // Add labels if specified
      if (labels && labels.length > 0) {
        await this.octokit.issues.addLabels({
          owner,
          repo,
          issue_number: pr.number,
          labels,
        })
      }

      return {
        success: true,
        prUrl: pr.html_url,
        prNumber: pr.number,
      }
    } catch (error: any) {
      console.error('[GitHubPR] Error creating PR:', error)
      return {
        success: false,
        error: error.message || 'Failed to create pull request',
      }
    }
  }

  /**
   * Commit all changes in a session
   */
  async commitChanges(session: ChatSession, message?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const workspaceDir = this.getWorkspaceDir(session.jobId)
      if (!existsSync(workspaceDir)) {
        return { success: false, error: 'Workspace directory not found' }
      }

      // Stage all changes
      execSync('git add -A', { cwd: workspaceDir })

      // Check if there are changes to commit
      const status = execSync('git status --porcelain', {
        cwd: workspaceDir,
        encoding: 'utf-8',
      })

      if (!status.trim()) {
        return { success: false, error: 'No changes to commit' }
      }

      // Generate commit message
      const commitMessage = message || this.generateCommitMessage(session)

      // Commit
      execSync(`git commit -m "${commitMessage}"`, { cwd: workspaceDir })

      return { success: true }
    } catch (error: any) {
      console.error('[GitHubPR] Error committing changes:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Get workspace directory for a job
   */
  private getWorkspaceDir(jobId: string): string {
    // This should match the workspace structure from BackgroundAgentService
    const baseDir = process.env.WORKSPACE_DIR || join(process.cwd(), '.nikcli', 'workspaces')
    return join(baseDir, jobId)
  }

  /**
   * Get current git branch
   */
  private getCurrentBranch(workspaceDir: string): string {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: workspaceDir,
      encoding: 'utf-8',
    }).trim()
    return branch
  }

  /**
   * Push branch to remote
   */
  private pushBranch(workspaceDir: string, branch: string): void {
    execSync(`git push -u origin ${branch}`, { cwd: workspaceDir })
  }

  /**
   * Generate PR title from session
   */
  private generatePRTitle(session: ChatSession): string {
    // Get first user message as base
    const firstUserMessage = session.messages.find((m) => m.role === 'user')
    const baseTitle = firstUserMessage?.content || 'Chat session changes'

    // Truncate to reasonable length
    const maxLength = 72
    if (baseTitle.length <= maxLength) {
      return baseTitle
    }

    return baseTitle.substring(0, maxLength - 3) + '...'
  }

  /**
   * Generate commit message from session
   */
  private generateCommitMessage(session: ChatSession): string {
    const title = this.generatePRTitle(session)
    const filesList = session.fileChanges.map((f) => `- ${f.type}: ${f.path}`).join('\n')

    return `${title}

Changes:
${filesList}

Session: ${session.id}
Job: ${session.jobId}`
  }

  /**
   * Get PR status
   */
  async getPRStatus(owner: string, repo: string, prNumber: number) {
    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      })

      const { data: checks } = await this.octokit.checks.listForRef({
        owner,
        repo,
        ref: pr.head.sha,
      })

      return {
        state: pr.state,
        mergeable: pr.mergeable,
        merged: pr.merged,
        checks: checks.check_runs.map((check) => ({
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
        })),
      }
    } catch (error: any) {
      console.error('[GitHubPR] Error getting PR status:', error)
      throw error
    }
  }
}
