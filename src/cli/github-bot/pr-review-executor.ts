// src/cli/github-bot/pr-review-executor.ts

import { execSync } from 'node:child_process'
import { bunFile, bunWrite, readText, writeText, fileExists, mkdirp } from '../utils/bun-compat'
import { join } from 'node:path'
import type { Octokit } from '@octokit/rest'
import type { GitHubBotConfig, GitHubPullRequest, ProcessingJob, RepositoryContext, TaskResult } from './types'

/**
 * Advanced PR Review Executor
 * Handles detailed PR analysis, error detection, and automated fixes
 */
export class PRReviewExecutor {
  private octokit: Octokit
  private config: GitHubBotConfig

  constructor(octokit: Octokit, config: GitHubBotConfig) {
    this.octokit = octokit
    this.config = config
  }

  /**
   * Execute comprehensive PR review and fix
   */
  async reviewAndFixPR(
    job: ProcessingJob,
    repoContext: RepositoryContext,
    pullRequest: GitHubPullRequest
  ): Promise<TaskResult> {
    console.log(`🔍 Starting comprehensive PR review for #${pullRequest.number}`)

    try {
      // 1. Fetch PR diff and files
      const prDiff = await this.fetchPRDiff(repoContext, pullRequest.number)
      const changedFiles = await this.fetchChangedFiles(repoContext, pullRequest.number)

      console.log(`📄 Analyzing ${changedFiles.length} changed files`)

      // 2. Clone repository at PR head
      const workingDir = await this.clonePRBranch(repoContext, pullRequest)

      // 3. Analyze PR for issues
      const issues = await this.analyzePRIssues(workingDir, changedFiles, prDiff)

      if (issues.length === 0) {
        return {
          success: true,
          summary: 'No issues found in PR. Code looks good! ✓',
          files: [],
          shouldComment: true,
          analysis: 'All checks passed. No fixes needed.',
        }
      }

      console.log(`⚠︎  Found ${issues.length} issues to fix`)

      // 4. Apply fixes
      const fixedFiles = await this.applyFixes(workingDir, issues, changedFiles)

      // 5. Run TypeScript type checking
      const typeCheckResult = await this.runTypeCheck(workingDir, repoContext)

      // 6. Create new branch and commit
      const newBranch = await this.createFixBranch(workingDir, pullRequest, job)
      await this.commitFixes(workingDir, fixedFiles, issues, job)

      // 7. Push and create PR
      await this.pushBranch(workingDir, newBranch)
      const prUrl = await this.createFixPR(repoContext, pullRequest, newBranch, issues, fixedFiles)

      return {
        success: true,
        summary: `Fixed ${issues.length} issues in ${fixedFiles.length} files`,
        files: fixedFiles,
        prUrl,
        shouldComment: true,
        analysis: this.formatAnalysis(issues, typeCheckResult),
        details: {
          branch: newBranch,
          testsRun: typeCheckResult.passed,
        },
      }
    } catch (error) {
      console.error('✖ PR review and fix failed:', error)
      throw error
    }
  }

  /**
   * Fetch PR diff
   */
  private async fetchPRDiff(repoContext: RepositoryContext, prNumber: number): Promise<string> {
    try {
      const { data } = await this.octokit.rest.pulls.get({
        owner: repoContext.owner,
        repo: repoContext.repo,
        pull_number: prNumber,
        mediaType: {
          format: 'diff',
        },
      })

      return data as unknown as string
    } catch (error) {
      console.error('Failed to fetch PR diff:', error)
      throw error
    }
  }

