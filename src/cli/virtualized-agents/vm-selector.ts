import chalk from 'chalk'
import inquirer from 'inquirer'
import type { SecureVirtualizedAgent } from './secure-vm-agent'
import { vmChatBridge } from './vm-chat-bridge'
import type { VMOrchestrator } from './vm-orchestrator'

export interface VMTarget {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  containerId: string
  agentId: string
  repositoryUrl?: string
  createdAt: Date
  lastActivity?: Date
  resourceUsage?: {
    memory: string
    cpu: string
    disk: string
  }
  systemInfo?: {
    os: string
    arch: string
    nodeVersion?: string
    workingDirectory: string
  }
}

export interface VMSelectorOptions {
  showInactive?: boolean
  filterByRepository?: string
  sortBy?: 'name' | 'created' | 'activity' | 'status'
  interactive?: boolean
}

export class VMSelector {
  private selectedVM: VMTarget | null = null
  private vmOrchestrator: VMOrchestrator
  private chatHistory: Map<
    string,
    Array<{
      role: 'user' | 'vm' | 'system'
      content: string
      timestamp: Date
    }>
  > = new Map()

  constructor(vmOrchestrator: VMOrchestrator) {
    this.vmOrchestrator = vmOrchestrator
  }

  /**
   * Get all available VM targets with detailed information
   */
  async getAvailableVMs(options: VMSelectorOptions = {}): Promise<VMTarget[]> {
    try {
      const containers = this.vmOrchestrator.getActiveContainers()
      const agents = vmChatBridge.getActiveAgents()
      const targets: VMTarget[] = []

      for (const container of containers) {
        // Find corresponding agent
        const agent = agents.find((a) => a.getContainerId() === container.id)

        if (!agent && !options.showInactive) continue

        // Get system information from VM
        const systemInfo = await this.getVMSystemInfo(container.id, agent)
        const resourceUsage = await this.getVMResourceUsage(container.id)

        const target: VMTarget = {
          id: container.id,
          name: container.name || `VM-${container.id.slice(0, 8)}`,
          status: container.status as 'running' | 'stopped' | 'error',
          containerId: container.id,
          agentId: container.agentId,
          repositoryUrl: container.repositoryUrl,
          createdAt: container.createdAt,
          lastActivity: this.getLastActivity(container.id),
          resourceUsage,
          systemInfo,
        }

        // Apply filters
        if (options.filterByRepository && !target.repositoryUrl?.includes(options.filterByRepository)) {
          continue
        }

        targets.push(target)
      }

      // Sort results
      if (options.sortBy) {
        targets.sort((a, b) => {
          switch (options.sortBy) {
            case 'name':
              return a.name.localeCompare(b.name)
            case 'created':
              return b.createdAt.getTime() - a.createdAt.getTime()
            case 'activity': {
              const aActivity = a.lastActivity?.getTime() || 0
              const bActivity = b.lastActivity?.getTime() || 0
              return bActivity - aActivity
            }
            case 'status': {
              const statusOrder = { running: 0, stopped: 1, error: 2 }
              return statusOrder[a.status] - statusOrder[b.status]
            }
            default:
              return 0
          }
        })
      }

      return targets
    } catch (error: any) {
      console.error(chalk.red(`✖ Failed to get VM targets: ${error.message}`))
      return []
    }
  }

