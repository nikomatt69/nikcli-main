import { PathResolver } from '../utils/path-resolver'

export interface ToolExecutionResult {
  success: boolean
  data: any
  error?: string
  metadata: {
    executionTime: number
    toolName: string
    parameters: any
  }
}

export abstract class BaseTool {
  protected name: string
  protected pathResolver: PathResolver

  constructor(
    name: string,
    protected workingDirectory: string
  ) {
    this.name = name
    this.pathResolver = new PathResolver(workingDirectory)
  }

  abstract execute(...args: any[]): Promise<ToolExecutionResult>

  /**
   * Verifica se un percorso è sicuro (dentro working directory)
   * Uses PathResolver for consistent behavior across all tools
   */
  protected isPathSafe(path: string): boolean {
    try {
      const resolved = this.pathResolver.resolve(path)
      return this.pathResolver.isWithinWorkingDirectory(resolved.absolutePath)
    } catch {
      return false
    }
  }

  /**
   * Resolve a path safely within working directory
   */
  protected resolvePath(path: string) {
    return this.pathResolver.resolve(path)
  }

  /**
   * Ottiene il nome del tool
   */
  getName(): string {
    return this.name
  }

  /**
   * Ottiene la working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  /**
   * Aggiorna la working directory
   */
  updateWorkingDirectory(newDir: string): void {
    this.workingDirectory = newDir
    this.pathResolver = new PathResolver(newDir)
  }
}