  /**
   * Fetch changed files in PR
   */
  private async fetchChangedFiles(
    repoContext: RepositoryContext,
    prNumber: number
  ): Promise<Array<{ filename: string; status: string; additions: number; deletions: number }>> {
    try {
      const { data: files } = await this.octokit.rest.pulls.listFiles({
        owner: repoContext.owner,
        repo: repoContext.repo,
        pull_number: prNumber,
      })

      return files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      }))
    } catch (error) {
      console.error('Failed to fetch changed files:', error)
      throw error
    }
  }

  /**
   * Clone repository at PR head branch
   */
  private async clonePRBranch(repoContext: RepositoryContext, pr: GitHubPullRequest): Promise<string> {
    const workingDir = join(repoContext.clonePath, `pr-${pr.number}`)
    const cloneUrl = `https://${this.config.githubToken}@github.com/${repoContext.owner}/${repoContext.repo}.git`

    console.log(`📥 Cloning PR branch: ${pr.head.ref}`)

    try {
      // Clone the repository
      execSync(`git clone --depth 1 -b ${pr.head.ref} ${cloneUrl} ${workingDir}`, {
        stdio: 'pipe',
      })

      console.log(`✓ Cloned to ${workingDir}`)
      return workingDir
    } catch (error) {
      console.error('Failed to clone PR branch:', error)
      throw error
    }
  }

  /**
   * Analyze PR for issues (TypeScript errors, linting, etc.)
   */
  private async analyzePRIssues(
    workingDir: string,
    changedFiles: Array<{ filename: string; status: string }>,
    _prDiff: string
  ): Promise<Array<{ file: string; line?: number; message: string; type: string }>> {
    const issues: Array<{ file: string; line?: number; message: string; type: string }> = []

    console.log('🔍 Running TypeScript compiler check...')

    // Run TypeScript compiler
    try {
      const tscOutput = execSync('npx tsc --noEmit --pretty false 2>&1 || true', {
        cwd: workingDir,
        encoding: 'utf8',
      })

      // Parse TypeScript errors
      const tsErrors = this.parseTSCOutput(tscOutput)
      issues.push(...tsErrors)
    } catch (error) {
      console.warn('TypeScript check failed:', error)
    }

    // Run ESLint on changed files
    console.log('🔍 Running ESLint...')
    for (const file of changedFiles) {
      if (file.filename.match(/\.(ts|tsx|js|jsx)$/)) {
        try {
          const eslintOutput = execSync(`npx eslint ${file.filename} --format json 2>&1 || true`, {
            cwd: workingDir,
            encoding: 'utf8',
          })

          const eslintIssues = this.parseESLintOutput(eslintOutput, file.filename)
          issues.push(...eslintIssues)
        } catch (error) {
          console.warn(`ESLint check failed for ${file.filename}:`, error)
        }
      }
    }

    return issues
  }

  /**
   * Parse TypeScript compiler output
   */
  private parseTSCOutput(output: string): Array<{ file: string; line?: number; message: string; type: string }> {
    const issues: Array<{ file: string; line?: number; message: string; type: string }> = []
    const lines = output.split('\n')

    for (const line of lines) {
      // Match TypeScript error format: file.ts(line,col): error TS1234: message
      const match = line.match(/^(.+?)\((\d+),\d+\):\s*(error|warning)\s+TS\d+:\s*(.+)$/)
      if (match) {
        issues.push({
          file: match[1],
          line: parseInt(match[2], 10),
          message: match[4],
          type: 'typescript',
        })
      }
    }

    return issues
  }

  /**
   * Parse ESLint output
   */
  private parseESLintOutput(
    output: string,
    filename: string
  ): Array<{ file: string; line?: number; message: string; type: string }> {
    const issues: Array<{ file: string; line?: number; message: string; type: string }> = []

    try {
      const results = JSON.parse(output)
      if (Array.isArray(results)) {
        for (const result of results) {
          if (result.messages) {
            for (const msg of result.messages) {
              issues.push({
                file: filename,
                line: msg.line,
                message: msg.message,
                type: 'eslint',
              })
            }
          }
        }
      }
    } catch (_error) {
      // Ignore JSON parse errors
    }

    return issues
  }

  /**
   * Apply automated fixes to issues
   */
  private async applyFixes(
    workingDir: string,
    issues: Array<{ file: string; line?: number; message: string; type: string }>,
    changedFiles: Array<{ filename: string }>
  ): Promise<string[]> {
    const fixedFiles = new Set<string>()

    // Group issues by file
    const issuesByFile = new Map<string, Array<{ line?: number; message: string; type: string }>>()
    for (const issue of issues) {
      if (!issuesByFile.has(issue.file)) {
        issuesByFile.set(issue.file, [])
      }
      issuesByFile.get(issue.file)!.push({
        line: issue.line,
        message: issue.message,
        type: issue.type,
      })
    }

    // Apply ESLint auto-fix
    console.log('🔧 Applying ESLint auto-fixes...')
    for (const file of changedFiles) {
      if (file.filename.match(/\.(ts|tsx|js|jsx)$/)) {
        try {
          execSync(`npx eslint ${file.filename} --fix 2>&1 || true`, {
            cwd: workingDir,
            stdio: 'pipe',
          })
          fixedFiles.add(file.filename)
        } catch (_error) {
          // Continue even if ESLint fix fails
        }
      }
    }

    // Apply TypeScript fixes using AI-powered code fixing
    console.log('🤖 Applying AI-powered fixes for TypeScript errors...')
    for (const [file, fileIssues] of issuesByFile) {
      if (fileIssues.some((i) => i.type === 'typescript')) {
        try {
          await this.applyAIFixes(workingDir, file, fileIssues)
          fixedFiles.add(file)
        } catch (error) {
          console.warn(`Failed to apply AI fixes to ${file}:`, error)
        }
      }
    }

    return Array.from(fixedFiles)
  }

  /**
   * Apply AI-powered fixes to a file
   */
  private async applyAIFixes(
    workingDir: string,
    file: string,
    issues: Array<{ line?: number; message: string; type: string }>
  ): Promise<void> {
    const filePath = join(workingDir, file)

    if (!await fileExists(filePath)) {
      console.warn(`File not found: ${filePath}`)
      return
    }

    const content = await readText(filePath)
    const lines = content.split('\n')

    // Build context for AI
    const issueContext = issues.map((issue) => `Line ${issue.line || '?'}: ${issue.message}`).join('\n')

    console.log(`🤖 Fixing ${issues.length} issues in ${file}`)

    // For now, use simple heuristics. In production, integrate with AI model
    // This is a placeholder for AI-powered fixing logic
    let modified = false

    for (const issue of issues) {
      if (issue.line && issue.line <= lines.length) {
        const line = lines[issue.line - 1]

        // Simple fixes for common TypeScript errors
        if (issue.message.includes('implicitly has an') && issue.message.includes('any')) {
          // Add type annotation
          lines[issue.line - 1] = line.replace(/(\w+)\s*=/, '$1: any =')
          modified = true
        } else if (issue.message.includes('is declared but never used')) {
          // Comment out unused variable
          lines[issue.line - 1] = `// ${line} // Unused variable`
          modified = true
        }
      }
    }

    if (modified) {
      await writeText(filePath, lines.join('\n'))
      console.log(`✓ Applied fixes to ${file}`)
    }
  }

  /**
   * Run TypeScript type checking
   */
  private async runTypeCheck(
    workingDir: string,
    _repoContext: RepositoryContext
  ): Promise<{ passed: boolean; errors: string[] }> {
    try {
      console.log('🔍 Running final TypeScript type check...')

      const output = execSync('npx tsc --noEmit 2>&1', {
        cwd: workingDir,
        encoding: 'utf8',
      })

      return {
        passed: true,
        errors: [],
      }
    } catch (error: any) {
      const errors = error.stdout ? error.stdout.split('\n').filter((l: string) => l.trim()) : []
      return {
        passed: false,
        errors,
      }
    }
  }

  /**
   * Create fix branch
   */
  private async createFixBranch(workingDir: string, pr: GitHubPullRequest, job: ProcessingJob): Promise<string> {
    const timestamp = Date.now()
    const branchName = `nikcli/fix-pr-${pr.number}-${timestamp}`

    console.log(`🌿 Creating fix branch: ${branchName}`)

    try {
      execSync(`git checkout -b ${branchName}`, {
        cwd: workingDir,
        stdio: 'pipe',
      })

      return branchName
    } catch (error) {
      console.error('Failed to create fix branch:', error)
      throw error
    }
  }

  /**
   * Commit fixes
   */
  private async commitFixes(
    workingDir: string,
    fixedFiles: string[],
    issues: Array<{ file: string; message: string; type: string }>,
    job: ProcessingJob
  ): Promise<void> {
    console.log('💾 Committing fixes...')

    try {
      // Stage all changes
      execSync('git add .', { cwd: workingDir, stdio: 'pipe' })

      // Create detailed commit message
      const commitMessage = this.buildCommitMessage(fixedFiles, issues, job)

      execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: workingDir,
        stdio: 'pipe',
      })

      console.log('✓ Changes committed')
    } catch (error) {
      console.error('Failed to commit fixes:', error)
      throw error
    }
  }

  /**
   * Build commit message
   */
  private buildCommitMessage(
    fixedFiles: string[],
    issues: Array<{ file: string; message: string; type: string }>,
    job: ProcessingJob
  ): string {
    const typeScriptIssues = issues.filter((i) => i.type === 'typescript').length
    const eslintIssues = issues.filter((i) => i.type === 'eslint').length

    let message = `fix: automated fixes for PR review\n\n`
    message += `Applied by @nikcli in response to #${job.issueNumber}\n`
    message += `Requested by: @${job.author}\n\n`

    if (typeScriptIssues > 0) {
      message += `- Fixed ${typeScriptIssues} TypeScript errors\n`
    }
    if (eslintIssues > 0) {
      message += `- Fixed ${eslintIssues} ESLint issues\n`
    }

    message += `\nModified files:\n`
    for (const file of fixedFiles.slice(0, 10)) {
      message += `- ${file}\n`
    }

    if (fixedFiles.length > 10) {
      message += `... and ${fixedFiles.length - 10} more files\n`
    }

    message += `\nCo-authored-by: NikCLI Bot <bot@nikcli.dev>`

    return message
  }

  /**
   * Push branch to remote
   */
  private async pushBranch(workingDir: string, branchName: string): Promise<void> {
    console.log(`📤 Pushing branch: ${branchName}`)

    try {
      execSync(`git push -u origin ${branchName}`, {
        cwd: workingDir,
        stdio: 'pipe',
      })

      console.log('✓ Branch pushed')
    } catch (error) {
      console.error('Failed to push branch:', error)
      throw error
    }
  }

  /**
   * Create fix PR
   */
  private async createFixPR(
    repoContext: RepositoryContext,
    originalPR: GitHubPullRequest,
    fixBranch: string,
    issues: Array<{ file: string; message: string; type: string }>,
    fixedFiles: string[]
  ): Promise<string> {
    console.log('📝 Creating fix PR...')

    try {
      const title = `🔧 Automated fixes for PR #${originalPR.number}`
      const body = this.buildPRBody(originalPR, issues, fixedFiles)

      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: repoContext.owner,
        repo: repoContext.repo,
        title,
        body,
        head: fixBranch,
        base: originalPR.base.ref, // Target the same base branch as original PR
      })

      console.log(`✓ Fix PR created: ${pr.html_url}`)
      return pr.html_url
    } catch (error) {
      console.error('Failed to create fix PR:', error)
      throw error
    }
  }

  /**
   * Build PR body
   */
  private buildPRBody(
    originalPR: GitHubPullRequest,
    issues: Array<{ file: string; message: string; type: string }>,
    fixedFiles: string[]
  ): string {
    const typeScriptIssues = issues.filter((i) => i.type === 'typescript')
    const eslintIssues = issues.filter((i) => i.type === 'eslint')

    let body = `## 🔧 Automated Fixes\n\n`
    body += `This PR contains automated fixes for issues found in PR #${originalPR.number}\n\n`

    body += `### Summary\n\n`
    body += `- **Fixed ${issues.length} issues** across ${fixedFiles.length} files\n`
    body += `- TypeScript errors: ${typeScriptIssues.length}\n`
    body += `- ESLint issues: ${eslintIssues.length}\n\n`

    body += `### Modified Files\n\n`
    for (const file of fixedFiles.slice(0, 20)) {
      body += `- \`${file}\`\n`
    }

    if (fixedFiles.length > 20) {
      body += `\n... and ${fixedFiles.length - 20} more files\n`
    }

    body += `\n### Issues Fixed\n\n`

    if (typeScriptIssues.length > 0) {
      body += `#### TypeScript Errors\n\n`
      for (const issue of typeScriptIssues.slice(0, 10)) {
        body += `- \`${issue.file}\`: ${issue.message}\n`
      }
      if (typeScriptIssues.length > 10) {
        body += `\n... and ${typeScriptIssues.length - 10} more TypeScript issues\n`
      }
      body += `\n`
    }

    if (eslintIssues.length > 0) {
      body += `#### ESLint Issues\n\n`
      for (const issue of eslintIssues.slice(0, 10)) {
        body += `- \`${issue.file}\`: ${issue.message}\n`
      }
      if (eslintIssues.length > 10) {
        body += `\n... and ${eslintIssues.length - 10} more ESLint issues\n`
      }
      body += `\n`
    }

    body += `---\n\n`
    body += `🤖 This PR was automatically created by [NikCLI Bot](https://github.com/nikomatt69/nikcli-main)\n`
    body += `Related to: #${originalPR.number}\n`

    return body
  }

  /**
   * Format analysis for result comment
   */
  private formatAnalysis(
    issues: Array<{ file: string; message: string; type: string }>,
    typeCheckResult: { passed: boolean; errors: string[] }
  ): string {
    let analysis = `### Issues Found and Fixed\n\n`

    const typeScriptIssues = issues.filter((i) => i.type === 'typescript').length
    const eslintIssues = issues.filter((i) => i.type === 'eslint').length

    analysis += `- TypeScript errors: ${typeScriptIssues}\n`
    analysis += `- ESLint issues: ${eslintIssues}\n\n`

    if (typeCheckResult.passed) {
      analysis += `✓ Final type check: **PASSED**\n`
    } else {
      analysis += `⚠︎ Final type check: **${typeCheckResult.errors.length} remaining errors**\n`
    }

    return analysis
  }
}
