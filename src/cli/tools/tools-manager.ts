import { type ChildProcess, exec, spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { createFileFilter } from '../context/file-filter-system'
import { advancedUI } from '../ui/advanced-cli-ui'
import { sanitizePath } from './secure-file-tools'
import { getWorkingDirectory, resolveWorkspacePath, toWorkspaceRelative } from '../utils/working-dir'

const execAsync = promisify(exec)

export interface FileInfo {
  path: string
  content: string
  size: number
  modified: Date
  extension: string
  language?: string
}

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
  private runningProcesses: Map<number, ProcessInfo> = new Map()
  private commandHistory: Array<{ command: string; timestamp: Date; success: boolean; output: string }> = []

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || getWorkingDirectory()
  }

  // File Operations
  async readFile(filePath: string): Promise<FileInfo> {
    const fullPath = sanitizePath(filePath, this.workingDirectory)

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const stats = fs.statSync(fullPath)
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`)
    }
    const content = fs.readFileSync(fullPath, 'utf8')
    const extension = path.extname(fullPath).slice(1)

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
    const fullPath = sanitizePath(filePath, this.workingDirectory)
    const dir = path.dirname(fullPath)

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(fullPath, content, 'utf8')
    advancedUI.logFunctionUpdate('success', `✓ File written: ${filePath}`)
    advancedUI.logFunctionCall('write-file-tool')
  }

  async editFile(
    filePath: string,
    changes: { line?: number; find?: string; replace: string; insert?: boolean }[]
  ): Promise<void> {
    const fileInfo = await this.readFile(filePath)
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
    const fullPath = sanitizePath(directory, this.workingDirectory)

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Directory not found: ${directory}`)
    }

    // Use FileFilterSystem for intelligent filtering
    const fileFilter = createFileFilter(this.workingDirectory, {
      respectGitignore: true,
      maxFileSize: 1024 * 1024, // 1MB
      maxTotalFiles: 5000,
      includeExtensions: [], // Include all by default, filter with pattern if provided
      excludeExtensions: [],
      excludeDirectories: [],
      excludePatterns: [],
      customRules: [],
    })

    const files: string[] = []

    const walkDir = (dir: string): void => {
      try {
        const items = fs.readdirSync(dir)

        for (const item of items) {
          const itemPath = path.join(dir, item)
          const relativePath = path.relative(fullPath, itemPath)

          if (fs.statSync(itemPath).isDirectory()) {
            // Check if directory should be included using FileFilterSystem
            const filterResult = fileFilter.shouldIncludeFile(itemPath, this.workingDirectory)
            if (filterResult.allowed) {
              walkDir(itemPath)
            }
          } else {
            // Check if file should be included using FileFilterSystem
            const filterResult = fileFilter.shouldIncludeFile(itemPath, this.workingDirectory)
            if (filterResult.allowed && (!pattern || pattern.test(relativePath))) {
              // Return path relative to the requested search root (fullPath)
              // Avoid computing relative to the original input string (e.g. 'src')
              // which could produce incorrect paths like '../file' when directory is not absolute
              files.push(relativePath)
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read (permissions, etc.)
        advancedUI.logFunctionUpdate(
          'info',
          `Skipped directory: ${dir} (${error instanceof Error ? error.message : 'Unknown error'}`
        )
        advancedUI.logFunctionCall('tools-manager')
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
      } catch (_error) { }
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
    const cwd = options.cwd ? resolveWorkspacePath(options.cwd) : this.workingDirectory
    const env = { ...process.env, ...options.env }

    // Build arg array safely; prepend sudo as a separate executable when requested
    const executable = options.sudo ? 'sudo' : command
    const execArgs = options.sudo ? [command, ...args] : [...args]

    const printable = `${executable} ${execArgs.map((a) => (a.includes(' ') ? `'${a}'` : a)).join(' ')}`
    advancedUI.logFunctionUpdate('info', `⚡ Executing: ${printable}`)
    advancedUI.logFunctionUpdate('info', `📁 Working directory: ${toWorkspaceRelative(cwd)}`)

    try {
      const startTime = Date.now()

      if (options.stream || options.interactive) {
        // Use spawn directly for streaming/interactive to avoid shell parsing issues
        return await this.runCommandSpawn(executable, execArgs, { cwd, env, interactive: options.interactive })
      } else {
        // Use spawn and collect buffers to avoid shell interpolation bugs
        const result = await this.runSpawnCollect(executable, execArgs, { cwd, env, timeout: options.timeout || 60000 })
        const duration = Date.now() - startTime
        this.addToHistory(printable, result.code === 0, result.stdout + result.stderr)
        if (result.code === 0) {
          advancedUI.logFunctionUpdate('success', `✓ Command completed in ${duration}ms`)
        }
        return result
      }
    } catch (error: any) {
      this.addToHistory(printable, false, error.message)
      advancedUI.logFunctionUpdate('error', `❌ Command failed: ${printable}`)
      advancedUI.logFunctionCall('tools-manager')
      advancedUI.logFunctionUpdate('info', `Error: ${error.message}`)
      advancedUI.logFunctionCall('tools-manager')
      return {
        stdout: '',
        stderr: error.message,
        code: 1,
      }
    }
  }

  private runSpawnCollect(
    executable: string,
    args: string[],
    opts: { cwd: string; env: any; timeout: number }
  ): Promise<{ stdout: string; stderr: string; code: number; pid?: number }> {
    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      const child = spawn(executable, args, { cwd: opts.cwd, env: opts.env })

      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGTERM')
        } catch { }
      }, opts.timeout)

      child.stdout?.on('data', (d) => (stdout += d.toString()))
      child.stderr?.on('data', (d) => (stderr += d.toString()))
      child.on('close', (code) => {
        clearTimeout(killTimer)
        resolve({ stdout, stderr, code: code ?? 0, pid: child.pid || undefined })
      })
      child.on('error', (err) => {
        clearTimeout(killTimer)
        resolve({ stdout, stderr: err.message, code: 1, pid: child.pid || undefined })
      })
    })
  }

  private async runCommandSpawn(
    executable: string,
    args: string[],
    options: { cwd: string; env: any; interactive?: boolean }
  ): Promise<{ stdout: string; stderr: string; code: number; pid: number }> {
    // Delegate to stream variant but without shell, keeping previous behavior otherwise
    const command = [executable, ...args].join(' ')
    return this.runCommandStream(command, { cwd: options.cwd, env: options.env, interactive: options.interactive })
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
          advancedUI.logFunctionUpdate('success', `✓ Process completed (PID: ${child.pid})`)
        } else {
          advancedUI.logFunctionUpdate('error', `❌ Process failed with code ${code} (PID: ${child.pid})`)
        }

        resolve({ stdout, stderr, code: code || 0, pid: child.pid! })
      })

      child.on('error', (error) => {
        advancedUI.logFunctionUpdate('error', `❌ Process error: ${error.message}`)
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

    advancedUI.logFunctionUpdate('info', `📦 Installing ${packageName} with ${manager}...`)
    const result = await this.runCommand(command, args)

    if (result.code === 0) {
      advancedUI.logFunctionUpdate('success', `✓ Successfully installed ${packageName}`)
      return true
    } else {
      advancedUI.logFunctionUpdate('error', `❌ Failed to install ${packageName}`)
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

      advancedUI.logFunctionUpdate('warning', `⚠️ Process ${pid} terminated`)
      return true
    } catch (_error) {
      advancedUI.logFunctionUpdate('error', `❌ Could not kill process ${pid}`)
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
          line: parseInt(line, 10),
          column: parseInt(column, 10),
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
    advancedUI.logFunctionUpdate('success', `✓ Added files to git: ${files.join(', ')}`)
  }

  async gitCommit(message: string): Promise<void> {
    await this.runCommand('git', ['commit', '-m', message])
    advancedUI.logFunctionUpdate('success', `✓ Committed with message: ${message}`)
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
    } catch { }

    try {
      const gitResult = await this.runCommand('git', ['--version'])
      gitVersion = gitResult.stdout.match(/git version ([\d.]+)/)?.[1]
    } catch { }

    try {
      const dockerResult = await this.runCommand('docker', ['--version'])
      dockerVersion = dockerResult.stdout.match(/Docker version ([\d.]+)/)?.[1]
    } catch { }

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
        } catch { }
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
    const projectPath = resolveWorkspacePath(projectName)

    advancedUI.logFunctionUpdate('info', `🚀 Setting up ${projectType} project: ${projectName}`)

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
            `cd ${projectName}`,
            'npm init -y',
            'npm install -D typescript @types/node ts-node'
          )
          fs.mkdirSync(projectPath, { recursive: true })
          await this.runCommand('npm', ['init', '-y'], { cwd: projectPath })
          await this.runCommand('npm', ['install', '-D', 'typescript', '@types/node', 'ts-node'], { cwd: projectPath })
          break

        case 'express':
          commands.push(`mkdir ${projectName}`, `cd ${projectName}`, 'npm init -y')
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
      advancedUI.logFunctionUpdate('success', `✓ Project ${projectName} created successfully!`)
      advancedUI.logFunctionUpdate('info', `📁 Location: ${projectPath}`)
    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `❌ Failed to create project: ${error.message}`)
    }

    return { success, path: projectPath, commands }
  }

  async monitorLogs(logFile: string, callback?: (line: string) => void): Promise<ChildProcess> {
    advancedUI.logFunctionUpdate('info', `⚡︎ Monitoring logs: ${logFile}`)

    const child = spawn('tail', ['-f', logFile], {
      cwd: this.workingDirectory,
    })

    child.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n').filter(Boolean)
      lines.forEach((line: string) => {
        advancedUI.logFunctionUpdate('info', `📝 ${line}`)
        callback?.(line)
      })
    })

    child.stderr?.on('data', (data) => {
      advancedUI.logFunctionUpdate('error', `❌ Log monitor error: ${data}`)
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
