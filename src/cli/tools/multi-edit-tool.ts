import { PromptManager } from '../prompts/prompt-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { EditTool, type EditToolParams } from './edit-tool'

/**
 * MultiEditTool - Esegue modifiche multiple simultanee con transazioni
 * Basato su esempi per operazioni atomiche su più file
 */

export interface MultiEditOperation {
  filePath: string
  oldString: string
  newString: string
  replaceAll?: boolean
}

export interface MultiEditParams {
  operations?: MultiEditOperation[]
  // Legacy/alias used by some callers
  edits?: Array<{
    file?: string
    filePath?: string
    search?: string
    replace?: string
    oldString?: string
    newString?: string
    replaceAll?: boolean
  }>
  createBackup?: boolean
  validateSyntax?: boolean
  previewOnly?: boolean
  rollbackOnError?: boolean
  // Allows dry-run semantics from older AI wrappers
  dryRun?: boolean
}

export interface MultiEditResult {
  totalOperations: number
  successfulOperations: number
  failedOperations: number
  results: Array<{
    operation: MultiEditOperation
    success: boolean
    error?: string
    replacementsMade?: number
  }>
  backupsCreated: string[]
  rollbackPerformed: boolean
}

export class MultiEditTool extends BaseTool {
  private editTool: EditTool

  constructor(workingDirectory: string) {
    super('multi-edit-tool', workingDirectory)
    this.editTool = new EditTool(workingDirectory)
  }

  async execute(params: MultiEditParams): Promise<ToolExecutionResult> {
    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'multi-edit-tool',
        parameters: params,
      })

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      const normalizedOperations = this.normalizeOperations(params)

      if (normalizedOperations.length === 0) {
        throw new Error('No operations specified')
      }

      advancedUI.logInfo(`⚡︎ Executing ${(params.operations || params.edits || []).length} edit operations`)

      const result: MultiEditResult = {
        totalOperations: normalizedOperations.length,
        successfulOperations: 0,
        failedOperations: 0,
        results: [],
        backupsCreated: [],
        rollbackPerformed: false,
      }

      // Esegui operazioni in sequenza
      for (let i = 0; i < normalizedOperations.length; i++) {
        const operation = normalizedOperations[i]

        advancedUI.logInfo(`📝 Operation ${i + 1}/${normalizedOperations.length}: ${operation.filePath}`)

        try {
          const editParams: EditToolParams = {
            filePath: operation.filePath,
            oldString: operation.oldString,
            newString: operation.newString,
            replaceAll: operation.replaceAll,
            createBackup: params.createBackup,
            validateSyntax: params.validateSyntax,
            previewOnly: params.previewOnly ?? params.dryRun,
          }

          const editResult = await this.editTool.execute(editParams)

          if (editResult.success && editResult.data) {
            result.successfulOperations++
            result.results.push({
              operation,
              success: true,
              replacementsMade: editResult.data.replacementsMade,
            })

            if (editResult.data.backupPath) {
              result.backupsCreated.push(editResult.data.backupPath)
            }
          } else {
            result.failedOperations++
            result.results.push({
              operation,
              success: false,
              error: editResult.error || 'Unknown error',
            })

            // Rollback se richiesto
            if (params.rollbackOnError && !params.previewOnly) {
              advancedUI.logWarning('⚡︎ Rolling back due to error...')
              await this.performRollback(result.backupsCreated)
              result.rollbackPerformed = true
              break
            }
          }
        } catch (error: any) {
          result.failedOperations++
          result.results.push({
            operation,
            success: false,
            error: error.message,
          })

          if (params.rollbackOnError && !params.previewOnly) {
            advancedUI.logWarning('⚡︎ Rolling back due to error...')
            await this.performRollback(result.backupsCreated)
            result.rollbackPerformed = true
            break
          }
        }
      }

      if (result.successfulOperations === result.totalOperations) {
        advancedUI.logSuccess(`✓ All ${result.totalOperations} operations completed successfully`)
      } else {
        advancedUI.logWarning(`⚠︎ ${result.successfulOperations}/${result.totalOperations} operations successful`)
      }

      return {
        success: result.failedOperations === 0,
        data: result,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      CliUI.logError(`Multi-edit tool failed: ${error.message}`)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Normalize different param shapes into the expected operations array.
   * Supports the newer `operations` shape and the legacy `edits` shape used by some tool wrappers.
   */
  private normalizeOperations(params: MultiEditParams): MultiEditOperation[] {
    if (params.operations && params.operations.length > 0) {
      return params.operations
    }

    if (!params.edits || params.edits.length === 0) {
      return []
    }

    const normalized: MultiEditOperation[] = []

    for (const edit of params.edits) {
      const filePath = edit.filePath || edit.file
      const oldString = edit.oldString ?? edit.search
      const newString = edit.newString ?? edit.replace

      if (!filePath || oldString == null || newString == null) {
        advancedUI.logWarning('⚠︎ Skipping invalid edit entry missing file/search/replace')
        continue
      }

      normalized.push({
        filePath,
        oldString,
        newString,
        replaceAll: edit.replaceAll,
      })
    }

    return normalized
  }

  /**
   * Esegue rollback ripristinando i backup
   */
  private async performRollback(backupPaths: string[]): Promise<void> {
    for (const backupPath of backupPaths) {
      try {
        const originalPath = this.getOriginalPathFromBackup(backupPath)
        const fs = require('node:fs')

        if (await fileExists(backupPath)) {
          fs.copyFileSync(backupPath, originalPath)
          advancedUI.logInfo(`⚡︎ Restored: ${originalPath}`)
        }
      } catch (error: any) {
        advancedUI.logError(`Failed to restore ${backupPath}: ${error.message}`)
      }
    }
  }

  /**
   * Ottiene il percorso originale dal percorso di backup
   */
  private getOriginalPathFromBackup(backupPath: string): string {
    // Rimuove .backup.timestamp dal nome
    return backupPath.replace(/\.backup\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '')
  }
}
