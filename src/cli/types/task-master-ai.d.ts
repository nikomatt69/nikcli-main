declare module 'task-master-ai' {
  export interface InitProjectOptions {
    projectPath?: string
    apiKey?: string
    [key: string]: any
  }

  export function initProject(options?: InitProjectOptions): Promise<any>
  export function runInitCLI(options?: InitProjectOptions): Promise<any>
  export const version: string
  export const devScriptPath: string
}