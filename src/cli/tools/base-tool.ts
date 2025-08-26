export interface ToolExecutionResult {
  success: boolean;
  data: any;
  error?: string;
  metadata: {
    executionTime: number;
    toolName: string;
    parameters: any;
  };
}

export abstract class BaseTool {
  protected name: string;
  
  constructor(name: string, protected workingDirectory: string) {
    this.name = name;
  }

  abstract execute(...args: any[]): Promise<ToolExecutionResult>;

  /**
   * Verifica se un percorso è sicuro (dentro working directory)
   */
  protected isPathSafe(path: string): boolean {
    const fs = require('fs');
    const pathModule = require('path');
    
    try {
      const resolvedPath = pathModule.resolve(path);
      const resolvedWorkingDir = pathModule.resolve(this.workingDirectory);
      
      return resolvedPath.startsWith(resolvedWorkingDir);
    } catch (error) {
      return false;
    }
  }

  /**
   * Ottiene il nome del tool
   */
  getName(): string {
    return this.name;
  }

  /**
   * Ottiene la working directory
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}
