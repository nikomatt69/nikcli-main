import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Represents a single chat message.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

/** Session data structure. */
export interface SessionData {
  id: string
  title?: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export class SessionManager {
  private baseDir: string

  constructor(dir?: string) {
    this.baseDir = dir || path.join(require('../utils/working-dir').getWorkingDirectory(), 'sessions')
  }

  private getSessionPath(id: string): string {
    return path.join(this.baseDir, `${id}.json`)
  }

  async loadSession(id: string): Promise<SessionData | null> {
    try {
      const raw = await fs.readFile(this.getSessionPath(id), 'utf-8')
      return JSON.parse(raw)
    } catch (e: any) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }

  async saveSession(session: SessionData): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
    session.updatedAt = new Date().toISOString()
    await fs.writeFile(this.getSessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8')
  }

  async listSessions(): Promise<SessionData[]> {
    try {
      const files = await fs.readdir(this.baseDir)
      const sessions: SessionData[] = []
      for (const file of files) {
        if (file.endsWith('.json')) {
          const raw = await fs.readFile(path.join(this.baseDir, file), 'utf-8')
          sessions.push(JSON.parse(raw))
        }
      }
      return sessions
    } catch (e: any) {
      if (e.code === 'ENOENT') return []
      throw e
    }
  }

  async deleteSession(id: string): Promise<void> {
    await fs.unlink(this.getSessionPath(id))
  }
}
