import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import chalk from 'chalk'

export interface TmuxSession {
  id: string
  name: string
  windows: number
  created: Date
  attached: boolean
  lastActivity: Date
}

export interface TmuxConfig {
  sessionPrefix: string
  autoAttach: boolean
  mouseSupport: boolean
  statusBar: boolean
  keyBindings: Record<string, string>
}

/**
 * Tmux Integration for Session Persistence
 * Provides seamless session management for SSH connections
 */
export class TmuxIntegration {
  private configPath: string
  private config: TmuxConfig
  private tmuxAvailable = false
  private currentSessionId: string | null = null

  constructor() {
    this.configPath = join(homedir(), '.nikcli', 'tmux-config.json')
    this.config = this.loadConfig()
    this.tmuxAvailable = this.checkTmuxAvailability()

    if (this.isAvailable()) {
      this.setupTmuxConfig()
    }
  }

  /**
   * Check if tmux is available on the system
   */
  private checkTmuxAvailability(): boolean {
    try {
      execSync('which tmux', { stdio: 'ignore' })
      const version = execSync('tmux -V', { encoding: 'utf-8' }).trim()
      console.log(chalk.gray(`✓ tmux available: ${version}`))
      return true
    } catch {
      console.log(chalk.yellow('⚠️ tmux not found - session persistence limited'))
      return false
    }
  }

  /**
   * Load tmux configuration
   */
  private loadConfig(): TmuxConfig {
    const defaultConfig: TmuxConfig = {
      sessionPrefix: 'nikcli',
      autoAttach: true,
      mouseSupport: true,
      statusBar: true,
      keyBindings: {
        prefix: 'C-a', // Ctrl+A as prefix instead of default Ctrl+B
        'split-horizontal': '|',
        'split-vertical': '-',
        'reload-config': 'r',
      },
    }

    if (existsSync(this.configPath)) {
      try {
        const saved = JSON.parse(readFileSync(this.configPath, 'utf-8'))
        return { ...defaultConfig, ...saved }
      } catch {
        console.log(chalk.yellow('⚠️ Invalid tmux config, using defaults'))
      }
    }

    return defaultConfig
  }

