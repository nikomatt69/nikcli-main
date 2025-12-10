import { type ChildProcess, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import chalk from 'chalk'
import { type FileInfo, TOKEN_CONSTANTS } from '../schemas/tool-schemas'
import { PathResolver } from '../utils/path-resolver'
import { bunExec } from '../utils/bun-compat'

// Token limiting constants from centralized schema
const { DEFAULT_TOKEN_BUDGET, MAX_LINES_PER_CHUNK, TOKEN_CHAR_RATIO } = TOKEN_CONSTANTS

// Re-export FileInfo for backwards compatibility
export type { FileInfo } from '../schemas/tool-schemas'

export interface SearchResult {
  file: string
  line: number
  content: string
  context?: string[]
}

export interface ErrorAnalysis {
  type: 'syntax' | 'runtime' | 'compile' | 'lint' | 'type'
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
  column?: number
  suggestion?: string
}

export interface ProcessInfo {
  pid: number
  command: string
  args: string[]
  cwd: string
  startTime: Date
  status: 'running' | 'completed' | 'failed' | 'killed'
  exitCode?: number
}

export interface SystemInfo {
  platform: string
  arch: string
  nodeVersion: string
  npmVersion?: string
  gitVersion?: string
  dockerVersion?: string
  memory: { total: number; free: number; used: number }
  cpus: number
  uptime: number
}

export class ToolsManager {
  private workingDirectory: string
  private pathResolver: PathResolver
  private runningProcesses: Map<number, ProcessInfo> = new Map()
  private commandHistory: Array<{ command: string; timestamp: Date; success: boolean; output: string }> = []

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd()
    this.pathResolver = new PathResolver(this.workingDirectory)
  }

  // File Operations
  async readFile(filePath: string, options?: { tokenBudget?: number; maxLines?: number }): Promise<FileInfo> {
    const resolved = this.pathResolver.resolve(filePath)
    const fullPath = resolved.absolutePath

    if (!resolved.exists) {
      throw new Error(`File not found: ${filePath}`)
    }

    const stats = fs.statSync(fullPath)
    let content = fs.readFileSync(fullPath, 'utf8')
    const extension = path.extname(fullPath).slice(1)

    // Apply token budget limiting to prevent context overflow
    const tokenBudget = options?.tokenBudget ?? DEFAULT_TOKEN_BUDGET
    const maxLines = options?.maxLines ?? MAX_LINES_PER_CHUNK
    const maxChars = tokenBudget * TOKEN_CHAR_RATIO

    if (content.length > maxChars) {
      const lines = content.split('\n')
      const truncatedLines = lines.slice(0, Math.min(lines.length, maxLines))
      const estimatedTokens = Math.ceil(truncatedLines.join('\n').length / TOKEN_CHAR_RATIO)

      content = truncatedLines.join('\n')
      if (truncatedLines.length < lines.length || estimatedTokens > tokenBudget) {
        content += `\n\n... [File truncated - exceeds token budget (${estimatedTokens} tokens, budget: ${tokenBudget})]`
      }
    }

    return {
      path: filePath,
      content,
      size: stats.size,
      modified: stats.mtime,
      extension,
      language: this.getLanguageFromExtension(extension),
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = this.pathResolver.resolve(filePath)
    const fullPath = resolved.absolutePath
    const dir = path.dirname(fullPath)

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(fullPath, content, 'utf8')
    console.log(chalk.green(`✓ File written: ${filePath}`))
  }

  async editFile(
    filePath: string,
    changes: { line?: number; find?: string; replace: string; insert?: boolean }[]
  ): Promise<void> {
    const fileInfo = await this.readFile(filePath)
    if (!fileInfo.content) {
      throw new Error(`File has no content: ${filePath}`)
    }
    let lines = fileInfo.content.split('\n')

    for (const change of changes) {
      if (change.line !== undefined) {
        // Line-based edit
        if (change.insert) {
          lines.splice(change.line, 0, change.replace)
        } else {
          lines[change.line] = change.replace
        }
      } else if (change.find) {
        // Find and replace
        lines = lines.map((line) => line.replace(new RegExp(change.find!, 'g'), change.replace))
      }
    }

    const newContent = lines.join('\n')
    await this.writeFile(filePath, newContent)
  }

  async listFiles(directory: string = '.', pattern?: RegExp): Promise<string[]> {
    const resolved = this.pathResolver.resolve(directory)
    const fullPath = resolved.absolutePath

    if (!resolved.exists) {
      throw new Error(`Directory not found: ${directory}`)
    }

    const files: string[] = []

    function walkDir(dir: string) {
      const items = fs.readdirSync(dir)

      for (const item of items) {
        const itemPath = path.join(dir, item)
        const relativePath = path.relative(fullPath, itemPath)

        if (fs.statSync(itemPath).isDirectory()) {
          if (!item.startsWith('.') && item !== 'node_modules') {
            walkDir(itemPath)
          }
        } else {
          if (!pattern || pattern.test(relativePath)) {
            files.push(path.relative(directory, relativePath))
          }
        }
      }
    }

    walkDir(fullPath)
    return files
  }

  // Search Operations
  async searchInFiles(query: string | RegExp, directory: string = '.', filePattern?: RegExp): Promise<SearchResult[]> {
    const files = await this.listFiles(directory, filePattern)
    const results: SearchResult[] = []
    const searchRegex = typeof query === 'string' ? new RegExp(query, 'gi') : query

    for (const file of files) {
      try {
        const fileInfo = await this.readFile(file)
        if (!fileInfo.content) continue
        const lines = fileInfo.content.split('\n')

        lines.forEach((line, index) => {
          if (searchRegex.test(line)) {
            results.push({
              file,
              line: index + 1,
              content: line.trim(),
              context: [lines[index - 1]?.trim() || '', line.trim(), lines[index + 1]?.trim() || ''].filter(Boolean),
            })
          }
        })
      } catch (_error) {}
    }

    return results
  }

  // Advanced Command Execution
  async runCommand(
    command: string,
    args: string[] = [],
    options: {
      cwd?: string
      timeout?: number
      env?: Record<string, string>
      interactive?: boolean
      stream?: boolean
      sudo?: boolean
    } = {}
  ): Promise<{ stdout: string; stderr: string; code: number; pid?: number }> {
    const fullCommand = options.sudo ? `sudo ${command} ${args.join(' ')}` : `${command} ${args.join(' ')}`
    const cwd = options.cwd ? path.resolve(this.workingDirectory, options.cwd) : this.workingDirectory
    const env = { ...process.env, ...options.env }

    console.log(chalk.blue(`⚡ Executing: ${fullCommand}`))
    console.log(chalk.gray(`📁 Working directory: ${cwd}`))

    try {
      const startTime = Date.now()

      if (options.stream || options.interactive) {
        return await this.runCommandStream(fullCommand, { cwd, env, interactive: options.interactive })
      } else {
        const result = await bunExec(fullCommand, {
          cwd,
          timeout: options.timeout || 60000,
          env,
        })
        const { stdout, stderr } = result

        const duration = Date.now() - startTime
        this.addToHistory(fullCommand, true, stdout + stderr)

        console.log(chalk.green(`✓ Command completed in ${duration}ms`))
        return { stdout, stderr, code: 0 }
      }
    } catch (error: any) {
      const _duration = Date.now() - Date.now()
      this.addToHistory(fullCommand, false, error.message)

      console.log(chalk.red(`✖ Command failed: ${fullCommand}`))
      console.log(chalk.gray(`Error: ${error.message}`))

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        code: error.code || 1,
      }
    }
  }

  private async runCommandStream(
    command: string,
    options: { cwd: string; env: any; interactive?: boolean }
  ): Promise<{ stdout: string; stderr: string; code: number; pid: number }> {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''

      const child = spawn('sh', ['-c', command], {
        cwd: options.cwd,
        env: options.env,
        stdio: options.interactive ? 'inherit' : 'pipe',
      })

      const processInfo: ProcessInfo = {
        pid: child.pid!,
        command: command.split(' ')[0],
        args: command.split(' ').slice(1),
        cwd: options.cwd,
        startTime: new Date(),
        status: 'running',
      }

      this.runningProcesses.set(child.pid!, processInfo)

      if (!options.interactive && child.stdout && child.stderr) {
        child.stdout.on('data', (data) => {
          const output = data.toString()
          stdout += output
          process.stdout.write(chalk.cyan(output))
        })

        child.stderr.on('data', (data) => {
          const output = data.toString()
          stderr += output
          process.stderr.write(chalk.yellow(output))
        })
      }

      child.on('close', (code) => {
        processInfo.status = code === 0 ? 'completed' : 'failed'
        processInfo.exitCode = code || 0
        this.runningProcesses.delete(child.pid!)

        this.addToHistory(command, code === 0, stdout + stderr)

        if (code === 0) {
          console.log(chalk.green(`✓ Process completed (PID: ${child.pid})`))
        } else {
          console.log(chalk.red(`✖ Process failed with code ${code} (PID: ${child.pid})`))
        }

        resolve({ stdout, stderr, code: code || 0, pid: child.pid! })
      })

      child.on('error', (error) => {
        console.log(chalk.red(`✖ Process error: ${error.message}`))
        processInfo.status = 'failed'
        this.runningProcesses.delete(child.pid!)
        resolve({ stdout, stderr: error.message, code: 1, pid: child.pid! })
      })
    })
  }

  async installPackage(
    packageName: string,
    options: { global?: boolean; dev?: boolean; manager?: 'npm' | 'yarn' | 'pnpm' } = {}
  ): Promise<boolean> {
    const manager = options.manager || 'npm'
    const command = manager
    let args: string[] = []

    switch (manager) {
      case 'npm':
        args = ['install']
        if (options.global) args.push('-g')
        if (options.dev) args.push('--save-dev')
        args.push(packageName)
        break
      case 'yarn':
        args = ['add']
        if (options.global) args = ['global', 'add']
        if (options.dev) args.push('--dev')
        args.push(packageName)
        break
      case 'pnpm':
        args = ['add']
        if (options.global) args.push('-g')
        if (options.dev) args.push('--save-dev')
        args.push(packageName)
        break
    }

    console.log(chalk.blue(`📦 Installing ${packageName} with ${manager}...`))
    const result = await this.runCommand(command, args)

    if (result.code === 0) {
      console.log(chalk.green(`✓ Successfully installed ${packageName}`))
      return true
    } else {
      console.log(chalk.red(`✖ Failed to install ${packageName}`))
      return false
    }
  }

  async killProcess(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 'SIGTERM')

      const processInfo = this.runningProcesses.get(pid)
      if (processInfo) {
        processInfo.status = 'killed'
        this.runningProcesses.delete(pid)
      }

      console.log(chalk.yellow(`⚠︎ Process ${pid} terminated`))
      return true
    } catch (_error) {
      console.log(chalk.red(`✖ Could not kill process ${pid}`))
      return false
    }
  }

  getRunningProcesses(): ProcessInfo[] {
    return Array.from(this.runningProcesses.values())
  }

  getCommandHistory(limit?: number): Array<{ command: string; timestamp: Date; success: boolean; output: string }> {
    return limit ? this.commandHistory.slice(-limit) : this.commandHistory
  }

  private addToHistory(command: string, success: boolean, output: string): void {
    this.commandHistory.push({
      command,
      timestamp: new Date(),
      success,
      output: output.slice(0, 1000), // Limit output size
    })

    // Keep only last 100 commands
    if (this.commandHistory.length > 100) {
      this.commandHistory = this.commandHistory.slice(-100)
    }
  }

  // Build and Test Operations
  async build(
    framework?: 'next' | 'react' | 'node' | 'npm'
  ): Promise<{ success: boolean; output: string; errors?: ErrorAnalysis[] }> {
    let _buildCommand = 'npm run build'

    if (framework === 'next') _buildCommand = 'npm run build'
    else if (framework === 'react') _buildCommand = 'npm run build'
    else if (framework === 'node') _buildCommand = 'npm run build'

    const result = await this.runCommand('npm', ['run', 'build'])

    const errors = this.parseErrors(result.stderr)

    return {
      success: result.code === 0,
      output: result.stdout + result.stderr,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  async runTests(testPattern?: string): Promise<{ success: boolean; output: string; errors?: ErrorAnalysis[] }> {
    const args = ['test']
    if (testPattern) args.push(testPattern)

    const result = await this.runCommand('npm', args)
    const errors = this.parseErrors(result.stderr)

    return {
      success: result.code === 0,
      output: result.stdout + result.stderr,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  async lint(filePath?: string): Promise<{ success: boolean; output: string; errors?: ErrorAnalysis[] }> {
    const args = ['run', 'lint']
    if (filePath) args.push(filePath)

    const result = await this.runCommand('npm', args)
    const errors = this.parseErrors(result.stderr)

    return {
      success: result.code === 0,
      output: result.stdout + result.stderr,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  async typeCheck(): Promise<{ success: boolean; output: string; errors?: ErrorAnalysis[] }> {
    const result = await this.runCommand('npx', ['tsc', '--noEmit'])
    const errors = this.parseTypeErrors(result.stderr)

    return {
      success: result.code === 0,
      output: result.stdout + result.stderr,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  // Error Analysis
  private parseErrors(output: string): ErrorAnalysis[] {
    const errors: ErrorAnalysis[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      // Parse different error formats
      if (line.includes('Error:') || line.includes('error:')) {
        errors.push(this.parseErrorLine(line, 'error'))
      } else if (line.includes('Warning:') || line.includes('warning:')) {
        errors.push(this.parseErrorLine(line, 'warning'))
      }
    }

    return errors
  }

  private parseTypeErrors(output: string): ErrorAnalysis[] {
    const errors: ErrorAnalysis[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      const match = line.match(/(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS(\d+):\s*(.+)/)
      if (match) {
        const [, file, line, column, severity, code, message] = match
        errors.push({
          type: 'type',
          severity: severity as 'error' | 'warning',
          message: `TS${code}: ${message}`,
          file: path.relative(this.workingDirectory, file),
          line: parseInt(line),
          column: parseInt(column),
        })
      }
    }

    return errors
  }

  private parseErrorLine(line: string, severity: 'error' | 'warning'): ErrorAnalysis {
    // Basic error parsing - can be enhanced
    return {
      type: 'compile',
      severity,
      message: line.trim(),
    }
  }

  // Git Operations
  async gitStatus(): Promise<{ modified: string[]; untracked: string[]; staged: string[] }> {
    const result = await this.runCommand('git', ['status', '--porcelain'])
    const lines = result.stdout.split('\n').filter(Boolean)

    const modified: string[] = []
    const untracked: string[] = []
    const staged: string[] = []

    for (const line of lines) {
      const status = line.slice(0, 2)
      const file = line.slice(3)

      if (status.includes('M')) modified.push(file)
      if (status.includes('??')) untracked.push(file)
      if (status[0] !== ' ' && status[0] !== '?') staged.push(file)
    }

    return { modified, untracked, staged }
  }

  async gitAdd(files: string[]): Promise<void> {
    await this.runCommand('git', ['add', ...files])
    console.log(chalk.green(`✓ Added files to git: ${files.join(', ')}`))
  }

  async gitCommit(message: string): Promise<void> {
    await this.runCommand('git', ['commit', '-m', message])
    console.log(chalk.green(`✓ Committed with message: ${message}`))
  }

  // System Information and Advanced Operations
  async getSystemInfo(): Promise<SystemInfo> {
    const platform = os.platform()
    const arch = os.arch()
    const nodeVersion = process.version
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()

    // Get versions of common tools
    let npmVersion, gitVersion, dockerVersion

    try {
      const npmResult = await this.runCommand('npm', ['--version'])
      npmVersion = npmResult.stdout.trim()
    } catch {}

    try {
      const gitResult = await this.runCommand('git', ['--version'])
      gitVersion = gitResult.stdout.match(/git version ([\d.]+)/)?.[1]
    } catch {}

    try {
      const dockerResult = await this.runCommand('docker', ['--version'])
      dockerVersion = dockerResult.stdout.match(/Docker version ([\d.]+)/)?.[1]
    } catch {}

    return {
      platform,
      arch,
      nodeVersion,
      npmVersion,
      gitVersion,
      dockerVersion,
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
      },
      cpus: os.cpus().length,
      uptime: os.uptime(),
    }
  }

  async runScript(
    scriptContent: string,
    options: { language?: 'bash' | 'python' | 'node'; file?: string } = {}
  ): Promise<{ success: boolean; output: string }> {
    const language = options.language || 'bash'
    let tempFile = options.file

    if (!tempFile) {
      const tempDir = os.tmpdir()
      const extension = language === 'bash' ? '.sh' : language === 'python' ? '.py' : '.js'
      tempFile = path.join(tempDir, `script_${Date.now()}${extension}`)

      // Write script to temp file
      fs.writeFileSync(tempFile, scriptContent)

      if (language === 'bash') {
        fs.chmodSync(tempFile, '755')
      }
    }

    try {
      let result

      switch (language) {
        case 'bash':
          result = await this.runCommand('bash', [tempFile])
          break
        case 'python':
          result = await this.runCommand('python3', [tempFile])
          break
        case 'node':
          result = await this.runCommand('node', [tempFile])
          break
        default:
          throw new Error(`Unsupported script language: ${language}`)
      }

      // Clean up temp file if we created it
      if (!options.file) {
        try {
          fs.unlinkSync(tempFile)
        } catch {}
      }

      return {
        success: result.code === 0,
        output: result.stdout + result.stderr,
      }
    } catch (error: any) {
      return {
        success: false,
        output: error.message,
      }
    }
  }

  async checkDependencies(dependencies: string[]): Promise<Record<string, { installed: boolean; version?: string }>> {
    const results: Record<string, { installed: boolean; version?: string }> = {}

    for (const dep of dependencies) {
      try {
        const result = await this.runCommand('which', [dep])
        if (result.code === 0) {
          try {
            const versionResult = await this.runCommand(dep, ['--version'])
            const version = versionResult.stdout.split('\n')[0]
            results[dep] = { installed: true, version }
          } catch {
            results[dep] = { installed: true }
          }
        } else {
          results[dep] = { installed: false }
        }
      } catch {
        results[dep] = { installed: false }
      }
    }

    return results
  }

  async setupProject(
    projectType: 'react' | 'next' | 'node' | 'express',
    projectName: string
  ): Promise<{ success: boolean; path: string; commands: string[] }> {
    const commands: string[] = []
    let success = false
    const projectPath = path.join(this.workingDirectory, projectName)

    console.log(chalk.blue(`🚀 Setting up ${projectType} project: ${projectName}`))

    try {
      switch (projectType) {
        case 'next':
          commands.push(`npx create-next-app@latest ${projectName} --typescript --tailwind --eslint --app --src-dir`)
          await this.runCommand('npx', [
            'create-next-app@latest',
            projectName,
            '--typescript',
            '--tailwind',
            '--eslint',
            '--app',
            '--src-dir',
          ])
          break

        case 'react':
          commands.push(`npx create-react-app ${projectName} --template typescript`)
          await this.runCommand('npx', ['create-react-app', projectName, '--template', 'typescript'])
          break

        case 'node':
          commands.push(
            `mkdir ${projectName}`,
            'cd ' + projectName,
            'npm init -y',
            'npm install -D typescript @types/node ts-node'
          )
          fs.mkdirSync(projectPath, { recursive: true })
          await this.runCommand('npm', ['init', '-y'], { cwd: projectPath })
          await this.runCommand('npm', ['install', '-D', 'typescript', '@types/node', 'ts-node'], { cwd: projectPath })
          break

        case 'express':
          commands.push(`mkdir ${projectName}`, 'cd ' + projectName, 'npm init -y')
          commands.push('npm install express', 'npm install -D typescript @types/node @types/express ts-node')
          fs.mkdirSync(projectPath, { recursive: true })
          await this.runCommand('npm', ['init', '-y'], { cwd: projectPath })
          await this.runCommand('npm', ['install', 'express'], { cwd: projectPath })
          await this.runCommand('npm', ['install', '-D', 'typescript', '@types/node', '@types/express', 'ts-node'], {
            cwd: projectPath,
          })
          break
      }

      success = true
      console.log(chalk.green(`✓ Project ${projectName} created successfully!`))
      console.log(chalk.gray(`📁 Location: ${projectPath}`))
    } catch (error: any) {
      console.log(chalk.red(`✖ Failed to create project: ${error.message}`))
    }

    return { success, path: projectPath, commands }
  }

  async monitorLogs(logFile: string, callback?: (line: string) => void): Promise<ChildProcess> {
    console.log(chalk.blue(`👀 Monitoring logs: ${logFile}`))

    const child = spawn('tail', ['-f', logFile], {
      cwd: this.workingDirectory,
    })

    child.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean)
      lines.forEach((line: string) => {
        console.log(chalk.cyan(`📝 ${line}`))
        callback?.(line)
      })
    })

    child.stderr?.on('data', (data) => {
      console.log(chalk.red(`✖ Log monitor error: ${data}`))
    })

    return child
  }

  // Helper Methods
  private getLanguageFromExtension(ext: string): string | undefined {
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      html: 'html',
      css: 'css',
      scss: 'scss',
      json: 'json',
      md: 'markdown',
      yml: 'yaml',
      yaml: 'yaml',
      xml: 'xml',
    }

    return languageMap[ext.toLowerCase()]
  }

  async analyzeProject(): Promise<{
    structure: any
    packageInfo?: any
    framework?: string
    technologies: string[]
  }> {
    const files = await this.listFiles('.')
    const structure = this.buildDirectoryStructure(files)

    let packageInfo
    let framework
    const technologies: string[] = []

    try {
      const pkg = await this.readFile('package.json')
      if (!pkg.content) throw new Error('Empty package.json')
      packageInfo = JSON.parse(pkg.content)

      // Detect framework
      if (packageInfo.dependencies?.next) framework = 'Next.js'
      else if (packageInfo.dependencies?.react) framework = 'React'
      else if (packageInfo.dependencies?.express) framework = 'Express'
      else if (packageInfo.dependencies?.fastify) framework = 'Fastify'

      // Detect technologies
      Object.keys(packageInfo.dependencies || {}).forEach((dep) => {
        if (dep.includes('typescript')) technologies.push('TypeScript')
        if (dep.includes('tailwind')) technologies.push('Tailwind CSS')
        if (dep.includes('prisma')) technologies.push('Prisma')
        if (dep.includes('next')) technologies.push('Next.js')
        if (dep.includes('react')) technologies.push('React')
        if (dep.includes('vue')) technologies.push('Vue.js')
        if (dep.includes('express')) technologies.push('Express')
      })
    } catch (_error) {
      // No package.json or invalid JSON
    }

    return {
      structure,
      packageInfo,
      framework,
      technologies: Array.from(new Set(technologies)),
    }
  }

  private buildDirectoryStructure(files: string[]): any {
    const structure: any = {}

    for (const file of files) {
      const parts = file.split('/')
      let current = structure

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (i === parts.length - 1) {
          // It's a file
          if (!current._files) current._files = []
          current._files.push(part)
        } else {
          // It's a directory
          if (!current[part]) current[part] = {}
          current = current[part]
        }
      }
    }

    return structure
  }
}

export const toolsManager = new ToolsManager()
