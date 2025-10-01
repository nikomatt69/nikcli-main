import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import chalk from 'chalk'
import { createFileFilter } from '../context/file-filter-system'

// ============================================================================
// Diagnostic Types & Interfaces
// ============================================================================

export type DiagnosticKind = 'build' | 'lint' | 'test' | 'runtime' | 'vcs'
export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface DiagnosticRange {
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}

export interface DiagnosticRelated {
  file: string
  range?: DiagnosticRange
  message: string
}

export interface Diagnostic {
  kind: DiagnosticKind
  file: string
  range?: DiagnosticRange
  message: string
  code?: string
  source: string
  severity: DiagnosticSeverity
  related?: DiagnosticRelated[]
  timestamp: number
}

export interface BuildSummary {
  success: boolean
  duration: number
  errors: number
  warnings: number
  command: string
  exitCode: number
}

export interface TestSummary {
  total: number
  passed: number
  failed: number
  skipped: number
  duration: number
  command: string
}

export interface VcsStatus {
  branch: string
  ahead: number
  behind: number
  staged: Array<{ file: string; status: string }>
  unstaged: Array<{ file: string; status: string }>
  untracked: string[]
}

export interface RuntimeLogEntry {
  timestamp: number
  level: 'error' | 'warn' | 'info' | 'debug'
  message: string
  source?: string
  stack?: string
}

export interface ProjectGraph {
  nodes: Array<{ id: string; type: string; path: string; dependencies: string[] }>
  edges: Array<{ from: string; to: string; type: string }>
}

export interface DiagnosticEvent {
  type: 'fs-change' | 'build' | 'lint' | 'test' | 'runtime' | 'vcs'
  timestamp: number
  summary: {
    errors: number
    warnings: number
    affected?: string[]
  }
  cursor: string
}

// ============================================================================
// Runner & Tool Detection
// ============================================================================

interface DetectedRunner {
  type: 'pnpm' | 'yarn' | 'bun' | 'npm'
  command: string
  available: boolean
}

interface DetectedTool {
  name: string
  command: string[]
  available: boolean
  configFile?: string
}

class ProjectDetector {
  private workingDir: string
  private packageJson: any = null

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir
    this.loadPackageJson()
  }

  private loadPackageJson(): void {
    try {
      const packagePath = join(this.workingDir, 'package.json')
      if (existsSync(packagePath)) {
        this.packageJson = JSON.parse(require('node:fs').readFileSync(packagePath, 'utf-8'))
      }
    } catch (_error) {
      // Package.json not found or invalid - not an error for detection
    }
  }

  detectRunner(): DetectedRunner {
    const runners = [
      { type: 'pnpm' as const, command: 'pnpm' },
      { type: 'yarn' as const, command: 'yarn' },
      { type: 'bun' as const, command: 'bun' },
      { type: 'npm' as const, command: 'npm' },
    ]

    for (const runner of runners) {
      try {
        execSync(`${runner.command} --version`, { stdio: 'ignore', timeout: 5000 })
        return { ...runner, available: true }
      } catch {}
    }

    return { type: 'npm', command: 'npm', available: false }
  }

  detectBuildTool(): DetectedTool {
    // Check for Next.js
    if (this.packageJson?.dependencies?.next || this.packageJson?.devDependencies?.next) {
      return {
        name: 'next',
        command: [this.detectRunner().command, 'run', 'build'],
        available: true,
        configFile: 'next.config.js',
      }
    }

    // Check for Vite
    if (this.packageJson?.dependencies?.vite || this.packageJson?.devDependencies?.vite) {
      return {
        name: 'vite',
        command: [this.detectRunner().command, 'run', 'build'],
        available: true,
        configFile: 'vite.config.ts',
      }
    }

    // Check for TypeScript
    if (existsSync(join(this.workingDir, 'tsconfig.json'))) {
      return {
        name: 'tsc',
        command: ['npx', 'tsc', '--noEmit'],
        available: true,
        configFile: 'tsconfig.json',
      }
    }

    // Check for Makefile
    if (existsSync(join(this.workingDir, 'Makefile'))) {
      return {
        name: 'make',
        command: ['make', 'build'],
        available: true,
        configFile: 'Makefile',
      }
    }

    return {
      name: 'none',
      command: [],
      available: false,
    }
  }

  detectLintTool(): DetectedTool {
    // Check for ESLint
    if (
      existsSync(join(this.workingDir, '.eslintrc.js')) ||
      existsSync(join(this.workingDir, '.eslintrc.json')) ||
      existsSync(join(this.workingDir, 'eslint.config.js'))
    ) {
      return {
        name: 'eslint',
        command: ['npx', 'eslint', '.', '--format', 'json'],
        available: true,
        configFile: '.eslintrc.js',
      }
    }

    // Check for Biome
    if (existsSync(join(this.workingDir, 'biome.json'))) {
      return {
        name: 'biome',
        command: ['npx', '@biomejs/biome', 'check', '.', '--reporter', 'json'],
        available: true,
        configFile: 'biome.json',
      }
    }

    // Check for Python/Ruff
    if (existsSync(join(this.workingDir, 'pyproject.toml')) || existsSync(join(this.workingDir, 'requirements.txt'))) {
      return {
        name: 'ruff',
        command: ['ruff', 'check', '.', '--output-format', 'json'],
        available: true,
        configFile: 'pyproject.toml',
      }
    }

    return {
      name: 'none',
      command: [],
      available: false,
    }
  }

  detectTestTool(): DetectedTool {
    // Check for Vitest
    if (this.packageJson?.dependencies?.vitest || this.packageJson?.devDependencies?.vitest) {
      return {
        name: 'vitest',
        command: [this.detectRunner().command, 'run', 'test', '--reporter=json'],
        available: true,
        configFile: 'vitest.config.ts',
      }
    }

    // Check for Jest
    if (this.packageJson?.dependencies?.jest || this.packageJson?.devDependencies?.jest) {
      return {
        name: 'jest',
        command: [this.detectRunner().command, 'test', '--json'],
        available: true,
        configFile: 'jest.config.js',
      }
    }

    // Check for Pytest
    if (existsSync(join(this.workingDir, 'pytest.ini')) || existsSync(join(this.workingDir, 'pyproject.toml'))) {
      return {
        name: 'pytest',
        command: ['python', '-m', 'pytest', '--json-report'],
        available: true,
        configFile: 'pytest.ini',
      }
    }

    // Check for Cargo (Rust)
    if (existsSync(join(this.workingDir, 'Cargo.toml'))) {
      return {
        name: 'cargo',
        command: ['cargo', 'test', '--message-format=json'],
        available: true,
        configFile: 'Cargo.toml',
      }
    }

    // Check for Go
    if (existsSync(join(this.workingDir, 'go.mod'))) {
      return {
        name: 'go',
        command: ['go', 'test', '-json', './...'],
        available: true,
        configFile: 'go.mod',
      }
    }

    return {
      name: 'none',
      command: [],
      available: false,
    }
  }

  detectWorkspaces(): string[] {
    if (this.packageJson?.workspaces) {
      if (Array.isArray(this.packageJson.workspaces)) {
        return this.packageJson.workspaces
      }
      if (this.packageJson.workspaces.packages) {
        return this.packageJson.workspaces.packages
      }
    }
    return []
  }
}

