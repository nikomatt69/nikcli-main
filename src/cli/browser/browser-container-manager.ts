import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { ContainerManager, type ContainerConfig, type ContainerStats } from '../virtualized-agents/container-manager'
import { advancedUI } from '../ui/advanced-cli-ui'

/**
 * BrowserContainerManager - Specialized container manager for browser automation
 *
 * Extends the base ContainerManager to handle browser-specific containers with:
 * - Chromium/Playwright browser runtime
 * - noVNC server for remote viewing
 * - WebSocket API for real-time communication
 * - Optimized resource allocation for browser workloads
 */
export class BrowserContainerManager extends ContainerManager {
  private activeBrowserContainers: Map<string, BrowserContainer> = new Map()
  // Production-ready image fallback strategy
  private readonly browserImages = [
    'kasmweb/chrome:1.15.0',                        // Primary: Lightweight with VNC
    'mcr.microsoft.com/playwright:v1.45.0-focal',   // Fallback: Official Playwright
    'selenoid/vnc:chrome_131.0'                     // Emergency: Basic browser
  ] as const

  private readonly baseNoVNCPort = 6080
  private readonly basePlaywrightPort = 9222
  private readonly baseVNCPort = 5900

  constructor() {
    super()
    this.setupEventHandlers()
  }