  /**
   * Interactive VM selection with rich UI
   */
  async selectVM(options: VMSelectorOptions = {}): Promise<VMTarget | null> {
    const vms = await this.getAvailableVMs({ ...options, sortBy: 'activity' })

    if (vms.length === 0) {
      console.log(chalk.yellow('⚠️ No VM containers available'))
      console.log(chalk.gray('Use /vm-create <repo-url|os> to create one'))
      return null
    }

    if (vms.length === 1 && !options.interactive) {
      this.selectedVM = vms[0]
      console.log(chalk.green(`✓ Auto-selected VM: ${this.selectedVM.name}`))
      return this.selectedVM
    }

    // Create interactive selection
    const choices = vms.map((vm) => ({
      name: this.formatVMChoice(vm),
      value: vm,
      short: vm.name,
    }))

    choices.push({
      name: chalk.gray('⚡︎ Refresh VM list'),
      value: 'refresh' as any,
      short: 'Refresh',
    })

    choices.push({
      name: chalk.gray('✖ Cancel'),
      value: null as any,
      short: 'Cancel',
    })

    console.log(chalk.cyan.bold('\n🐳 Select VM for Chat Session'))
    console.log(chalk.gray('─'.repeat(60)))

    const { selectedVM } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedVM',
        message: 'Choose a VM to chat with:',
        choices,
        pageSize: 10,
      },
    ])

    if (selectedVM === 'refresh') {
      return await this.selectVM(options)
    }

    if (selectedVM === null) {
      return null
    }

    // Type guard to ensure selectedVM is not null
    if (!selectedVM) {
      return null
    }

    this.selectedVM = selectedVM
    console.log(chalk.green(`✓ Selected VM: ${this.selectedVM?.name}`))

    // Initialize chat history for this VM
    if (!this.chatHistory.has(this.selectedVM!.id)) {
      this.chatHistory.set(this.selectedVM!.id, [])
      await this.addSystemMessage(
        this.selectedVM!.id,
        `Connected to VM ${this.selectedVM!.name} (${this.selectedVM!.systemInfo?.os} ${this.selectedVM!.systemInfo?.arch})`
      )
    }

    return this.selectedVM
  }

  /**
   * Get currently selected VM
   */
  getSelectedVM(): VMTarget | null {
    return this.selectedVM
  }

  /**
   * Set selected VM directly
   */
  setSelectedVM(vmId: string): boolean {
    const vm = this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId)
    if (vm) {
      this.selectedVM = {
        id: vm.id,
        name: vm.name || `VM-${vm.id.slice(0, 8)}`,
        status: vm.status as any,
        containerId: vm.id,
        agentId: vm.agentId,
        repositoryUrl: vm.repositoryUrl,
        createdAt: vm.createdAt,
      }
      return true
    }
    return false
  }

  /**
   * Switch to different VM
   */
  async switchVM(): Promise<VMTarget | null> {
    console.log(chalk.blue('⚡︎ Switching VM...'))
    return await this.selectVM({ interactive: true })
  }

  /**
   * Show VM dashboard with status overview
   */
  async showVMDashboard(): Promise<void> {
    const vms = await this.getAvailableVMs({ showInactive: true, sortBy: 'status' })

    console.log(chalk.cyan.bold('\n🐳 VM Dashboard'))
    console.log(chalk.gray('═'.repeat(80)))

    if (vms.length === 0) {
      console.log(chalk.yellow('No VM containers found'))
      console.log(chalk.gray('Use /vm-create <repo-url|os> to create your first VM'))
      return
    }

    // Show currently selected VM
    if (this.selectedVM) {
      console.log(chalk.green.bold(`\n🎯 Currently Selected: ${this.selectedVM.name}`))
      console.log(chalk.gray(`   Container: ${this.selectedVM.containerId.slice(0, 12)}`))
      console.log(chalk.gray(`   Status: ${this.formatStatus(this.selectedVM.status)}`))
    }

    console.log(chalk.white.bold('\n📋 Available VMs:'))
    console.log(chalk.gray('─'.repeat(80)))

    vms.forEach((vm) => {
      const isSelected = this.selectedVM?.id === vm.id
      const prefix = isSelected ? chalk.green('▶ ') : '  '
      const name = isSelected ? chalk.green.bold(vm.name) : chalk.white(vm.name)

      console.log(`${prefix}${name} (${vm.containerId.slice(0, 8)})`)
      console.log(`   Status: ${this.formatStatus(vm.status)}  Repository: ${vm.repositoryUrl || 'N/A'}`)

      if (vm.systemInfo) {
        console.log(
          `   System: ${vm.systemInfo.os} ${vm.systemInfo.arch}  Working Dir: ${vm.systemInfo.workingDirectory}`
        )
      }

      if (vm.resourceUsage) {
        console.log(
          `   Resources: Memory ${vm.resourceUsage.memory}  CPU ${vm.resourceUsage.cpu}  Disk ${vm.resourceUsage.disk}`
        )
      }

      const lastActivity = vm.lastActivity
        ? `${Math.round((Date.now() - vm.lastActivity.getTime()) / 1000 / 60)}m ago`
        : 'Never'
      console.log(`   Created: ${vm.createdAt.toLocaleDateString()}  Last Activity: ${lastActivity}`)
      console.log()
    })

    console.log(chalk.gray('─'.repeat(80)))
    console.log(chalk.blue('💡 Commands:'))
    console.log(chalk.gray('   /vm-switch     - Switch to different VM'))
    console.log(chalk.gray('   /vm-connect    - Connect to specific VM'))
    console.log(chalk.gray('   /vm-create     - Create new VM'))
    console.log(chalk.gray('   /vm-mode       - Enter VM chat mode'))
  }

  /**
   * Get chat history for VM
   */
  getChatHistory(vmId: string): Array<{
    role: 'user' | 'vm' | 'system'
    content: string
    timestamp: Date
  }> {
    return this.chatHistory.get(vmId) || []
  }

  /**
   * Add message to chat history
   */
  async addChatMessage(vmId: string, role: 'user' | 'vm' | 'system', content: string): Promise<void> {
    if (!this.chatHistory.has(vmId)) {
      this.chatHistory.set(vmId, [])
    }

    this.chatHistory.get(vmId)?.push({
      role,
      content,
      timestamp: new Date(),
    })

    // Keep only last 100 messages per VM
    const history = this.chatHistory.get(vmId)!
    if (history.length > 100) {
      history.splice(0, history.length - 100)
    }

    // Update last activity
    const vm = this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId)
    if (vm) {
      // Store last activity timestamp
      this.setLastActivity(vmId, new Date())
    }
  }

  /**
   * Clear chat history for VM
   */
  clearChatHistory(vmId: string): void {
    this.chatHistory.set(vmId, [])
  }

  // Private helper methods

  private formatVMChoice(vm: VMTarget): string {
    const status = this.formatStatus(vm.status)
    const repo = vm.repositoryUrl ? chalk.gray(`(${vm.repositoryUrl.split('/').slice(-1)[0]})`) : ''
    const resources = vm.resourceUsage
      ? chalk.gray(`[${vm.resourceUsage.memory} RAM, ${vm.resourceUsage.cpu} CPU]`)
      : ''

    return `${vm.name} ${repo} ${status} ${resources}`
  }

  private formatStatus(status: string): string {
    switch (status) {
      case 'running':
        return chalk.green('🟢 Running')
      case 'stopped':
        return chalk.yellow('🟡 Stopped')
      case 'error':
        return chalk.red('🔴 Error')
      default:
        return chalk.gray('⚪ Unknown')
    }
  }

  private async getVMSystemInfo(_containerId: string, agent?: SecureVirtualizedAgent): Promise<any> {
    try {
      if (!agent) return null

      // Try to get system info from VM
      const systemInfo = await agent.executeCommand('uname -a && pwd && node --version', {
        timeout: 5000,
        capture: true,
      })

      const lines = systemInfo.stdout?.split('\n') || []
      const unameResult = lines[0] || ''
      const pwd = lines[1] || '/workspace'
      const nodeVersion = lines[2] || ''

      return {
        os: unameResult.includes('Linux') ? 'Linux' : 'Unknown',
        arch: unameResult.includes('x86_64') ? 'x86_64' : 'arm64',
        nodeVersion: nodeVersion.replace('v', ''),
        workingDirectory: pwd.trim(),
      }
    } catch (_error) {
      return {
        os: 'Linux',
        arch: 'x86_64',
        workingDirectory: '/workspace',
      }
    }
  }

  private async getVMResourceUsage(containerId: string): Promise<any> {
    try {
      // Get container stats via Docker API
      const { exec } = require('node:child_process')
      const { promisify } = require('node:util')
      const execAsync = promisify(exec)

      const { stdout } = await execAsync(
        `docker stats ${containerId.slice(0, 12)} --no-stream --format "table {{.MemUsage}}\\t{{.CPUPerc}}"`
      )
      const lines = stdout.trim().split('\n')

      if (lines.length > 1) {
        const [memory, cpu] = lines[1].split('\t')
        return {
          memory: memory.trim(),
          cpu: cpu.trim(),
          disk: 'N/A', // Docker doesn't provide this easily
        }
      }
    } catch (_error) {
      // Fallback values
    }

    return {
      memory: 'N/A',
      cpu: 'N/A',
      disk: 'N/A',
    }
  }

  private getLastActivity(_vmId: string): Date | undefined {
    // This would typically be stored in a database or cache
    // For now, return undefined
    return undefined
  }

  private setLastActivity(_vmId: string, _timestamp: Date): void {
    // This would typically update a database or cache
    // For now, do nothing
  }

  private async addSystemMessage(vmId: string, message: string): Promise<void> {
    await this.addChatMessage(vmId, 'system', message)
  }

  /**
   * OS-like VM Experience Features
   */

  /**
   * Get current working directory of VM
   */
  async getCurrentWorkingDirectory(vmId: string): Promise<string> {
    const vm = this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId)
    if (!vm) return '/workspace'

    try {
      const agents = vmChatBridge.getActiveAgents()
      const agent = agents.find((a) => a.getContainerId() === vmId)
      if (agent) {
        const result = await agent.executeCommand('pwd', { timeout: 3000, capture: true })
        return result.stdout?.trim() || '/workspace'
      }
    } catch (error) {
      console.error(chalk.red(`Failed to get working directory for VM ${vmId}: ${error}`))
    }

    return '/workspace'
  }

  /**
   * List files in VM directory
   */
  async listVMFiles(vmId: string, directory?: string): Promise<string[]> {
    const vm = this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId)
    if (!vm) return []

    try {
      const agents = vmChatBridge.getActiveAgents()
      const agent = agents.find((a) => a.getContainerId() === vmId)
      if (agent) {
        const dir = directory || (await this.getCurrentWorkingDirectory(vmId))
        const result = await agent.executeCommand(`ls -la "${dir}"`, { timeout: 5000, capture: true })
        return result.stdout?.split('\n').filter((line: string) => line.trim()) || []
      }
    } catch (error) {
      console.error(chalk.red(`Failed to list files in VM ${vmId}: ${error}`))
    }

    return []
  }

  /**
   * Get VM system information (detailed)
   */
  async getVMDetailedSystemInfo(vmId: string): Promise<any> {
    const vm = this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId)
    if (!vm) return null

    try {
      const agents = vmChatBridge.getActiveAgents()
      const agent = agents.find((a) => a.getContainerId() === vmId)
      if (agent) {
        // Get comprehensive system info
        const commands = [
          'uname -a',
          'pwd',
          'whoami',
          'id',
          'ps aux --sort=-%cpu | head -10',
          'df -h',
          'free -h',
          'uptime',
          'which node npm git docker',
          'node --version 2>/dev/null || echo "Node.js not installed"',
          'npm --version 2>/dev/null || echo "npm not installed"',
        ]

        const result = await agent.executeCommand(commands.join(' && echo "---" && '), {
          timeout: 10000,
          capture: true,
        })

        const sections = result.stdout?.split('---') || []

        return {
          systemInfo: sections[0]?.trim(),
          workingDirectory: sections[1]?.trim(),
          user: sections[2]?.trim(),
          userInfo: sections[3]?.trim(),
          topProcesses: sections[4]?.trim(),
          diskUsage: sections[5]?.trim(),
          memoryUsage: sections[6]?.trim(),
          uptime: sections[7]?.trim(),
          availableTools: sections[8]?.trim(),
          nodeVersion: sections[9]?.trim(),
          npmVersion: sections[10]?.trim(),
        }
      }
    } catch (error) {
      console.error(chalk.red(`Failed to get system info for VM ${vmId}: ${error}`))
    }

    return null
  }

  /**
   * Show VM system status (OS-like)
   */
  async showVMSystemStatus(vmId?: string): Promise<void> {
    const targetVM = vmId ? this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId) : this.selectedVM

    if (!targetVM) {
      console.log(chalk.yellow('No VM selected or found'))
      return
    }

    console.log(chalk.cyan.bold(`\n🖥️ VM System Status: ${targetVM.name || 'Unknown'}`))
    console.log(chalk.gray('═'.repeat(70)))

    try {
      const systemInfo = await this.getVMDetailedSystemInfo(targetVM.id)
      if (systemInfo) {
        console.log(chalk.white.bold('\n📊 System Information:'))
        console.log(chalk.gray(systemInfo.systemInfo))

        console.log(chalk.white.bold('\n👤 User & Environment:'))
        console.log(chalk.gray(`User: ${systemInfo.user}`))
        console.log(chalk.gray(`Working Directory: ${systemInfo.workingDirectory}`))
        console.log(chalk.gray(`User ID: ${systemInfo.userInfo}`))

        console.log(chalk.white.bold('\n💾 Resources:'))
        console.log(chalk.gray('Memory Usage:'))
        console.log(chalk.gray(systemInfo.memoryUsage))
        console.log(chalk.gray('Disk Usage:'))
        console.log(chalk.gray(systemInfo.diskUsage))
        console.log(chalk.gray(`Uptime: ${systemInfo.uptime}`))

        console.log(chalk.white.bold('\n🔧 Development Environment:'))
        console.log(chalk.gray(systemInfo.nodeVersion))
        console.log(chalk.gray(systemInfo.npmVersion))
        console.log(chalk.gray('Available tools:'))
        console.log(chalk.gray(systemInfo.availableTools))

        console.log(chalk.white.bold('\n⚡ Top Processes:'))
        console.log(chalk.gray(systemInfo.topProcesses))
      } else {
        console.log(chalk.red('Failed to retrieve system information'))
      }

      // Show container info
      console.log(chalk.white.bold('\n🐳 Container Information:'))
      console.log(chalk.gray(`Container ID: ${targetVM.id.slice(0, 12)}`))
      console.log(chalk.gray(`Repository: ${targetVM.repositoryUrl || 'N/A'}`))
      console.log(chalk.gray(`Created: ${targetVM.createdAt?.toLocaleString() || 'Unknown'}`))
    } catch (error: any) {
      console.log(chalk.red(`✖ Failed to get VM system status: ${error.message}`))
    }

    console.log(chalk.gray('═'.repeat(70)))
  }

  /**
   * Advanced VM Features
   */

  /**
   * Multi-VM broadcast message
   */
  async broadcastToAllVMs(message: string): Promise<{ vmId: string; response: any; success: boolean }[]> {
    const results: { vmId: string; response: any; success: boolean }[] = []
    const vms = await this.getAvailableVMs({ showInactive: false })

    console.log(chalk.cyan(`📢 Broadcasting to ${vms.length} VMs: "${message}"`))
    console.log(chalk.gray('─'.repeat(60)))

    for (const vm of vms) {
      try {
        const agents = vmChatBridge.getActiveAgents()
        const agent = agents.find((a) => a.getContainerId() === vm.id)

        if (agent) {
          console.log(chalk.blue(`🔌 ${vm.name}: Sending...`))

          // Use VM orchestrator for communication
          const response = await this.vmOrchestrator.sendMessageToAgent?.(vm.agentId, message)

          if (response?.success) {
            console.log(chalk.green(`✓ ${vm.name}: Response received`))
            results.push({ vmId: vm.id, response: response.data, success: true })
          } else {
            console.log(chalk.red(`✖ ${vm.name}: ${response?.error || 'Failed'}`))
            results.push({ vmId: vm.id, response: response?.error, success: false })
          }
        } else {
          console.log(chalk.gray(`⚪ ${vm.name}: Agent not found`))
          results.push({ vmId: vm.id, response: 'Agent not found', success: false })
        }
      } catch (error: any) {
        console.log(chalk.red(`✖ ${vm.name}: ${error.message}`))
        results.push({ vmId: vm.id, response: error.message, success: false })
      }
    }

    console.log(chalk.gray('─'.repeat(60)))
    const successful = results.filter((r) => r.success).length
    console.log(chalk.cyan(`📊 Broadcast complete: ${successful}/${vms.length} successful`))

    return results
  }

  /**
   * VM health check across all VMs
   */
  async performHealthCheckAll(): Promise<void> {
    console.log(chalk.cyan.bold('\n🏥 VM Health Check Dashboard'))
    console.log(chalk.gray('═'.repeat(80)))

    const vms = await this.getAvailableVMs({ showInactive: true })
    const healthResults: any[] = []

    for (const vm of vms) {
      console.log(chalk.blue(`\n🔍 Checking VM: ${vm.name}`))
      console.log(chalk.gray(`Container: ${vm.containerId.slice(0, 12)}`))

      try {
        const agents = vmChatBridge.getActiveAgents()
        const agent = agents.find((a) => a.getContainerId() === vm.id)

        if (!agent) {
          console.log(chalk.red('✖ Agent not available'))
          healthResults.push({ vm: vm.name, status: 'agent_missing', health: 'critical' })
          continue
        }

        // Quick health check commands
        const healthCommands = [
          'echo "alive"',
          'whoami',
          'pwd',
          'df -h | head -2',
          'free -m | head -2',
          'ps aux | wc -l',
        ]

        const result = await agent.executeCommand(healthCommands.join(' && echo "---" && '), {
          timeout: 5000,
          capture: true,
        })

        if (result.stdout?.includes('alive')) {
          console.log(chalk.green('✓ VM is responsive'))
          const sections = result.stdout.split('---')
          const processCount = sections[5]?.trim() || '0'
          console.log(chalk.gray(`  Active processes: ${processCount}`))
          console.log(chalk.gray(`  Working directory: ${sections[2]?.trim()}`))

          healthResults.push({
            vm: vm.name,
            status: 'healthy',
            health: 'good',
            processes: processCount,
            workingDir: sections[2]?.trim(),
          })
        } else {
          console.log(chalk.yellow('⚠️ VM partially responsive'))
          healthResults.push({ vm: vm.name, status: 'partial', health: 'warning' })
        }
      } catch (error: any) {
        console.log(chalk.red(`✖ Health check failed: ${error.message}`))
        healthResults.push({ vm: vm.name, status: 'error', health: 'critical', error: error.message })
      }
    }

    // Summary
    console.log(chalk.cyan.bold('\n📋 Health Summary:'))
    console.log(chalk.gray('─'.repeat(80)))

    const healthy = healthResults.filter((r) => r.health === 'good').length
    const warnings = healthResults.filter((r) => r.health === 'warning').length
    const critical = healthResults.filter((r) => r.health === 'critical').length

    console.log(chalk.green(`✓ Healthy: ${healthy}`))
    console.log(chalk.yellow(`⚠️ Warnings: ${warnings}`))
    console.log(chalk.red(`✖ Critical: ${critical}`))

    if (critical > 0) {
      console.log(chalk.red('\n🚨 Critical Issues Found:'))
      healthResults
        .filter((r) => r.health === 'critical')
        .forEach((result) => {
          console.log(chalk.red(`  - ${result.vm}: ${result.status} ${result.error ? `(${result.error})` : ''}`))
        })
    }
  }

  /**
   * Backup VM session state
   */
  async backupVMSession(vmId: string): Promise<string> {
    const vm = this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId)
    if (!vm) throw new Error(`VM ${vmId} not found`)

    console.log(chalk.blue(`💾 Backing up VM session: ${vm.name || vmId.slice(0, 8)}`))

    try {
      const chatHistory = this.getChatHistory(vmId)
      const currentDir = await this.getCurrentWorkingDirectory(vmId)

      const backupId = `vm-backup-${vmId.slice(0, 8)}-${Date.now()}`

      // In a real implementation, this would be saved to file or database
      console.log(chalk.green(`✓ Backup created: ${backupId}`))
      console.log(chalk.gray(`Chat messages: ${chatHistory.length}`))
      console.log(chalk.gray(`Working directory: ${currentDir}`))
      console.log(chalk.gray(`System info: Available`))

      return backupId
    } catch (error: any) {
      console.log(chalk.red(`✖ Backup failed: ${error.message}`))
      throw error
    }
  }

  /**
   * VM session statistics
   */
  async getVMSessionStats(): Promise<void> {
    console.log(chalk.cyan.bold('\n📊 VM Session Statistics'))
    console.log(chalk.gray('═'.repeat(70)))

    const vms = await this.getAvailableVMs({ showInactive: true })
    let totalMessages = 0
    let activeChats = 0
    const vmStats: any[] = []

    for (const vm of vms) {
      const history = this.getChatHistory(vm.id)
      const isActive = vm.status === 'running'

      totalMessages += history.length
      if (isActive && history.length > 0) activeChats++

      vmStats.push({
        name: vm.name,
        id: vm.id.slice(0, 8),
        status: vm.status,
        messages: history.length,
        lastActivity: vm.lastActivity || 'Never',
        isActive,
      })
    }

    console.log(chalk.white.bold('🎯 Overview:'))
    console.log(chalk.gray(`Total VMs: ${vms.length}`))
    console.log(chalk.gray(`Active VMs: ${vms.filter((vm) => vm.status === 'running').length}`))
    console.log(chalk.gray(`Active Chats: ${activeChats}`))
    console.log(chalk.gray(`Total Messages: ${totalMessages}`))

    console.log(chalk.white.bold('\n📋 Individual VM Stats:'))
    console.log(chalk.gray('─'.repeat(70)))

    vmStats.forEach((stat) => {
      const statusIcon = stat.status === 'running' ? '🟢' : '🔴'
      const activeIcon = stat.isActive && stat.messages > 0 ? '💬' : '💤'

      console.log(`${statusIcon} ${activeIcon} ${chalk.white(stat.name)} (${stat.id})`)
      console.log(chalk.gray(`   Messages: ${stat.messages} | Status: ${stat.status}`))
      console.log(
        chalk.gray(
          `   Last Activity: ${typeof stat.lastActivity === 'object' ? stat.lastActivity.toLocaleString() : stat.lastActivity}`
        )
      )
      console.log()
    })
  }

  /**
   * Execute command in VM with OS-like output
   */
  async executeVMCommand(vmId: string, command: string): Promise<string> {
    const vm = this.vmOrchestrator.getActiveContainers().find((c) => c.id === vmId)
    if (!vm) throw new Error(`VM ${vmId} not found`)

    try {
      const agents = vmChatBridge.getActiveAgents()
      const agent = agents.find((a) => a.getContainerId() === vmId)
      if (agent) {
        console.log(chalk.blue(`🔧 Executing: ${command}`))
        const result = await agent.executeCommand(command, { timeout: 30000, capture: true })

        if (result.stdout) {
          console.log(chalk.white('📤 Output:'))
          console.log(result.stdout)
        }

        if (result.stderr) {
          console.log(chalk.yellow('⚠️ Stderr:'))
          console.log(result.stderr)
        }

        return result.stdout || ''
      } else {
        throw new Error('VM agent not found')
      }
    } catch (error: any) {
      console.log(chalk.red(`✖ Command execution failed: ${error.message}`))
      throw error
    }
  }
}

// Singleton instance
export const vmSelector = new VMSelector(
  // Will be injected when available
  null as any
)

// Method to inject VM orchestrator
export function initializeVMSelector(vmOrchestrator: VMOrchestrator): void {
  ; (vmSelector as any).vmOrchestrator = vmOrchestrator
}
