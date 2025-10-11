import * as fs from 'node:fs/promises'
import * as path from 'path'

export interface TelemetryEvent {
  type: string
  ts: number
  data: Record<string, any>
}

export class TokenTelemetry {
  private static instance: TokenTelemetry
  private logFile: string

  private constructor(logDir: string = './.nikcli') {
    this.logFile = path.join(logDir, 'telemetry.jsonl')
  }

  static getInstance(): TokenTelemetry {
    if (!TokenTelemetry.instance) TokenTelemetry.instance = new TokenTelemetry()
    return TokenTelemetry.instance
  }

  private async append(event: TelemetryEvent): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true })
      await fs.appendFile(this.logFile, `${JSON.stringify(event)}\n`)
    } catch {
      // silent
    }
  }

  async recordPrompt(summary: {
    source: string
    estimatedTokens: number
    tokenLimit?: number
    messages?: number
  }): Promise<void> {
    await this.append({ type: 'prompt', ts: Date.now(), data: summary })
  }

  async recordOptimization(detail: {
    source: string
    beforeTokens: number
    afterTokens: number
    compressionRatio: number
  }): Promise<void> {
    await this.append({ type: 'opt', ts: Date.now(), data: detail })
  }

  async recordCache(event: {
    action: 'hit' | 'miss' | 'store'
    similarity?: number
    tokensSaved?: number
  }): Promise<void> {
    await this.append({ type: 'cache', ts: Date.now(), data: event })
  }

  async recordTruncation(event: {
    kind: 'system' | 'tool' | 'functionArgs' | 'message'
    beforeTokens: number
    afterTokens: number
  }): Promise<void> {
    await this.append({ type: 'truncate', ts: Date.now(), data: event })
  }

  async recordRagChunking(event: {
    file: string
    chunks: number
    chunkTokens: number
    overlapTokens: number
  }): Promise<void> {
    await this.append({ type: 'rag', ts: Date.now(), data: event })
  }
}

export const tokenTelemetry = TokenTelemetry.getInstance()
