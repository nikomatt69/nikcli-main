// TODO: Consider refactoring for reduced complexity
// Web interface routes for Background Agents API
import express from 'express'

// Local type definitions
interface GitHubRepository {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  clone_url: string
  default_branch: string
  description?: string
  language?: string
  updated_at: string
}

// GitHub API client
class GitHubAPIClient {
  private token: string | null

  constructor(token?: string) {
    this.token = token || process.env.GITHUB_TOKEN || null
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    if (!this.token) {
      throw new Error('GitHub token not configured')
    }

    try {
      const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: {
          Authorization: `token ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'NikCLI-BackgroundAgents/0.3.0',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
      }

      const repos = await response.json()

      return repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        html_url: repo.html_url,
        clone_url: repo.clone_url,
        default_branch: repo.default_branch,
        description: repo.description || undefined,
        language: repo.language || undefined,
        updated_at: repo.updated_at,
      }))
    } catch (error: any) {
      console.error('Failed to fetch GitHub repositories:', error.message)
      throw new Error(`Failed to fetch repositories: ${error.message}`)
    }
  }

  async getUserInfo(): Promise<{ login: string; name?: string; email?: string }> {
    if (!this.token) {
      throw new Error('GitHub token not configured')
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${this.token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'NikCLI-BackgroundAgents/0.3.0',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
      }

      const user = await response.json()
      return {
        login: user.login,
        name: user.name || undefined,
        email: user.email || undefined,
      }
    } catch (error: any) {
      console.error('Failed to fetch GitHub user info:', error.message)
      throw new Error(`Failed to fetch user info: ${error.message}`)
    }
  }
}

interface WebConfig {
  github: {
    token: string | null
    username: string | null
    repositories: GitHubRepository[]
  }
  defaultModel: string
  defaultRepository: string | null
  notifications: {
    slack: boolean
    email: boolean
  }
}

import { backgroundAgentService } from '../background-agent-service'

export function setupWebRoutes(app: express.Application): void {
  const webRouter = express.Router()

  // Configuration endpoints
  webRouter.get('/config', getWebConfig)
  webRouter.post('/config', updateWebConfig)

  // GitHub integration endpoints
  webRouter.get('/auth/github', initiateGitHubOAuth)
  webRouter.get('/auth/github/callback', handleGitHubCallback)
  webRouter.get('/repositories', getGitHubRepositories)

  // Job management endpoints
  webRouter.get('/jobs', getWebJobs)
  webRouter.post('/jobs', createWebJob)
  webRouter.get('/jobs/:id', getWebJob)
  webRouter.delete('/jobs/:id', cancelWebJob)

  // Snapshot endpoints
  webRouter.get('/snapshots', getSnapshots)
  webRouter.post('/snapshots', createSnapshot)
  webRouter.get('/snapshots/:id', getSnapshot)
  webRouter.delete('/snapshots/:id', deleteSnapshot)

  app.use('/api/v1/web', webRouter)
}

// Configuration handlers
async function getWebConfig(_req: express.Request, res: express.Response): Promise<void> {
  try {
    const githubClient = new GitHubAPIClient()

    let username: string | null = null
    let repositories: GitHubRepository[] = []

    // Try to fetch GitHub data if token is available
    try {
      const userInfo = await githubClient.getUserInfo()
      username = userInfo.login
      repositories = await githubClient.getRepositories()
    } catch (githubError: any) {
      console.warn('GitHub API not available:', githubError.message)
      // Continue with empty data if GitHub is not configured
    }

    const config: WebConfig = {
      github: {
        token: process.env.GITHUB_TOKEN || null,
        username,
        repositories,
      },
      defaultModel: 'claude-3-5-sonnet-latest',
      defaultRepository: null,
      notifications: {
        slack: false,
        email: false,
      },
    }

    res.json({
      success: true,
      config,
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function updateWebConfig(req: express.Request, res: express.Response): Promise<void> {
  try {
    const updates = req.body
    const githubClient = new GitHubAPIClient()

    let username: string | null = null
    let repositories: GitHubRepository[] = []

    // Try to fetch GitHub data if token is available
    try {
      const userInfo = await githubClient.getUserInfo()
      username = userInfo.login
      repositories = await githubClient.getRepositories()
    } catch (githubError: any) {
      console.warn('GitHub API not available:', githubError.message)
      // Continue with empty data if GitHub is not configured
    }

    const config: WebConfig = {
      github: {
        token: process.env.GITHUB_TOKEN || null,
        username,
        repositories,
      },
      defaultModel: updates.defaultModel || 'claude-3-5-sonnet-latest',
      defaultRepository: updates.defaultRepository || null,
      notifications: {
        slack: updates.notifications?.slack || false,
        email: updates.notifications?.email || false,
      },
    }

    res.json({
      success: true,
      config,
      message: 'Configuration updated successfully',
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

// GitHub OAuth handlers
async function initiateGitHubOAuth(req: express.Request, res: express.Response): Promise<void> {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID
    if (!clientId) {
      throw new Error('GitHub OAuth not configured')
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/web/auth/github/callback`
    const scope = 'repo,user:read'
    const state = Math.random().toString(36).substring(7)

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`

    res.redirect(authUrl)
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function handleGitHubCallback(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { code } = req.query

    if (!code) {
      throw new Error('No authorization code received')
    }

    // Exchange code for token (implementation would go here)
    // For now, redirect back to config page
    res.redirect('/config?tab=github&success=true')
  } catch (_error: any) {
    res.redirect('/config?tab=github&error=oauth_failed')
  }
}

async function getGitHubRepositories(_req: express.Request, res: express.Response): Promise<void> {
  try {
    const githubClient = new GitHubAPIClient()
    const repositories = await githubClient.getRepositories()

    res.json({
      success: true,
      repositories,
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

// Job management handlers
async function getWebJobs(req: express.Request, res: express.Response): Promise<void> {
  try {
    const jobs = backgroundAgentService.listJobs({
      limit: parseInt(req.query.limit as string, 10) || 50,
      offset: parseInt(req.query.offset as string, 10) || 0,
    })

    res.json({
      success: true,
      jobs: jobs.map((job) => ({
        ...job,
        webCreatedAt: job.createdAt,
        userInitiated: true,
        webLogs: [],
      })),
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function createWebJob(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { repositoryName, task, baseBranch = 'main', ...otherProps } = req.body

    const jobRequest = {
      repo: repositoryName,
      baseBranch,
      task,
      ...otherProps,
    }

    const jobId = await backgroundAgentService.createJob(jobRequest)

    res.json({
      success: true,
      jobId,
      message: 'Background job created successfully',
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function getWebJob(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { id } = req.params
    const job = backgroundAgentService.getJob(id)

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      })
      return
    }

    res.json({
      success: true,
      job: {
        ...job,
        webCreatedAt: job.createdAt,
        userInitiated: true,
        webLogs: [],
      },
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function cancelWebJob(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { id } = req.params
    const success = await backgroundAgentService.cancelJob(id)

    res.json({
      success,
      message: success ? 'Job cancelled successfully' : 'Job not found or cannot be cancelled',
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

// Snapshot handlers (placeholder implementations)
async function getSnapshots(_req: express.Request, res: express.Response): Promise<void> {
  try {
    // Mock snapshots - in real implementation would fetch from storage
    const snapshots = [
      {
        id: 'snap_1',
        name: 'Pre-refactor snapshot',
        repository: 'nikomatt69/nikcli-main',
        branch: 'main',
        commit: 'abc123',
        createdAt: new Date(),
        size: 1024 * 1024 * 5, // 5MB
        description: 'Snapshot before major refactor',
        metadata: {
          totalFiles: 150,
          languages: ['TypeScript', 'JavaScript'],
          lastModified: new Date(),
        },
      },
    ]

    res.json({
      success: true,
      snapshots,
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function createSnapshot(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { name, repository, description } = req.body

    // Mock snapshot creation
    const snapshot = {
      id: `snap_${Date.now()}`,
      name,
      repository,
      branch: 'main',
      commit: 'abc123',
      createdAt: new Date(),
      size: Math.floor(Math.random() * 1024 * 1024 * 10),
      description,
      metadata: {
        totalFiles: Math.floor(Math.random() * 200),
        languages: ['TypeScript', 'JavaScript'],
        lastModified: new Date(),
      },
    }

    res.json({
      success: true,
      snapshot,
      message: 'Snapshot created successfully',
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function getSnapshot(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { id } = req.params

    // Mock snapshot retrieval
    res.json({
      success: true,
      snapshot: {
        id,
        name: 'Sample snapshot',
        repository: 'nikomatt69/nikcli-main',
        branch: 'main',
        commit: 'abc123',
        createdAt: new Date(),
        size: 1024 * 1024 * 5,
        description: 'Sample snapshot',
        metadata: {
          totalFiles: 150,
          languages: ['TypeScript'],
          lastModified: new Date(),
        },
      },
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

async function deleteSnapshot(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { _ } = req.params

    // Mock snapshot deletion
    res.json({
      success: true,
      message: 'Snapshot deleted successfully',
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

// WebSocket handler
