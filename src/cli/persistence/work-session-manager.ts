import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { existsSync } from 'node:fs'
import { EditHistoryManager, type EditHistoryState, type EditOperation } from './edit-history-manager'

// Minimal date helpers to match dist behavior
function getCurrentISODate(): string {
    return new Date().toISOString()
}

function formatForDisplay(iso: string, opts?: { includeTime?: boolean; includeDate?: boolean }): string {
    const d = new Date(iso)
    const date = d.toLocaleDateString()
    const time = d.toLocaleTimeString()
    const includeDate = opts?.includeDate !== false
    const includeTime = opts?.includeTime !== false
    if (includeDate && includeTime) return `${date} ${time}`
    if (includeDate) return date
    if (includeTime) return time
    return ''
}

export interface WorkSessionMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp?: string
    metadata?: {
        tokenCount?: number
        model?: string
    }
}

export interface WorkSessionContext {
    workingDirectory: string
    activePlans: unknown[]
    activeAgents: unknown[]
    openFiles: string[]
}

export interface WorkSessionStats {
    filesModified: number
    linesAdded: number
    linesRemoved: number
    tokensUsed: number
}

export interface WorkSessionMetadata {
    version: number
    totalEdits: number
    totalMessages: number
    sessionDuration: number
    tags?: string[]
}

export interface WorkSession {
    id: string
    name: string
    createdAt: string
    updatedAt: string
    lastAccessedAt: string
    messages: WorkSessionMessage[]
    editHistory: EditHistoryState
    context: WorkSessionContext
    metadata: WorkSessionMetadata
    stats: WorkSessionStats
}

export interface WorkSessionManagerOptions {
    baseDir?: string
    autoSaveInterval?: number
    maxSessions?: number
    compressionThreshold?: number
}

export class WorkSessionManager extends EventEmitter {
    private baseDir: string
    private autoSaveInterval: number
    private maxSessions: number
    private compressionThreshold: number
    private currentSession: WorkSession | null = null
    private autoSaveTimer: NodeJS.Timeout | null = null
    private operationsSinceLastSave = 0
    private autoSaveThreshold = 10
    private isSaving = false
    private saveQueue: Array<() => Promise<void>> = []
    private editHistoryManager: EditHistoryManager

    constructor(options: WorkSessionManagerOptions = {}) {
        super()
        this.baseDir = options.baseDir || path.join(process.cwd(), '.nikcli', 'work-sessions')
        this.autoSaveInterval = options.autoSaveInterval || 60_000
        this.maxSessions = options.maxSessions || 100
        this.compressionThreshold = options.compressionThreshold || 1024 * 1024
        this.editHistoryManager = new EditHistoryManager({
            maxStackSize: 50,
            persistToDisk: false,
            autoSave: false,
        })
    }

    async initialize(): Promise<void> {
        await this.ensureDirectoryExists(this.baseDir)
        await this.editHistoryManager.initialize()
        this.emit('initialized')
        console.log(chalk.blue('📂 Work Session Manager initialized'))
    }

    async createSession(name?: string, tags: string[] = [], sessionId?: string): Promise<WorkSession> {
        const now = getCurrentISODate()
        const session: WorkSession = {
            id: sessionId || nanoid(),
            name:
                name ||
                `Session ${formatForDisplay(getCurrentISODate(), { includeTime: false })} ${formatForDisplay(getCurrentISODate(), { includeDate: false })}`,
            createdAt: now,
            updatedAt: now,
            lastAccessedAt: now,
            messages: [],
            editHistory: {
                undoStack: [],
                redoStack: [],
                currentPosition: 0,
                maxStackSize: 50,
            },
            context: {
                workingDirectory: process.cwd(),
                activePlans: [],
                activeAgents: [],
                openFiles: [],
            },
            metadata: {
                version: 1,
                totalEdits: 0,
                totalMessages: 0,
                sessionDuration: 0,
                tags,
            },
            stats: {
                filesModified: 0,
                linesAdded: 0,
                linesRemoved: 0,
                tokensUsed: 0,
            },
        }

        this.currentSession = session
        await this.saveSession(session)
        this.startAutoSave()
        this.emit('session_created', session)
        console.log(chalk.green(`✓ Work session created: ${session.name}`))
        return session
    }

    async resumeSession(sessionId: string): Promise<WorkSession> {
        const session = await this.loadSession(sessionId)
        if (!session) throw new Error(`Session not found: ${sessionId}`)
        if (this.currentSession) await this.pauseSession()

        this.currentSession = session
        session.lastAccessedAt = getCurrentISODate()
        this.editHistoryManager.importHistory(JSON.stringify(session.editHistory))
        this.startAutoSave()
        this.emit('session_resumed', session)
        console.log(chalk.green(`✓ Resumed session: ${session.name}`))
        console.log(chalk.gray(`  • ${session.metadata.totalMessages} messages`))
        console.log(chalk.gray(`  • ${session.metadata.totalEdits} edits`))
        console.log(chalk.gray(`  • ${session.stats.filesModified} files modified`))
        return session
    }

