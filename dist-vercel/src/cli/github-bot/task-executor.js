// src/cli/github-bot/task-executor.ts
Object.defineProperty(exports, '__esModule', { value: true })
exports.TaskExecutor = void 0
const node_child_process_1 = require('node:child_process')
const node_fs_1 = require('node:fs')
const node_path_1 = require('node:path')
const node_os_1 = require('node:os')
const comment_processor_1 = require('./comment-processor')
/**
 * Executes tasks requested via @nikcli mentions in GitHub
 * Handles repository cloning, task execution, and PR creation
 */
class TaskExecutor {
  constructor(octokit, config) {
    this.octokit = octokit
    this.config = config
    this.commentProcessor = new comment_processor_1.CommentProcessor()
    this.workingDir = (0, node_path_1.join)((0, node_os_1.tmpdir)(), 'nikcli-github-bot')
    // Ensure working directory exists
    if (!(0, node_fs_1.existsSync)(this.workingDir)) {
      ;(0, node_fs_1.mkdirSync)(this.workingDir, { recursive: true })
    }
  }
  /**
   * Execute task from processing job
   */
  async executeTask(job) {
    console.log(`🚀 Executing task: ${job.mention.command}`)
    try {
      // Parse the command
      const parsedCommand = this.commentProcessor.parseCommand(job.mention)
      if (!parsedCommand) {
        throw new Error(`Invalid command: ${job.mention.command}`)
      }
      // Build repository context
      const repoContext = await this.buildRepositoryContext(job.repository)
      // Setup task execution context
      const taskContext = await this.setupTaskContext(job, repoContext)
      // Execute the specific command
      const result = await this.executeCommand(parsedCommand, taskContext)
      // Create PR if changes were made
      if (result.files.length > 0) {
        const prUrl = await this.createPullRequest(taskContext, result)
        result.prUrl = prUrl
        result.shouldComment = true
      }
      console.log(`✅ Task completed successfully`)
      return result
    } catch (error) {
      console.error(`❌ Task execution failed:`, error)
      throw error
    }
  }
  /**
   * Build repository context information
   */
  async buildRepositoryContext(repository) {
    const [owner, repo] = repository.split('/')
    try {
      // Get repository information
      const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo })
      // Get repository languages
      const { data: languages } = await this.octokit.rest.repos.listLanguages({ owner, repo })
      // Detect project characteristics
      const hasPackageJson = await this.fileExists(owner, repo, 'package.json')
      const _hasCargoToml = await this.fileExists(owner, repo, 'Cargo.toml')
      const _hasPyProjectToml = await this.fileExists(owner, repo, 'pyproject.toml')
      let packageManager
      let framework
      if (hasPackageJson) {
        // Try to detect package manager and framework
        const packageContent = await this.getFileContent(owner, repo, 'package.json')
        try {
          const packageJson = JSON.parse(packageContent)
          // Detect package manager
          if (await this.fileExists(owner, repo, 'bun.lockb')) packageManager = 'bun'
          else if (await this.fileExists(owner, repo, 'pnpm-lock.yaml')) packageManager = 'pnpm'
          else if (await this.fileExists(owner, repo, 'yarn.lock')) packageManager = 'yarn'
          else packageManager = 'npm'
          // Detect framework
          const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
          if (deps.react) framework = 'React'
          else if (deps.vue) framework = 'Vue'
          else if (deps.angular) framework = 'Angular'
          else if (deps.svelte) framework = 'Svelte'
          else if (deps.next) framework = 'Next.js'
          else if (deps.nuxt) framework = 'Nuxt.js'
        } catch (_e) {
          // Ignore JSON parsing errors
        }
      }
      // Check for tests and CI
      const hasTests = await this.hasTestDirectory(owner, repo)
      const hasCI =
        (await this.fileExists(owner, repo, '.github/workflows')) ||
        (await this.fileExists(owner, repo, '.gitlab-ci.yml')) ||
        (await this.fileExists(owner, repo, 'Jenkinsfile'))
      return {
        owner,
        repo,
        defaultBranch: repoData.default_branch,
        clonePath: (0, node_path_1.join)(this.workingDir, `${owner}-${repo}-${Date.now()}`),
        languages: Object.keys(languages),
        packageManager,
        framework,
        hasTests,
        hasCI,
      }
    } catch (error) {
      console.error('Failed to build repository context:', error)
      throw new Error(`Failed to analyze repository ${repository}`)
    }
  }
  /**
   * Setup task execution context
   */
  async setupTaskContext(job, repoContext) {
    // Create unique branch name
    const timestamp = Date.now()
    const tempBranch = `nikcli/${job.mention.command}-${timestamp}`
    // Clone repository
    await this.cloneRepository(repoContext, tempBranch)
    return {
      job,
      repository: repoContext,
      workingDirectory: repoContext.clonePath,
      tempBranch,
    }
  }
  /**
   * Clone repository to local working directory
   */
  async cloneRepository(repoContext, branchName) {
    const cloneUrl = `https://github.com/${repoContext.owner}/${repoContext.repo}.git`
    console.log(`📥 Cloning repository to ${repoContext.clonePath}`)
    try {
      // Clone repository
      ;(0, node_child_process_1.execSync)(
        `git clone --depth 1 -b ${repoContext.defaultBranch} ${cloneUrl} ${repoContext.clonePath}`,
        { stdio: 'pipe' }
      )
      // Create and switch to new branch
      ;(0, node_child_process_1.execSync)(`git checkout -b ${branchName}`, {
        cwd: repoContext.clonePath,
        stdio: 'pipe',
      })
      console.log(`✅ Repository cloned and branch ${branchName} created`)
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error}`)
    }
  }
  /**
   * Execute specific command based on parsed command
   */
  async executeCommand(command, context) {
    console.log(`🔧 Executing command: ${command.command}`)
    switch (command.command) {
      case 'fix':
        return this.executeFix(command, context)
      case 'add':
        return this.executeAdd(command, context)
      case 'optimize':
        return this.executeOptimize(command, context)
      case 'refactor':
        return this.executeRefactor(command, context)
      case 'test':
        return this.executeTest(command, context)
      case 'doc':
        return this.executeDoc(command, context)
      case 'security':
        return this.executeSecurity(command, context)
      case 'accessibility':
        return this.executeAccessibility(command, context)
      case 'analyze':
        return this.executeAnalyze(command, context)
      case 'review':
        return this.executeReview(command, context)
      default:
        throw new Error(`Unsupported command: ${command.command}`)
    }
  }
  /**
   * Execute fix command
   */
  async executeFix(command, context) {
    const result = {
      success: true,
      summary: `Applied fixes to ${command.target || 'codebase'}`,
      files: [],
      shouldComment: true,
      details: {},
    }
    try {
      // Run NikCLI fix command in the repository
      const nikCliCommand = this.buildNikCLICommand('fix', command, context)
      const output = (0, node_child_process_1.execSync)(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      // Parse NikCLI output to determine modified files
      result.files = this.parseModifiedFiles(output)
      result.analysis = `Fixed issues in ${result.files.length} files`
      // Run tests if requested
      if (command.options?.createTests) {
        await this.runTests(context)
        result.details.testsRun = true
      }
    } catch (error) {
      result.success = false
      result.summary = `Failed to apply fixes: ${error}`
      throw error
    }
    return result
  }
  /**
   * Execute add command
   */
  async executeAdd(command, context) {
    const result = {
      success: true,
      summary: `Added new functionality: ${command.description}`,
      files: [],
      shouldComment: true,
      details: {},
    }
    try {
      const nikCliCommand = this.buildNikCLICommand('implement', command, context)
      const output = (0, node_child_process_1.execSync)(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      result.files = this.parseModifiedFiles(output)
      result.analysis = `Implemented new feature with ${result.files.length} files modified`
    } catch (error) {
      result.success = false
      result.summary = `Failed to add functionality: ${error}`
      throw error
    }
    return result
  }
  /**
   * Execute optimize command
   */
  async executeOptimize(command, context) {
    const result = {
      success: true,
      summary: `Applied optimizations to ${command.target || 'codebase'}`,
      files: [],
      shouldComment: true,
      details: {},
    }
    const nikCliCommand = this.buildNikCLICommand('optimize', command, context)
    const output = (0, node_child_process_1.execSync)(nikCliCommand, {
      cwd: context.workingDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    result.files = this.parseModifiedFiles(output)
    result.analysis = `Optimized performance in ${result.files.length} files`
    return result
  }
  /**
   * Execute analyze command (read-only)
   */
  async executeAnalyze(command, context) {
    const result = {
      success: true,
      summary: `Code analysis completed for ${command.target || 'repository'}`,
      files: [],
      shouldComment: true,
      analysis: '',
    }
    try {
      // Run analysis without modifications
      const nikCliCommand = this.buildNikCLICommand('analyze', command, context)
      const output = (0, node_child_process_1.execSync)(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      result.analysis = this.extractAnalysisReport(output)
    } catch (error) {
      result.success = false
      result.summary = `Analysis failed: ${error}`
    }
    return result
  }
  /**
   * Stub implementations for other commands
   */
  async executeRefactor(command, context) {
    return this.executeGenericCommand('refactor', command, context)
  }
  async executeTest(command, context) {
    return this.executeGenericCommand('test', command, context)
  }
  async executeDoc(command, context) {
    return this.executeGenericCommand('document', command, context)
  }
  async executeSecurity(command, context) {
    return this.executeGenericCommand('security', command, context)
  }
  async executeAccessibility(command, context) {
    return this.executeGenericCommand('accessibility', command, context)
  }
  async executeReview(command, context) {
    return this.executeGenericCommand('review', command, context)
  }
  /**
   * Generic command execution
   */
  async executeGenericCommand(action, command, context) {
    const result = {
      success: true,
      summary: `Applied ${action} to ${command.target || 'codebase'}`,
      files: [],
      shouldComment: true,
    }
    try {
      const nikCliCommand = this.buildNikCLICommand(action, command, context)
      const output = (0, node_child_process_1.execSync)(nikCliCommand, {
        cwd: context.workingDirectory,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      result.files = this.parseModifiedFiles(output)
      result.analysis = `Applied ${action} to ${result.files.length} files`
    } catch (error) {
      result.success = false
      result.summary = `${action} failed: ${error}`
      throw error
    }
    return result
  }
  /**
   * Build NikCLI command string
   */
  buildNikCLICommand(action, command, _context) {
    let cmd = `npx @nicomatt69/nikcli ${action}`
    if (command.target) {
      cmd += ` "${command.target}"`
    }
    if (command.description && command.description !== action) {
      cmd += ` --description "${command.description}"`
    }
    // Add common flags
    cmd += ' --auto-confirm --quiet'
    return cmd
  }
  /**
   * Parse modified files from NikCLI output
   */
  parseModifiedFiles(output) {
    const files = []
    const lines = output.split('\n')
    for (const line of lines) {
      // Look for file modification patterns
      if (line.includes('Modified:') || line.includes('Created:') || line.includes('Updated:')) {
        const match = line.match(/(?:Modified|Created|Updated):\s*(.+)/)
        if (match) {
          files.push(match[1].trim())
        }
      }
    }
    return files
  }
  /**
   * Extract analysis report from output
   */
  extractAnalysisReport(output) {
    // Extract meaningful analysis content from NikCLI output
    const lines = output.split('\n')
    const analysisLines = lines.filter(
      (line) => !line.includes('Loading') && !line.includes('Initializing') && line.trim().length > 0
    )
    return analysisLines.join('\n').substring(0, 1000) // Limit length
  }
  /**
   * Create pull request with changes
   */
  async createPullRequest(context, result) {
    const { job, repository, tempBranch } = context
    try {
      // Commit changes
      ;(0, node_child_process_1.execSync)('git add .', { cwd: context.workingDirectory, stdio: 'pipe' })
      const commitMessage = `🤖 ${job.mention.command}: ${result.summary}

Applied via @nikcli mention in #${job.issueNumber}
Requested by: @${job.author}

Files modified:
${result.files.map((f) => `- ${f}`).join('\n')}

Co-authored-by: NikCLI Bot <bot@nikcli.dev>`
      ;(0, node_child_process_1.execSync)(`git commit -m "${commitMessage}"`, {
        cwd: context.workingDirectory,
        stdio: 'pipe',
      })
      // Push branch
      ;(0, node_child_process_1.execSync)(`git push -u origin ${tempBranch}`, {
        cwd: context.workingDirectory,
        stdio: 'pipe',
      })
      // Create pull request
      const prTitle = `🤖 ${job.mention.command}: ${result.summary}`
      const prBody = `## Summary
${result.summary}

## Changes Applied
${result.files.map((f) => `- \`${f}\``).join('\n')}

${result.analysis ? `## Analysis\n${result.analysis}\n` : ''}

## Context
- Requested by: @${job.author}
- Original issue/PR: #${job.issueNumber}
- Command: \`@nikcli ${job.mention.command}\`

---
🤖 This PR was automatically created by [NikCLI Bot](https://github.com/nikomatt69/nikcli-main)`
      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: repository.owner,
        repo: repository.repo,
        title: prTitle,
        body: prBody,
        head: tempBranch,
        base: repository.defaultBranch,
      })
      console.log(`✅ Pull request created: ${pr.html_url}`)
      return pr.html_url
    } catch (error) {
      console.error('Failed to create pull request:', error)
      throw error
    }
  }
  /**
   * Run tests if available
   */
  async runTests(context) {
    const { repository } = context
    try {
      if (repository.packageManager) {
        const testCommand = `${repository.packageManager} test`
        ;(0, node_child_process_1.execSync)(testCommand, {
          cwd: context.workingDirectory,
          stdio: 'pipe',
        })
      }
    } catch (error) {
      console.warn('Tests failed or not available:', error)
    }
  }
  /**
   * Utility: Check if file exists in repository
   */
  async fileExists(owner, repo, path) {
    try {
      await this.octokit.rest.repos.getContent({ owner, repo, path })
      return true
    } catch {
      return false
    }
  }
  /**
   * Utility: Get file content from repository
   */
  async getFileContent(owner, repo, path) {
    try {
      const { data } = await this.octokit.rest.repos.getContent({ owner, repo, path })
      if ('content' in data) {
        return Buffer.from(data.content, 'base64').toString('utf8')
      }
      return ''
    } catch {
      return ''
    }
  }
  /**
   * Utility: Check if repository has test directory
   */
  async hasTestDirectory(owner, repo) {
    const testDirs = ['test', 'tests', '__tests__', 'spec', 'specs']
    for (const dir of testDirs) {
      if (await this.fileExists(owner, repo, dir)) {
        return true
      }
    }
    // Check for test files in common locations
    const testFiles = ['package.json']
    for (const file of testFiles) {
      const content = await this.getFileContent(owner, repo, file)
      if (content.includes('"test"') || content.includes('"jest"') || content.includes('"vitest"')) {
        return true
      }
    }
    return false
  }
}
exports.TaskExecutor = TaskExecutor
