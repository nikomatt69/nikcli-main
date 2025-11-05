/**
 * Workspace and Project Types
 */

export interface Repository {
  id: string
  name: string
  fullName: string
  owner: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  lastUpdated?: Date | string
}

export interface Workspace {
  id: string
  name: string
  path: string
  repository?: Repository
  isActive: boolean
  createdAt: Date | string
  environment?: EnvironmentConfig
}

export interface EnvironmentConfig {
  snapshot?: 'auto' | 'manual' | 'disabled'
  install?: string
  start?: string
  terminals?: TerminalConfig[]
  secrets?: string[]
  node?: string
  cache?: string[]
  policies?: EnvironmentPolicies
}

export interface TerminalConfig {
  name: string
  command: string
  autoStart?: boolean
}

export interface EnvironmentPolicies {
  maxMemoryMB?: number
  maxCpuPercent?: number
  networkPolicy?: 'restricted' | 'allow' | 'deny'
  allowedDomains?: string[]
  timeoutMinutes?: number
  allowedCommands?: string[]
  blockedCommands?: string[]
  maxFileSize?: number
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  children?: FileNode[]
  isExpanded?: boolean
}

export interface RAGIndexStatus {
  isIndexed: boolean
  totalFiles: number
  indexedFiles: number
  lastIndexed?: Date | string
  vectorStore: 'local' | 'upstash' | 'chromadb'
  embeddingsCost: number
}