    async pauseSession(): Promise<void> {
        if (!this.currentSession) return
        this.stopAutoSave()
        await this.saveCurrentSession()
        this.emit('session_paused', this.currentSession)
        console.log(chalk.blue(`⏸️ Session paused: ${this.currentSession.name}`))
        this.currentSession = null
    }

    getCurrentSession(): WorkSession | null {
        return this.currentSession
    }

    updateCurrentSession(updates: Partial<WorkSession>): void {
        if (!this.currentSession) throw new Error('No active session')
        Object.assign(this.currentSession, updates)
        this.currentSession.updatedAt = getCurrentISODate()
        this.operationsSinceLastSave++
        if (this.operationsSinceLastSave >= this.autoSaveThreshold) {
            this.saveCurrentSession().catch((error: any) => {
                console.log(chalk.yellow(`⚠️ Auto-save failed: ${error.message}`))
            })
        }
    }

    addMessage(message: WorkSessionMessage): void {
        if (!this.currentSession) throw new Error('No active session')
        this.currentSession.messages.push(message)
        this.currentSession.metadata.totalMessages++
        this.currentSession.updatedAt = getCurrentISODate()
        if (message.metadata?.tokenCount) this.currentSession.stats.tokensUsed += message.metadata.tokenCount
        this.operationsSinceLastSave++
    }

    async recordEdit(operation: EditOperation): Promise<string> {
        if (!this.currentSession) throw new Error('No active session')
        const editId = await this.editHistoryManager.recordEdit(operation)
        this.currentSession.editHistory = this.editHistoryManager.getState()
        this.currentSession.metadata.totalEdits++
        this.currentSession.updatedAt = getCurrentISODate()
        const uniqueFiles = new Set(this.currentSession.editHistory.undoStack.map((op) => op.filePath))
        this.currentSession.stats.filesModified = uniqueFiles.size
        this.operationsSinceLastSave++
        this.emit('edit_recorded', { sessionId: this.currentSession.id, editId, operation })
        return editId
    }

    async undo(count = 1): Promise<EditOperation[]> {
        if (!this.currentSession) throw new Error('No active session')
        const undone = await this.editHistoryManager.undo(count)
        this.currentSession.editHistory = this.editHistoryManager.getState()
        this.currentSession.updatedAt = getCurrentISODate()
        this.operationsSinceLastSave++
        return undone
    }

    async redo(count = 1): Promise<EditOperation[]> {
        if (!this.currentSession) throw new Error('No active session')
        const redone = await this.editHistoryManager.redo(count)
        this.currentSession.editHistory = this.editHistoryManager.getState()
        this.currentSession.updatedAt = getCurrentISODate()
        this.operationsSinceLastSave++
        return redone
    }

    updateContext(contextUpdates: Partial<WorkSessionContext>): void {
        if (!this.currentSession) throw new Error('No active session')
        Object.assign(this.currentSession.context, contextUpdates)
        this.currentSession.updatedAt = getCurrentISODate()
    }

