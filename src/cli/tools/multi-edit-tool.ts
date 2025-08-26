import { BaseTool, ToolExecutionResult } from './base-tool';
import { PromptManager } from '../prompts/prompt-manager';
import { CliUI } from '../utils/cli-ui';
import { EditTool, EditToolParams } from './edit-tool';

/**
 * MultiEditTool - Esegue modifiche multiple simultanee con transazioni
 * Basato su esempi per operazioni atomiche su più file
 */

export interface MultiEditOperation {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface MultiEditParams {
  operations: MultiEditOperation[];
  createBackup?: boolean;
  validateSyntax?: boolean;
  previewOnly?: boolean;
  rollbackOnError?: boolean;
}

export interface MultiEditResult {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  results: Array<{
    operation: MultiEditOperation;
    success: boolean;
    error?: string;
    replacementsMade?: number;
  }>;
  backupsCreated: string[];
  rollbackPerformed: boolean;
}

export class MultiEditTool extends BaseTool {
  private editTool: EditTool;

  constructor(workingDirectory: string) {
    super('multi-edit-tool', workingDirectory);
    this.editTool = new EditTool(workingDirectory);
  }

  async execute(params: MultiEditParams): Promise<ToolExecutionResult> {
    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance();
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'multi-edit-tool',
        parameters: params
      });

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`);

      if (!params.operations || params.operations.length === 0) {
        throw new Error('No operations specified');
      }

      CliUI.logInfo(`🔄 Executing ${params.operations.length} edit operations`);

      const result: MultiEditResult = {
        totalOperations: params.operations.length,
        successfulOperations: 0,
        failedOperations: 0,
        results: [],
        backupsCreated: [],
        rollbackPerformed: false
      };

      // Esegui operazioni in sequenza
      for (let i = 0; i < params.operations.length; i++) {
        const operation = params.operations[i];
        
        CliUI.logInfo(`📝 Operation ${i + 1}/${params.operations.length}: ${operation.filePath}`);

        try {
          const editParams: EditToolParams = {
            filePath: operation.filePath,
            oldString: operation.oldString,
            newString: operation.newString,
            replaceAll: operation.replaceAll,
            createBackup: params.createBackup,
            validateSyntax: params.validateSyntax,
            previewOnly: params.previewOnly
          };

          const editResult = await this.editTool.execute(editParams);

          if (editResult.success && editResult.data) {
            result.successfulOperations++;
            result.results.push({
              operation,
              success: true,
              replacementsMade: editResult.data.replacementsMade
            });

            if (editResult.data.backupPath) {
              result.backupsCreated.push(editResult.data.backupPath);
            }
          } else {
            result.failedOperations++;
            result.results.push({
              operation,
              success: false,
              error: editResult.error || 'Unknown error'
            });

            // Rollback se richiesto
            if (params.rollbackOnError && !params.previewOnly) {
              CliUI.logWarning('🔄 Rolling back due to error...');
              await this.performRollback(result.backupsCreated);
              result.rollbackPerformed = true;
              break;
            }
          }

        } catch (error: any) {
          result.failedOperations++;
          result.results.push({
            operation,
            success: false,
            error: error.message
          });

          if (params.rollbackOnError && !params.previewOnly) {
            CliUI.logWarning('🔄 Rolling back due to error...');
            await this.performRollback(result.backupsCreated);
            result.rollbackPerformed = true;
            break;
          }
        }
      }

      if (result.successfulOperations === result.totalOperations) {
        CliUI.logSuccess(`✅ All ${result.totalOperations} operations completed successfully`);
      } else {
        CliUI.logWarning(`⚠️ ${result.successfulOperations}/${result.totalOperations} operations successful`);
      }

      return {
        success: result.failedOperations === 0,
        data: result,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params
        }
      };

    } catch (error: any) {
      CliUI.logError(`Multi-edit tool failed: ${error.message}`);
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
   * Esegue rollback ripristinando i backup
   */
  private async performRollback(backupPaths: string[]): Promise<void> {
    for (const backupPath of backupPaths) {
      try {
        const originalPath = this.getOriginalPathFromBackup(backupPath);
        const fs = require('fs');
        
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, originalPath);
          CliUI.logInfo(`🔄 Restored: ${originalPath}`);
        }
      } catch (error: any) {
        CliUI.logError(`Failed to restore ${backupPath}: ${error.message}`);
      }
    }
  }

  /**
   * Ottiene il percorso originale dal percorso di backup
   */
  private getOriginalPathFromBackup(backupPath: string): string {
    // Rimuove .backup.timestamp dal nome
    return backupPath.replace(/\.backup\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/, '');
  }
}
