// src/cli/bridge/workspace-bridge.ts
// Workspace bridge agent - connects local workspace to cloud API

import { WebSocket } from 'ws'
import { EventEmitter } from 'node:events'
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve, relative } from 'node:path'
import { nanoid } from 'nanoid'

const execAsync = promisify(exec)

export interface BridgeConfig {
  cloudUrl: string
  accessToken: string
  workspaceId: string
  workspacePath: string
  allowedCommands?: string[]
  maxFileSize?: number // bytes
  reconnectInterval?: number // ms
}

export interface BridgeMessage {
  id: string
  type:
    | 'ping'
    | 'pong'
    | 'file:read'
    | 'file:write'
    | 'file:list'
    | 'file:stat'
    | 'command:execute'
    | 'response'
    | 'error'
  workspaceId: string
  payload?: any
  timestamp: string
}

/**
 * Workspace Bridge - Connects local workspace to cloud API
 * Provides secure access to local file system and command execution
 */
export class WorkspaceBridge extends EventEmitter {
  private ws?: WebSocket
  private config: Required<BridgeConfig>
  private isConnected = false
  private reconnectTimeout?: NodeJS.Timeout
  private heartbeatInterval?: NodeJS.Timeout
  private pendingRequests: Map<string, {
    resolve: (value: any) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }> = new Map()

  constructor(config: BridgeConfig) {
    super()

    this.config = {
      cloudUrl: config.cloudUrl,
      accessToken: config.accessToken,
      workspaceId: config.workspaceId,
      workspacePath: resolve(config.workspacePath),
      allowedCommands: config.allowedCommands || [
        'git',
        'npm',
        'yarn',
        'pnpm',
        'bun',
        'node',
        'deno',
        'docker',
        'make',
        'cargo',
        'go',
      ],
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      reconnectInterval: config.reconnectInterval || 5000, // 5s
    }
  }

