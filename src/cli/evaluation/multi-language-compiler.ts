import { spawn } from 'child_process'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import chalk from 'chalk'

export type SupportedLanguage = 'typescript' | 'python' | 'rust' | 'solidity'

export interface CompilationResult {
  success: boolean
  language: SupportedLanguage
  exitCode: number | null
  stdout: string
  stderr: string
  duration: number
  timestamp: Date
  outputPath?: string
}

/**
 * Multi-language compiler for benchmark tasks
 * Supports TypeScript, Python, Rust, and Solidity
 */
export class MultiLanguageCompiler {
  private workDir: string

  constructor(workDir: string) {
    this.workDir = workDir
  }

  /**
   * Compile TypeScript to JavaScript
   */
  private async compileTypeScript(): Promise<CompilationResult> {
    const startTime = Date.now()
    const stdout: string[] = []
    const stderr: string[] = []

    return new Promise((resolve) => {
      const tsc = spawn('npx', ['tsc', '--project', 'tsconfig.json'], {
        cwd: this.workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      tsc.stdout?.on('data', (data) => stdout.push(data.toString()))
      tsc.stderr?.on('data', (data) => stderr.push(data.toString()))

      tsc.on('close', (code) => {
        resolve({
          success: code === 0,
          language: 'typescript',
          exitCode: code,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          duration: Date.now() - startTime,
          timestamp: new Date(),
        })
      })

      tsc.on('error', (err) => {
        resolve({
          success: false,
          language: 'typescript',
          exitCode: 1,
          stdout: stdout.join(''),
          stderr: `Error spawning tsc: ${err.message}`,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        })
      })
    })
  }

  /**
   * Validate Python syntax (no true compilation, but syntax check)
   */
  private async compilePython(): Promise<CompilationResult> {
    const startTime = Date.now()
    const stdout: string[] = []
    const stderr: string[] = []

    return new Promise((resolve) => {
      const python = spawn('python3', ['-m', 'py_compile', '.'], {
        cwd: this.workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      python.stdout?.on('data', (data) => stdout.push(data.toString()))
      python.stderr?.on('data', (data) => stderr.push(data.toString()))

      python.on('close', (code) => {
        resolve({
          success: code === 0,
          language: 'python',
          exitCode: code,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          duration: Date.now() - startTime,
          timestamp: new Date(),
        })
      })

      python.on('error', (err) => {
        resolve({
          success: false,
          language: 'python',
          exitCode: 1,
          stdout: stdout.join(''),
          stderr: `Error spawning python3: ${err.message}`,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        })
      })
    })
  }

  /**
   * Compile Rust code
   */
  private async compileRust(): Promise<CompilationResult> {
    const startTime = Date.now()
    const stdout: string[] = []
    const stderr: string[] = []

    return new Promise((resolve) => {
      const cargo = spawn('cargo', ['build', '--release'], {
        cwd: this.workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      cargo.stdout?.on('data', (data) => stdout.push(data.toString()))
      cargo.stderr?.on('data', (data) => stderr.push(data.toString()))

      cargo.on('close', (code) => {
        resolve({
          success: code === 0,
          language: 'rust',
          exitCode: code,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          duration: Date.now() - startTime,
          timestamp: new Date(),
          outputPath: join(this.workDir, 'target', 'release'),
        })
      })

      cargo.on('error', (err) => {
        resolve({
          success: false,
          language: 'rust',
          exitCode: 1,
          stdout: stdout.join(''),
          stderr: `Error spawning cargo: ${err.message}`,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        })
      })
    })
  }

  /**
   * Compile Solidity contracts
   */
  private async compileSolidity(): Promise<CompilationResult> {
    const startTime = Date.now()
    const stdout: string[] = []
    const stderr: string[] = []

    return new Promise((resolve) => {
      // Try forge first (Foundry)
      const forge = spawn('forge', ['build'], {
        cwd: this.workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      forge.stdout?.on('data', (data) => stdout.push(data.toString()))
      forge.stderr?.on('data', (data) => stderr.push(data.toString()))

      forge.on('close', (code) => {
        resolve({
          success: code === 0,
          language: 'solidity',
          exitCode: code,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
          duration: Date.now() - startTime,
          timestamp: new Date(),
          outputPath: join(this.workDir, 'out'),
        })
      })

      forge.on('error', (err) => {
        resolve({
          success: false,
          language: 'solidity',
          exitCode: 1,
          stdout: stdout.join(''),
          stderr: `Error spawning forge: ${err.message}`,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        })
      })
    })
  }

  /**
   * Compile code based on language
   */
  async compile(language: SupportedLanguage): Promise<CompilationResult> {
    console.log(chalk.blue(`📦 Compiling ${language}...`))

    switch (language) {
      case 'typescript':
        return this.compileTypeScript()
      case 'python':
        return this.compilePython()
      case 'rust':
        return this.compileRust()
      case 'solidity':
        return this.compileSolidity()
      default:
        return {
          success: false,
          language,
          exitCode: 1,
          stdout: '',
          stderr: `Unknown language: ${language}`,
          duration: 0,
          timestamp: new Date(),
        }
    }
  }

  /**
   * Get compilation report
   */
  getCompilationReport(result: CompilationResult): string {
    return [
      chalk.bold(`Compilation Report: ${result.language.toUpperCase()}`),
      `Status: ${result.success ? chalk.green('✓ SUCCESS') : chalk.red('✖ FAILED')}`,
      `Exit Code: ${result.exitCode}`,
      `Duration: ${result.duration}ms`,
      result.stdout ? `\nOutput:\n${result.stdout}` : '',
      result.stderr ? `\nErrors:\n${result.stderr}` : '',
    ]
      .filter((line) => line.length > 0)
      .join('\n')
  }
}

/**
 * Factory for creating compiler instances
 */
export function createCompiler(workDir: string): MultiLanguageCompiler {
  return new MultiLanguageCompiler(workDir)
}
