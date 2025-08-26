/**
 * Validated AI Provider Wrapper
 * Leggero wrapper che aggiunge validazione all'AI Provider esistente
 */

import { advancedAIProvider } from '../ai/advanced-ai-provider';
import { validatorManager, ValidationContext, ExtendedValidationResult } from './validator-manager';
import { agentQueue } from './simple-agent-queue';
import { advancedUI } from '../ui/advanced-cli-ui';
import { createReasoningSystemPrompt, createUniversalAgentPrompt, ReasoningContext } from '../prompts/reasoning-system-prompt';
import { CoreMessage } from 'ai';
import chalk from 'chalk';
import { join, resolve, dirname, extname } from 'path';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';

export interface ValidatedWriteOptions {
  path: string;
  content: string;
  agentId?: string;
  reasoning?: string;
  skipValidation?: boolean;
  skipFormatting?: boolean;
}

export interface ValidatedWriteResult {
  success: boolean;
  path: string;
  size?: number;
  formatted?: boolean;
  formatter?: string;
  validated?: boolean;
  errors?: string[];
  warnings?: string[];
  reasoning?: string;
  executionTime?: number;
}

/**
 * Wrapper che aggiunge validazione intelligente all'AI Provider
 */
export class ValidatedAIProvider {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Scrivi file con validazione e formattazione automatica + coordinamento queue
   */
  async writeFileValidated(options: ValidatedWriteOptions): Promise<ValidatedWriteResult> {
    const { path, content, agentId = 'unknown', reasoning, skipValidation = false, skipFormatting = false } = options;

    // USA LA QUEUE per coordinamento
    return agentQueue.executeWithLock(
      {
        type: 'write',
        filePath: path,
        agentId
      },
      async () => {
        const startTime = Date.now();

        try {
          const fullPath = resolve(this.workingDirectory, path);
          const dir = dirname(fullPath);

          advancedUI.logInfo(`📝 Writing validated file: ${path} (${agentId})`);

          // Ensure directory exists
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          let processedContent = content;
          let validationResult: ExtendedValidationResult | null = null;

          // VALIDATION + FORMATTING (se non skippati)
          if (!skipValidation) {
            const validationContext: ValidationContext = {
              filePath: fullPath,
              content,
              operation: existsSync(fullPath) ? 'update' : 'create',
              agentId,
              projectType: this.detectProjectType()
            };

            // Configura ValidatorManager per questo file
            if (skipFormatting) {
              validatorManager.updateConfig({ autoFormat: false });
            }

            try {
              validationResult = await validatorManager.validateContent(validationContext);

              if (!validationResult.isValid) {
                if (validationResult.fixedContent) {
                  processedContent = validationResult.fixedContent;
                  console.log(chalk.green(`🔧 Auto-fix applicato per ${path}`));
                } else {
                  return {
                    success: false,
                    path,
                    validated: false,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings,
                    reasoning: reasoning || 'Validation failed',
                    executionTime: Date.now() - startTime
                  };
                }
              } else {
                // Usa contenuto formattato anche se validazione è passata
                if (validationResult.fixedContent) {
                  processedContent = validationResult.fixedContent;
                }
              }
            } catch (validationError: any) {
              advancedUI.logWarning(`⚠️ Validation error, proceeding without: ${validationError.message}`);
            } finally {
              // Ripristina configurazione
              if (skipFormatting) {
                validatorManager.updateConfig({ autoFormat: true });
              }
            }
          }

          // WRITE FILE
          writeFileSync(fullPath, processedContent, 'utf-8');
          const stats = require('fs').statSync(fullPath);

          const result: ValidatedWriteResult = {
            success: true,
            path,
            size: stats.size,
            formatted: validationResult?.formatted || false,
            formatter: validationResult?.formatter,
            validated: !skipValidation,
            errors: validationResult?.errors,
            warnings: validationResult?.warnings,
            reasoning: reasoning || `File ${existsSync(fullPath) ? 'updated' : 'created'} with validation`,
            executionTime: Date.now() - startTime
          };

          // Log risultato
          if (validationResult?.formatted) {
            advancedUI.logSuccess(`✅ File formatted with ${validationResult.formatter} and written: ${path}`);
          } else {
            advancedUI.logSuccess(`✅ File validated and written: ${path}`);
          }

          return result;

        } catch (error: any) {
          advancedUI.logError(`❌ Failed to write validated file ${path}: ${error.message}`);

          return {
            success: false,
            path,
            validated: false,
            errors: [error.message],
            reasoning: reasoning || 'File write failed',
            executionTime: Date.now() - startTime
          };
        }
      }
    );
  }