// ============================================================================
// Diagnostic Parsers
// ============================================================================

class DiagnosticParser {
  static parseTypeScript(output: string, source: string = 'tsc'): Diagnostic[] {
    const diagnostics: Diagnostic[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      // Match TypeScript diagnostic format: file(line,col): error TSxxxx: message
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning|info)\s+(TS\d+):\s+(.+)$/)
      if (match) {
        const [, file, startLine, startCol, severityStr, code, message] = match
        const severity = severityStr as DiagnosticSeverity

        diagnostics.push({
          kind: 'build',
          file: relative(process.cwd(), file),
          range: {
            startLine: parseInt(startLine, 10),
            startCol: parseInt(startCol, 10),
            endLine: parseInt(startLine, 10),
            endCol: parseInt(startCol, 10),
          },
          message: message.trim(),
          code,
          source,
          severity,
          timestamp: Date.now(),
        })
      }
    }

    return diagnostics
  }

  static parseESLint(jsonOutput: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = []

    try {
      const results = JSON.parse(jsonOutput)

      for (const result of results) {
        for (const message of result.messages || []) {
          diagnostics.push({
            kind: 'lint',
            file: relative(process.cwd(), result.filePath),
            range: {
              startLine: message.line || 1,
              startCol: message.column || 1,
              endLine: message.endLine || message.line || 1,
              endCol: message.endColumn || message.column || 1,
            },
            message: message.message,
            code: message.ruleId,
            source: 'eslint',
            severity: message.severity === 2 ? 'error' : 'warning',
            timestamp: Date.now(),
          })
        }
      }
    } catch (error) {
      console.error('Failed to parse ESLint output:', error)
    }

    return diagnostics
  }

  static parseVitest(jsonOutput: string): { diagnostics: Diagnostic[]; summary: TestSummary } {
    const diagnostics: Diagnostic[] = []
    let summary: TestSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      command: 'vitest',
    }

    try {
      const result = JSON.parse(jsonOutput)

      summary = {
        total: result.numTotalTests || 0,
        passed: result.numPassedTests || 0,
        failed: result.numFailedTests || 0,
        skipped: result.numPendingTests || 0,
        duration: result.testExecTime || 0,
        command: 'vitest',
      }

      if (result.testResults) {
        for (const testFile of result.testResults) {
          for (const test of testFile.assertionResults || []) {
            if (test.status === 'failed') {
              diagnostics.push({
                kind: 'test',
                file: relative(process.cwd(), testFile.name),
                message: test.title + (test.failureMessages ? `: ${test.failureMessages.join(', ')}` : ''),
                source: 'vitest',
                severity: 'error',
                timestamp: Date.now(),
              })
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse Vitest output:', error)
    }

    return { diagnostics, summary }
  }

  static parseGenericBuild(
    _output: string,
    stderr: string,
    exitCode: number
  ): { diagnostics: Diagnostic[]; summary: BuildSummary } {
    const diagnostics: Diagnostic[] = []

    // Try to extract file:line patterns from stderr
    const errorLines = stderr.split('\n')
    for (const line of errorLines) {
      const match = line.match(/^(.+?):(\d+):(?:(\d+):)?\s*(error|warning|info):\s*(.+)$/)
      if (match) {
        const [, file, startLine, startCol, severityStr, message] = match
        diagnostics.push({
          kind: 'build',
          file: relative(process.cwd(), file),
          range: startCol
            ? {
                startLine: parseInt(startLine, 10),
                startCol: parseInt(startCol, 10),
                endLine: parseInt(startLine, 10),
                endCol: parseInt(startCol, 10),
              }
            : undefined,
          message: message.trim(),
          source: 'build',
          severity: severityStr as DiagnosticSeverity,
          timestamp: Date.now(),
        })
      }
    }

    const summary: BuildSummary = {
      success: exitCode === 0,
      duration: 0, // Will be calculated by caller
      errors: diagnostics.filter((d) => d.severity === 'error').length,
      warnings: diagnostics.filter((d) => d.severity === 'warning').length,
      command: 'build',
      exitCode,
    }

    return { diagnostics, summary }
  }
}

// ============================================================================
// Cache System
// ============================================================================

class DiagnosticCache {
  private cache = new Map<string, Diagnostic[]>()
  private timestamps = new Map<string, number>()
  private readonly maxAge = 5 * 60 * 1000 // 5 minutes

  set(key: string, diagnostics: Diagnostic[]): void {
    this.cache.set(key, diagnostics)
    this.timestamps.set(key, Date.now())
  }

  get(key: string): Diagnostic[] | null {
    const timestamp = this.timestamps.get(key)
    if (!timestamp || Date.now() - timestamp > this.maxAge) {
      this.cache.delete(key)
      this.timestamps.delete(key)
      return null
    }
    return this.cache.get(key) || null
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      this.timestamps.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
        this.timestamps.delete(key)
      }
    }
  }

  has(key: string): boolean {
    return this.cache.has(key) && this.get(key) !== null
  }
}