    async saveCurrentSession(): Promise<void> {
        if (!this.currentSession) return

        if (this.isSaving) {
            return new Promise((resolve, reject) => {
                this.saveQueue.push(async () => {
                    try {
                        await this.saveSession(this.currentSession!)
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                })
            })
        }

        this.isSaving = true
        try {
            await this.saveSession(this.currentSession)
            this.operationsSinceLastSave = 0
        } finally {
            this.isSaving = false
            const queueCopy = [...this.saveQueue]
            this.saveQueue = []
            for (const queuedSave of queueCopy) {
                try {
                    await queuedSave()
                } catch (error) {
                    console.log(chalk.red(`❌ Queued save failed: ${error}`))
                }
            }
        }
    }

    private async saveSession(session: WorkSession): Promise<void> {
        try {
            await this.ensureDirectoryExists(this.baseDir)
            const sessionPath = this.getSessionPath(session.id)
            const tempPath = `${sessionPath}.tmp`
            const backupPath = `${sessionPath}.backup`

            session.updatedAt = getCurrentISODate()
            const sessionData = JSON.stringify(session, null, 2)

            if (sessionData.length > this.compressionThreshold) {
                console.log(chalk.yellow(`⚠️ Large session (${Math.round(sessionData.length / 1024)}KB)`))
            }

            if (existsSync(sessionPath)) {
                try {
                    await fs.copyFile(sessionPath, backupPath)
                } catch (error) {
                    console.log(chalk.gray('⚠️ Could not create backup'))
                }
            }

            await fs.writeFile(tempPath, sessionData, 'utf-8')

            try {
                await fs.rename(tempPath, sessionPath)
                if (existsSync(backupPath)) {
                    try {
                        await fs.unlink(backupPath)
                    } catch { }
                }
                this.emit('session_saved', session)
            } catch (renameError) {
                try {
                    if (existsSync(tempPath)) await fs.unlink(tempPath)
                } catch { }
                throw renameError
            }
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to save session: ${error.message}`))
            const sessionPath = this.getSessionPath(session.id)
            const backupPath = `${sessionPath}.backup`
            const tempPath = `${sessionPath}.tmp`
            try {
                if (existsSync(tempPath)) await fs.unlink(tempPath)
            } catch { }
            if (existsSync(backupPath)) {
                try {
                    await fs.copyFile(backupPath, sessionPath)
                    console.log(chalk.yellow('✓ Restored from backup'))
                } catch {
                    console.log(chalk.red('❌ Could not restore from backup'))
                }
            }
            throw error
        }
    }

    async loadSession(sessionId: string): Promise<WorkSession | null> {
        try {
            const sessionPath = this.getSessionPath(sessionId)
            if (!existsSync(sessionPath)) return null
            const sessionData = await fs.readFile(sessionPath, 'utf-8')
            const session = JSON.parse(sessionData) as WorkSession
            this.emit('session_loaded', session)
            return session
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to load session: ${error.message}`))
            return null
        }
    }

    async listSessions(): Promise<
        Array<{
            id: string
            name: string
            createdAt: string
            lastAccessedAt: string
            totalEdits: number
            totalMessages: number
            filesModified: number
            tags?: string[]
        }>
    > {
        try {
            await this.ensureDirectoryExists(this.baseDir)
            const files = await fs.readdir(this.baseDir)
            const sessions: Array<{
                id: string
                name: string
                createdAt: string
                lastAccessedAt: string
                totalEdits: number
                totalMessages: number
                filesModified: number
                tags?: string[]
            }> = []
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const sessionPath = path.join(this.baseDir, file)
                        const sessionData = await fs.readFile(sessionPath, 'utf-8')
                        const session = JSON.parse(sessionData) as WorkSession
                        sessions.push({
                            id: session.id,
                            name: session.name,
                            createdAt: session.createdAt,
                            lastAccessedAt: session.lastAccessedAt,
                            totalEdits: session.metadata.totalEdits,
                            totalMessages: session.metadata.totalMessages,
                            filesModified: session.stats.filesModified,
                            tags: Array.isArray(session.metadata.tags) ? session.metadata.tags : [],
                        })
                    } catch {
                        console.log(chalk.yellow(`⚠️ Failed to read session file: ${file}`))
                    }
                }
            }
            sessions.sort((a, b) => new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime())
            return sessions
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to list sessions: ${error.message}`))
            return []
        }
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        try {
            const sessionPath = this.getSessionPath(sessionId)
            if (!existsSync(sessionPath)) return false
            await fs.unlink(sessionPath)
            this.emit('session_deleted', { sessionId })
            console.log(chalk.green(`✓ Session deleted: ${sessionId}`))
            return true
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to delete session: ${error.message}`))
            return false
        }
    }

    async cleanupOldSessions(keepCount?: number): Promise<number> {
        try {
            const sessions = await this.listSessions()
            const maxSessions = keepCount || this.maxSessions
            if (sessions.length <= maxSessions) return 0
            const sessionsToDelete = sessions.slice(maxSessions)
            let deletedCount = 0
            for (const session of sessionsToDelete) {
                const success = await this.deleteSession(session.id)
                if (success) deletedCount++
            }
            console.log(chalk.green(`🧹 Cleaned up ${deletedCount} old sessions`))
            return deletedCount
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to cleanup sessions: ${error.message}`))
            return 0
        }
    }

    async exportSession(sessionId: string, exportPath: string): Promise<void> {
        const session = await this.loadSession(sessionId)
        if (!session) throw new Error(`Session not found: ${sessionId}`)
        await fs.writeFile(exportPath, JSON.stringify(session, null, 2), 'utf-8')
        console.log(chalk.green(`📦 Session exported: ${exportPath}`))
    }

    async importSession(importPath: string): Promise<WorkSession> {
        const sessionData = await fs.readFile(importPath, 'utf-8')
        const session = JSON.parse(sessionData) as WorkSession
        session.id = nanoid()
        session.lastAccessedAt = getCurrentISODate()
        await this.saveSession(session)
        console.log(chalk.green(`📥 Session imported: ${session.name}`))
        return session
    }

    startAutoSave(): void {
        this.stopAutoSave()
        this.autoSaveTimer = setInterval(async () => {
            if (this.currentSession && this.operationsSinceLastSave > 0) {
                console.log(chalk.gray('💾 Auto-saving session...'))
                await this.saveCurrentSession()
            }
        }, this.autoSaveInterval)
    }

    stopAutoSave(): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer)
            this.autoSaveTimer = null
        }
    }

    private getSessionPath(sessionId: string): string {
        return path.join(this.baseDir, `${sessionId}.json`)
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        await fs.mkdir(dirPath, { recursive: true })
    }

    async shutdown(): Promise<void> {
        this.stopAutoSave()
        if (this.currentSession) await this.saveCurrentSession()
        console.log(chalk.blue('👋 Work Session Manager shutdown'))
    }
}

export const workSessionManager = new WorkSessionManager({
    autoSaveInterval: 60_000,
    maxSessions: 100,
})