  /**
   * Save tmux configuration
   */
  private saveConfig(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to save tmux config: ${error.message}`))
    }
  }

  /**
   * Setup tmux configuration for NikCLI
   */
  private setupTmuxConfig(): void {
    if (!this.tmuxAvailable) return

    const tmuxConfigPath = join(homedir(), '.tmux.conf')
    const nikcliConfig = this.generateTmuxConfig()

    try {
      let existingConfig = ''
      if (existsSync(tmuxConfigPath)) {
        existingConfig = readFileSync(tmuxConfigPath, 'utf-8')
      }

      // Add NikCLI config if not already present
      if (!existingConfig.includes('# NikCLI tmux configuration')) {
        const newConfig = existingConfig + '\n\n' + nikcliConfig
        writeFileSync(tmuxConfigPath, newConfig)
        console.log(chalk.green('✅ tmux configuration updated'))

        // Reload tmux config if tmux is running
        try {
          execSync('tmux source-file ~/.tmux.conf', { stdio: 'ignore' })
        } catch {
          // tmux not running, config will be loaded on next start
        }
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to setup tmux config: ${error.message}`))
    }
  }

  /**
   * Generate tmux configuration for NikCLI
   */
  private generateTmuxConfig(): string {
    const { keyBindings } = this.config

    return `
# NikCLI tmux configuration
set -g prefix ${keyBindings.prefix}
unbind C-b
bind-key ${keyBindings.prefix} send-prefix

# Mouse support
${this.config.mouseSupport ? 'set -g mouse on' : 'set -g mouse off'}

# Status bar
${this.config.statusBar ? 'set -g status on' : 'set -g status off'}
set -g status-style bg=blue,fg=white
set -g status-left "#[bg=green,fg=black] NikCLI #[bg=blue] "
set -g status-right "#[bg=cyan,fg=black] %H:%M #[bg=green,fg=black] #S "

# Key bindings for NikCLI
bind ${keyBindings['split-horizontal']} split-window -h
bind ${keyBindings['split-vertical']} split-window -v
bind ${keyBindings['reload-config']} source-file ~/.tmux.conf \\; display-message "Config reloaded!"

# Window navigation
bind -n M-Left previous-window
bind -n M-Right next-window

# Pane navigation
bind -n M-h select-pane -L
bind -n M-l select-pane -R
bind -n M-k select-pane -U
bind -n M-j select-pane -D

# Session management
bind S choose-session
bind X confirm-before -p "Kill session #S? (y/n)" kill-session

# History and scrollback
set -g history-limit 10000
set -g mode-keys vi

# Colors and terminal
set -g default-terminal "screen-256color"
set -ga terminal-overrides ",*256col*:Tc"

# NikCLI specific settings
set -g set-titles on
set -g set-titles-string "NikCLI: #S"
set -g automatic-rename on
set -g renumber-windows on
`.trim()
  }

  /**
   * Create a new tmux session for NikCLI
   */
  async createSession(options?: { name?: string; workingDir?: string; command?: string }): Promise<string | null> {
    if (!this.tmuxAvailable) {
      console.log(chalk.yellow('⚠️ tmux not available'))
      return null
    }

    const { name, workingDir, command } = options || {}
    const sessionName = name || `${this.config.sessionPrefix}-${Date.now()}`

    try {
      // Check if session already exists
      if (this.sessionExists(sessionName)) {
        console.log(chalk.yellow(`⚠️ Session '${sessionName}' already exists`))
        return sessionName
      }

      // Create session command
      let createCmd = `tmux new-session -d -s "${sessionName}"`

      if (workingDir) {
        createCmd += ` -c "${workingDir}"`
      }

      if (command) {
        createCmd += ` "${command}"`
      }

      execSync(createCmd, { stdio: 'ignore' })
      this.currentSessionId = sessionName

      console.log(chalk.green(`✅ tmux session created: ${sessionName}`))
      return sessionName
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create tmux session: ${error.message}`))
      return null
    }
  }

  /**
   * Attach to existing tmux session
   */
  async attachSession(sessionName: string): Promise<boolean> {
    if (!this.isAvailable || !this.sessionExists(sessionName)) {
      return false
    }

    try {
      // If we're already in tmux, switch session instead of attaching
      if (process.env.TMUX) {
        execSync(`tmux switch-client -t "${sessionName}"`, { stdio: 'ignore' })
      } else {
        execSync(`tmux attach-session -t "${sessionName}"`, { stdio: 'ignore' })
      }

      this.currentSessionId = sessionName
      console.log(chalk.green(`✅ Attached to tmux session: ${sessionName}`))
      return true
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to attach to session: ${error.message}`))
      return false
    }
  }

  /**
   * Detach from current tmux session
   */
  async detachSession(): Promise<boolean> {
    if (!this.isAvailable || !process.env.TMUX) {
      return false
    }

    try {
      execSync('tmux detach-client', { stdio: 'ignore' })
      console.log(chalk.blue('📱 Detached from tmux session'))
      return true
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to detach: ${error.message}`))
      return false
    }
  }

  /**
   * Kill tmux session
   */
  async killSession(sessionName: string): Promise<boolean> {
    if (!this.isAvailable || !this.sessionExists(sessionName)) {
      return false
    }

    try {
      execSync(`tmux kill-session -t "${sessionName}"`, { stdio: 'ignore' })

      if (this.currentSessionId === sessionName) {
        this.currentSessionId = null
      }

      console.log(chalk.green(`✅ tmux session killed: ${sessionName}`))
      return true
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to kill session: ${error.message}`))
      return false
    }
  }

  /**
   * List all tmux sessions
   */
  listSessions(): TmuxSession[] {
    if (!this.isAvailable) return []

    try {
      const output = execSync(
        'tmux list-sessions -F "#{session_id}|#{session_name}|#{session_windows}|#{session_created}|#{session_attached}|#{session_activity}"',
        { encoding: 'utf-8' }
      ).trim()

      if (!output) return []

      return output.split('\n').map((line) => {
        const [id, name, windows, created, attached, activity] = line.split('|')

        return {
          id,
          name,
          windows: parseInt(windows, 10),
          created: new Date(parseInt(created, 10) * 1000),
          attached: attached !== '0',
          lastActivity: new Date(parseInt(activity, 10) * 1000),
        }
      })
    } catch {
      return []
    }
  }

  /**
   * Check if a session exists
   */
  sessionExists(sessionName: string): boolean {
    if (!this.isAvailable) return false

    try {
      execSync(`tmux has-session -t "${sessionName}"`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Get current tmux session info
   */
  getCurrentSession(): TmuxSession | null {
    if (!this.isAvailable || !process.env.TMUX) return null

    try {
      const output = execSync(
        'tmux display-message -p "#{session_id}|#{session_name}|#{session_windows}|#{session_created}|#{session_attached}|#{session_activity}"',
        { encoding: 'utf-8' }
      ).trim()

      const [id, name, windows, created, attached, activity] = output.split('|')

      return {
        id,
        name,
        windows: parseInt(windows, 10),
        created: new Date(parseInt(created, 10) * 1000),
        attached: attached !== '0',
        lastActivity: new Date(parseInt(activity, 10) * 1000),
      }
    } catch {
      return null
    }
  }

  /**
   * Send command to tmux session
   */
  async sendCommand(sessionName: string, command: string, windowIndex = 0): Promise<boolean> {
    if (!this.isAvailable || !this.sessionExists(sessionName)) {
      return false
    }

    try {
      execSync(`tmux send-keys -t "${sessionName}:${windowIndex}" "${command}" Enter`, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Create a new window in session
   */
  async createWindow(sessionName: string, name?: string, command?: string): Promise<boolean> {
    if (!this.isAvailable || !this.sessionExists(sessionName)) {
      return false
    }

    try {
      let cmd = `tmux new-window -t "${sessionName}"`

      if (name) {
        cmd += ` -n "${name}"`
      }

      if (command) {
        cmd += ` "${command}"`
      }

      execSync(cmd, { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Save session layout and state
   */
  async saveSessionState(sessionName: string): Promise<string | null> {
    if (!this.isAvailable || !this.sessionExists(sessionName)) {
      return null
    }

    try {
      // Get session layout
      const layout = execSync(
        `tmux list-windows -t "${sessionName}" -F "#{window_index}:#{window_name}:#{window_layout}"`,
        { encoding: 'utf-8' }
      ).trim()

      // Save to file
      const statePath = join(homedir(), '.nikcli', 'tmux-sessions', `${sessionName}.state`)
      writeFileSync(statePath, layout)

      return statePath
    } catch {
      return null
    }
  }

  /**
   * Check if tmux is available
   */
  isAvailable(): boolean {
    return this.tmuxAvailable
  }

  /**
   * Check if running inside tmux
   */
  isInsideTmux(): boolean {
    return !!process.env.TMUX
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<TmuxConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()

    if (this.isAvailable()) {
      this.setupTmuxConfig()
    }
  }

  /**
   * Get configuration
   */
  getConfig(): TmuxConfig {
    return { ...this.config }
  }

  /**
   * Auto-resume session on connect (for SSH)
   */
  async autoResumeSession(): Promise<string | null> {
    if (!this.isAvailable || !this.config.autoAttach) {
      return null
    }

    // Look for existing NikCLI sessions
    const sessions = this.listSessions()
    const nikcliSessions = sessions.filter((s) => s.name.startsWith(this.config.sessionPrefix))

    if (nikcliSessions.length > 0) {
      // Attach to most recent session
      const latest = nikcliSessions.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0]

      if (await this.attachSession(latest.name)) {
        return latest.name
      }
    }

    // Create new session if none exist
    return await this.createSession({
      name: `${this.config.sessionPrefix}-${Date.now()}`,
      workingDir: process.cwd(),
    })
  }
}

// Export singleton instance
export const tmuxIntegration = new TmuxIntegration()
