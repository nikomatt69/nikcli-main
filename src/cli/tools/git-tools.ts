import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { inputQueue } from '../core/input-queue'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { type CommandResult, SecureCommandTool } from './secure-command-tool'

export type GitAction = 'status' | 'diff' | 'commit' | 'applyPatch'

export interface GitToolParams {
  action: GitAction
  args?: Record<string, any>
}

export class GitTools extends BaseTool {
  private runner: SecureCommandTool

  constructor(workingDirectory: string) {
    super('git-tools', workingDirectory)
    this.runner = new SecureCommandTool(workingDirectory)
  }

  // Metadata for core ToolRegistry auto-discovery
  getMetadata(): any {
    return {
      id: 'git_workflow',
      name: 'git_workflow',
      description: 'Safe Git operations: status, diff, commit, applyPatch (no push)',
      version: '0.1.0',
      category: 'development',
      author: 'system',
      tags: ['git', 'vcs', 'diff', 'commit', 'patch', 'git_operations'],
      capabilities: ['git-status', 'git-diff', 'git-commit', 'git-apply'],
      requiredCapabilities: [],
      dependencies: [],
      permissions: {
        canReadFiles: true,
        canWriteFiles: true,
        canDeleteFiles: false,
        canExecuteCommands: true,
        allowedPaths: [],
        forbiddenPaths: [],
        allowedCommands: ['git status', 'git diff', 'git commit', 'git apply', 'git add'],
        forbiddenCommands: ['git push', 'git reset --hard', 'git clean -fd'],
        canAccessNetwork: false,
        maxExecutionTime: 300000,
        maxMemoryUsage: 512 * 1024 * 1024,
        requiresApproval: true,
      },
      inputSchema: {},
      outputSchema: {},
      examples: [],
      isBuiltIn: true,
      isEnabled: true,
      priority: 65,
      loadOrder: 0,
    }
  }

