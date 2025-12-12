import { existsSync, mkdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path, { join, relative } from 'node:path'
import { PromptManager } from '../prompts/prompt-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { diffManager } from '../ui/diff-manager'
import { DiffViewer, type FileDiff } from '../ui/diff-viewer'
import { CliUI } from '../utils/cli-ui'
import { SmartMatcher } from '../utils/smart-matcher'
import { EditValidator } from '../utils/edit-validator'
import { BaseTool, type ToolExecutionResult } from './base-tool'

/**
 * Enhanced EditTool - Editor avanzato con diff, patch e validation
 * Basato su esempi con logica di sostituzione precisa e backup automatico
 * Integrato con smart matching per fuzzy search e whitespace handling
 */

export interface EditToolParams {
  filePath: string
  oldString: string
  newString: string
  replaceAll?: boolean
  createBackup?: boolean
  validateSyntax?: boolean
  previewOnly?: boolean
  fuzzyMatch?: boolean
  fuzzyThreshold?: number
  ignoreWhitespace?: boolean
  ignoreIndentation?: boolean
  requireUnique?: boolean
  contextLines?: number
}

export interface EditResult {
  filePath: string
  success: boolean
  replacementsMade: number
  backupCreated: boolean
  backupPath?: string
  diff?: string
  syntaxValid?: boolean
  previewMode: boolean
  changes: EditChange[]
}

export interface EditChange {
  lineNumber: number
  before: string
  after: string
  context: {
    beforeLines: string[]
    afterLines: string[]
  }
}

export class EditTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('edit-tool', workingDirectory)
  }

  async execute(params: EditToolParams): Promise<ToolExecutionResult> {
    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'edit-tool',
        parameters: params,
      })

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      // Validazione parametri
      if (!params.filePath) {
        throw new Error('filePath is required')
      }

      if (params.oldString === params.newString) {
        throw new Error('oldString and newString must be different')
      }

      // Risolvi percorso assoluto
      const filePath = this.resolveFilePath(params.filePath)

      // Validazione sicurezza percorso
      if (!this.isPathSafe(filePath)) {
        throw new Error(`File path not safe or outside working directory: ${filePath}`)
      }

      advancedUI.logInfo(`✏️ Editing file: ${relative(this.workingDirectory, filePath)}`)

      // Leggi contenuto file esistente
      let originalContent = ''
      let fileExists = false

      if (existsSync(filePath)) {
        // Validate that it's a file (not a directory)
        const stats = statSync(filePath)
        if (!stats.isFile()) {
          throw new Error(`Cannot edit: path is a directory: ${params.filePath}`)
        }
        originalContent = await readFile(filePath, 'utf-8')
        fileExists = true
      } else if (params.oldString !== '') {
        throw new Error(`File does not exist: ${filePath}`)
      }

      // Esegui sostituzione
      const editResult = await this.performEdit(filePath, originalContent, params, fileExists)

      // Preview mode - non scrivere file
      if (params.previewOnly) {
        advancedUI.logInfo('📋 Preview mode - no changes written to file')
        return {
          success: true,
          data: editResult,
          metadata: {
            executionTime: Date.now(),
            toolName: this.name,
            parameters: params,
          },
        }
      }

      // Crea backup se richiesto e file esiste
      if (params.createBackup !== false && fileExists && editResult.replacementsMade > 0) {
        const backupPath = await this.createBackup(filePath, originalContent)
        editResult.backupCreated = true
        editResult.backupPath = backupPath
        advancedUI.logInfo(`💾 Backup created: ${relative(this.workingDirectory, backupPath)}`)
      }

      // Scrivi nuovo contenuto
      if (editResult.replacementsMade > 0) {
        // Rebuild new content from changes using original content to ensure correctness
        const newContent = this.reconstructContentFromChanges(originalContent, editResult.changes)
        await this.writeFileWithValidation(filePath, newContent, params)
        advancedUI.logSuccess(`✓ File edited successfully: ${editResult.replacementsMade} replacements made`)
      } else {
        advancedUI.logWarning('⚠︎ No replacements made - pattern not found')
      }

      return {
        success: true,
        data: editResult,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      CliUI.logError(`Edit tool failed: ${error.message}`)
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
   * Esegue la sostituzione del testo
   */
  private async performEdit(
    filePath: string,
    originalContent: string,
    params: EditToolParams,
    fileExists: boolean
  ): Promise<EditResult> {
    const matcher = new SmartMatcher()
    const validator = new EditValidator()

    let newContent: string
    let replacementsMade = 0
    const changes: EditChange[] = []

    if (params.oldString === '') {
      // Creazione nuovo file
      newContent = params.newString
      replacementsMade = 1

      changes.push({
        lineNumber: 1,
        before: '',
        after: params.newString,
        context: { beforeLines: [], afterLines: [] },
      })
    } else {
      // Pre-edit validation
      const validation = validator.validateEdit(originalContent, params.oldString, params.newString, params)

      if (!validation.valid) {
        // Show validation errors and suggestions
        for (const error of validation.errors) {
          advancedUI.logError(`❌ ${error.type}: ${error.message}`)
        }

        if (validation.suggestions.length > 0) {
          advancedUI.logInfo('\n💡 Suggestions:')
          for (const suggestion of validation.suggestions) {
            advancedUI.logInfo(`  • ${suggestion}`)
          }
        }

        throw new Error(`Edit validation failed: ${validation.errors.map(e => e.message).join(', ')}`)
      }

      // Sostituzione in file esistente
      const lines = originalContent.split('\n')
      const newLines: string[] = []
      let processedFirst = false

      // Prepare matching options
      const matchOptions = {
        fuzzyThreshold: params.fuzzyThreshold ?? 0.85,
        ignoreWhitespace: params.ignoreWhitespace ?? (params.fuzzyMatch ? true : false),
        ignoreIndentation: params.ignoreIndentation ?? (params.fuzzyMatch ? true : false),
        requireUnique: params.requireUnique ?? true,
        contextLines: params.contextLines ?? 2,
      }

      // Use smart matching if enabled
      if (params.fuzzyMatch) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const matchResult = matcher.findBestMatch(line, params.oldString, matchOptions)

          if (matchResult.found && matchResult.confidence >= matchOptions.fuzzyThreshold) {
            if (params.replaceAll || !processedFirst) {
              // Use actual matched content for replacement
              const actualOld = matchResult.actualContent || params.oldString
              const newLine = line.replace(actualOld, params.newString)
              newLines.push(newLine)
              replacementsMade++
              processedFirst = true

              // Log confidence if < 95%
              if (matchResult.confidence < 0.95) {
                advancedUI.logWarning(
                  `⚠︎ Line ${i + 1}: fuzzy match (${Math.round(matchResult.confidence * 100)}% confidence)`
                )
              }

              changes.push({
                lineNumber: i + 1,
                before: line,
                after: newLine,
                context: this.getLineContext(lines, i, 2),
              })
            } else {
              newLines.push(line)
            }
          } else {
            newLines.push(line)
          }
        }
      } else {
        // Original exact matching logic
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]

          if (params.replaceAll) {
            // Sostituisci tutte le occorrenze nella linea
            if (line.includes(params.oldString)) {
              const newLine = line.replace(new RegExp(this.escapeRegex(params.oldString), 'g'), params.newString)
              const occurrences = (line.match(new RegExp(this.escapeRegex(params.oldString), 'g')) || []).length

              newLines.push(newLine)
              replacementsMade += occurrences

              changes.push({
                lineNumber: i + 1,
                before: line,
                after: newLine,
                context: this.getLineContext(lines, i, 2),
              })
            } else {
              newLines.push(line)
            }
          } else {
            // Sostituisci solo prima occorrenza
            if (line.includes(params.oldString) && replacementsMade === 0) {
              const newLine = line.replace(params.oldString, params.newString)
              newLines.push(newLine)
              replacementsMade = 1

              changes.push({
                lineNumber: i + 1,
                before: line,
                after: newLine,
                context: this.getLineContext(lines, i, 2),
              })
            } else {
              newLines.push(line)
            }
          }
        }
      }

      newContent = newLines.join('\n')

      // Show suggestions if no replacements were made
      if (replacementsMade === 0 && params.oldString !== '') {
        const suggestions = matcher.findSimilarLines(originalContent, params.oldString, {
          maxResults: 3,
          threshold: 0.6,
        })

        if (suggestions.length > 0) {
          advancedUI.logWarning('⚠︎ Pattern not found. Similar matches:')
          for (const sugg of suggestions) {
            advancedUI.logInfo(`  Line ${sugg.lineNumber}: "${sugg.content}" (${Math.round(sugg.similarity * 100)}% similar)`)
          }
          advancedUI.logInfo('\nConsider using fuzzyMatch: true or adjusting the search pattern.')
        } else {
          advancedUI.logWarning('⚠︎ No replacements made - pattern not found')
        }
      }
    }

    // Genera e mostra diff
    const diff = this.generateDiff(originalContent, newContent, filePath)

    // Mostra diff usando il DiffViewer se ci sono state modifiche
    if (replacementsMade > 0 && !params.previewOnly) {
      const fileDiff: FileDiff = {
        filePath,
        originalContent,
        newContent,
        isNew: !fileExists,
        isDeleted: false,
      }

      console.log('\n')
      DiffViewer.showFileDiff(fileDiff, { compact: true })

      // Aggiungi al diff manager per l'approval system
      diffManager.addFileDiff(filePath, originalContent, newContent)
    }

    // Validazione sintassi se richiesta
    let syntaxValid: boolean | undefined
    if (params.validateSyntax) {
      syntaxValid = await this.validateSyntax(filePath, newContent)
    }

    return {
      filePath,
      success: true,
      replacementsMade,
      backupCreated: false,
      diff,
      syntaxValid,
      previewMode: params.previewOnly || false,
      changes,
    }
  }

  /**
   * Ottiene contesto di linee intorno a una posizione
   */
  private getLineContext(
    lines: string[],
    lineIndex: number,
    contextSize: number
  ): { beforeLines: string[]; afterLines: string[] } {
    const beforeLines = lines.slice(Math.max(0, lineIndex - contextSize), lineIndex)

    const afterLines = lines.slice(lineIndex + 1, Math.min(lines.length, lineIndex + 1 + contextSize))

    return { beforeLines, afterLines }
  }

  /**
   * Escape caratteri speciali regex
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Genera diff tra contenuto originale e nuovo
   */
  private generateDiff(oldContent: string, newContent: string, filePath: string): string {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    const diff: string[] = []
    diff.push(`--- ${filePath}`)
    diff.push(`+++ ${filePath}`)

    // Semplice diff line-by-line
    let lineNum = 1
    const maxLines = Math.max(oldLines.length, newLines.length)

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || ''
      const newLine = newLines[i] || ''

      if (oldLine !== newLine) {
        if (oldLine && newLine) {
          diff.push(`@@ -${lineNum},1 +${lineNum},1 @@`)
          diff.push(`-${oldLine}`)
          diff.push(`+${newLine}`)
        } else if (oldLine) {
          diff.push(`@@ -${lineNum},1 +${lineNum},0 @@`)
          diff.push(`-${oldLine}`)
        } else if (newLine) {
          diff.push(`@@ -${lineNum},0 +${lineNum},1 @@`)
          diff.push(`+${newLine}`)
        }
      }
      lineNum++
    }

    return diff.join('\n')
  }

  /**
   * Crea backup del file originale
   */
  private async createBackup(filePath: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${filePath}.backup.${timestamp}`

    await writeFile(backupPath, content, 'utf-8')
    return backupPath
  }

  /**
   * Scrive file con validazione
   */
  private async writeFileWithValidation(filePath: string, newContent: string, params: EditToolParams): Promise<void> {
    // Crea directory se non esiste
    const dir = path.dirname(filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Validazione finale
    if (params.validateSyntax) {
      const isValid = await this.validateSyntax(filePath, newContent)
      if (!isValid) {
        throw new Error('Syntax validation failed - file not written')
      }
    }

    // Scrivi file atomicamente
    const tempPath = `${filePath}.tmp.${Date.now()}`
    await writeFile(tempPath, newContent, 'utf-8')

    // Rename atomico
    require('node:fs').renameSync(tempPath, filePath)
  }

  /**
   * Ricostruisce contenuto dalle modifiche basandosi sul contenuto originale
   */
  private reconstructContentFromChanges(originalContent: string, changes: EditChange[]): string {
    if (changes.length === 0) {
      return originalContent
    }

    // Se è un nuovo file (prima modifica ha before vuoto)
    if (changes[0].before === '' && changes.length === 1) {
      return changes[0].after
    }

    // Per file esistenti, ricostruisci applicando le modifiche
    const lines = originalContent.split('\n')
    const changeMap = new Map<number, string>()

    for (const change of changes) {
      changeMap.set(change.lineNumber - 1, change.after) // lineNumber è 1-based, array è 0-based
    }

    // Applica le modifiche
    const newLines = lines.map((line, index) => {
      return changeMap.has(index) ? changeMap.get(index)! : line
    })

    return newLines.join('\n')
  }

  /**
   * Validazione sintassi basata su estensione file
   */
  private async validateSyntax(filePath: string, content: string): Promise<boolean> {
    const ext = filePath.split('.').pop()?.toLowerCase()

    try {
      switch (ext) {
        case 'json':
          JSON.parse(content)
          return true

        case 'js':
        case 'ts':
          // Validazione JavaScript/TypeScript basilare
          // In una implementazione reale, useresti un parser appropriato
          return !content.includes('syntax error')

        case 'yaml':
        case 'yml':
          // Validazione YAML basilare
          return !content.includes('!!error')

        default:
          // Per altri tipi, assumiamo valido
          return true
      }
    } catch (error) {
      advancedUI.logWarning(`Syntax validation failed: ${error}`)
      return false
    }
  }

  /**
   * Risolve percorso file (assoluto o relativo)
   */
  private resolveFilePath(filePath: string): string {
    if (require('node:path').isAbsolute(filePath)) {
      return filePath
    }
    return join(this.workingDirectory, filePath)
  }
}