  /**
   * Genera risposta con reasoning framework obbligatorio
   */
  async generateReasoningResponse(
    userRequest: string,
    agentId: string = 'universal-agent',
    capabilities: string[] = ['full-stack-development', 'code-analysis', 'file-operations']
  ): Promise<string> {
    const reasoningContext: ReasoningContext = {
      projectType: this.detectProjectType(),
      currentWorkingDirectory: this.workingDirectory,
      availableTools: [
        'writeFileValidated', 'readFile', 'formatCode', 'validateCode',
        'executeCommand', 'analyzeProject', 'installPackages'
      ],
      userRequest,
      agentId,
      capabilities
    };

    const systemPrompt = agentId === 'universal-agent'
      ? createUniversalAgentPrompt(reasoningContext)
      : createReasoningSystemPrompt(reasoningContext);

    const messages: CoreMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userRequest }
    ];

    try {
      const response = await advancedAIProvider.generateWithTools(messages);

      // Validazione opzionale del reasoning (per debug)
      if (process.env.VALIDATE_REASONING) {
        const { validateReasoningResponse } = await import('../prompts/reasoning-system-prompt');
        const validation = validateReasoningResponse(typeof response === 'string' ? response : '');

        if (!validation.isValid) {
          advancedUI.logWarning(`⚠️ Agent reasoning validation failed: ${validation.suggestions.join(', ')}`);
        }
      }

      return typeof response === 'string' ? response : '';
    } catch (error: any) {
      advancedUI.logError(`❌ Failed to generate reasoning response: ${error.message}`);
      throw error;
    }
  }

  /**
   * Proxy per altri metodi dell'AI Provider esistente
   */
  async generateStreamResponse(messages: any[], options: any = {}) {
    // Use modernAIProvider for streaming if available
    const { modernAIProvider } = await import('../ai/modern-ai-provider');
    return modernAIProvider.streamChatWithTools(messages);
  }

  async generateResponse(request: { messages: any[] }) {
    // Use modernAIProvider for response generation if available
    const { modernAIProvider } = await import('../ai/modern-ai-provider');
    return modernAIProvider.generateWithTools(request.messages as CoreMessage[]);
  }

  /**
   * Leggi file (proxy semplice)
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = resolve(this.workingDirectory, filePath);
    return readFileSync(fullPath, 'utf-8');
  }

  /**
   * Rileva tipo di progetto
   */
  private detectProjectType(): string {
    try {
      const packageJsonPath = join(this.workingDirectory, 'package.json');
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

        if (packageJson.dependencies?.['next'] || packageJson.devDependencies?.['next']) {
          return 'next.js';
        }
        if (packageJson.dependencies?.['react'] || packageJson.devDependencies?.['react']) {
          return 'react';
        }
        if (packageJson.dependencies?.['typescript'] || packageJson.devDependencies?.['typescript']) {
          return 'typescript';
        }

        return 'node';
      }

      return 'generic';
    } catch {
      return 'generic';
    }
  }

  /**
   * Configura directory di lavoro
   */
  setWorkingDirectory(directory: string): void {
    this.workingDirectory = resolve(directory);
    advancedAIProvider.setWorkingDirectory(directory);
  }

  /**
   * Ottieni directory corrente
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Ottieni metriche di validazione
   */
  getValidationMetrics() {
    return validatorManager.getConfig();
  }

  /**
   * Batch write di più file con validazione
   */
  async writeMultipleFilesValidated(files: ValidatedWriteOptions[]): Promise<ValidatedWriteResult[]> {
    const results: ValidatedWriteResult[] = [];

    for (const fileOptions of files) {
      const result = await this.writeFileValidated(fileOptions);
      results.push(result);

      // Stop se un file critico fallisce
      if (!result.success && fileOptions.path.includes('.ts')) {
        advancedUI.logWarning(`⚠️ Stopping batch write due to TypeScript file failure`);
        break;
      }
    }

    return results;
  }
}

// Export singleton instance
export const validatedAIProvider = new ValidatedAIProvider();