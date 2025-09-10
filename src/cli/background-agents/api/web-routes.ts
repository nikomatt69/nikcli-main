// Web interface routes for Background Agents API
import express from 'express';
import { backgroundAgentService } from '../background-agent-service';
import { WebConfig, GitHubRepository } from '../../../web/types';

export function setupWebRoutes(app: express.Application): void {
  const webRouter = express.Router();

  // Configuration endpoints
  webRouter.get('/config', getWebConfig);
  webRouter.post('/config', updateWebConfig);

  // GitHub integration endpoints
  webRouter.get('/auth/github', initiateGitHubOAuth);
  webRouter.get('/auth/github/callback', handleGitHubCallback);
  webRouter.get('/repositories', getGitHubRepositories);

  // Job management endpoints
  webRouter.get('/jobs', getWebJobs);
  webRouter.post('/jobs', createWebJob);
  webRouter.get('/jobs/:id', getWebJob);
  webRouter.delete('/jobs/:id', cancelWebJob);

  // Snapshot endpoints
  webRouter.get('/snapshots', getSnapshots);
  webRouter.post('/snapshots', createSnapshot);
  webRouter.get('/snapshots/:id', getSnapshot);
  webRouter.delete('/snapshots/:id', deleteSnapshot);

  // WebSocket endpoint
  webRouter.get('/ws', handleWebSocketUpgrade);

  app.use('/api/v1/web', webRouter);
}

// Configuration handlers
async function getWebConfig(req: express.Request, res: express.Response): Promise<void> {
  try {
    // In a real implementation, this would load from a persistent store
    const config: WebConfig = {
      github: {
        token: process.env.GITHUB_TOKEN || null,
        username: null, // Would be fetched from GitHub API
        repositories: [],
      },
      defaultModel: 'claude-3-5-sonnet-latest',
      defaultRepository: null,
      notifications: {
        slack: false,
        email: false,
      },
    };

    res.json({
      success: true,
      config,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function updateWebConfig(req: express.Request, res: express.Response): Promise<void> {
  try {
    const updates = req.body;
    
    // In a real implementation, this would persist to a store
    // For now, we'll just return the updated config
    const config: WebConfig = {
      github: {
        token: process.env.GITHUB_TOKEN || null,
        username: null,
        repositories: [],
      },
      defaultModel: updates.defaultModel || 'claude-3-5-sonnet-latest',
      defaultRepository: updates.defaultRepository || null,
      notifications: {
        slack: updates.notifications?.slack || false,
        email: updates.notifications?.email || false,
      },
    };

    res.json({
      success: true,
      config,
      message: 'Configuration updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// GitHub OAuth handlers
async function initiateGitHubOAuth(req: express.Request, res: express.Response): Promise<void> {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      throw new Error('GitHub OAuth not configured');
    }

    const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/web/auth/github/callback`;
    const scope = 'repo,user:read';
    const state = Math.random().toString(36).substring(7);

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

    res.redirect(authUrl);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function handleGitHubCallback(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { code, state } = req.query;

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Exchange code for token (implementation would go here)
    // For now, redirect back to config page
    res.redirect('/config?tab=github&success=true');
  } catch (error: any) {
    res.redirect('/config?tab=github&error=oauth_failed');
  }
}

async function getGitHubRepositories(req: express.Request, res: express.Response): Promise<void> {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token not configured');
    }

    // Mock repositories for now - in real implementation would fetch from GitHub API
    const repositories: GitHubRepository[] = [
      {
        id: 1,
        name: 'nikcli-main',
        full_name: 'nikomatt69/nikcli-main',
        description: 'NikCLI - Context-Aware AI Development Assistant',
        private: false,
        default_branch: 'main',
        updated_at: new Date().toISOString(),
        language: 'TypeScript',
      },
    ];

    res.json({
      success: true,
      repositories,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Job management handlers
async function getWebJobs(req: express.Request, res: express.Response): Promise<void> {
  try {
    const jobs = backgroundAgentService.listJobs({
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    });

    res.json({
      success: true,
      jobs: jobs.map(job => ({
        ...job,
        webCreatedAt: job.createdAt,
        userInitiated: true,
        webLogs: [],
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function createWebJob(req: express.Request, res: express.Response): Promise<void> {
  try {
    const {
      repositoryId,
      repositoryName,
      task,
      baseBranch = 'main',
      createSnapshot = true,
      notifyOnCompletion = true,
      autoCreatePR = true,
      ...otherProps
    } = req.body;

    const jobRequest = {
      repo: repositoryName,
      baseBranch,
      task,
      ...otherProps,
    };

    const jobId = await backgroundAgentService.createJob(jobRequest);

    res.json({
      success: true,
      jobId,
      message: 'Background job created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function getWebJob(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { id } = req.params;
    const job = backgroundAgentService.getJob(id);

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      });
      return;
    }

    res.json({
      success: true,
      job: {
        ...job,
        webCreatedAt: job.createdAt,
        userInitiated: true,
        webLogs: [],
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function cancelWebJob(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { id } = req.params;
    const success = await backgroundAgentService.cancelJob(id);

    res.json({
      success,
      message: success ? 'Job cancelled successfully' : 'Job not found or cannot be cancelled',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Snapshot handlers (placeholder implementations)
async function getSnapshots(req: express.Request, res: express.Response): Promise<void> {
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
    ];

    res.json({
      success: true,
      snapshots,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function createSnapshot(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { name, repository, description } = req.body;

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
    };

    res.json({
      success: true,
      snapshot,
      message: 'Snapshot created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function getSnapshot(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { id } = req.params;
    
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
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

async function deleteSnapshot(req: express.Request, res: express.Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Mock snapshot deletion
    res.json({
      success: true,
      message: 'Snapshot deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// WebSocket handler
function handleWebSocketUpgrade(req: express.Request, res: express.Response): void {
  res.status(426).json({
    success: false,
    error: 'WebSocket upgrade required',
    message: 'This endpoint requires WebSocket upgrade',
  });
}