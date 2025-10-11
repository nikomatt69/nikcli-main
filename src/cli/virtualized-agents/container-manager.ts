import { exec } from 'child_process'
import { EventEmitter } from 'events'
import { promisify } from 'util'
import { advancedUI } from '../ui/advanced-cli-ui'

const execAsync = promisify(exec)

/**
 * ContainerManager - Docker interface for secure container operations
 *
 * Handles:
 * - Docker container lifecycle (create, start, stop, remove)
 * - Secure container configuration with isolation
 * - Resource management and monitoring
 * - Network isolation and security
 * - Volume management for workspace isolation
 * - Command execution in containers
 */
export class ContainerManager extends EventEmitter {
  private networkName = 'nikcli-network'

  constructor() {
    super()
    this.ensureDockerNetwork()
  }

  /**
   * Create secure container with isolation and resource limits
   */
  async createContainer(config: ContainerConfig): Promise<string> {
    try {
      advancedUI.logInfo(`🐳 Creating container for agent ${config.name}`)

      // Build docker run command honoring config
      const args: string[] = ['docker', 'run', '-d']

      // Name and network
      args.push('--name', config.name)
      args.push('--network', this.networkName)

      // Security options
      if (config.security?.noNewPrivileges !== false) {
        args.push('--security-opt', 'no-new-privileges:true')
      }
      if (config.security?.readOnlyRootfs) {
        args.push('--read-only')
      }
      ;(config.security?.capabilities?.drop || []).forEach((cap) => args.push('--cap-drop', cap))
      ;(config.security?.capabilities?.add || []).forEach((cap) => args.push('--cap-add', cap))

      // Tmpfs mounts for extra isolation
      args.push('--tmpfs', '/tmp:rw,noexec,nosuid,size=100m')
      args.push('--tmpfs', '/var/tmp:rw,noexec,nosuid,size=50m')

      // Resource limits
      args.push('--memory', config.resources?.memory || '256m')
      args.push('--cpus', config.resources?.cpuQuota || '0.5')

      // Environment variables
      Object.entries(config.environment || {}).forEach(([key, value]) => {
        args.push('-e', `${key}=${value}`)
      })

      // Volumes
      ;(config.volumes || []).forEach((volume) => args.push('-v', this.shellQuote(volume)))

      // Ports
      ;(config.ports || []).forEach((port) => args.push('-p', port))

      // Image and default command (keep container alive)
      args.push(config.image, 'sleep', 'infinity')

      advancedUI.logInfo(`Docker command: ${args.join(' ')}`)

      // Execute Docker run command
      const { stdout, stderr } = await execAsync(args.join(' '), { timeout: 120000 })

      // Docker outputs image pull progress to stderr, which is not an error
      // Only treat as error if stderr contains actual error indicators
      if (
        stderr &&
        !stderr.includes('Warning') &&
        !stderr.includes('Pulling from') &&
        !stderr.includes('Pull complete') &&
        !stderr.includes('Download complete') &&
        !stderr.includes('Digest:') &&
        !stderr.includes('Status:') &&
        !stderr.includes('Unable to find image') // This is normal for first pull
      ) {
        throw new Error(`Docker create failed: ${stderr}`)
      }

      const containerId = stdout.trim()

      if (!containerId) {
        throw new Error('Failed to get container ID from Docker')
      }

      advancedUI.logSuccess(`✓ Container created: ${containerId.slice(0, 12)}`)
      this.emit('container:created', { containerId, name: config.name })

      return containerId
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to create container: ${error.message}`)
      throw error
    }
  }

  /**
   * Start container
   */
  async startContainer(containerId: string): Promise<void> {
    try {
      advancedUI.logInfo(`▶️ Starting container: ${containerId.slice(0, 12)}`)

      const { stderr } = await execAsync(`docker start ${containerId}`)

      if (stderr) {
        throw new Error(`Docker start failed: ${stderr}`)
      }

      // Wait for container to be ready
      await this.waitForContainer(containerId)

      advancedUI.logSuccess(`✓ Container started: ${containerId.slice(0, 12)}`)
      this.emit('container:started', { containerId })
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to start container: ${error.message}`)
      throw error
    }
  }

  /**
   * Stop container gracefully
   */
  async stopContainer(containerId: string): Promise<void> {
    try {
      advancedUI.logInfo(`⏹️ Stopping container: ${containerId.slice(0, 12)}`)

      // Give container 10 seconds to stop gracefully
      const { stderr } = await execAsync(`docker stop -t 10 ${containerId}`)

      if (stderr && !stderr.includes('Warning')) {
        advancedUI.logError(`Warning stopping container: ${stderr}`)
      }

      advancedUI.logSuccess(`✓ Container stopped: ${containerId.slice(0, 12)}`)
      this.emit('container:stopped', { containerId })
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to stop container: ${error.message}`)

      // Force kill if graceful stop fails
      try {
        await execAsync(`docker kill ${containerId}`)
        advancedUI.logWarning(`⚠️ Container force killed: ${containerId.slice(0, 12)}`)
      } catch (killError: any) {
        advancedUI.logError(`❌ Failed to kill container: ${killError.message}`)
      }
    }
  }

  /**
   * Remove container and cleanup
   */
  async removeContainer(containerId: string): Promise<void> {
    try {
      advancedUI.logInfo(`🗑️ Removing container: ${containerId.slice(0, 12)}`)

      // Remove container and associated volumes
      const { stderr } = await execAsync(`docker rm -v ${containerId}`)

      if (stderr && !stderr.includes('Warning')) {
        advancedUI.logError(`Warning removing container: ${stderr}`)
      }

      advancedUI.logSuccess(`✓ Container removed: ${containerId.slice(0, 12)}`)
      this.emit('container:removed', { containerId })
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to remove container: ${error.message}`)
    }
  }

  /**
   * Execute command in container
   */
  async executeCommand(containerId: string, command: string): Promise<string> {
    try {
      const dockerExecCommand = `docker exec ${containerId} sh -c "${command.replace(/"/g, '\\"')}"`

      advancedUI.logInfo(`🔧 Executing: ${command}`)
      advancedUI.logInfo(`📋 Docker command: ${dockerExecCommand}`)

      const { stdout, stderr } = await execAsync(dockerExecCommand, {
        timeout: 180000, // 180 second timeout to accommodate installs
      })

      if (stdout) {
        advancedUI.logInfo(`📤 Command output: ${stdout.trim()}`)
      }

      if (stderr && !this.isWarningOnly(stderr)) {
        advancedUI.logError(`⚠️ Command stderr: ${stderr}`)
      }

      return stdout
    } catch (error: any) {
      advancedUI.logError(`❌ Command execution failed: ${error.message}`)
      advancedUI.logError(`❌ Command failed in ${containerId.slice(0, 8)}: ${command}`)
      throw new Error(`Command failed: ${command} - ${error.message}`)
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(containerId: string, lines: number = 100): Promise<string> {
    try {
      advancedUI.logInfo(`📋 Getting logs for container ${containerId.slice(0, 12)}`)

      const { stdout, stderr } = await execAsync(`docker logs --tail ${lines} ${containerId}`)

      if (stderr) {
        advancedUI.logError(`⚠️ Docker logs stderr: ${stderr}`)
      }

      return stdout || stderr || 'No logs available'
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to get container logs: ${error.message}`)
      throw error
    }
  }

  /**
   * Get container statistics and metrics
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    try {
      const { stdout } = await execAsync(
        `docker stats ${containerId} --no-stream --format "table {{.MemUsage}}\t{{.CPUPerc}}\t{{.NetIO}}\t{{.BlockIO}}"`
      )

      const lines = stdout.trim().split('\n')
      if (lines.length < 2) {
        throw new Error('Invalid stats output')
      }

      const statsLine = lines[1]
      const [memUsage, cpuPerc, netIO, blockIO] = statsLine.split('\t')

      return {
        memory_usage: this.parseMemoryUsage(memUsage),
        cpu_usage: this.parseCPUUsage(cpuPerc),
        network_activity: this.parseNetworkIO(netIO),
        disk_usage: this.parseBlockIO(blockIO),
        uptime: await this.getContainerUptime(containerId),
      }
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to get container stats: ${error.message}`)
      return {
        memory_usage: 0,
        cpu_usage: 0,
        network_activity: 0,
        disk_usage: 0,
        uptime: 0,
      }
    }
  }

  /**
   * Check if Docker is available and running
   */
  async checkDockerAvailability(): Promise<boolean> {
    try {
      await execAsync('docker version --format "{{.Server.Version}}"')
      return true
    } catch (_error) {
      advancedUI.logError('❌ Docker is not available or not running')
      return false
    }
  }

  /**
   * Ensure secure Docker network exists
   */
  private async ensureDockerNetwork(): Promise<void> {
    try {
      // Check if network exists
      await execAsync(`docker network inspect ${this.networkName}`)
      advancedUI.logInfo(`Docker network ${this.networkName} already exists`)
    } catch (_error) {
      // Network doesn't exist, create it
      try {
        await execAsync(`docker network create --driver bridge ${this.networkName}`)
        advancedUI.logSuccess(`✓ Created secure Docker network: ${this.networkName}`)
      } catch (createError: any) {
        advancedUI.logError(`❌ Failed to create Docker network: ${createError.message}`)
      }
    }
  }

  /**
   * Wait for container to be ready
   */
  private async waitForContainer(containerId: string, maxAttempts: number = 30): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { stdout } = await execAsync(`docker inspect ${containerId} --format="{{.State.Status}}"`)

        if (stdout.trim() === 'running') {
          return
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (_error) {
        if (attempt === maxAttempts) {
          throw new Error(`Container failed to start after ${maxAttempts} attempts`)
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  /**
   * Get container uptime in seconds
   */
  private async getContainerUptime(containerId: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`docker inspect ${containerId} --format="{{.State.StartedAt}}"`)

      const startTime = new Date(stdout.trim())
      const now = new Date()
      return Math.floor((now.getTime() - startTime.getTime()) / 1000)
    } catch (_error) {
      return 0
    }
  }

  // Utility methods for parsing Docker stats
  private parseMemoryUsage(memUsage: string): number {
    const match = memUsage.match(/([0-9.]+)([KMGT]?i?B)/)
    if (!match) return 0

    const value = parseFloat(match[1])
    const unit = match[2]

    const multipliers: { [key: string]: number } = {
      B: 1,
      KiB: 1024,
      MiB: 1024 * 1024,
      GiB: 1024 * 1024 * 1024,
      KB: 1000,
      MB: 1000 * 1000,
      GB: 1000 * 1000 * 1000,
    }

    return value * (multipliers[unit] || 1)
  }

  private parseCPUUsage(cpuPerc: string): number {
    const match = cpuPerc.match(/([0-9.]+)%/)
    return match ? parseFloat(match[1]) : 0
  }

  private parseNetworkIO(netIO: string): number {
    // Sum of input and output bytes
    const parts = netIO.split(' / ')
    let total = 0

    for (const part of parts) {
      const match = part.match(/([0-9.]+)([KMGT]?i?B)/)
      if (match) {
        const value = parseFloat(match[1])
        const unit = match[2]
        total += value * this.getByteMultiplier(unit)
      }
    }

    return total
  }

  private parseBlockIO(blockIO: string): number {
    // Sum of read and write bytes
    const parts = blockIO.split(' / ')
    let total = 0

    for (const part of parts) {
      const match = part.match(/([0-9.]+)([KMGT]?i?B)/)
      if (match) {
        const value = parseFloat(match[1])
        const unit = match[2]
        total += value * this.getByteMultiplier(unit)
      }
    }

    return total
  }

  private getByteMultiplier(unit: string): number {
    const multipliers: { [key: string]: number } = {
      B: 1,
      KiB: 1024,
      MiB: 1024 * 1024,
      GiB: 1024 * 1024 * 1024,
      KB: 1000,
      MB: 1000 * 1000,
      GB: 1000 * 1000 * 1000,
    }

    return multipliers[unit] || 1
  }

  private shellQuote(value: string): string {
    if (/^[A-Za-z0-9._/-=:]+$/.test(value)) {
      return value
    }

    return `'${value.replace(/'/g, "'\\''")}'`
  }

  private isWarningOnly(stderr: string): boolean {
    const warningPatterns = ['Warning:', 'WARNING:', 'WARN:', 'debconf: unable to initialize frontend']

    return warningPatterns.some((pattern) => stderr.includes(pattern))
  }
}

/**
 * Simple Docker client wrapper
 */
class DockerClient {
  async version(): Promise<string> {
    const { stdout } = await execAsync('docker version --format "{{.Server.Version}}"')
    return stdout.trim()
  }
}

// Type definitions
export interface ContainerConfig {
  name: string
  image: string
  environment?: { [key: string]: string }
  volumes?: string[]
  ports?: string[]
  security?: {
    readOnlyRootfs?: boolean
    noNewPrivileges?: boolean
    seccompProfile?: string
    capabilities?: {
      drop?: string[]
      add?: string[]
    }
  }
  resources?: {
    memory?: string
    cpuQuota?: string
    diskQuota?: string
  }
  network?: {
    mode?: string
    isolate?: boolean
  }
}

export interface ContainerStats {
  memory_usage: number
  cpu_usage: number
  network_activity: number
  disk_usage: number
  uptime: number
}
