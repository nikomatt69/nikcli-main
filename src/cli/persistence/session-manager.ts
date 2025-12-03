import path from 'node:path'
import { $, fileExists, mkdirp, readJson, writeJson, globScan } from '../utils/bun-compat'

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
    this.baseDir = dir || path.join(process.cwd(), 'sessions')
  }

  private getSessionPath(id: string): string {
    return path.join(this.baseDir, `${id}.json`)
  }

  async loadSession(id: string): Promise<SessionData | null> {
    try {
      const sessionPath = this.getSessionPath(id)
      if (!(await fileExists(sessionPath))) {
        return null
      }
      return await readJson<SessionData>(sessionPath)
    } catch (e: any) {
      if (e.code === 'ENOENT') return null
      throw e
    }
  }

  async saveSession(session: SessionData): Promise<void> {
    await mkdirp(this.baseDir)
    session.updatedAt = new Date().toISOString()
    await writeJson(this.getSessionPath(session.id), session)
  }

  async listSessions(): Promise<SessionData[]> {
    try {
      // Check if directory exists
      if (!(await fileExists(this.baseDir))) {
        return []
      }
      
      const files = await globScan('*.json', { cwd: this.baseDir })
      const sessions: SessionData[] = []
      
      for (const file of files) {
        try {
          const session = await readJson<SessionData>(path.join(this.baseDir, file))
          sessions.push(session)
        } catch {
          // Skip invalid session files
        }
      }
      return sessions
    } catch (e: any) {
      if (e.code === 'ENOENT') return []
      throw e
    }
  }

  async deleteSession(id: string): Promise<void> {
    await $`rm -f ${this.getSessionPath(id)}`.quiet()
  }
}