  /**
   * Connect to cloud API
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected')
    }

    const wsUrl = this.config.cloudUrl.replace(/^http/, 'ws') + '/bridge/ws'

    console.log(`🔗 Connecting workspace bridge to: ${wsUrl}`)

    this.ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'X-Workspace-Id': this.config.workspaceId,
      },
    })

    this.ws.on('open', () => {
      this.isConnected = true
      this.emit('connected')
      console.log(`🔗 ✓ Workspace bridge connected!`)
      console.log(`   Workspace: ${this.config.workspacePath}`)
      console.log(`   ID: ${this.config.workspaceId}`)
      this.startHeartbeat()
    })

    this.ws.on('message', async (data: Buffer) => {
      try {
        const message: BridgeMessage = JSON.parse(data.toString('utf-8'))
        await this.handleMessage(message)
      } catch (error) {
        console.error('Error handling bridge message:', error)
      }
    })

    this.ws.on('close', () => {
      this.isConnected = false
      this.emit('disconnected')
      console.log('🔗 Workspace bridge disconnected')
      this.stopHeartbeat()
      this.scheduleReconnect()
    })

    this.ws.on('error', (error: Error) => {
      console.error('🔗 Workspace bridge error:', error)
      this.emit('error', error)
    })

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 10000)

      this.once('connected', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * Disconnect from cloud API
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = undefined
    }

    this.isConnected = false
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(message: BridgeMessage): Promise<void> {
    // Check if it's a response to a pending request
    if (message.type === 'response' || message.type === 'error') {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(message.id)

        if (message.type === 'response') {
          pending.resolve(message.payload)
        } else {
          pending.reject(new Error(message.payload?.message || 'Unknown error'))
        }
      }
      return
    }

    // Handle request
    try {
      let response: any

      switch (message.type) {
        case 'ping':
          response = { pong: true }
          break

        case 'file:read':
          response = await this.handleFileRead(message.payload)
          break

        case 'file:write':
          response = await this.handleFileWrite(message.payload)
          break

        case 'file:list':
          response = await this.handleFileList(message.payload)
          break

        case 'file:stat':
          response = await this.handleFileStat(message.payload)
          break

        case 'command:execute':
          response = await this.handleCommandExecute(message.payload)
          break

        default:
          throw new Error(`Unknown message type: ${message.type}`)
      }

      // Send response
      this.send({
        id: message.id,
        type: 'response',
        workspaceId: this.config.workspaceId,
        payload: response,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      // Send error response
      this.send({
        id: message.id,
        type: 'error',
        workspaceId: this.config.workspaceId,
        payload: {
          message: error instanceof Error ? error.message : String(error),
        },
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * Handle file read request
   */
  private async handleFileRead(payload: { path: string }): Promise<{ content: string }> {
    const fullPath = this.resolvePath(payload.path)
    await this.validatePath(fullPath)

    const stats = await stat(fullPath)
    if (stats.size > this.config.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`)
    }

    const content = await readFile(fullPath, 'utf-8')
    return { content }
  }

  /**
   * Handle file write request
   */
  private async handleFileWrite(payload: { path: string; content: string }): Promise<{ success: boolean }> {
    const fullPath = this.resolvePath(payload.path)
    await this.validatePath(fullPath)

    if (Buffer.byteLength(payload.content, 'utf-8') > this.config.maxFileSize) {
      throw new Error('Content too large')
    }

    await writeFile(fullPath, payload.content, 'utf-8')
    return { success: true }
  }

  /**
   * Handle file list request
   */
  private async handleFileList(payload: { path?: string }): Promise<{ files: Array<{ name: string; type: string }> }> {
    const fullPath = this.resolvePath(payload.path || '.')
    await this.validatePath(fullPath)

    const entries = await readdir(fullPath, { withFileTypes: true })
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    }))

    return { files }
  }

  /**
   * Handle file stat request
   */
  private async handleFileStat(payload: { path: string }): Promise<{
    size: number
    isDirectory: boolean
    isFile: boolean
    modified: string
  }> {
    const fullPath = this.resolvePath(payload.path)
    await this.validatePath(fullPath)

    const stats = await stat(fullPath)
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime.toISOString(),
    }
  }

  /**
   * Handle command execute request
   */
  private async handleCommandExecute(payload: { command: string; cwd?: string }): Promise<{
    stdout: string
    stderr: string
    exitCode: number
  }> {
    // Validate command
    const commandName = payload.command.split(' ')[0]
    if (!this.config.allowedCommands.includes(commandName)) {
      throw new Error(`Command not allowed: ${commandName}`)
    }

    const cwd = payload.cwd ? this.resolvePath(payload.cwd) : this.config.workspacePath
    await this.validatePath(cwd)

    try {
      const { stdout, stderr } = await execAsync(payload.command, {
        cwd,
        timeout: 60000, // 60s timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB max buffer
      })

      return {
        stdout,
        stderr,
        exitCode: 0,
      }
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
      }
    }
  }

  /**
   * Resolve path relative to workspace
   */
  private resolvePath(path: string): string {
    const resolved = resolve(this.config.workspacePath, path)
    return resolved
  }

  /**
   * Validate path is within workspace
   */
  private async validatePath(path: string): Promise<void> {
    const rel = relative(this.config.workspacePath, path)
    if (rel.startsWith('..') || resolve(path) === resolve(rel)) {
      throw new Error('Path outside workspace')
    }
  }

  /**
   * Send message to cloud
   */
  private send(message: BridgeMessage): void {
    if (!this.ws || !this.isConnected) {
      throw new Error('Not connected')
    }

    const json = JSON.stringify(message)
    this.ws.send(json)
  }

  /**
   * Send request and wait for response
   */
  private async request(type: string, payload: any, timeout = 30000): Promise<any> {
    if (!this.ws || !this.isConnected) {
      throw new Error('Not connected')
    }

    const id = nanoid()
    const message: BridgeMessage = {
      id,
      type: type as any,
      workspaceId: this.config.workspaceId,
      payload,
      timestamp: new Date().toISOString(),
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error('Request timeout'))
      }, timeout)

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutHandle,
      })

      this.send(message)
    })
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({
          id: nanoid(),
          type: 'ping',
          workspaceId: this.config.workspaceId,
          timestamp: new Date().toISOString(),
        })
      }
    }, 30000) // 30s
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }
  }

  /**
   * Schedule reconnect
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return
    }

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = undefined
      console.log('🔗 Attempting to reconnect...')
      try {
        await this.connect()
      } catch (error) {
        console.error('🔗 Reconnection failed:', error)
      }
    }, this.config.reconnectInterval)
  }
}
