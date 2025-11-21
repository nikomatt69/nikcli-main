import chalk from 'chalk'
import boxen from 'boxen'
import { toolService } from '../services/tool-service'

/**
 * SecurityPanels - Handles security and mode panels
 * Extracted from lines 16634-16902 in nik-cli.ts
 */
export class SecurityPanels {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleSecurityPanels(args: string[]): Promise<void> {
    const sub = (args[0] || 'status').toLowerCase()
    try {
      switch (sub) {
        case 'status': {
          const status = toolService.getSecurityStatus()
          const config = this.nikCLI.configManager.getAll()
          const lines: string[] = []
          lines.push(`Security Mode: ${config.securityMode}`)
          lines.push(`Developer Mode: ${status.devModeActive ? 'Active' : 'Inactive'}`)
          lines.push(`Session Approvals: ${status.sessionApprovals}`)
          lines.push(`Approval Policy: ${config.approvalPolicy}`)
          lines.push('')
          lines.push('📋 Tool Approval Policies:')
          const pol = (config as any).toolApprovalPolicies || {}
          lines.push(`• File Operations: ${pol.fileOperations}`)
          lines.push(`• Git Operations: ${pol.gitOperations}`)
          lines.push(`• Package Operations: ${pol.packageOperations}`)
          lines.push(`• System Commands: ${pol.systemCommands}`)
          lines.push(`• Network Requests: ${pol.networkRequests}`)

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: '🔒 Security Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            }),
            'general'
          )
          break
        }
        case 'set': {
          if (args.length < 3) {
            const content = [
              'Usage: /security set <security-mode> <safe|default|developer>',
              'Example: /security set security-mode safe',
            ].join('\n')
            this.nikCLI.printPanel(
              boxen(content, {
                title: '🔒 Security Help',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const key = args[1]
          const value = args[2]
          if (key === 'security-mode' && ['safe', 'default', 'developer'].includes(value)) {
            this.nikCLI.configManager.set('securityMode', value as any)
            this.nikCLI.printPanel(
              boxen(`Security mode set to: ${value}`, {
                title: '🔒 Security Updated',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green',
              })
            )
          } else {
            this.nikCLI.printPanel(
              boxen('Invalid setting. Only security-mode is supported here.', {
                title: '🔒 Security Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
          }
          break
        }
        case 'help': {
          const content = [
            '/security status                - Show current security settings',
            '/security set security-mode ... - Change security mode',
            '/security help                  - Show this help',
            '',
            'Modes: safe | default | developer',
          ].join('\n')
          this.nikCLI.printPanel(
            boxen(content, {
              title: '🔒 Security Help',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        default: {
          this.nikCLI.printPanel(
            boxen(`Unknown security command: ${sub}\nUse /security help`, {
              title: '🔒 Security',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
      }
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Security command failed: ${error.message}`, {
          title: '❌ Security Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleDevModePanels(args: string[]): Promise<void> {
    const action = (args[0] || 'enable').toLowerCase()
    try {
      switch (action) {
        case 'enable': {
          const minutes = args[1] ? parseInt(args[1], 10) : undefined
          const ms = minutes ? minutes * 60000 : undefined
          toolService.enableDevMode(ms)
          const content = [
            `Developer mode enabled${minutes ? ` for ${minutes} minutes` : ' for 1 hour (default)'}`,
            'Reduced security restrictions active.',
            'Use /security status to see current settings.',
          ].join('\n')
          this.nikCLI.printPanel(
            boxen(content, {
              title: '🔧 Developer Mode',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        case 'status': {
          const isActive = toolService.isDevModeActive()
          const content = `Status: ${isActive ? 'Active' : 'Inactive'}${isActive ? '\n⚠️ Security restrictions are reduced' : ''}`
          this.nikCLI.printPanel(
            boxen(content, {
              title: '🔧 Developer Mode: Status',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          break
        }
        case 'help': {
          const lines = [
            '/dev-mode enable [minutes] - Enable developer mode',
            '/dev-mode status           - Check developer mode status',
            '/dev-mode help             - Show this help',
            '',
            '⚠️ Developer mode reduces security restrictions',
          ]
          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: '🔧 Developer Mode: Help',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            }),
            'general'
          )
          break
        }
        default: {
          this.nikCLI.printPanel(
            boxen(`Unknown dev-mode command: ${action}\nUse /dev-mode help`, {
              title: '🔧 Developer Mode',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            })
          )
        }
      }
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Dev-mode command failed: ${error.message}`, {
          title: '❌ Developer Mode Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleSafeModePanel(): Promise<void> {
    try {
      const cfg = this.nikCLI.configManager.getAll()
      cfg.securityMode = 'safe'
      this.nikCLI.configManager.setAll(cfg as any)
      this.nikCLI.printPanel(
        boxen(
          'Maximum security restrictions. All risky operations require approval.\nUse /security status to see details.',
          {
            title: '🔒 Safe Mode Enabled',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Safe mode command failed: ${error.message}`, {
          title: '🔒 Safe Mode Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleClearApprovalsPanel(): Promise<void> {
    try {
      toolService.clearSessionApprovals()
      this.nikCLI.printPanel(
        boxen('All session approvals cleared. Next operations will require fresh approval.', {
          title: '✓ Approvals Cleared',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }),
        'general'
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Clear approvals command failed: ${error.message}`, {
          title: '❌ Approvals Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async syncSessions(): Promise<void> {
    // Sync sessions implementation would go here
    // This is a placeholder for the sync functionality
  }

  async clearAllCaches(): Promise<void> {
    // Clear all caches implementation would go here
    // This is a placeholder for the cache clearing functionality
  }
}