// ============================================================================
// Main IDE Diagnostic Server
// ============================================================================

export class IDEDiagnosticServer extends EventEmitter {
  private workingDir: string
  private detector: ProjectDetector
  private cache = new DiagnosticCache()
  private watchers = new Map<string, any>()
  private runningProcesses = new Map<string, ChildProcess>()
  private isWatchingEnabled = false
  private watchedPaths = new Set<string>()
  private readonly allowedCommands = new Set([
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'npx',
    'node',
    'tsc',
    'eslint',
    'biome',
    'vitest',
    'jest',
    'python',
    'pytest',
    'ruff',
    'cargo',
    'go',
    'make',
    'git',
    'docker',
    'docker-compose',
  ])

  constructor(workingDir: string = process.cwd()) {
    super()
    this.workingDir = workingDir
    this.detector = new ProjectDetector(workingDir)
    // File watcher is NOT initialized automatically anymore
    // It will be started only when explicitly requested

    // Initialize stats for monitoring health
    this.initializeStats()
  }

  private initializeStats(): void {
    // Check system file descriptor limits to prevent EMFILE errors
    try {
      const { execSync } = require('node:child_process')
      const limits = execSync('ulimit -n', { encoding: 'utf8' }).trim()
      const maxFd = parseInt(limits, 10)

      if (maxFd < 1024) {
        console.warn(chalk.yellow(`⚠️ Low file descriptor limit: ${maxFd}. Consider increasing with 'ulimit -n 4096'`))
      }
    } catch {
      // Ignore if ulimit check fails
    }
  }

  // ========================================================================
  // MCP Tool Implementations
  // ========================================================================

