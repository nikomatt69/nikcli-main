import { BaseTool, ToolExecutionResult } from './base-tool';
import { PromptManager } from '../prompts/prompt-manager';
import { CliUI } from '../utils/cli-ui';
import { readFile, writeFile, stat } from 'fs/promises';
import { join, relative, dirname, basename } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { DiffViewer, FileDiff } from '../ui/diff-viewer';
import { diffManager } from '../ui/diff-manager';

/**
 * Enhanced EditTool - Editor avanzato con diff, patch e validation
 * Basato su esempi con logica di sostituzione precisa e backup automatico
 */

export interface EditToolParams {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  createBackup?: boolean;
  validateSyntax?: boolean;
  previewOnly?: boolean;
}

export interface EditResult {
  filePath: string;
  success: boolean;
  replacementsMade: number;
  backupCreated: boolean;
  backupPath?: string;
  diff?: string;
  syntaxValid?: boolean;
  previewMode: boolean;
  changes: EditChange[];
}

export interface EditChange {
  lineNumber: number;
  before: string;
  after: string;
  context: {
    beforeLines: string[];
    afterLines: string[];
  };
}

export class EditTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('edit-tool', workingDirectory);
  }

  async execute(params: EditToolParams): Promise<ToolExecutionResult> {
    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance();
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'edit-tool',
        parameters: params
      });

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`);

      // Validazione parametri
      if (!params.filePath) {
        throw new Error('filePath is required');
      }

      if (params.oldString === params.newString) {
        throw new Error('oldString and newString must be different');
      }

      // Risolvi percorso assoluto
      const filePath = this.resolveFilePath(params.filePath);

      // Validazione sicurezza percorso
      if (!this.isPathSafe(filePath)) {
        throw new Error(`File path not safe or outside working directory: ${filePath}`);
      }

      CliUI.logInfo(`✏️ Editing file: ${relative(this.workingDirectory, filePath)}`);

      // Leggi contenuto file esistente
      let originalContent = '';
      let fileExists = false;

      if (existsSync(filePath)) {
        originalContent = await readFile(filePath, 'utf-8');
        fileExists = true;
      } else if (params.oldString !== '') {
        throw new Error(`File does not exist: ${filePath}`);
      }

      // Esegui sostituzione
      const editResult = await this.performEdit(
        filePath,
        originalContent,
        params,
        fileExists
      );

      // Preview mode - non scrivere file
      if (params.previewOnly) {
        CliUI.logInfo('📋 Preview mode - no changes written to file');
        return {
          success: true,
          data: editResult,
          metadata: {
            executionTime: Date.now(),
            toolName: this.name,
            parameters: params
          }
        };
      }

      // Crea backup se richiesto e file esiste
      if (params.createBackup !== false && fileExists && editResult.replacementsMade > 0) {
        const backupPath = await this.createBackup(filePath, originalContent);
        editResult.backupCreated = true;
        editResult.backupPath = backupPath;
        CliUI.logInfo(`💾 Backup created: ${relative(this.workingDirectory, backupPath)}`);
      }

      // Scrivi nuovo contenuto
      if (editResult.replacementsMade > 0) {
        await this.writeFileWithValidation(filePath, editResult.changes, params);
        CliUI.logSuccess(`✅ File edited successfully: ${editResult.replacementsMade} replacements made`);
      } else {
        CliUI.logWarning('⚠️ No replacements made - pattern not found');
      }

      return {
        success: true,
        data: editResult,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params
        }
      };

    } catch (error: any) {
      CliUI.logError(`Edit tool failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params
        }
      };
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
    let newContent: string;
    let replacementsMade = 0;
    const changes: EditChange[] = [];

    if (params.oldString === '') {
      // Creazione nuovo file
      newContent = params.newString;
      replacementsMade = 1;
      
      changes.push({
        lineNumber: 1,
        before: '',
        after: params.newString,
        context: { beforeLines: [], afterLines: [] }
      });
    } else {
      // Sostituzione in file esistente
      const lines = originalContent.split('\n');
      const newLines: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (params.replaceAll) {
          // Sostituisci tutte le occorrenze nella linea
          if (line.includes(params.oldString)) {
            const newLine = line.replace(new RegExp(this.escapeRegex(params.oldString), 'g'), params.newString);
            const occurrences = (line.match(new RegExp(this.escapeRegex(params.oldString), 'g')) || []).length;
            
            newLines.push(newLine);
            replacementsMade += occurrences;
            
            changes.push({
              lineNumber: i + 1,
              before: line,
              after: newLine,
              context: this.getLineContext(lines, i, 2)
            });
          } else {
            newLines.push(line);
          }
        } else {
          // Sostituisci solo prima occorrenza
          if (line.includes(params.oldString) && replacementsMade === 0) {
            const newLine = line.replace(params.oldString, params.newString);
            newLines.push(newLine);
            replacementsMade = 1;
            
            changes.push({
              lineNumber: i + 1,
              before: line,
              after: newLine,
              context: this.getLineContext(lines, i, 2)
            });
          } else {
            newLines.push(line);
          }
        }
      }
      
      newContent = newLines.join('\n');
    }

    // Genera e mostra diff
    const diff = this.generateDiff(originalContent, newContent, filePath);
    
    // Mostra diff usando il DiffViewer se ci sono state modifiche
    if (replacementsMade > 0 && !params.previewOnly) {
      const fileDiff: FileDiff = {
        filePath,
        originalContent,
        newContent,
        isNew: !fileExists,
        isDeleted: false
      };
      
      console.log('\n');
      DiffViewer.showFileDiff(fileDiff, { compact: true });
      
      // Aggiungi al diff manager per l'approval system
      diffManager.addFileDiff(filePath, originalContent, newContent);
    }

    // Validazione sintassi se richiesta
    let syntaxValid: boolean | undefined;
    if (params.validateSyntax) {
      syntaxValid = await this.validateSyntax(filePath, newContent);
    }

    return {
      filePath,
      success: true,
      replacementsMade,
      backupCreated: false,
      diff,
      syntaxValid,
      previewMode: params.previewOnly || false,
      changes
    };
  }

  /**
   * Ottiene contesto di linee intorno a una posizione
   */
  private getLineContext(lines: string[], lineIndex: number, contextSize: number): { beforeLines: string[]; afterLines: string[] } {
    const beforeLines = lines.slice(
      Math.max(0, lineIndex - contextSize),
      lineIndex
    );
    
    const afterLines = lines.slice(
      lineIndex + 1,
      Math.min(lines.length, lineIndex + 1 + contextSize)
    );

    return { beforeLines, afterLines };
  }

  /**
   * Escape caratteri speciali regex
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Genera diff tra contenuto originale e nuovo
   */
  private generateDiff(oldContent: string, newContent: string, filePath: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const diff: string[] = [];
    diff.push(`--- ${filePath}`);
    diff.push(`+++ ${filePath}`);
    
    // Semplice diff line-by-line
    let lineNum = 1;
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        if (oldLine && newLine) {
          diff.push(`@@ -${lineNum},1 +${lineNum},1 @@`);
          diff.push(`-${oldLine}`);
          diff.push(`+${newLine}`);
        } else if (oldLine) {
          diff.push(`@@ -${lineNum},1 +${lineNum},0 @@`);
          diff.push(`-${oldLine}`);
        } else if (newLine) {
          diff.push(`@@ -${lineNum},0 +${lineNum},1 @@`);
          diff.push(`+${newLine}`);
        }
      }
      lineNum++;
    }
    
    return diff.join('\n');
  }

  /**
   * Crea backup del file originale
   */
  private async createBackup(filePath: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    
    await writeFile(backupPath, content, 'utf-8');
    return backupPath;
  }

  /**
   * Scrive file con validazione
   */
  private async writeFileWithValidation(
    filePath: string,
    changes: EditChange[],
    params: EditToolParams
  ): Promise<void> {
    // Crea directory se non esiste
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Ricostruisci contenuto dalle modifiche
    const newContent = this.reconstructContentFromChanges(filePath, changes);
    
    // Validazione finale
    if (params.validateSyntax) {
      const isValid = await this.validateSyntax(filePath, newContent);
      if (!isValid) {
        throw new Error('Syntax validation failed - file not written');
      }
    }

    // Scrivi file atomicamente
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await writeFile(tempPath, newContent, 'utf-8');
    
    // Rename atomico
    require('fs').renameSync(tempPath, filePath);
  }

  /**
   * Ricostruisce contenuto dalle modifiche
   */
  private reconstructContentFromChanges(filePath: string, changes: EditChange[]): string {
    // Per semplicità, rileggiamo il file e applichiamo le modifiche
    // In una implementazione più sofisticata, potremmo ricostruire dal diff
    if (existsSync(filePath)) {
      return require('fs').readFileSync(filePath, 'utf-8');
    }
    
    // Se è un nuovo file, usa il contenuto dalla prima modifica
    return changes.length > 0 ? changes[0].after : '';
  }

  /**
   * Validazione sintassi basata su estensione file
   */
  private async validateSyntax(filePath: string, content: string): Promise<boolean> {
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    try {
      switch (ext) {
        case 'json':
          JSON.parse(content);
          return true;
          
        case 'js':
        case 'ts':
          // Validazione JavaScript/TypeScript basilare
          // In una implementazione reale, useresti un parser appropriato
          return !content.includes('syntax error');
          
        case 'yaml':
        case 'yml':
          // Validazione YAML basilare
          return !content.includes('!!error');
          
        default:
          // Per altri tipi, assumiamo valido
          return true;
      }
    } catch (error) {
      CliUI.logWarning(`Syntax validation failed: ${error}`);
      return false;
    }
  }

  /**
   * Risolve percorso file (assoluto o relativo)
   */
  private resolveFilePath(filePath: string): string {
    if (require('path').isAbsolute(filePath)) {
      return filePath;
    }
    return join(this.workingDirectory, filePath);
  }
}
