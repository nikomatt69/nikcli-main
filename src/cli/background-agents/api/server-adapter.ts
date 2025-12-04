import type { APIServerConfig } from './server'
import { BackgroundAgentsAPIServer } from './server'
import { BunBackgroundAgentsAPIServer } from './server-bun'
import type { HealthChecker } from '../../monitoring'

type ServerMode = 'express' | 'bun'

export class UnifiedAPIServer {
  private mode: ServerMode
  private expressServer?: BackgroundAgentsAPIServer
  private bunServer?: BunBackgroundAgentsAPIServer

  constructor(config: APIServerConfig, healthChecker?: HealthChecker) {
    const useBun = (process.env.USE_BUN_SERVER || '').toLowerCase() === 'true'
    this.mode = useBun ? 'bun' : 'express'

    if (this.mode === 'express') {
      this.expressServer = new BackgroundAgentsAPIServer(config, healthChecker)
    } else {
      this.bunServer = new BunBackgroundAgentsAPIServer(config, healthChecker)
    }
  }

  async start(): Promise<void> {
    if (this.mode === 'express') {
      await this.expressServer?.start()
    } else {
      await this.bunServer?.start()
    }
  }

  async stop(): Promise<void> {
    if (this.mode === 'express') {
      await this.expressServer?.stop()
    } else {
      await this.bunServer?.stop()
    }
  }
}