  async diagList(
    filters: {
      kind?: DiagnosticKind[]
      severity?: DiagnosticSeverity[]
      file?: string
      dir?: string
      source?: string[]
    } = {}
  ): Promise<Diagnostic[]> {
    const allDiagnostics: Diagnostic[] = []

    // Collect from cache
    for (const [_key, diagnostics] of this.cache['cache'].entries()) {
      allDiagnostics.push(...diagnostics)
    }

    // Apply filters
    let filtered = allDiagnostics

    if (filters.kind) {
      filtered = filtered.filter((d) => filters.kind?.includes(d.kind))
    }

    if (filters.severity) {
      filtered = filtered.filter((d) => filters.severity?.includes(d.severity))
    }

    if (filters.file) {
      filtered = filtered.filter((d) => d.file.includes(filters.file!))
    }

    if (filters.dir) {
      filtered = filtered.filter((d) => d.file.startsWith(filters.dir!))
    }

    if (filters.source) {
      filtered = filtered.filter((d) => filters.source?.includes(d.source))
    }

    // Sort by severity (error > warning > info), then source, then file:line
    return filtered.sort((a, b) => {
      const severityOrder = { error: 3, warning: 2, info: 1 }
      if (a.severity !== b.severity) {
        return severityOrder[b.severity] - severityOrder[a.severity]
      }
      if (a.source !== b.source) {
        return a.source.localeCompare(b.source)
      }
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file)
      }
      const aLine = a.range?.startLine || 0
      const bLine = b.range?.startLine || 0
      return aLine - bLine
    })
  }

  async diagGet(
    file: string,
    line?: number
  ): Promise<{
    diagnostics: Diagnostic[]
    related: DiagnosticRelated[]
  }> {
    const allDiagnostics = await this.diagList()
    const fileDiagnostics = allDiagnostics.filter((d) => d.file === file)

    let diagnostics = fileDiagnostics
    if (line !== undefined) {
      diagnostics = fileDiagnostics.filter((d) => d.range && d.range.startLine <= line && d.range.endLine >= line)
    }

    const related: DiagnosticRelated[] = []
    for (const diag of diagnostics) {
      if (diag.related) {
        related.push(...diag.related)
      }
    }

    return { diagnostics, related }
  }

  async buildRun(): Promise<{ summary: BuildSummary; diagnostics: Diagnostic[] }> {
    const buildTool = this.detector.detectBuildTool()

    if (!buildTool.available) {
      throw new Error('No build tool detected. Looking for: Next.js, Vite, TypeScript, or Makefile')
    }

    const cacheKey = `build:${buildTool.name}`
    const startTime = Date.now()

    try {
      const result = await this.executeCommand(buildTool.command, {
        timeout: 300000, // 5 minutes
        cwd: this.workingDir,
      })

      const duration = Date.now() - startTime
      let diagnostics: Diagnostic[] = []
      let summary: BuildSummary

      if (buildTool.name === 'tsc') {
        diagnostics = DiagnosticParser.parseTypeScript(result.stderr, 'tsc')
        summary = {
          success: result.exitCode === 0,
          duration,
          errors: diagnostics.filter((d) => d.severity === 'error').length,
          warnings: diagnostics.filter((d) => d.severity === 'warning').length,
          command: buildTool.command.join(' '),
          exitCode: result.exitCode,
        }
      } else {
        const parsed = DiagnosticParser.parseGenericBuild(result.stdout, result.stderr, result.exitCode)
        diagnostics = parsed.diagnostics
        summary = { ...parsed.summary, duration, command: buildTool.command.join(' ') }
      }

      this.cache.set(cacheKey, diagnostics)

      this.emit('diagnosticUpdate', {
        type: 'build',
        timestamp: Date.now(),
        summary: {
          errors: summary.errors,
          warnings: summary.warnings,
        },
        cursor: cacheKey,
      })

      return { summary, diagnostics }
    } catch (error: any) {
      throw new Error(`Build failed: ${error.message}`)
    }
  }

  async lintRun(): Promise<{
    summary: { errors: number; warnings: number; files: number }
    diagnostics: Diagnostic[]
  }> {
    const lintTool = this.detector.detectLintTool()

    if (!lintTool.available) {
      throw new Error('No lint tool detected. Looking for: ESLint, Biome, or Ruff')
    }

    const cacheKey = `lint:${lintTool.name}`

    try {
      const result = await this.executeCommand(lintTool.command, {
        timeout: 120000, // 2 minutes
        cwd: this.workingDir,
      })

      let diagnostics: Diagnostic[] = []

      if (lintTool.name === 'eslint') {
        diagnostics = DiagnosticParser.parseESLint(result.stdout)
      } else {
        // Generic parsing for other linters
        diagnostics = DiagnosticParser.parseGenericBuild(result.stdout, result.stderr, result.exitCode).diagnostics
        diagnostics = diagnostics.map((d) => ({ ...d, kind: 'lint' as DiagnosticKind }))
      }

      const summary = {
        errors: diagnostics.filter((d) => d.severity === 'error').length,
        warnings: diagnostics.filter((d) => d.severity === 'warning').length,
        files: new Set(diagnostics.map((d) => d.file)).size,
      }

      this.cache.set(cacheKey, diagnostics)

      this.emit('diagnosticUpdate', {
        type: 'lint',
        timestamp: Date.now(),
        summary: {
          errors: summary.errors,
          warnings: summary.warnings,
          affected: Array.from(new Set(diagnostics.map((d) => d.file))),
        },
        cursor: cacheKey,
      })

      return { summary, diagnostics }
    } catch (error: any) {
      throw new Error(`Lint failed: ${error.message}`)
    }
  }

  async testRun(): Promise<{ summary: TestSummary; diagnostics: Diagnostic[] }> {
    const testTool = this.detector.detectTestTool()

    if (!testTool.available) {
      throw new Error('No test tool detected. Looking for: Vitest, Jest, Pytest, Cargo, or Go')
    }

    const cacheKey = `test:${testTool.name}`

    try {
      const result = await this.executeCommand(testTool.command, {
        timeout: 300000, // 5 minutes
        cwd: this.workingDir,
      })

      let diagnostics: Diagnostic[] = []
      let summary: TestSummary

      if (testTool.name === 'vitest' || testTool.name === 'jest') {
        const parsed = DiagnosticParser.parseVitest(result.stdout)
        diagnostics = parsed.diagnostics
        summary = parsed.summary
      } else {
        // Generic parsing for other test runners
        summary = {
          total: 0,
          passed: result.exitCode === 0 ? 1 : 0,
          failed: result.exitCode === 0 ? 0 : 1,
          skipped: 0,
          duration: 0,
          command: testTool.command.join(' '),
        }
      }

      this.cache.set(cacheKey, diagnostics)

      this.emit('diagnosticUpdate', {
        type: 'test',
        timestamp: Date.now(),
        summary: {
          errors: summary.failed,
          warnings: 0,
          affected: Array.from(new Set(diagnostics.map((d) => d.file))),
        },
        cursor: cacheKey,
      })

      return { summary, diagnostics }
    } catch (error: any) {
      throw new Error(`Test failed: ${error.message}`)
    }
  }

  async vcsStatus(): Promise<VcsStatus> {
    if (!existsSync(join(this.workingDir, '.git'))) {
      throw new Error('Not a Git repository')
    }

    try {
      // Get current branch
      const branchResult = await this.executeCommand(['git', 'branch', '--show-current'], { cwd: this.workingDir })
      const branch = branchResult.stdout.trim()

      // Get ahead/behind info
      let ahead = 0,
        behind = 0
      try {
        const statusResult = await this.executeCommand(['git', 'status', '--porcelain=v1', '--branch'], {
          cwd: this.workingDir,
        })
        const branchLine = statusResult.stdout.split('\n')[0]
        const aheadMatch = branchLine.match(/ahead (\d+)/)
        const behindMatch = branchLine.match(/behind (\d+)/)
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)
        if (behindMatch) behind = parseInt(behindMatch[1], 10)
      } catch {
        // Ignore if no remote tracking
      }

      // Get file status
      const statusResult = await this.executeCommand(['git', 'status', '--porcelain'], { cwd: this.workingDir })
      const staged: Array<{ file: string; status: string }> = []
      const unstaged: Array<{ file: string; status: string }> = []
      const untracked: string[] = []

      for (const line of statusResult.stdout.split('\n')) {
        if (line.trim() === '') continue

        const stagedStatus = line[0]
        const unstagedStatus = line[1]
        const file = line.slice(3)

        if (stagedStatus !== ' ' && stagedStatus !== '?') {
          staged.push({ file, status: stagedStatus })
        }

        if (unstagedStatus !== ' ') {
          if (unstagedStatus === '?') {
            untracked.push(file)
          } else {
            unstaged.push({ file, status: unstagedStatus })
          }
        }
      }

      return { branch, ahead, behind, staged, unstaged, untracked }
    } catch (error: any) {
      throw new Error(`Git status failed: ${error.message}`)
    }
  }

  async vcsDiff(path?: string, staged: boolean = false): Promise<string> {
    if (!existsSync(join(this.workingDir, '.git'))) {
      throw new Error('Not a Git repository')
    }

    try {
      const command = ['git', 'diff']
      if (staged) {
        command.push('--staged')
      }
      if (path) {
        command.push('--', path)
      }

      const result = await this.executeCommand(command, { cwd: this.workingDir })
      return result.stdout
    } catch (error: any) {
      throw new Error(`Git diff failed: ${error.message}`)
    }
  }

  async runtimeLogs(
    service?: string,
    lines: number = 100,
    _cursor?: string
  ): Promise<{
    logs: RuntimeLogEntry[]
    nextCursor?: string
  }> {
    // This is a simplified implementation
    // In a real implementation, you would read from actual log files or services

    const logs: RuntimeLogEntry[] = []

    // Try to read from common log locations
    const logPaths = ['logs/app.log', 'var/log/app.log', '.next/trace.log', 'build/logs/build.log']

    for (const logPath of logPaths) {
      const fullPath = join(this.workingDir, logPath)
      if (existsSync(fullPath)) {
        try {
          const content = await readFile(fullPath, 'utf-8')
          const logLines = content.split('\n').slice(-lines)

          for (const line of logLines) {
            if (line.trim()) {
              logs.push({
                timestamp: Date.now(),
                level: this.extractLogLevel(line),
                message: line,
                source: service || basename(logPath),
              })
            }
          }
          break
        } catch {
          // Continue to next log file
        }
      }
    }

    return { logs }
  }

  async graphProject(): Promise<ProjectGraph> {
    const nodes: ProjectGraph['nodes'] = []
    const edges: ProjectGraph['edges'] = []

    // Basic project graph - in a real implementation this would be more sophisticated
    try {
      if (this.detector['packageJson']) {
        const pkg = this.detector['packageJson']

        nodes.push({
          id: pkg.name || 'root',
          type: 'package',
          path: 'package.json',
          dependencies: Object.keys(pkg.dependencies || {}),
        })

        // Add dependency edges
        for (const dep of Object.keys(pkg.dependencies || {})) {
          edges.push({
            from: pkg.name || 'root',
            to: dep,
            type: 'dependency',
          })
        }
      }
    } catch (error) {
      console.error('Failed to build project graph:', error)
    }

    return { nodes, edges }
  }

  // ========================================================================
  // Event Subscription
  // ========================================================================

  diagSubscribe(callback: (event: DiagnosticEvent) => void): () => void {
    const listener = (event: DiagnosticEvent) => callback(event)
    this.on('diagnosticUpdate', listener)

    return () => {
      this.off('diagnosticUpdate', listener)
    }
  }

  // ========================================================================
  // Utilities & Security
  // ========================================================================

  private async executeCommand(
    command: string[],
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // Security: Check if command is allowed
    const baseCommand = command[0]
    if (!this.allowedCommands.has(baseCommand)) {
      throw new Error(`Command '${baseCommand}' is not allowed`)
    }

    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command
      const childProcess = spawn(cmd, args, {
        cwd: options.cwd || this.workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Redact sensitive environment variables from logs
          NODE_AUTH_TOKEN: '***REDACTED***',
          NPM_TOKEN: '***REDACTED***',
          GITHUB_TOKEN: '***REDACTED***',
        },
      })

      let stdout = ''
      let stderr = ''

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })

      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      const timeout = setTimeout(() => {
        childProcess.kill('SIGTERM')
        reject(new Error(`Command timeout: ${command.join(' ')}`))
      }, options.timeout || 30000)

      childProcess.on('close', (code: number) => {
        clearTimeout(timeout)
        resolve({
          stdout: this.redactSensitiveInfo(stdout),
          stderr: this.redactSensitiveInfo(stderr),
          exitCode: code || 0,
        })
      })

      childProcess.on('error', (error: any) => {
        clearTimeout(timeout)
        reject(error)
      })

      // Store process for potential cancellation
      const processId = `${Date.now()}-${Math.random()}`
      this.runningProcesses.set(processId, childProcess)

      childProcess.on('close', () => {
        this.runningProcesses.delete(processId)
      })
    })
  }

  private redactSensitiveInfo(text: string): string {
    // Redact common patterns for tokens, URLs with credentials, etc.
    return text
      .replace(/token[=:]\s*[a-zA-Z0-9_-]{20,}/gi, 'token=***REDACTED***')
      .replace(/password[=:]\s*\S+/gi, 'password=***REDACTED***')
      .replace(/https?:\/\/[^:]+:[^@]+@/g, 'https://***REDACTED***@')
      .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer ***REDACTED***')
  }

  private extractLogLevel(line: string): 'error' | 'warn' | 'info' | 'debug' {
    const lowerLine = line.toLowerCase()
    if (lowerLine.includes('error') || lowerLine.includes('err')) return 'error'
    if (lowerLine.includes('warn') || lowerLine.includes('warning')) return 'warn'
    if (lowerLine.includes('debug')) return 'debug'
    return 'info'
  }

  // ========================================================================
  // File Watching Control Methods
  // ========================================================================

  /**
   * Start monitoring a specific path or the entire working directory
   * Uses intelligent filtering to respect gitignore and prevent EMFILE errors
   */
  startMonitoring(specificPath?: string): void {
    if (this.isWatchingEnabled) {
      console.log(chalk.blue('🔍 IDE diagnostic monitoring already active'))
      return
    }

    const pathToWatch = specificPath ? resolve(this.workingDir, specificPath) : this.workingDir

    try {
      // Create intelligent file filter that respects gitignore and excludes artifacts
      const fileFilter = createFileFilter(this.workingDir, {
        respectGitignore: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB max file size
        maxTotalFiles: 10000, // Reasonable file limit to prevent excessive watchers
        includeExtensions: [], // Include all by default
        excludeExtensions: ['.map', '.min.js', '.min.css', '.bundle.js', '.log', '.tmp', '.temp', '.cache'],
        excludeDirectories: [],
        excludePatterns: [],
        customRules: [],
      })

      // Use FileFilterSystem for intelligent path filtering
      const shouldIgnore = (path: string): boolean => {
        try {
          const filterResult = fileFilter.shouldIncludeFile(path, this.workingDir)
          return !filterResult.allowed
        } catch {
          // If filtering fails, err on the side of caution and ignore
          return true
        }
      }

      // Use chokidar with intelligent filtering and strict limits
      const watcher = require('chokidar').watch(pathToWatch, {
        ignored: shouldIgnore,
        ignoreInitial: true,
        // Critical limits to prevent EMFILE errors
        depth: 6, // Reasonable recursion depth
        usePolling: false, // Use native file events when possible
        atomic: 200, // Debounce file changes more aggressively
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
        // Respect symlinks but don't follow them to prevent loops
        followSymlinks: false,
        // Additional safeguards
        ignorePermissionErrors: true,
        persistent: true,
        // Limit concurrent file operations
        interval: 100,
        binaryInterval: 300,
      })

      // Throttle change events to prevent spam
      let changeTimeout: NodeJS.Timeout | null = null
      const pendingChanges = new Set<string>()

      watcher.on('change', (path: string) => {
        const relativePath = relative(this.workingDir, path)
        pendingChanges.add(relativePath)

        // Throttle cache invalidation and events
        if (changeTimeout) {
          clearTimeout(changeTimeout)
        }

        changeTimeout = setTimeout(() => {
          // Invalidate cache for all changed files
          for (const changedPath of pendingChanges) {
            this.cache.invalidate(changedPath)
          }

          // Emit single event with all changes
          this.emit('diagnosticUpdate', {
            type: 'fs-change',
            timestamp: Date.now(),
            summary: {
              errors: 0,
              warnings: 0,
              affected: Array.from(pendingChanges),
            },
            cursor: `fs:${Date.now()}`,
          })

          pendingChanges.clear()
        }, 500) // 500ms debounce
      })

      // Add error handling for watcher
      watcher.on('error', (error: any) => {
        console.warn(chalk.yellow(`🔍 File watcher error: ${error.message}`))

        // If we get EMFILE or similar, stop monitoring to prevent system issues
        if (error.code === 'EMFILE' || error.code === 'ENFILE') {
          console.error(chalk.red('🔍 Too many open files - stopping monitoring to prevent system issues'))
          this.stopMonitoring()
        }
      })

      // Log when ready
      watcher.on('ready', () => {
        const watcherId = specificPath ? `path:${specificPath}` : 'main'
        this.watchers.set(watcherId, watcher)
        this.isWatchingEnabled = true

        if (specificPath) {
          this.watchedPaths.add(specificPath)
          console.log(chalk.green(`🔍 Started intelligent monitoring: ${specificPath}`))
        } else {
          console.log(chalk.green(`🔍 Started intelligent monitoring: ${this.workingDir}`))
        }
        console.log(chalk.gray(`🔍 Respecting gitignore and excluding artifact folders`))
      })
    } catch (error: any) {
      console.warn(chalk.yellow(`🔍 File watching not available: ${error.message}`))

      // If chokidar is not available, provide fallback
      if (error.code === 'MODULE_NOT_FOUND') {
        console.log(chalk.gray('🔍 Install chokidar for file monitoring: npm install chokidar'))
      }
    }
  }

  /**
   * Stop monitoring completely
   */
  stopMonitoring(): void {
    if (!this.isWatchingEnabled) {
      console.log(chalk.gray('🔍 IDE diagnostic monitoring already inactive'))
      return
    }

    for (const [watcherId, watcher] of this.watchers.entries()) {
      try {
        if (watcher?.close) {
          watcher.close()
        }
      } catch (error) {
        console.warn(chalk.yellow(`Failed to close watcher ${watcherId}:`, error))
      }
    }

    this.watchers.clear()
    this.watchedPaths.clear()
    this.isWatchingEnabled = false

    console.log(chalk.red('🔍 Stopped all diagnostic monitoring'))
  }

  /**
   * Stop monitoring a specific path
   */
  stopMonitoringPath(specificPath: string): void {
    const watcherId = `path:${specificPath}`
    const watcher = this.watchers.get(watcherId)

    if (watcher) {
      try {
        if (watcher.close) {
          watcher.close()
        }
        this.watchers.delete(watcherId)
        this.watchedPaths.delete(specificPath)
        console.log(chalk.yellow(`🔍 Stopped monitoring: ${specificPath}`))

        // If no more watchers, set isWatchingEnabled to false
        if (this.watchers.size === 0) {
          this.isWatchingEnabled = false
        }
      } catch (error) {
        console.warn(chalk.yellow(`Failed to stop monitoring ${specificPath}:`, error))
      }
    } else {
      console.log(chalk.gray(`🔍 Path ${specificPath} was not being monitored`))
    }
  }

  /**
   * Get current monitoring status
   */
  getMonitoringStatus(): {
    enabled: boolean
    watchedPaths: string[]
    totalWatchers: number
  } {
    return {
      enabled: this.isWatchingEnabled,
      watchedPaths: Array.from(this.watchedPaths),
      totalWatchers: this.watchers.size,
    }
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  async shutdown(): Promise<void> {
    // Kill running processes
    for (const process of this.runningProcesses.values()) {
      try {
        process.kill('SIGTERM')
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.runningProcesses.clear()

    // Close file watchers
    for (const watcher of this.watchers.values()) {
      try {
        if (watcher.close) {
          await watcher.close()
        }
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.watchers.clear()

    this.removeAllListeners()
  }

  // ========================================================================
  // Health & Debug
  // ========================================================================

  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: {
      buildTool: string
      lintTool: string
      testTool: string
      cacheSize: number
      runningProcesses: number
    }
  } {
    const buildTool = this.detector.detectBuildTool()
    const lintTool = this.detector.detectLintTool()
    const testTool = this.detector.detectTestTool()

    const details = {
      buildTool: buildTool.available ? buildTool.name : 'none',
      lintTool: lintTool.available ? lintTool.name : 'none',
      testTool: testTool.available ? testTool.name : 'none',
      cacheSize: this.cache['cache'].size,
      runningProcesses: this.runningProcesses.size,
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

    if (!buildTool.available && !lintTool.available && !testTool.available) {
      status = 'unhealthy'
    } else if (!buildTool.available || !lintTool.available) {
      status = 'degraded'
    }

    return { status, details }
  }
}

// ============================================================================
// MCP Server Interface
// ============================================================================

export interface McpRequest {
  method: string
  params?: any
  id?: string
}

export interface McpResponse {
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
  id?: string
}

export class IDEDiagnosticMcpServer {
  private server: IDEDiagnosticServer

  constructor(workingDir?: string) {
    this.server = new IDEDiagnosticServer(workingDir)
  }

  async handleRequest(request: McpRequest): Promise<McpResponse> {
    try {
      const { method, params = {}, id } = request

      let result: any

      switch (method) {
        case 'diag.list':
          result = await this.server.diagList(params)
          break

        case 'diag.get':
          if (!params.file) {
            throw new Error('file parameter is required')
          }
          result = await this.server.diagGet(params.file, params.line)
          break

        case 'build.run':
          result = await this.server.buildRun()
          break

        case 'lint.run':
          result = await this.server.lintRun()
          break

        case 'test.run':
          result = await this.server.testRun()
          break

        case 'vcs.status':
          result = await this.server.vcsStatus()
          break

        case 'vcs.diff':
          result = await this.server.vcsDiff(params.path, params.staged)
          break

        case 'runtime.logs':
          result = await this.server.runtimeLogs(params.service, params.lines, params.cursor)
          break

        case 'graph.project':
          result = await this.server.graphProject()
          break

        case 'diag.subscribe':
          // For subscription, return subscription info
          result = {
            subscribed: true,
            events: ['fs-change', 'build', 'lint', 'test', 'runtime', 'vcs'],
          }
          break

        case 'monitor.start':
          this.server.startMonitoring(params.path)
          result = { status: 'started', path: params.path || 'entire project' }
          break

        case 'monitor.stop':
          if (params.path) {
            this.server.stopMonitoringPath(params.path)
          } else {
            this.server.stopMonitoring()
          }
          result = { status: 'stopped', path: params.path || 'all paths' }
          break

        case 'monitor.status':
          result = this.server.getMonitoringStatus()
          break

        case 'ping':
          result = { status: 'pong', timestamp: Date.now() }
          break

        case 'health':
          result = this.server.getHealth()
          break

        default:
          throw new Error(`Unknown method: ${method}`)
      }

      return { result, id }
    } catch (error: any) {
      return {
        error: {
          code: -32000,
          message: error.message,
          data: { method: request.method },
        },
        id: request.id,
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.server.shutdown()
  }

  // Subscribe to events
  subscribe(callback: (event: DiagnosticEvent) => void): () => void {
    return this.server.diagSubscribe(callback)
  }
}

// Singleton export removed - server will be created on demand only
// Use McpClient to get the IDE diagnostic server when needed