  /**
   * Create browser container with production-ready configuration
   */
  async createBrowserContainer(options: BrowserContainerOptions = {}): Promise<BrowserContainer> {
    const containerName = options.name || `browser-${Date.now()}`

    advancedUI.logFunctionCall('createBrowserContainer', { containerName })

    try {
      // Validate Docker environment first
      await this.validateDockerEnvironment()

      // Find available ports
      const ports = await this.allocatePorts()
      const selectedImage = await this.selectBrowserImage()

      advancedUI.logFunctionUpdate('info', `Using image: ${selectedImage}`, '🐳')
      advancedUI.logFunctionUpdate('info', `Ports: VNC:${ports.vnc}, noVNC:${ports.noVnc}, API:${ports.api}`, '🔌')
      // Configure container with production settings
      const containerConfig: ContainerConfig = {
        name: containerName,
        image: selectedImage,
        environment: this.buildEnvironment(selectedImage, ports, options),
        ports: this.buildPortMappings(ports),
        volumes: options.volumes || [],
        security: {
          readOnlyRootfs: false, // Browser needs write access
          noNewPrivileges: true,
          capabilities: {
            drop: ['ALL'],
            add: ['SYS_ADMIN'], // Required for Chrome sandbox
          },
          ...options.security,
        },
        resources: {
          memory: options.memory || '2g',
          cpuQuota: options.cpuQuota || '2.0',
          ...options.resources,
        },
      }

      // Create the container using parent class
      const containerId = await this.createContainer(containerConfig)

      // Start the container
      await this.startContainer(containerId)

      // Create browser container object
      const browserContainer: BrowserContainer = {
        id: containerId,
        name: containerName,
        status: 'initializing',
        image: selectedImage,
        ports: ports,
        noVncUrl: `http://localhost:${ports.noVnc}`,
        vncUrl: `vnc://localhost:${ports.vnc}`,
        apiUrl: `http://localhost:${ports.api}`,
        createdAt: new Date(),
        lastActivity: new Date(),
        config: containerConfig,
        screenSize: {
          width: options.screenWidth || 1920,
          height: options.screenHeight || 1080,
        },
        displayPort: ports.noVnc,
        apiPort: ports.api,
        vncPort: ports.vnc,
      }

      // Initialize browser environment
      await this.initializeBrowserEnvironment(browserContainer)

      // Store active container
      this.activeBrowserContainers.set(containerId, browserContainer)

      advancedUI.logFunctionUpdate('success', `Browser container ready: ${containerName}`, '🌐')
      advancedUI.logFunctionUpdate('info', `noVNC viewer: ${browserContainer.noVncUrl}`, '🖥️')
      advancedUI.logFunctionUpdate('info', `Browser API: ${browserContainer.apiUrl}`, '🎭')

      this.emit('browser:created', browserContainer)
      return browserContainer

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Failed to create browser container: ${error.message}`, '❌')
      throw new Error(`Browser container creation failed: ${error.message}`)
    }
  }

  /**
   * Initialize browser environment (kasmweb is self-contained)
   */
  private async initializeBrowserEnvironment(container: BrowserContainer): Promise<void> {
    try {
      advancedUI.logFunctionUpdate('info', 'Initializing browser environment...', '🔧')

      // For kasmweb images, the environment is self-contained
      if (container.image.includes('kasmweb')) {
        // kasmweb containers start automatically with VNC and Chrome
        await this.delay(10000) // Allow container to fully initialize

        container.status = 'ready'
        container.lastActivity = new Date()

        advancedUI.logFunctionUpdate('success', 'Kasmweb browser environment ready', '✅')

      } else {
        // For other images, use manual initialization
        await this.initializeCustomBrowserEnvironment(container)
      }

      // Verify services are running
      await this.verifyBrowserServices(container)

    } catch (error: any) {
      container.status = 'error'
      advancedUI.logFunctionUpdate('error', `Browser initialization failed: ${error.message}`, '❌')
      throw error
    }
  }

  /**
   * Initialize custom browser environment for non-kasmweb images
   */
  private async initializeCustomBrowserEnvironment(container: BrowserContainer): Promise<void> {
    const containerId = container.id

    // Start Xvfb (X Virtual Framebuffer)
    await this.executeCommand(containerId, 'Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &')
    await this.delay(2000)

    // Start VNC server
    await this.executeCommand(containerId, 'x11vnc -display :99 -nopw -listen localhost -xkb -rfbport 5900 > /dev/null 2>&1 &')

    // Start noVNC websocket proxy
    await this.executeCommand(containerId, 'websockify --web /usr/share/novnc 6080 localhost:5900 > /dev/null 2>&1 &')
    await this.delay(3000)

    // Start browser in headed mode
    await this.executeCommand(containerId, 'DISPLAY=:99 google-chrome-stable --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-user-data > /dev/null 2>&1 &')
    await this.delay(5000)

    container.status = 'ready'
    container.lastActivity = new Date()

    advancedUI.logFunctionUpdate('success', 'Custom browser environment initialized', '✅')
  }

  /**
   * Verify browser services are running correctly
   */
  private async verifyBrowserServices(container: BrowserContainer): Promise<void> {
    const maxRetries = 3
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        attempt++
        advancedUI.logFunctionUpdate('info', `Verifying services (attempt ${attempt}/${maxRetries})...`, '🔍')

        // For kasmweb, check the main interface
        const checkUrl = container.image.includes('kasmweb')
          ? `${container.noVncUrl}/`
          : `${container.noVncUrl}/vnc.html`

        const response = await fetch(checkUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        })

        if (response.ok) {
          advancedUI.logFunctionUpdate('success', 'Browser services verified', '✅')
          return
        } else {
          throw new Error(`Service returned status ${response.status}`)
        }

      } catch (error: any) {
        if (attempt === maxRetries) {
          advancedUI.logFunctionUpdate('warning', `Service verification failed after ${maxRetries} attempts: ${error.message}`, '⚠️')
          // Don't throw - services might still work even if verification fails
        } else {
          advancedUI.logFunctionUpdate('info', `Retry ${attempt} failed, waiting...`, '⏳')
          await this.delay(2000)
        }
      }
    }
  }

  /**
   * Stop and remove browser container
   */
  async stopBrowserContainer(containerId: string): Promise<void> {
    const container = this.activeBrowserContainers.get(containerId)
    if (!container) {
      throw new Error(`Browser container ${containerId} not found`)
    }

    try {
      advancedUI.logFunctionCall('stopBrowserContainer', { containerId: containerId.slice(0, 12) })

      container.status = 'stopping'

      // Gracefully stop browser processes
      await this.executeCommand(containerId, 'pkill -f chrome || true')
      await this.executeCommand(containerId, 'pkill -f x11vnc || true')
      await this.executeCommand(containerId, 'pkill -f websockify || true')
      await this.executeCommand(containerId, 'pkill -f Xvfb || true')

      // Stop and remove container
      await this.stopContainer(containerId)
      await this.removeContainer(containerId)

      // Clean up tracking
      this.activeBrowserContainers.delete(containerId)

      advancedUI.logFunctionUpdate('success', `Browser container stopped: ${container.name}`, '🛑')
      this.emit('browser:stopped', { containerId, name: container.name })

    } catch (error: any) {
      advancedUI.logFunctionUpdate('error', `Failed to stop browser container: ${error.message}`, '❌')
      throw error
    }
  }

  /**
   * Get browser container info
   */
  getBrowserContainer(containerId: string): BrowserContainer | undefined {
    return this.activeBrowserContainers.get(containerId)
  }

  /**
   * List all active browser containers
   */
  getActiveBrowserContainers(): BrowserContainer[] {
    return Array.from(this.activeBrowserContainers.values())
  }

  /**
   * Get browser container statistics
   */
  async getBrowserContainerStats(containerId: string): Promise<BrowserContainerStats | null> {
    const container = this.activeBrowserContainers.get(containerId)
    if (!container) return null

    try {
      const baseStats = await this.getContainerStats(containerId)

      return {
        ...baseStats,
        container_id: containerId,
        container_name: container.name,
        status: container.status,
        display_port: container.displayPort,
        api_port: container.apiPort,
        vnc_port: container.vncPort,
        screen_size: container.screenSize,
        uptime_seconds: Math.floor((Date.now() - container.createdAt.getTime()) / 1000),
        last_activity: container.lastActivity,
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', `Failed to get stats for ${containerId}: ${error.message}`, '⚠️')
      return null
    }
  }

  /**
   * Cleanup all browser containers
   */
  async cleanupAllBrowserContainers(): Promise<number> {
    const containers = this.getActiveBrowserContainers()
    let cleanedCount = 0

    advancedUI.logFunctionCall('cleanupAllBrowserContainers', { count: containers.length })

    for (const container of containers) {
      try {
        await this.stopBrowserContainer(container.id)
        cleanedCount++
      } catch (error: any) {
        advancedUI.logFunctionUpdate('error', `Failed to cleanup ${container.name}: ${error.message}`, '❌')
      }
    }

    if (cleanedCount > 0) {
      advancedUI.logFunctionUpdate('success', `Cleaned up ${cleanedCount} browser containers`, '🧹')
    }

    return cleanedCount
  }

  /**
   * Cleanup inactive browser containers (older than maxAge)
   */
  async cleanupInactiveBrowserContainers(maxAge: number = 3600000): Promise<number> {
    const now = Date.now()
    const containers = this.getActiveBrowserContainers()
    let cleanedCount = 0

    for (const container of containers) {
      const age = now - container.lastActivity.getTime()

      if (age > maxAge && container.status !== 'active') {
        try {
          await this.stopBrowserContainer(container.id)
          cleanedCount++
        } catch (error: any) {
          advancedUI.logFunctionUpdate('warning', `Failed to cleanup inactive container ${container.name}: ${error.message}`, '⚠️')
        }
      }
    }

    return cleanedCount
  }

  /**
   * Update container activity timestamp
   */
  updateContainerActivity(containerId: string): void {
    const container = this.activeBrowserContainers.get(containerId)
    if (container) {
      container.lastActivity = new Date()
      container.status = 'active'
    }
  }

  /**
   * Validate Docker environment and requirements
   */
  private async validateDockerEnvironment(): Promise<void> {
    const { execSync } = require('child_process')

    try {
      // Check Docker daemon
      execSync('docker info', { timeout: 5000, stdio: 'ignore' })

      // Check Docker version
      const version = execSync('docker --version', { encoding: 'utf8', timeout: 3000 })
      advancedUI.logFunctionUpdate('info', `Docker validated: ${version.trim()}`, '✅')

      // Check available disk space (minimum 2GB for browser images)
      execSync('docker system df', { timeout: 3000, stdio: 'ignore' })
      advancedUI.logFunctionUpdate('info', 'Docker disk space checked', '💾')

    } catch (error: any) {
      if (error.message.includes('Cannot connect')) {
        throw new Error('Docker daemon is not running. Please start Docker Desktop or Docker service.')
      } else if (error.message.includes('not found')) {
        throw new Error('Docker is not installed. Please install Docker from https://docker.com')
      } else {
        throw new Error(`Docker validation failed: ${error.message}`)
      }
    }
  }

  /**
   * Select best available browser image with fallback
   */
  private async selectBrowserImage(): Promise<string> {
    const { execSync } = require('child_process')

    for (const image of this.browserImages) {
      try {
        advancedUI.logFunctionUpdate('info', `Checking image: ${image}`, '🔍')

        // Check if image exists locally first
        try {
          execSync(`docker inspect ${image}`, { timeout: 3000, stdio: 'ignore' })
          advancedUI.logFunctionUpdate('success', `Image available locally: ${image}`, '✅')
          return image
        } catch {
          // Image not available locally, try to pull
          advancedUI.logFunctionUpdate('info', `Pulling image: ${image}...`, '⬇️')

          try {
            // Use docker pull with progress and retry logic
            execSync(`docker pull ${image}`, {
              timeout: 300000, // 5 minutes for large images
              stdio: 'pipe'
            })

            // Verify the pull was successful
            execSync(`docker inspect ${image}`, { timeout: 3000, stdio: 'ignore' })
            advancedUI.logFunctionUpdate('success', `Image pulled successfully: ${image}`, '✅')
            return image

          } catch (pullError: any) {
            advancedUI.logFunctionUpdate('warning', `Failed to pull ${image}: ${pullError.message}`, '⚠️')
            continue
          }
        }

      } catch (error: any) {
        advancedUI.logFunctionUpdate('warning', `Image ${image} failed: ${error.message}`, '⚠️')
        continue
      }
    }

    throw new Error('No browser images available. Please check your internet connection and Docker configuration.')
  }

  /**
   * Allocate available ports
   */
  private async allocatePorts(): Promise<BrowserPorts> {
    return {
      vnc: await this.findAvailablePortAsync(this.baseVNCPort),
      noVnc: await this.findAvailablePortAsync(this.baseNoVNCPort),
      api: await this.findAvailablePortAsync(this.basePlaywrightPort),
    }
  }

  /**
   * Build environment variables for container
   */
  private buildEnvironment(image: string, _ports: BrowserPorts, options: BrowserContainerOptions): Record<string, string> {
    const environment: Record<string, string> = {
      DISPLAY: ':99',
      SCREEN_WIDTH: (options.screenWidth || 1920).toString(),
      SCREEN_HEIGHT: (options.screenHeight || 1080).toString(),
      NODE_ENV: 'production',
      ...options.environment,
    }

    // Image-specific environment
    if (image.includes('kasmweb')) {
      environment.VNC_PW = 'password'
      environment.VNC_RESOLUTION = `${environment.SCREEN_WIDTH}x${environment.SCREEN_HEIGHT}`
    } else if (image.includes('playwright')) {
      environment.CHROME_BIN = '/usr/bin/google-chrome-stable'
    }

    return environment
  }

  /**
   * Build port mappings for container
   */
  private buildPortMappings(ports: BrowserPorts): string[] {
    return [
      `${ports.noVnc}:6901`,  // noVNC web interface (kasmweb default)
      `${ports.vnc}:5901`,    // VNC server (kasmweb default)
      `${ports.api}:9222`,    // Chrome DevTools API
    ]
  }

  /**
   * Check Docker availability
   */
  async checkDockerAvailability(): Promise<boolean> {
    try {
      const { execSync } = require('child_process')
      execSync('docker --version', { timeout: 5000, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  // Private utility methods

  private async findAvailablePortAsync(startPort: number): Promise<number> {
    const net = require('net')

    return new Promise((resolve, reject) => {
      const server = net.createServer()

      server.listen(startPort, () => {
        const port = server.address()?.port
        server.close(() => {
          if (port) {
            resolve(port)
          } else {
            reject(new Error('Could not determine port'))
          }
        })
      })

      server.on('error', () => {
        // Port is in use, try next one
        if (startPort < startPort + 100) {
          this.findAvailablePortAsync(startPort + 1).then(resolve).catch(reject)
        } else {
          reject(new Error(`No available ports found in range ${startPort}-${startPort + 100}`))
        }
      })
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private setupEventHandlers(): void {
    // Handle base container events
    this.on('container:created', ({ containerId }) => {
      advancedUI.logFunctionUpdate('info', `Container created: ${containerId.slice(0, 12)}`, '🐳')
    })

    this.on('container:stopped', ({ containerId }) => {
      advancedUI.logFunctionUpdate('info', `Container stopped: ${containerId.slice(0, 12)}`, '⏹️')
    })

    // Periodic cleanup of inactive containers
    setInterval(() => {
      this.cleanupInactiveBrowserContainers()
    }, 300000) // Every 5 minutes
  }
}

// Type definitions
export interface BrowserContainerOptions {
  name?: string
  image?: string
  screenWidth?: number
  screenHeight?: number
  memory?: string
  cpuQuota?: string
  environment?: Record<string, string>
  volumes?: string[]
  security?: ContainerConfig['security']
  resources?: ContainerConfig['resources']
}

export interface BrowserPorts {
  vnc: number
  noVnc: number
  api: number
}

export interface BrowserContainer {
  id: string
  name: string
  status: 'initializing' | 'ready' | 'active' | 'stopping' | 'error'
  image: string
  ports: BrowserPorts
  noVncUrl: string
  vncUrl: string
  apiUrl: string
  createdAt: Date
  lastActivity: Date
  config: ContainerConfig
  screenSize: {
    width: number
    height: number
  }
  displayPort: number
  apiPort: number
  vncPort: number
}

export interface BrowserContainerStats extends ContainerStats {
  container_id: string
  container_name: string
  status: string
  display_port: number
  api_port: number
  vnc_port: number
  screen_size: { width: number; height: number }
  uptime_seconds: number
  last_activity: Date
}

// Singleton instance
export const browserContainerManager = new BrowserContainerManager()