  async execute(params: GitToolParams): Promise<ToolExecutionResult> {
    const start = Date.now()
    try {
      switch (params.action) {
        case 'status':
          return await this.status()
        case 'diff':
          return await this.diff(params.args || {})
        case 'commit':
          if (!this.isCommitArgs(params.args)) {
            throw new Error("args.message (string) is required for 'commit'")
          }
          return await this.commit(params.args)
        case 'applyPatch':
          if (!this.isPatchArgs(params.args)) {
            throw new Error("args.patch (string) is required for 'applyPatch'")
          }
          return await this.applyPatch(params.args)
        default:
          throw new Error(`Unknown action: ${String((params as any).action)}`)
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: params },
      }
    }
  }

  private async status(): Promise<ToolExecutionResult> {
    const start = Date.now()
    const res = await this.runner.execute('git status --porcelain=v2 -b', { skipConfirmation: true })
    const parsed = this.parseStatus(res)
    CliUI.logInfo(`📦 Git status: ${parsed.summary}`)
    return {
      success: true,
      data: { raw: res.stdout, ...parsed },
      metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: { action: 'status' } },
    }
  }

  private parseStatus(res: CommandResult): {
    branch?: string
    ahead?: number
    behind?: number
    changes: any[]
    summary: string
  } {
    const lines = res.stdout.split('\n')
    let branch: string | undefined
    let ahead = 0
    let behind = 0
    const changes: any[] = []
    for (const l of lines) {
      if (l.startsWith('# branch.head')) branch = l.split(' ').slice(2).join(' ')
      if (l.startsWith('# branch.ab')) {
        const parts = l.split(' ')
        ahead = Number(parts[2].split('+')[1] || 0)
        behind = Number(parts[3].split('-')[1] || 0)
      }
      if (l.startsWith('1 ') || l.startsWith('2 ') || l.startsWith('? ')) {
        changes.push(l)
      }
    }
    const summary = `${changes.length} changes${branch ? ` on ${branch}` : ''}${ahead || behind ? ` (↑${ahead} ↓${behind})` : ''}`
    return { branch, ahead, behind, changes, summary }
  }

  private async diff(args: { staged?: boolean; pathspec?: string[] } = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    const cmd = args.staged ? 'git diff --staged' : 'git diff'
    const withPaths = args.pathspec && args.pathspec.length ? `${cmd} -- ${args.pathspec.join(' ')}` : cmd
    const res = await this.runner.execute(withPaths, { skipConfirmation: true })
    return {
      success: true,
      data: { diff: res.stdout },
      metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: { action: 'diff', args } },
    }
  }

  private async commit(args: { message: string; add?: string[]; allowEmpty?: boolean }): Promise<ToolExecutionResult> {
    const start = Date.now()
    if (!args.message || !String(args.message).trim()) throw new Error('Commit message is required')

    // Show summary and confirm
    const status = await this.status()
    const changes = status.data?.changes || []
    if (changes.length === 0) {
      return {
        success: false,
        error: 'No changes to commit',
        data: null,
        metadata: { executionTime: 0, toolName: this.getName(), parameters: { action: 'commit' } },
      }
    }

    try {
      ;(global as any).__nikCLI?.suspendPrompt?.()
    } catch {}
    inputQueue.enableBypass()
    try {
      console.log(chalk.blue(`\n📝 Commit message:`))
      console.log(chalk.gray(args.message))
      const { confirmed } = await inquirer.prompt([
        {
          type: 'list',
          name: 'confirmed',
          message: `Commit ${changes.length} changes?`,
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false },
          ],
          default: 1,
        },
      ])
      if (!confirmed)
        return {
          success: false,
          error: 'Commit cancelled by user',
          data: null,
          metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: { action: 'commit' } },
        }
    } finally {
      inputQueue.disableBypass()
      try {
        ;(global as any).__nikCLI?.resumePromptAndRender?.()
      } catch {}
    }

    // Optionally add files
    if (args.add && args.add.length) {
      await this.runner.execute(`git add -- ${args.add.join(' ')}`, { skipConfirmation: true })
    }
    const allowEmptyFlag = args.allowEmpty ? ' --allow-empty' : ''
    const res = await this.runner.execute(`git commit -m ${JSON.stringify(args.message)}${allowEmptyFlag}`, {
      skipConfirmation: true,
    })
    return {
      success: res.exitCode === 0,
      data: { stdout: res.stdout, stderr: res.stderr },
      metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: { action: 'commit', args } },
    }
  }

  private async applyPatch(args: { patch: string }): Promise<ToolExecutionResult> {
    const start = Date.now()
    if (!args.patch || !args.patch.trim()) throw new Error('patch is required')

    // Write patch to tmp and check
    const tmp = path.join(os.tmpdir(), `nikcli-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`)
    fs.writeFileSync(tmp, args.patch, 'utf8')
    try {
      const check = await this.runner.execute(`git apply --check ${JSON.stringify(tmp)}`, { skipConfirmation: true })
      if (check.exitCode !== 0) {
        return {
          success: false,
          error: 'Patch does not apply cleanly',
          data: { stderr: check.stderr },
          metadata: {
            executionTime: Date.now() - start,
            toolName: this.getName(),
            parameters: { action: 'applyPatch' },
          },
        }
      }

      // Confirm application
      try {
        ;(global as any).__nikCLI?.suspendPrompt?.()
      } catch {}
      inputQueue.enableBypass()
      try {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'list',
            name: 'confirmed',
            message: 'Apply patch to working tree?',
            choices: [
              { name: 'Yes', value: true },
              { name: 'No', value: false },
            ],
            default: 1,
          },
        ])
        if (!confirmed)
          return {
            success: false,
            error: 'Patch application cancelled',
            data: null,
            metadata: {
              executionTime: Date.now() - start,
              toolName: this.getName(),
              parameters: { action: 'applyPatch' },
            },
          }
      } finally {
        inputQueue.disableBypass()
        try {
          ;(global as any).__nikCLI?.resumePromptAndRender?.()
        } catch {}
      }

      const res = await this.runner.execute(`git apply ${JSON.stringify(tmp)}`, { skipConfirmation: true })
      return {
        success: res.exitCode === 0,
        data: { stdout: res.stdout, stderr: res.stderr },
        metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: { action: 'applyPatch' } },
      }
    } finally {
      try {
        fs.unlinkSync(tmp)
      } catch {}
    }
  }

  // Type guards for args narrowing
  private isCommitArgs(args: any): args is { message: string; add?: string[]; allowEmpty?: boolean } {
    return args && typeof args.message === 'string' && args.message.length >= 0
  }

  private isPatchArgs(args: any): args is { patch: string } {
    return args && typeof args.patch === 'string' && args.patch.length >= 0
  }
}

export default GitTools
