import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { inputQueue } from '../core/input-queue'
import { DiffViewer, type FileDiff } from '../ui/diff-viewer'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { sanitizePath, validateIsFile } from './secure-file-tools'
import { advancedUI } from '../ui/advanced-cli-ui'

export type JsonPatchOp =
  | { op: 'add'; path: string; value: any }
  | { op: 'replace'; path: string; value: any }
  | { op: 'remove'; path: string }

export interface JsonPatchParams {
  filePath: string
  operations: JsonPatchOp[]
  createBackup?: boolean
  previewOnly?: boolean
  allowMissing?: boolean
  skipConfirmation?: boolean
}

export class JsonPatchTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('json-patch-tool', workingDirectory)
  }

  // Metadata for core ToolRegistry auto-discovery
  getMetadata(): any {
    return {
      id: 'config_patch',
      name: 'config_patch',
      description: 'Apply structured patches to JSON/YAML configuration files with diff/backup',
      version: '0.1.0',
      category: 'file-ops',
      author: 'system',
      tags: ['config', 'json', 'yaml', 'patch', 'settings', 'scripts', 'config_update'],
      capabilities: ['config-update', 'json-patch', 'yaml-patch'],
      requiredCapabilities: [],
      dependencies: [],
      permissions: {
        canReadFiles: true,
        canWriteFiles: true,
        canDeleteFiles: false,
        canExecuteCommands: false,
        allowedPaths: [],
        forbiddenPaths: [],
        allowedCommands: [],
        forbiddenCommands: [],
        canAccessNetwork: false,
        maxExecutionTime: 300000,
        maxMemoryUsage: 512 * 1024 * 1024,
        requiresApproval: false,
      },
      inputSchema: {},
      outputSchema: {},
      examples: [],
      isBuiltIn: true,
      isEnabled: true,
      priority: 70,
      loadOrder: 0,
    }
  }

  async execute(params: JsonPatchParams): Promise<ToolExecutionResult> {
    const start = Date.now()
    try {
      if (!params.filePath) throw new Error('filePath is required')
      if (!Array.isArray(params.operations) || params.operations.length === 0) {
        throw new Error('operations must be a non-empty array')
      }

      const absolute = sanitizePath(params.filePath, this.getWorkingDirectory())
      if (!fs.existsSync(absolute)) throw new Error(`File not found: ${params.filePath}`)

      // Validate that it's a file (not a directory)
      validateIsFile(absolute, `Cannot patch: path is a directory: ${params.filePath}`)

      const ext = path.extname(absolute).toLowerCase()

      const originalContent = fs.readFileSync(absolute, 'utf8')
      let data: any
      let serializer: (obj: any) => string

      if (ext === '.json') {
        try {
          data = JSON.parse(originalContent)
        } catch (e: any) {
          throw new Error(`Invalid JSON: ${e.message}`)
        }
        serializer = (obj) => JSON.stringify(obj, null, 2) + '\n'
      } else if (ext === '.yaml' || ext === '.yml') {
        try {
          const yaml = await import('yaml')
          data = yaml.parse(originalContent) ?? {}
          serializer = (obj) => yaml.stringify(obj)
        } catch (e: any) {
          throw new Error(`Invalid YAML: ${e.message}`)
        }
      } else {
        throw new Error('Unsupported file type. Use .json, .yaml or .yml')
      }

      const before = JSON.stringify(data)
      const applied = this.applyPatch(data, params.operations, !!params.allowMissing)
      const after = JSON.stringify(applied)

      if (before === after) {
        advancedUI.logWarning('⚠️ No changes produced by provided operations')
        return {
          success: true,
          data: { changes: 0, backupPath: undefined },
          metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: params },
        }
      }

      const newContent = serializer(applied)

      // Diff preview
      const fileDiff: FileDiff = {
        filePath: params.filePath,
        originalContent,
        newContent,
        isNew: false,
        isDeleted: false,
      }
      console.log('\n')
      DiffViewer.showFileDiff(fileDiff, { compact: true })

      // Confirmation unless previewOnly
      if (!params.previewOnly && !params.skipConfirmation) {
        try {
          ; (global as any).__nikCLI?.suspendPrompt?.()
        } catch { }
        inputQueue.enableBypass()
        try {
          const { confirmed } = await inquirer.prompt([
            {
              type: 'list',
              name: 'confirmed',
              message: 'Apply JSON patch to file?',
              choices: [
                { name: 'Yes', value: true },
                { name: 'No', value: false },
              ],
              default: 1,
            },
          ])
          if (!confirmed) {
            return {
              success: false,
              error: 'Operation cancelled by user',
              data: null,
              metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: params },
            }
          }
        } finally {
          inputQueue.disableBypass()
          try {
            ; (global as any).__nikCLI?.resumePromptAndRender?.()
          } catch { }
        }
      }

      // Backup
      let backupPath: string | undefined
      if (!params.previewOnly && params.createBackup !== false) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        backupPath = `${absolute}.backup.${ts}`
        fs.writeFileSync(backupPath, originalContent, 'utf8')
        advancedUI.logInfo(`💾 Backup created: ${path.relative(this.getWorkingDirectory(), backupPath)}`)
      }

      if (!params.previewOnly) {
        fs.writeFileSync(absolute, newContent, 'utf8')
        advancedUI.logSuccess('✅ JSON patch applied')
      } else {
        advancedUI.logInfo('📋 Preview only, no changes written')
      }

      return {
        success: true,
        data: { changes: 1, backupPath },
        metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: params },
      }
    } catch (error: any) {
      CliUI.logError(`JSON patch tool failed: ${error.message}`)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: { executionTime: Date.now() - start, toolName: this.getName(), parameters: params },
      }
    }
  }

  private applyPatch(doc: any, ops: JsonPatchOp[], allowMissing: boolean): any {
    const clone = JSON.parse(JSON.stringify(doc))
    for (const op of ops) {
      switch (op.op) {
        case 'add':
          this.setByPointer(clone, op.path, op.value, allowMissing)
          break
        case 'replace':
          this.ensureExists(clone, op.path)
          this.setByPointer(clone, op.path, op.value, allowMissing)
          break
        case 'remove':
          this.removeByPointer(clone, op.path, allowMissing)
          break
        default:
          throw new Error(`Unsupported operation: ${(op as any).op}`)
      }
    }
    return clone
  }

  private parsePointer(pointer: string): string[] {
    if (!pointer.startsWith('/')) throw new Error(`Invalid JSON pointer: ${pointer}`)
    return pointer
      .split('/')
      .slice(1)
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  }

  private ensureExists(obj: any, pointer: string): void {
    const parts = this.parsePointer(pointer)
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      if (!(key in cur)) throw new Error(`Path not found: ${pointer}`)
      cur = cur[key]
    }
  }

  private setByPointer(obj: any, pointer: string, value: any, allowMissing: boolean): void {
    const parts = this.parsePointer(pointer)
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      if (Array.isArray(cur)) {
        const idx = key === '-' ? cur.length : Number.isNaN(Number(key)) ? undefined : Number(key)
        if (idx === undefined) throw new Error(`Expected array index at '/${parts.slice(0, i + 1).join('/')}'`)
        if (idx >= cur.length) {
          if (!allowMissing) throw new Error(`Index out of bounds at '/${parts.slice(0, i + 1).join('/')}'`)
          // fill with nulls to reach index
          while (cur.length < idx) cur.push(null)
          cur.push({})
        }
        cur = cur[idx]
      } else {
        if (!(key in cur)) {
          if (!allowMissing) throw new Error(`Path not found: /${parts.slice(0, i + 1).join('/')}`)
          cur[key] = {}
        }
        cur = cur[key]
      }
    }
    const last = parts[parts.length - 1]
    if (Array.isArray(cur)) {
      if (last === '-') {
        cur.push(value)
        return
      }
      const idx = Number.isNaN(Number(last)) ? undefined : Number(last)
      if (idx === undefined) throw new Error(`Expected array index at terminal segment '${last}'`)
      if (idx > cur.length) throw new Error('Index beyond array length')
      cur[idx] = value
      return
    }
    ; (cur as any)[last] = value
  }

  private removeByPointer(obj: any, pointer: string, allowMissing: boolean): void {
    const parts = this.parsePointer(pointer)
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      if (Array.isArray(cur)) {
        const idx = Number.isNaN(Number(key)) ? undefined : Number(key)
        if (idx === undefined || idx >= cur.length) {
          if (allowMissing) return
          throw new Error(`Path not found: /${parts.slice(0, i + 1).join('/')}`)
        }
        cur = cur[idx]
      } else {
        if (!(key in cur)) {
          if (allowMissing) return
          throw new Error(`Path not found: /${parts.slice(0, i + 1).join('/')}`)
        }
        cur = cur[key]
      }
    }
    const last = parts[parts.length - 1]
    if (Array.isArray(cur)) {
      const idx = Number.isNaN(Number(last)) ? undefined : Number(last)
      if (idx === undefined || idx >= cur.length) {
        if (allowMissing) return
        throw new Error(`Path not found: ${pointer}`)
      }
      cur.splice(idx, 1)
      return
    }
    if (!(last in cur)) {
      if (allowMissing) return
      throw new Error(`Path not found: ${pointer}`)
    }
    delete cur[last]
  }
}

export default JsonPatchTool
