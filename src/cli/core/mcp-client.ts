import { type ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import http from 'node:http'
import https from 'node:https'
import chalk from 'chalk'
import { IDEDiagnosticMcpServer } from '../mcp/ide-diagnostic-server'
import { completionCache } from './completion-protocol-cache'
import { simpleConfigManager } from './config-manager'

// Claude Code/OpenCode compatible MCP server configuration
export interface ClaudeCodeMcpServer {
  type: 'local' | 'remote'
  enabled: boolean
  // Local server properties
  command?: string[]
  environment?: Record<string, string>
  // Remote server properties
  url?: string
  headers?: Record<string, string>
  // Extended NikCLI properties
  timeout?: number
  retries?: number
  priority?: number
  capabilities?: string[]
}

// Legacy MCP server configuration (for backward compatibility)
export interface LegacyMcpServerConfig {
  name: string
  type: 'http' | 'websocket' | 'command' | 'stdio'
  endpoint?: string // For HTTP/WebSocket
  command?: string // For command-based servers
  args?: string[] // Command arguments
  headers?: Record<string, string> // HTTP headers
  timeout?: number // Request timeout in ms
  retries?: number // Max retries
  healthCheck?: string // Health check endpoint
  enabled: boolean
  priority?: number // Higher priority servers are preferred
  capabilities?: string[] // What this server can do
  authentication?: {
    type: 'bearer' | 'basic' | 'api_key'
    token?: string
    username?: string
    password?: string
    apiKey?: string
    header?: string // For API key header name
  }
}

// Unified server configuration for internal use
export interface McpServerConfig {
  name: string
  type: 'local' | 'remote' | 'http' | 'websocket' | 'command' | 'stdio'
  enabled: boolean
  // Local/Command properties
  command?: string | string[]
  args?: string[]
  environment?: Record<string, string>
  // Remote/HTTP properties
  url?: string
  endpoint?: string
  headers?: Record<string, string>
  // Common properties
  timeout?: number
  retries?: number
  priority?: number
  capabilities?: string[]
  // Legacy authentication
  authentication?: {
    type: 'bearer' | 'basic' | 'api_key'
    token?: string
    username?: string
    password?: string
    apiKey?: string
    header?: string
  }
}

export interface McpRequest {
  method: string
  params?: any
  id?: string
  serverName?: string
}

export interface McpResponse {
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
  id?: string
  fromCache?: boolean
  serverName?: string
  executionTime?: number
}

/**
 * Enhanced MCP Client with connection pooling, caching, and robust error handling
 */
export class McpClient extends EventEmitter {
  private configManager = simpleConfigManager
  private connections: Map<string, ChildProcess | any> = new Map()
  private connectionPools: Map<string, any[]> = new Map()
  private healthStatus: Map<string, boolean> = new Map()
  private requestQueue: Map<string, McpRequest[]> = new Map()
  private retryAttempts: Map<string, number> = new Map()
  private lastHealthCheck: Map<string, number> = new Map()
  private defaultServers: Map<string, IDEDiagnosticMcpServer> = new Map()

  private readonly DEFAULT_TIMEOUT = 30000 // 30 seconds
  private readonly DEFAULT_RETRIES = 3
  private readonly HEALTH_CHECK_INTERVAL = 60000 // 1 minute
  private readonly MAX_POOL_SIZE = 5

  constructor() {
    super()
    this.initializeDefaultServers()
    this.startHealthChecker()
  }

  /**
   * Initialize default MCP servers that are always available
   */
  private initializeDefaultServers(): void {
    // No default servers are initialized automatically anymore
    // IDE diagnostic server will be initialized only on demand
    console.log(chalk.blue('🔧 MCP client ready - servers will be initialized on demand'))
  }

  /**
   * Get or create IDE diagnostic server on demand
   */
  private getOrCreateIdeDiagnosticServer(): IDEDiagnosticMcpServer {
    let ideServer = this.defaultServers.get('ide-diagnostic')
    if (!ideServer) {
      ideServer = new IDEDiagnosticMcpServer()
      this.defaultServers.set('ide-diagnostic', ideServer)
    }
    return ideServer
  }

  /**
   * Get configured MCP servers (supports both Claude Code/OpenCode and legacy formats)
   */
  getConfiguredServers(): McpServerConfig[] {
    const servers: McpServerConfig[] = []

    // Add default servers first with highest priority
    servers.push({
      name: 'ide-diagnostic',
      type: 'local',
      enabled: true,
      priority: 1000, // Highest priority
      capabilities: ['diagnostic', 'build', 'lint', 'test', 'vcs', 'runtime', 'project-analysis'],
    })

    // Load new Claude Code/OpenCode compatible format
    const mcpConfig = (this.configManager.get('mcp') as Record<string, ClaudeCodeMcpServer>) || {}
    for (const [name, server] of Object.entries(mcpConfig)) {
      if (server.enabled) {
        servers.push(this.convertClaudeCodeServer(name, server))
      }
    }

    // Load legacy format for backward compatibility
    const legacyConfig = (this.configManager.get('mcpServers') as Record<string, LegacyMcpServerConfig>) || {}
    for (const [_name, server] of Object.entries(legacyConfig)) {
      if (server.enabled) {
        servers.push(this.convertLegacyServer(server))
      }
    }

    // Sort by priority (higher priority first)
    return servers.sort((a, b) => (b.priority || 0) - (a.priority || 0))
  }

  /**
   * Convert Claude Code format to unified format
   */
  private convertClaudeCodeServer(name: string, server: ClaudeCodeMcpServer): McpServerConfig {
    return {
      name,
      type: server.type,
      enabled: server.enabled,
      command: server.command,
      environment: server.environment,
      url: server.url,
      headers: server.headers,
      timeout: server.timeout,
      retries: server.retries,
      priority: server.priority,
      capabilities: server.capabilities,
    }
  }

  /**
   * Convert legacy format to unified format
   */
  private convertLegacyServer(server: LegacyMcpServerConfig): McpServerConfig {
    return {
      name: server.name,
      type: server.type,
      enabled: server.enabled,
      command: server.command,
      args: server.args,
      endpoint: server.endpoint,
      headers: server.headers,
      timeout: server.timeout,
      retries: server.retries,
      priority: server.priority,
      capabilities: server.capabilities,
      authentication: server.authentication,
    }
  }

  /**
   * Call the specified MCP server with caching and error handling
   */
  async call(serverName: string, request: McpRequest): Promise<McpResponse> {
    const startTime = Date.now()

    try {
      // Check cache first for GET-like operations
      if (this.isCacheable(request)) {
        const cacheKey = this.generateCacheKey(serverName, request)
        const cachedResponse = await completionCache.getCompletion({
          prefix: cacheKey,
          context: JSON.stringify(request.params || {}),
          maxTokens: 1000,
          temperature: 0,
          model: 'mcp-cache',
        })

        if (cachedResponse) {
          console.log(chalk.green(`🎯 MCP Cache Hit: ${serverName}`))
          return {
            result: JSON.parse(cachedResponse.completion),
            fromCache: true,
            serverName,
            executionTime: Date.now() - startTime,
          }
        }
      }

      // Get server configuration
      const server = await this.getServerConfig(serverName)
      if (!server) {
        throw new Error(`MCP server '${serverName}' not found or disabled`)
      }

      // Check server health
      if (!(await this.checkServerHealth(serverName))) {
        throw new Error(`MCP server '${serverName}' is unhealthy`)
      }

      // Execute the request
      const response = await this.executeRequest(server, request)

      // Cache successful responses
      if (response.result && this.isCacheable(request)) {
        const cacheKey = this.generateCacheKey(serverName, request)
        await completionCache.storeCompletion(
          {
            prefix: cacheKey,
            context: JSON.stringify(request.params || {}),
            maxTokens: 1000,
            temperature: 0,
            model: 'mcp-cache',
          },
          JSON.stringify(response.result)
        )
      }

      console.log(chalk.blue(`🔮 MCP Call: ${serverName} (${Date.now() - startTime}ms)`))

      return {
        ...response,
        serverName,
        executionTime: Date.now() - startTime,
      }
    } catch (error: any) {
      console.log(chalk.red(`✖ MCP Error: ${serverName} - ${error.message}`))

      // Attempt retry logic
      const retryCount = this.retryAttempts.get(serverName) || 0
      const server = await this.getServerConfig(serverName)
      const maxRetries = server?.retries || this.DEFAULT_RETRIES

      if (retryCount < maxRetries) {
        this.retryAttempts.set(serverName, retryCount + 1)
        console.log(chalk.yellow(`⚡︎ Retrying MCP call to ${serverName} (${retryCount + 1}/${maxRetries})`))

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 2 ** retryCount * 1000))

        return this.call(serverName, request)
      }

      this.retryAttempts.delete(serverName)
      throw error
    }
  }

  /**
   * Execute request based on server type (supports both new and legacy formats)
   */
  private async executeRequest(server: McpServerConfig, request: McpRequest): Promise<McpResponse> {
    // Check if this is a default server first
    if (this.defaultServers.has(server.name)) {
      return this.executeDefaultServerRequest(server, request)
    }

    switch (server.type) {
      case 'remote':
        return this.executeRemoteRequest(server, request)
      case 'local':
        return this.executeLocalRequest(server, request)
      case 'http':
        return this.executeHttpRequest(server, request)
      case 'websocket':
        return this.executeWebSocketRequest(server, request)
      case 'command':
      case 'stdio':
        return this.executeCommandRequest(server, request)
      default:
        throw new Error(`Unsupported MCP server type: ${server.type}`)
    }
  }

  /**
   * Execute request on default built-in servers
   */
  private async executeDefaultServerRequest(server: McpServerConfig, request: McpRequest): Promise<McpResponse> {
    let defaultServer

    // Special handling for ide-diagnostic server - create on demand
    if (server.name === 'ide-diagnostic') {
      defaultServer = this.getOrCreateIdeDiagnosticServer()
    } else {
      defaultServer = this.defaultServers.get(server.name)
      if (!defaultServer) {
        throw new Error(`Default server '${server.name}' not found`)
      }
    }

    try {
      return await defaultServer.handleRequest(request)
    } catch (error: any) {
      throw new Error(`Default server '${server.name}' error: ${error.message}`)
    }
  }

  /**
   * Execute remote MCP request (Claude Code/OpenCode format)
   */
  private async executeRemoteRequest(server: McpServerConfig, request: McpRequest): Promise<McpResponse> {
    if (!server.url) {
      throw new Error('Remote server requires URL configuration')
    }

    const url = new URL(server.url)
    const isHttps = url.protocol === 'https:'
    const httpModule = isHttps ? https : http

    // Prepare request payload
    const payload = {
      jsonrpc: '2.0',
      id: request.id || Date.now().toString(),
      method: request.method,
      params: request.params,
    }

    // Prepare headers (Claude Code format)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'NikCLI-MCP-Client/1.0',
      ...server.headers,
    }

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload)
      headers['Content-Length'] = Buffer.byteLength(postData).toString()

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: server.timeout || this.DEFAULT_TIMEOUT,
      }

      const req = httpModule.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const response = JSON.parse(data)

            if (response.error) {
              reject(new Error(`MCP Error: ${response.error.message}`))
            } else {
              resolve({ result: response.result, id: response.id })
            }
          } catch (_error) {
            reject(new Error('Invalid JSON response from MCP server'))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('MCP request timeout'))
      })

      req.write(postData)
      req.end()
    })
  }

  /**
   * Execute local MCP request (Claude Code format)
   */
  private async executeLocalRequest(server: McpServerConfig, request: McpRequest): Promise<McpResponse> {
    if (!server.command || !Array.isArray(server.command) || server.command.length === 0) {
      throw new Error('Local server requires command array configuration')
    }

    const payload = {
      jsonrpc: '2.0',
      id: request.id || Date.now().toString(),
      method: request.method,
      params: request.params,
    }

    return new Promise((resolve, reject) => {
      const [command, ...args] = server.command as string[]

      // Set up environment variables
      const env = {
        ...process.env,
        ...server.environment,
      }

      const process_spawn = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      })

      let stdout = ''
      let stderr = ''

      process_spawn.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      process_spawn.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      process_spawn.on('close', (code) => {
        if (code === 0) {
          try {
            const response = JSON.parse(stdout)
            if (response.error) {
              reject(new Error(`MCP Local Error: ${response.error.message}`))
            } else {
              resolve({ result: response.result, id: response.id })
            }
          } catch (_error) {
            reject(new Error('Invalid JSON response from MCP local server'))
          }
        } else {
          reject(new Error(`MCP local server failed with code ${code}: ${stderr}`))
        }
      })

      process_spawn.on('error', reject)

      // Send request
      process_spawn.stdin.write(JSON.stringify(payload))
      process_spawn.stdin.end()

      // Timeout handling
      setTimeout(() => {
        if (!process_spawn.killed) {
          process_spawn.kill()
          reject(new Error('MCP local server timeout'))
        }
      }, server.timeout || this.DEFAULT_TIMEOUT)
    })
  }

  /**
   * Execute HTTP-based MCP request
   */
  private async executeHttpRequest(server: McpServerConfig, request: McpRequest): Promise<McpResponse> {
    if (!server.endpoint) {
      throw new Error('HTTP server requires endpoint configuration')
    }

    const url = new URL(server.endpoint)
    const isHttps = url.protocol === 'https:'
    const httpModule = isHttps ? https : http

    // Prepare request payload
    const payload = {
      jsonrpc: '2.0',
      id: request.id || Date.now().toString(),
      method: request.method,
      params: request.params,
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'NikCLI-MCP-Client/1.0',
      ...server.headers,
    }

    // Add authentication
    if (server.authentication) {
      this.addAuthHeaders(headers, server.authentication)
    }

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(payload)
      headers['Content-Length'] = Buffer.byteLength(postData).toString()

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: server.timeout || this.DEFAULT_TIMEOUT,
      }

      const req = httpModule.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            const response = JSON.parse(data)

            if (response.error) {
              reject(new Error(`MCP Error: ${response.error.message}`))
            } else {
              resolve({ result: response.result, id: response.id })
            }
          } catch (_error) {
            reject(new Error('Invalid JSON response from MCP server'))
          }
        })
      })

      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('MCP request timeout'))
      })

      req.write(postData)
      req.end()
    })
  }

  /**
   * Execute WebSocket-based MCP request
   */
  private async executeWebSocketRequest(_server: McpServerConfig, _request: McpRequest): Promise<McpResponse> {
    // WebSocket implementation would go here
    // For now, throw not implemented error
    throw new Error('WebSocket MCP servers not yet implemented')
  }

  /**
   * Execute command-based MCP request
   */
  private async executeCommandRequest(server: McpServerConfig, request: McpRequest): Promise<McpResponse> {
    if (!server.command) {
      throw new Error('Command server requires command configuration')
    }

    const payload = {
      jsonrpc: '2.0',
      id: request.id || Date.now().toString(),
      method: request.method,
      params: request.params,
    }

    return new Promise((resolve, reject) => {
      // Handle command format
      const commandStr = typeof server.command === 'string' ? server.command : server.command![0]
      const commandArgs = typeof server.command === 'string' ? server.args || [] : server.command!.slice(1)

      const process_spawn = spawn(commandStr, commandArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      if (process_spawn.stdout) {
        process_spawn.stdout.on('data', (data) => {
          stdout += data.toString()
        })
      }

      if (process_spawn.stderr) {
        process_spawn.stderr.on('data', (data) => {
          stderr += data.toString()
        })
      }

      process_spawn.on('close', (code) => {
        if (code === 0) {
          try {
            const response = JSON.parse(stdout)
            if (response.error) {
              reject(new Error(`MCP Command Error: ${response.error.message}`))
            } else {
              resolve({ result: response.result, id: response.id })
            }
          } catch (_error) {
            reject(new Error('Invalid JSON response from MCP command'))
          }
        } else {
          reject(new Error(`MCP command failed with code ${code}: ${stderr}`))
        }
      })

      process_spawn.on('error', reject)

      // Send request
      if (process_spawn.stdin) {
        process_spawn.stdin.write(JSON.stringify(payload))
        process_spawn.stdin.end()
      } else {
        reject(new Error('Failed to access stdin of MCP command'))
      }

      // Timeout handling
      setTimeout(() => {
        if (!process_spawn.killed) {
          process_spawn.kill()
          reject(new Error('MCP command timeout'))
        }
      }, server.timeout || this.DEFAULT_TIMEOUT)
    })
  }

  /**
   * Add authentication headers
   */
  private addAuthHeaders(headers: Record<string, string>, auth: McpServerConfig['authentication']) {
    if (!auth) return

    switch (auth.type) {
      case 'bearer':
        if (auth.token) {
          headers.Authorization = `Bearer ${auth.token}`
        }
        break
      case 'basic':
        if (auth.username && auth.password) {
          const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
          headers.Authorization = `Basic ${credentials}`
        }
        break
      case 'api_key':
        if (auth.apiKey) {
          const headerName = auth.header || 'X-API-Key'
          headers[headerName] = auth.apiKey
        }
        break
    }
  }

  /**
   * Check if request is cacheable
   */
  private isCacheable(request: McpRequest): boolean {
    // Cache read-only operations
    const cacheableMethods = ['list', 'get', 'read', 'search', 'query', 'find', 'describe', 'status', 'info', 'help']

    return cacheableMethods.some((method) => request.method.toLowerCase().includes(method))
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(serverName: string, request: McpRequest): string {
    return `mcp:${serverName}:${request.method}:${JSON.stringify(request.params || {})}`
  }

  /**
   * Get server configuration
   */
  private async getServerConfig(serverName: string): Promise<McpServerConfig | null> {
    const servers = this.getConfiguredServers()
    return servers.find((server) => server.name === serverName) || null
  }

  /**
   * Check server health
   */
  async checkServerHealth(serverName: string): Promise<boolean> {
    const now = Date.now()
    const lastCheck = this.lastHealthCheck.get(serverName) || 0

    // Return cached health status if checked recently
    if (now - lastCheck < this.HEALTH_CHECK_INTERVAL) {
      return this.healthStatus.get(serverName) || false
    }

    // For default servers, check directly
    if (this.defaultServers.has(serverName) || serverName === 'ide-diagnostic') {
      try {
        const healthRequest: McpRequest = {
          method: 'health',
          params: {},
          id: 'health_check',
        }

        // Special handling for ide-diagnostic server
        let defaultServer
        if (serverName === 'ide-diagnostic') {
          defaultServer = this.getOrCreateIdeDiagnosticServer()
        } else {
          defaultServer = this.defaultServers.get(serverName)!
        }

        const response = await defaultServer.handleRequest(healthRequest)

        const isHealthy = response.result?.status !== 'unhealthy'
        this.healthStatus.set(serverName, isHealthy)
        this.lastHealthCheck.set(serverName, now)
        return isHealthy
      } catch (_error) {
        this.healthStatus.set(serverName, false)
        this.lastHealthCheck.set(serverName, now)
        return false
      }
    }

    const server = await this.getServerConfig(serverName)
    if (!server) {
      this.healthStatus.set(serverName, false)
      return false
    }

    try {
      // Try a simple health check request
      const healthRequest: McpRequest = {
        method: 'ping',
        params: {},
        id: 'health_check',
      }

      await this.executeRequest(server, healthRequest)

      this.healthStatus.set(serverName, true)
      this.lastHealthCheck.set(serverName, now)
      return true
    } catch (_error) {
      this.healthStatus.set(serverName, false)
      this.lastHealthCheck.set(serverName, now)
      return false
    }
  }

  /**
   * List available servers with status
   */
  async listServers(): Promise<Array<McpServerConfig & { healthy: boolean }>> {
    const servers = this.getConfiguredServers()
    const serverStatuses = await Promise.all(
      servers.map(async (server) => ({
        ...server,
        healthy: await this.checkServerHealth(server.name),
      }))
    )

    return serverStatuses
  }

  /**
   * Test server connection
   */
  async testServer(serverName: string): Promise<{ success: boolean; error?: string; latency?: number }> {
    const startTime = Date.now()

    try {
      const healthy = await this.checkServerHealth(serverName)
      if (!healthy) {
        return { success: false, error: 'Health check failed' }
      }

      return {
        success: true,
        latency: Date.now() - startTime,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        latency: Date.now() - startTime,
      }
    }
  }

  /**
   * Start background health checker
   */
  private startHealthChecker(): void {
    setInterval(async () => {
      const servers = this.getConfiguredServers()
      for (const server of servers) {
        // Reset last check to force recheck
        this.lastHealthCheck.delete(server.name)
        await this.checkServerHealth(server.name)
      }
    }, this.HEALTH_CHECK_INTERVAL)
  }

  /**
   * Clean up connections on shutdown
   */
  async shutdown(): Promise<void> {
    // Shutdown default servers first
    for (const [serverName, server] of this.defaultServers.entries()) {
      try {
        await server.shutdown()
        console.log(chalk.gray(`🔧 Default server '${serverName}' shut down`))
      } catch (_error) {
        console.log(chalk.yellow(`Warning: Could not shutdown default server ${serverName}`))
      }
    }

    // Close all active connections
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        if (connection && typeof connection.kill === 'function') {
          connection.kill()
        }
      } catch (_error) {
        console.log(chalk.yellow(`Warning: Could not close connection to ${serverName}`))
      }
    }

    this.connections.clear()
    this.connectionPools.clear()
    this.defaultServers.clear()

    console.log(chalk.blue('🔮 MCP Client shut down'))
  }

  /** Dispose alias for unified API */
  async dispose(): Promise<void> {
    await this.shutdown()
  }
}

// Export singleton instance
export const mcpClient = new McpClient()
