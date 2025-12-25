import * as os from 'node:os'
import * as path from 'node:path'
import { z } from 'zod'
import { advancedUI } from '../ui/advanced-cli-ui'
import { fileExistsSync, mkdirpSync, readTextSync, writeTextSync } from '../utils/bun-compat'

// Zod schema for permission entry
const PermissionEntrySchema = z.object({
  tool: z.string().describe('Tool name (e.g., "read_file")'),
  operation: z.string().describe('Operation (e.g., "read")'),
  approvedAt: z.string().datetime().describe('ISO timestamp when approved'),
  expiresAt: z.string().datetime().optional().describe('Optional expiration'),
})

const PermissionStorageSchema = z.object({
  version: z.number().default(1).describe('Schema version'),
  permissions: z.array(PermissionEntrySchema).default([]).describe('Approved tools'),
})

export interface PermissionEntry {
  tool: string
  operation: string
  approvedAt: string
  expiresAt?: string
}

interface PermissionStorageData {
  version: number
  permissions: PermissionEntry[]
}

export class PermissionStorage {
  private static instance: PermissionStorage | null = null
  private permissions: Map<string, PermissionEntry> = new Map()
  private readonly PERMISSIONS_PATH: string
  private readonly CONFIG_DIR: string

  private constructor() {
    this.CONFIG_DIR = path.join(os.homedir(), '.nikcli')
    this.PERMISSIONS_PATH = path.join(this.CONFIG_DIR, 'permissions.json')
    this.load()
  }

  static getInstance(): PermissionStorage {
    if (PermissionStorage.instance === null) {
      PermissionStorage.instance = new PermissionStorage()
    }
    return PermissionStorage.instance
  }

  private load(): void {
    try {
      if (!fileExistsSync(this.CONFIG_DIR)) {
        mkdirpSync(this.CONFIG_DIR)
      }

      if (!fileExistsSync(this.PERMISSIONS_PATH)) {
        this.permissions.clear()
        return
      }

      const content = readTextSync(this.PERMISSIONS_PATH)
      if (!content || content.trim() === '') {
        this.permissions.clear()
        return
      }

      const parsed = JSON.parse(content)
      const result = PermissionStorageSchema.safeParse(parsed)

      if (result.success) {
        this.permissions.clear()
        for (const permission of result.data.permissions) {
          const key = this.getKey(permission.tool, permission.operation)
          this.permissions.set(key, permission)
        }
        advancedUI.logInfo(`[PermissionStorage] Loaded ${this.permissions.size} permissions`)
      } else {
        advancedUI.logWarning(`[PermissionStorage] Invalid schema, resetting: ${result.error.message}`)
        this.permissions.clear()
      }
    } catch (error) {
      advancedUI.logWarning(`[PermissionStorage] Failed to load: ${error}`)
      this.permissions.clear()
    }
  }

  private save(): void {
    try {
      if (!fileExistsSync(this.CONFIG_DIR)) {
        mkdirpSync(this.CONFIG_DIR)
      }

      const permissionsArray = Array.from(this.permissions.values())
      const data: PermissionStorageData = {
        version: 1,
        permissions: permissionsArray,
      }

      writeTextSync(this.PERMISSIONS_PATH, JSON.stringify(data, null, 2))
      advancedUI.logInfo(`[PermissionStorage] Saved ${permissionsArray.length} permissions`)
    } catch (error) {
      advancedUI.logError(`[PermissionStorage] Failed to save: ${error}`)
    }
  }

  private getKey(tool: string, operation: string): string {
    return `${tool}:${operation}`
  }

  isApproved(tool: string, operation: string): boolean {
    const key = this.getKey(tool, operation)
    const permission = this.permissions.get(key)

    if (!permission) {
      return false
    }

    // Check expiration
    if (permission.expiresAt) {
      const now = new Date().toISOString()
      if (permission.expiresAt < now) {
        this.permissions.delete(key)
        this.save()
        return false
      }
    }

    return true
  }

  approve(tool: string, operation: string, expiresInHours?: number): void {
    const key = this.getKey(tool, operation)
    const now = new Date().toISOString()

    let expiresAt: string | undefined
    if (expiresInHours && expiresInHours > 0) {
      const expiryDate = new Date()
      expiryDate.setHours(expiryDate.getHours() + expiresInHours)
      expiresAt = expiryDate.toISOString()
    }

    const permission: PermissionEntry = {
      tool,
      operation,
      approvedAt: now,
      expiresAt,
    }

    this.permissions.set(key, permission)
    this.save()

    const expiryInfo = expiresAt ? ` (expires ${expiresAt})` : ''
    advancedUI.logInfo(`[PermissionStorage] Approved: ${tool}:${operation}${expiryInfo}`)
  }

  revoke(tool: string, operation: string): boolean {
    const key = this.getKey(tool, operation)
    const existed = this.permissions.delete(key)

    if (existed) {
      this.save()
      advancedUI.logInfo(`[PermissionStorage] Revoked: ${tool}:${operation}`)
    }

    return existed
  }

  clearAll(): void {
    const count = this.permissions.size
    this.permissions.clear()
    this.save()
    advancedUI.logInfo(`[PermissionStorage] Cleared ${count} permissions`)
  }

  cleanExpired(): number {
    const now = new Date().toISOString()
    let removed = 0

    for (const [key, permission] of this.permissions.entries()) {
      if (permission.expiresAt && permission.expiresAt < now) {
        this.permissions.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      this.save()
      advancedUI.logInfo(`[PermissionStorage] Cleaned ${removed} expired permissions`)
    }

    return removed
  }

  getPermissionCount(): number {
    return this.permissions.size
  }

  getAllPermissions(): PermissionEntry[] {
    return Array.from(this.permissions.values())
  }

  getPermission(tool: string, operation: string): PermissionEntry | undefined {
    const key = this.getKey(tool, operation)
    return this.permissions.get(key)
  }
}

export const permissionStorage = PermissionStorage.getInstance()
