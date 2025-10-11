import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'
import type { EnhancedSessionManager } from '../persistence/enhanced-session-manager'
import { type TmuxSession, tmuxIntegration } from './tmux-integration'

export interface SSHSessionInfo {
  clientIP: string
  clientPort: string
  serverPort: string
  protocol: string
  isSecure: boolean
  startTime: Date
}

export interface SessionBridgeConfig {
  autoRestore: boolean
  autoBackup: boolean
  backupInterval: number // minutes
  maxBackups: number
  syncWithCloud: boolean
  tmuxIntegration: boolean
}

export interface SessionState {
  sessionId: string
  tmuxSessionName?: string
  lastBackup: Date
  connectionCount: number
  totalUptime: number
  metadata: {
    deviceType: 'mobile' | 'desktop'
    clientInfo: SSHSessionInfo
    workspaceDir: string
    gitBranch?: string
  }
}

/**
 * SSH Session Bridge for seamless mobile/remote persistence
 */
export class SSHSessionBridge {
  private sessionManager: EnhancedSessionManager
  private configPath: string
  private statePath: string
  private config: SessionBridgeConfig
  private currentState: SessionState | null = null
  private backupTimer: Timer | null = null
  private sshInfo: SSHSessionInfo | null = null

  constructor(sessionManager: EnhancedSessionManager) {
    this.sessionManager = sessionManager
    this.configPath = join(homedir(), '.nikcli', 'ssh-bridge-config.json')
    this.statePath = join(homedir(), '.nikcli', 'ssh-session-state.json')
    this.config = this.loadConfig()

    this.initializeBridge()
  }

  /**
   * Initialize SSH session bridge
   */
  private async initializeBridge(): Promise<void> {
    // Detect SSH session
    this.sshInfo = this.detectSSHSession()

    if (this.sshInfo) {
      console.log(chalk.blue('🔗 SSH session detected - initializing bridge'))
      console.log(chalk.gray(`   Client: ${this.sshInfo.clientIP}:${this.sshInfo.clientPort}`))

      // Setup session state directory
      await this.ensureStateDirectory()

      // Restore or create session
      if (this.config.autoRestore) {
        await this.restoreSession()
      }

      // Setup auto-backup
      if (this.config.autoBackup) {
        this.startAutoBackup()
      }

      // Setup tmux integration if enabled
      if (this.config.tmuxIntegration && tmuxIntegration.isAvailable()) {
        await this.setupTmuxIntegration()
      }

      console.log(chalk.green('✓ SSH session bridge initialized'))
    }
  }

