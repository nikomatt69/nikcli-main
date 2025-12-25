import { join } from 'node:path'
import { bunFile, bunWrite, fileExists, mkdirp } from '../utils/bun-compat'

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
    this.baseDir = dir || join(process.cwd(), 'sessions')
  }

  private getSessionPath(id: string): string {
    return join(this.baseDir, `${id}.json`)
  }

  async loadSession(id: string): Promise<SessionData | null> {
    try {
      const sessionPath = this.getSessionPath(id)
      const exists = await fileExists(sessionPath)
      if (!exists) return null

      const file = bunFile(sessionPath)
      const raw = await file.text()
      return JSON.parse(raw)
    } catch (error: unknown) {
      const e = error as { code?: string }
      if (e.code === 'ENOENT') return null
      throw error
    }
  }

  async saveSession(session: SessionData): Promise<void> {
    await mkdirp(this.baseDir)
    session.updatedAt = new Date().toISOString()
    const content = JSON.stringify(session, null, 2)
    await bunWrite(this.getSessionPath(session.id), content)
  }

  async listSessions(): Promise<SessionData[]> {
    try {
      const dirExists = await fileExists(this.baseDir)
      if (!dirExists) return []

      const glob = new Bun.Glob('*.json')
      const sessions: SessionData[] = []

      for await (const file of glob.scan({ cwd: this.baseDir, absolute: false })) {
        try {
          const filePath = join(this.baseDir, file)
          const bunFileHandle = bunFile(filePath)
          const raw = await bunFileHandle.text()
          sessions.push(JSON.parse(raw))
        } catch {
          // Skip invalid JSON files
        }
      }

      return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    } catch (error: unknown) {
      const e = error as { code?: string }
      if (e.code === 'ENOENT') return []
      throw error
    }
  }

  async deleteSession(id: string): Promise<void> {
    const sessionPath = this.getSessionPath(id)
    const exists = await fileExists(sessionPath)
    if (exists) {
      await Bun.write(sessionPath, '') // Clear content
      const { unlink } = await import('node:fs/promises')
      await unlink(sessionPath)
    }
  }
}