  /**
   * Detect SSH session information
   */
  private detectSSHSession(): SSHSessionInfo | null {
    // Check environment variables set by SSH
    const sshClient = process.env.SSH_CLIENT
    const sshConnection = process.env.SSH_CONNECTION
    const sshTty = process.env.SSH_TTY

    if (!sshClient && !sshConnection && !sshTty) {
      return null // Not an SSH session
    }

    try {
      // Parse SSH_CLIENT: "client_ip client_port server_port"
      // Or SSH_CONNECTION: "client_ip client_port server_ip server_port"
      const connectionInfo = sshClient || sshConnection
      if (!connectionInfo) return null

      const parts = connectionInfo.split(' ')
      if (parts.length < 3) return null

      return {
        clientIP: parts[0],
        clientPort: parts[1],
        serverPort: parts[2],
        protocol: sshTty ? 'ssh' : 'unknown',
        isSecure: true,
        startTime: new Date(),
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Failed to parse SSH info: ${error}`))
      return null
    }
  }

  /**
   * Load bridge configuration
   */
  private loadConfig(): SessionBridgeConfig {
    const defaultConfig: SessionBridgeConfig = {
      autoRestore: true,
      autoBackup: true,
      backupInterval: 5, // 5 minutes
      maxBackups: 10,
      syncWithCloud: true,
      tmuxIntegration: true,
    }

    if (existsSync(this.configPath)) {
      try {
        const saved = JSON.parse(readFileSync(this.configPath, 'utf-8'))
        return { ...defaultConfig, ...saved }
      } catch {
        console.log(chalk.yellow('⚠️ Invalid SSH bridge config, using defaults'))
      }
    }

    return defaultConfig
  }

  /**
   * Save bridge configuration
   */
  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to save SSH bridge config: ${error.message}`))
    }
  }

  /**
   * Ensure state directory exists
   */
  private async ensureStateDirectory(): Promise<void> {
    const stateDir = join(homedir(), '.nikcli', 'ssh-sessions')
    try {
      await mkdir(stateDir, { recursive: true })
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to create state directory: ${error.message}`))
    }
  }

  /**
   * Generate session state ID based on SSH connection
   */
  private generateSessionStateId(): string {
    if (!this.sshInfo) return 'local-session'

    // Create unique ID based on client info and server
    const identifier = `${this.sshInfo.clientIP}-${process.env.HOSTNAME || 'unknown'}`
    return `ssh-${identifier.replace(/[^a-zA-Z0-9-]/g, '_')}`
  }

  /**
   * Restore previous session state
   */
  private async restoreSession(): Promise<void> {
    const stateId = this.generateSessionStateId()
    const statePath = join(homedir(), '.nikcli', 'ssh-sessions', `${stateId}.json`)

    try {
      if (existsSync(statePath)) {
        const stateData = JSON.parse(readFileSync(statePath, 'utf-8'))
        this.currentState = {
          ...stateData,
          connectionCount: (stateData.connectionCount || 0) + 1,
          lastBackup: new Date(stateData.lastBackup),
        }

        console.log(
          chalk.green(`✓ Restored SSH session state (connection #${this.currentState?.connectionCount || 0})`)
        )

        // Try to restore tmux session
        if (this.currentState?.tmuxSessionName && tmuxIntegration.isAvailable()) {
          if (tmuxIntegration.sessionExists(this.currentState.tmuxSessionName)) {
            console.log(chalk.blue(`⚡︎ Resuming tmux session: ${this.currentState.tmuxSessionName}`))
            // Don't auto-attach, let user decide
          } else {
            console.log(chalk.yellow(`⚠️ Previous tmux session '${this.currentState.tmuxSessionName}' not found`))
          }
        }

        return
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to restore session state: ${error.message}`))
    }

    // Create new session state
    await this.createNewSessionState()
  }

  /**
   * Create new session state
   */
  private async createNewSessionState(): Promise<void> {
    if (!this.sshInfo) return

    const sessionId = this.generateSessionStateId()

    // Get git branch if in a git repo
    let gitBranch: string | undefined
    try {
      const { execSync } = await import('node:child_process')
      gitBranch = execSync('git branch --show-current', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim()
    } catch {
      // Not in a git repo or git not available
    }

    this.currentState = {
      sessionId,
      lastBackup: new Date(),
      connectionCount: 1,
      totalUptime: 0,
      metadata: {
        deviceType: this.sessionManager.isMobile() ? 'mobile' : 'desktop',
        clientInfo: this.sshInfo,
        workspaceDir: process.cwd(),
        gitBranch,
      },
    }

    await this.saveSessionState()
    console.log(chalk.green('✓ Created new SSH session state'))
  }

  /**
   * Save current session state
   */
  private async saveSessionState(): Promise<void> {
    if (!this.currentState) return

    const statePath = join(homedir(), '.nikcli', 'ssh-sessions', `${this.currentState.sessionId}.json`)

    try {
      await writeFileSync(statePath, JSON.stringify(this.currentState, null, 2))
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to save session state: ${error.message}`))
    }
  }

  /**
   * Setup tmux integration
   */
  private async setupTmuxIntegration(): Promise<void> {
    if (!tmuxIntegration.isAvailable()) return

    let tmuxSessionName: string | null = null

    // Try to resume existing tmux session
    if (this.currentState?.tmuxSessionName) {
      if (tmuxIntegration.sessionExists(this.currentState.tmuxSessionName)) {
        tmuxSessionName = this.currentState.tmuxSessionName
        console.log(chalk.blue(`⚡︎ Tmux session available: ${tmuxSessionName}`))
      }
    }

    // Create new tmux session if none exists
    if (!tmuxSessionName) {
      const sessionName = `nikcli-ssh-${Date.now()}`
      tmuxSessionName = await tmuxIntegration.createSession({
        name: sessionName,
        workingDir: process.cwd(),
      })

      if (tmuxSessionName && this.currentState) {
        this.currentState.tmuxSessionName = tmuxSessionName
        await this.saveSessionState()
      }
    }

    if (tmuxSessionName) {
      console.log(chalk.green(`✓ Tmux session ready: ${tmuxSessionName}`))
      console.log(chalk.gray(`   Use: tmux attach-session -t ${tmuxSessionName}`))
    }
  }

  /**
   * Start automatic backup timer
   */
  private startAutoBackup(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
    }

    this.backupTimer = setInterval(
      async () => {
        await this.createBackup()
      },
      this.config.backupInterval * 60 * 1000
    ) // Convert minutes to milliseconds

    console.log(chalk.gray(`🕐 Auto-backup enabled (every ${this.config.backupInterval} minutes)`))
  }

  /**
   * Create session backup
   */
  private async createBackup(): Promise<void> {
    try {
      // Get current session data
      const sessions = await this.sessionManager.listSessions()
      const backupData = {
        timestamp: new Date().toISOString(),
        sessionState: this.currentState,
        sessions: sessions.filter((s) => s.syncStatus !== 'conflict'),
        tmuxSessions: tmuxIntegration.isAvailable() ? tmuxIntegration.listSessions() : [],
      }

      // Save backup
      const backupDir = join(homedir(), '.nikcli', 'ssh-backups')
      await mkdir(backupDir, { recursive: true })

      const backupFileName = `backup-${Date.now()}.json`
      const backupPath = join(backupDir, backupFileName)

      writeFileSync(backupPath, JSON.stringify(backupData, null, 2))

      // Update state
      if (this.currentState) {
        this.currentState.lastBackup = new Date()
        await this.saveSessionState()
      }

      // Cleanup old backups
      await this.cleanupOldBackups(backupDir)

      console.log(chalk.gray(`✓ Session backup created: ${backupFileName}`))
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Backup failed: ${error.message}`))
    }
  }

  /**
   * Cleanup old backup files
   */
  private async cleanupOldBackups(backupDir: string): Promise<void> {
    try {
      const { readdir, stat, unlink } = await import('node:fs/promises')
      const files = await readdir(backupDir)
      const backupFiles = files.filter((f) => f.startsWith('backup-') && f.endsWith('.json'))

      if (backupFiles.length <= this.config.maxBackups) return

      // Sort by creation time and remove oldest
      const fileStats = await Promise.all(
        backupFiles.map(async (file) => ({
          file,
          path: join(backupDir, file),
          mtime: (await stat(join(backupDir, file))).mtime,
        }))
      )

      const sorted = fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
      const toDelete = sorted.slice(this.config.maxBackups)

      for (const { path } of toDelete) {
        await unlink(path)
      }

      if (toDelete.length > 0) {
        console.log(chalk.gray(`🗑️  Cleaned up ${toDelete.length} old backup(s)`))
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Backup cleanup failed: ${error.message}`))
    }
  }

  /**
   * Get connection info for display
   */
  getConnectionInfo(): string {
    if (!this.sshInfo || !this.currentState) {
      return 'Not connected via SSH'
    }

    const uptime = Math.round((Date.now() - this.sshInfo.startTime.getTime()) / 1000 / 60) // minutes
    const deviceIcon = this.currentState.metadata.deviceType === 'mobile' ? '📱' : '🖥️'

    return [
      `${deviceIcon} SSH Session Info:`,
      `  Client: ${this.sshInfo.clientIP}:${this.sshInfo.clientPort}`,
      `  Device: ${this.currentState.metadata.deviceType}`,
      `  Connection #${this.currentState.connectionCount}`,
      `  Uptime: ${uptime} minutes`,
      `  Last backup: ${this.currentState.lastBackup.toLocaleTimeString()}`,
      this.currentState.tmuxSessionName ? `  Tmux: ${this.currentState.tmuxSessionName}` : '',
      this.currentState.metadata.gitBranch ? `  Git branch: ${this.currentState.metadata.gitBranch}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  /**
   * Manual session save
   */
  async saveSession(): Promise<boolean> {
    try {
      await this.createBackup()
      return true
    } catch {
      return false
    }
  }

  /**
   * Get available tmux sessions
   */
  getTmuxSessions(): TmuxSession[] {
    if (!tmuxIntegration.isAvailable()) return []
    return tmuxIntegration.listSessions()
  }

  /**
   * Connect to tmux session
   */
  async connectToTmux(sessionName?: string): Promise<boolean> {
    if (!tmuxIntegration.isAvailable()) return false

    const targetSession = sessionName || this.currentState?.tmuxSessionName
    if (!targetSession) return false

    return await tmuxIntegration.attachSession(targetSession)
  }

  /**
   * Check if SSH session is active
   */
  isSSHSession(): boolean {
    return !!this.sshInfo
  }

  /**
   * Get current session state
   */
  getCurrentState(): SessionState | null {
    return this.currentState
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SessionBridgeConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()

    // Restart auto-backup if interval changed
    if (updates.backupInterval && this.config.autoBackup) {
      this.startAutoBackup()
    }
  }

  /**
   * Get configuration
   */
  getConfig(): SessionBridgeConfig {
    return { ...this.config }
  }

  /**
   * Cleanup on disconnect
   */
  async cleanup(): Promise<void> {
    if (this.backupTimer) {
      clearInterval(this.backupTimer)
      this.backupTimer = null
    }

    // Final backup
    if (this.config.autoBackup && this.currentState) {
      await this.createBackup()
    }

    console.log(chalk.blue('🔗 SSH session bridge cleaned up'))
  }
}

// Export singleton initialization
export let sshSessionBridge: SSHSessionBridge | null = null

export function initializeSSHBridge(sessionManager: EnhancedSessionManager): SSHSessionBridge {
  sshSessionBridge = new SSHSessionBridge(sessionManager)
  return sshSessionBridge
}

export function getSSHBridge(): SSHSessionBridge | null {
  return sshSessionBridge
}
