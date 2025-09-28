/**
 * Central Validator Manager for all file operations
 * Provides unified validation across all agents and tools
 */

import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { z } from 'zod'
import type { ContentValidator, ValidationResult } from '../schemas/tool-schemas'
import { ContentValidators } from '../tools/write-file-tool'
import { advancedUI } from '../ui/advanced-cli-ui'
import { createFormatterManager, type FormatResult } from './formatter-manager'

export interface ValidationConfig {
  enableLSP: boolean
  autoFix: boolean
  autoFormat: boolean
  strictMode: boolean
  skipWarnings: boolean
  customValidators?: ContentValidator[]
  cognitiveValidation?: boolean
  orchestrationAware?: boolean
  intelligentCaching?: boolean
  adaptiveThresholds?: boolean
}

export interface ValidationContext {
  filePath: string
  content: string
  operation: 'create' | 'update' | 'append'
  agentId?: string
  projectType?: string
}

// Zod schemas for intelligent validation
const ValidationCognitionSchema = z.object({
  intent: z.enum(['create', 'modify', 'fix', 'enhance', 'refactor', 'analyze']),
  complexity: z.enum(['simple', 'moderate', 'complex', 'expert']),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  language: z.string(),
  framework: z.string().optional(),
  projectType: z.string().optional(),
  agentContext: z.string().optional(),
  orchestrationLevel: z.number().min(0).max(10),
  contextAwareness: z.number().min(0).max(1),
})

const IntelligentValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  suggestions: z.array(z.string()),
  optimizations: z.array(z.string()),
  cognitiveScore: z.number().min(0).max(1),
  orchestrationCompatibility: z.number().min(0).max(1),
  adaptiveRecommendations: z.array(z.string()),
  fixedContent: z.string().optional(),
  formatted: z.boolean().optional(),
  formatter: z.string().optional(),
})

export type ValidationCognition = z.infer<typeof ValidationCognitionSchema>
export type IntelligentValidationResult = z.infer<typeof IntelligentValidationResultSchema>

export class ValidatorManager extends EventEmitter {
  private static instance: ValidatorManager
  private config: ValidationConfig
  private customValidators: Map<string, ContentValidator[]> = new Map()
  private formatterManager: ReturnType<typeof createFormatterManager> | null = null
  private validationCache: Map<string, IntelligentValidationResult> = new Map()
  private cognitivePatterns: Map<string, ValidationCognition> = new Map()
  private adaptiveThresholds: Map<string, number> = new Map()
  private orchestrationMetrics: Map<string, number> = new Map()

  constructor(config: Partial<ValidationConfig> = {}) {
    super()
    this.config = {
      enableLSP: true,
      autoFix: true,
      autoFormat: true,
      strictMode: false,
      skipWarnings: false,
      cognitiveValidation: true,
      orchestrationAware: true,
      intelligentCaching: true,
      adaptiveThresholds: true,
      ...config,
    }

    this.initializeIntelligentSystems()
  }

  static getInstance(config?: Partial<ValidationConfig>): ValidatorManager {
    if (!ValidatorManager.instance) {
      ValidatorManager.instance = new ValidatorManager(config)
    }
    return ValidatorManager.instance
  }

  /**
   * Initialize intelligent validation systems
   */
  private initializeIntelligentSystems(): void {
    // Setup cognitive pattern recognition
    this.setupCognitivePatterns()

    // Initialize adaptive thresholds
    this.initializeAdaptiveThresholds()

    // Setup orchestration metrics
    this.setupOrchestrationMetrics()

    // Enable intelligent caching
    this.enableIntelligentCaching()
  }

  /**
   * Setup cognitive pattern recognition for different validation scenarios
   */
  private setupCognitivePatterns(): void {
    // Common patterns for different file types and operations
    const patterns: Array<[string, ValidationCognition]> = [
      [
        'react-component',
        {
          intent: 'create',
          complexity: 'moderate',
          riskLevel: 'medium',
          language: 'typescript',
          framework: 'react',
          orchestrationLevel: 6,
          contextAwareness: 0.8,
        },
      ],
      [
        'api-endpoint',
        {
          intent: 'create',
          complexity: 'complex',
          riskLevel: 'high',
          language: 'typescript',
          framework: 'express',
          orchestrationLevel: 8,
          contextAwareness: 0.9,
        },
      ],
      [
        'utility-function',
        {
          intent: 'create',
          complexity: 'simple',
          riskLevel: 'low',
          language: 'typescript',
          orchestrationLevel: 4,
          contextAwareness: 0.6,
        },
      ],
    ]

    patterns.forEach(([key, pattern]) => {
      this.cognitivePatterns.set(key, pattern)
    })
  }

  /**
   * Initialize adaptive thresholds based on project patterns
   */
  private initializeAdaptiveThresholds(): void {
    const defaultThresholds = {
      errorTolerance: 0.1,
      warningTolerance: 0.3,
      complexityThreshold: 0.7,
      orchestrationCompatibility: 0.8,
      cognitiveScoreMinimum: 0.6,
    }

    Object.entries(defaultThresholds).forEach(([key, value]) => {
      this.adaptiveThresholds.set(key, value)
    })
  }

  /**
   * Setup orchestration metrics for agent coordination
   */
  private setupOrchestrationMetrics(): void {
    const metrics = {
      agentCoordination: 0.8,
      taskAlignment: 0.7,
      contextCoherence: 0.9,
      systemIntegration: 0.85,
    }

    Object.entries(metrics).forEach(([key, value]) => {
      this.orchestrationMetrics.set(key, value)
    })
  }

  /**
   * Enable intelligent caching with signature-based invalidation
   */
  private enableIntelligentCaching(): void {
    if (this.config.intelligentCaching) {
      // Cache cleanup disabled to avoid message interruptions
      // setInterval(() => {
      //   this.cleanupIntelligentCache();
      // }, 5 * 60 * 1000);
    }
  }

  /**
   * Register custom validators for specific file patterns or agent types
   */
  registerValidator(pattern: string, validator: ContentValidator): void {
    if (!this.customValidators.has(pattern)) {
      this.customValidators.set(pattern, [])
    }
    this.customValidators.get(pattern)?.push(validator)
  }

  /**
   * Initialize formatter manager with working directory
   */
  private initializeFormatter(workingDirectory: string): void {
    if (!this.formatterManager) {
      this.formatterManager = createFormatterManager(workingDirectory, {
        enabled: this.config.autoFormat,
        formatOnSave: true,
        respectEditorConfig: true,
      })
    }
  }

  /**
   * Main validation method with cognitive enhancement
   */
  async validateContent(context: ValidationContext): Promise<ExtendedValidationResult> {
    if (this.config.cognitiveValidation) {
      return this.validateWithCognition(context)
    }
    return this.validateTraditionally(context)
  }

  /**
   * Enhanced cognitive validation with intelligence and orchestration awareness
   */
  async validateWithCognition(context: ValidationContext): Promise<IntelligentValidationResult> {
    const { filePath, content, operation, agentId } = context

    // Step 1: Generate cognitive signature for caching
    const cognitiveSignature = this.generateCognitiveSignature(context)

    // Step 2: Check intelligent cache
    if (this.config.intelligentCaching) {
      const cached = this.validationCache.get(cognitiveSignature)
      if (cached && this.isCacheValid(cached, context)) {
        advancedUI.logInfo(`⚡︎ Using cached validation for ${filePath.split('/').pop()}`)
        this.emit('validation:cached', { filePath, cached })
        return cached
      }
    }

    // Step 3: Analyze validation cognition
    const cognition = await this.analyzeCognition(context)
    advancedUI.logInfo(
      `⚡︎ Cognitive analysis: ${cognition.intent} (${cognition.complexity}, risk: ${cognition.riskLevel})`
    )

    // Step 4: Select intelligent validators
    const validators = this.selectIntelligentValidators(context, cognition)

    // Step 5: Execute validation with orchestration awareness
    const result = await this.executeIntelligentValidation(context, cognition, validators)

    // Step 6: Apply adaptive learning
    if (this.config.adaptiveThresholds) {
      this.updateAdaptiveThresholds(context, result)
    }

    // Step 7: Cache result
    if (this.config.intelligentCaching) {
      this.validationCache.set(cognitiveSignature, result)
    }

    // Step 8: Emit orchestration events
    this.emit('validation:completed', { context, cognition, result })

    return result
  }

  /**
   * Traditional validation method (fallback)
   */
  async validateTraditionally(context: ValidationContext): Promise<ExtendedValidationResult> {
    const { filePath, content, operation, agentId } = context

    advancedUI.logInfo(`🎨 Processing ${operation}: ${filePath.split('/').pop()}`)

    const errors: string[] = []
    const warnings: string[] = []
    let processedContent = content
    let formatResult: FormatResult | null = null

    try {
      // Initialize formatter with working directory from file path
      const workingDirectory = filePath.substring(0, filePath.lastIndexOf('/')) || process.cwd()
      this.initializeFormatter(workingDirectory)

      // 1. 🎨 FORMAT FIRST - Format code according to language standards
      if (this.config.autoFormat && this.formatterManager) {
        advancedUI.logInfo(`🎨 Auto-formatting ${filePath.split('/').pop()}...`)
        formatResult = await this.formatterManager.formatContent(content, filePath)

        if (formatResult.success && formatResult.formatted) {
          processedContent = formatResult.content
          advancedUI.logSuccess(`✓ Formatted with ${formatResult.formatter}`)
        } else if (formatResult.warnings) {
          warnings.push(...formatResult.warnings)
        }

        if (formatResult.error && !formatResult.success) {
          warnings.push(`Formatting failed: ${formatResult.error}`)
        }
      }

      // 2. 🔍 VALIDATE - Run LSP and syntax validation on formatted content
      const validators = this.selectValidators(context)

      for (const validator of validators) {
        try {
          const result = await validator(processedContent, filePath)

          if (result.errors) {
            errors.push(...result.errors)
          }

          if (result.warnings && !this.config.skipWarnings) {
            warnings.push(...result.warnings)
          }
        } catch (validatorError: any) {
          warnings.push(`Validator error: ${validatorError.message}`)
        }
      }

      // 3. 📋 LOG RESULTS - Show formatting and validation results
      this.logProcessingResults(filePath, formatResult, errors, warnings, agentId)

      // 4. 🔧 AUTO-FIX - Fix remaining errors if possible
      let finalContent = processedContent
      if (errors.length > 0 && this.config.autoFix) {
        finalContent = await this.attemptAutoFix(processedContent, filePath, errors)

        // Re-validate after auto-fix
        if (finalContent !== processedContent) {
          return this.validateContent({ ...context, content: finalContent })
        }
      }

      const isValid = errors.length === 0 || (!this.config.strictMode && errors.every((e) => !this.isCriticalError(e)))

      return {
        isValid,
        errors,
        warnings,
        fixedContent: finalContent !== content ? finalContent : undefined,
        formatted: formatResult?.formatted || false,
        formatter: formatResult?.formatter,
      }
    } catch (error: any) {
      advancedUI.logError(`Processing failed for ${filePath}: ${error.message}`)
      return {
        isValid: false,
        errors: [`Processing system error: ${error.message}`],
        warnings: [],
        fixedContent: undefined,
        formatted: false,
      }
    }
  }

  /**
   * Generate cognitive signature for intelligent caching
   */
  private generateCognitiveSignature(context: ValidationContext): string {
    const { filePath, content, operation, agentId, projectType } = context
    const contentHash = this.simpleHash(content)
    const contextHash = this.simpleHash(`${filePath}:${operation}:${agentId}:${projectType}`)
    return `${contentHash}:${contextHash}`
  }

  /**
   * Simple hash function for cognitive signatures
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Check if cached validation result is still valid
   */
  private isCacheValid(cached: IntelligentValidationResult, _context: ValidationContext): boolean {
    // Cache is valid for 10 minutes and if cognitive score is above threshold
    const cacheAge = Date.now() - ((cached as any).timestamp || 0)
    const isRecent = cacheAge < 10 * 60 * 1000
    const isHighQuality = cached.cognitiveScore >= (this.adaptiveThresholds.get('cognitiveScoreMinimum') || 0.6)

    return isRecent && isHighQuality
  }

  /**
   * Analyze validation cognition for intelligent processing
   */
  private async analyzeCognition(context: ValidationContext): Promise<ValidationCognition> {
    const { filePath, content, operation, agentId, projectType } = context

    // Extract file characteristics
    const language = this.detectLanguage(filePath)
    const framework = this.detectFramework(content, filePath)
    const complexity = this.assessComplexity(content)
    const riskLevel = this.assessRiskLevel(content, operation)
    const intent = this.inferIntent(operation, content)

    // Calculate orchestration metrics
    const orchestrationLevel = this.calculateOrchestrationLevel(context)
    const contextAwareness = this.calculateContextAwareness(context)

    const cognition: ValidationCognition = {
      intent,
      complexity,
      riskLevel,
      language,
      framework,
      projectType,
      agentContext: agentId,
      orchestrationLevel,
      contextAwareness,
    }

    // Validate cognition schema
    return ValidationCognitionSchema.parse(cognition)
  }

  /**
   * Detect programming language from file path
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      md: 'markdown',
      css: 'css',
      scss: 'scss',
      html: 'html',
      py: 'python',
      rs: 'rust',
      go: 'go',
    }
    return langMap[ext || ''] || 'unknown'
  }

  /**
   * Detect framework from content analysis
   */
  private detectFramework(content: string, filePath: string): string | undefined {
    if (content.includes('import React') || content.includes('from "react"')) return 'react'
    if (content.includes('import { NextPage }') || content.includes('next/')) return 'nextjs'
    if (content.includes('import express') || content.includes('app.listen')) return 'express'
    if (content.includes('import { FastifyInstance }')) return 'fastify'
    if (filePath.includes('__tests__') || content.includes('describe(')) return 'jest'
    return undefined
  }

  /**
   * Assess content complexity
   */
  private assessComplexity(content: string): 'simple' | 'moderate' | 'complex' | 'expert' {
    const lines = content.split('\n').length
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(content)
    const imports = (content.match(/import/g) || []).length

    if (lines < 50 && cyclomaticComplexity < 5 && imports < 5) return 'simple'
    if (lines < 150 && cyclomaticComplexity < 10 && imports < 15) return 'moderate'
    if (lines < 300 && cyclomaticComplexity < 20 && imports < 30) return 'complex'
    return 'expert'
  }

  /**
   * Calculate cyclomatic complexity
   */
  private calculateCyclomaticComplexity(content: string): number {
    const decisionPoints = [
      /\bif\b/g,
      /\belse\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\b&&\b/g,
      /\b\|\|\b/g,
    ]

    return decisionPoints.reduce((complexity, pattern) => {
      const matches = content.match(pattern) || []
      return complexity + matches.length
    }, 1) // Base complexity of 1
  }

  /**
   * Assess risk level of operation
   */
  private assessRiskLevel(content: string, operation: string): 'low' | 'medium' | 'high' | 'critical' {
    let riskScore = 0

    // Operation risk
    if (operation === 'create') riskScore += 1
    if (operation === 'update') riskScore += 2
    if (operation === 'append') riskScore += 1

    // Content risk indicators
    if (content.includes('eval(') || content.includes('new Function(')) riskScore += 5
    if (content.includes('process.exit') || content.includes('process.kill')) riskScore += 4
    if (content.includes('fs.unlink') || content.includes('rm -rf')) riskScore += 4
    if (content.includes('exec(') || content.includes('spawn(')) riskScore += 3
    if (content.includes('innerHTML') || content.includes('dangerouslySetInnerHTML')) riskScore += 2

    if (riskScore >= 8) return 'critical'
    if (riskScore >= 5) return 'high'
    if (riskScore >= 2) return 'medium'
    return 'low'
  }

  /**
   * Infer intent from operation and content
   */
  private inferIntent(
    operation: string,
    content: string
  ): 'create' | 'modify' | 'fix' | 'enhance' | 'refactor' | 'analyze' {
    if (operation === 'create') return 'create'
    if (content.includes('TODO:') || content.includes('FIXME:')) return 'fix'
    if (content.includes('// Enhanced') || content.includes('// Improved')) return 'enhance'
    if (content.includes('// Refactored') || content.includes('// Restructured')) return 'refactor'
    if (operation === 'update') return 'modify'
    return 'analyze'
  }

  /**
   * Calculate orchestration level (0-10)
   */
  private calculateOrchestrationLevel(context: ValidationContext): number {
    let level = 5 // Base level

    if (context.agentId) level += 2
    if (context.projectType) level += 1
    if (context.operation === 'create') level += 1
    if (context.filePath.includes('/core/') || context.filePath.includes('/services/')) level += 1

    return Math.min(10, Math.max(0, level))
  }

  /**
   * Calculate context awareness (0-1)
   */
  private calculateContextAwareness(context: ValidationContext): number {
    let awareness = 0.5 // Base awareness

    if (context.agentId) awareness += 0.2
    if (context.projectType) awareness += 0.1
    if (context.filePath.includes('src/')) awareness += 0.1
    if (context.operation === 'update') awareness += 0.1

    return Math.min(1, Math.max(0, awareness))
  }

  /**
   * Select intelligent validators based on cognition
   */
  private selectIntelligentValidators(context: ValidationContext, cognition: ValidationCognition): ContentValidator[] {
    const validators = this.selectValidators(context)

    // Add cognitive-specific validators
    if (cognition.riskLevel === 'high' || cognition.riskLevel === 'critical') {
      validators.push(this.createSecurityValidator())
    }

    if (cognition.complexity === 'complex' || cognition.complexity === 'expert') {
      validators.push(this.createComplexityValidator())
    }

    if (cognition.orchestrationLevel >= 8) {
      validators.push(this.createOrchestrationValidator())
    }

    return validators
  }

  /**
   * Execute intelligent validation with orchestration awareness
   */
  private async executeIntelligentValidation(
    context: ValidationContext,
    cognition: ValidationCognition,
    validators: ContentValidator[]
  ): Promise<IntelligentValidationResult> {
    const { filePath, content } = context

    // Initialize result containers
    const errors: string[] = []
    const warnings: string[] = []
    const suggestions: string[] = []
    const optimizations: string[] = []
    const adaptiveRecommendations: string[] = []

    let processedContent = content
    let formatResult: FormatResult | null = null

    try {
      // 1. Format with cognitive awareness
      if (this.config.autoFormat) {
        const workingDirectory = filePath.substring(0, filePath.lastIndexOf('/')) || process.cwd()
        this.initializeFormatter(workingDirectory)

        if (this.formatterManager) {
          formatResult = await this.formatterManager.formatContent(content, filePath)
          if (formatResult.success && formatResult.formatted) {
            processedContent = formatResult.content
          }
        }
      }

      // 2. Execute validators with cognitive context
      for (const validator of validators) {
        try {
          const result = await validator(processedContent, filePath)

          if (result.errors) errors.push(...result.errors)
          if (result.warnings && !this.config.skipWarnings) warnings.push(...result.warnings)
        } catch (validatorError: any) {
          warnings.push(`Validator error: ${validatorError.message}`)
        }
      }

      // 3. Generate intelligent suggestions
      suggestions.push(...this.generateIntelligentSuggestions(context, cognition))

      // 4. Generate optimization recommendations
      optimizations.push(...this.generateOptimizations(context, cognition))

      // 5. Generate adaptive recommendations
      adaptiveRecommendations.push(...this.generateAdaptiveRecommendations(context, cognition))

      // 6. Calculate cognitive scores
      const cognitiveScore = this.calculateCognitiveScore(errors, warnings, cognition)
      const orchestrationCompatibility = this.calculateOrchestrationCompatibility(context, cognition)

      // 7. Auto-fix with cognitive awareness
      let finalContent = processedContent
      if (errors.length > 0 && this.config.autoFix) {
        finalContent = await this.attemptIntelligentAutoFix(processedContent, filePath, errors, cognition)
      }

      const isValid = this.assessValidityWithCognition(errors, warnings, cognition)

      const result: IntelligentValidationResult = {
        isValid,
        errors,
        warnings,
        suggestions,
        optimizations,
        cognitiveScore,
        orchestrationCompatibility,
        adaptiveRecommendations,
        fixedContent: finalContent !== content ? finalContent : undefined,
        formatted: formatResult?.formatted || false,
        formatter: formatResult?.formatter,
      }

      // Add timestamp for cache validation
      ;(result as any).timestamp = Date.now()

      return IntelligentValidationResultSchema.parse(result)
    } catch (error: any) {
      advancedUI.logError(`Intelligent validation failed for ${filePath}: ${error.message}`)

      return {
        isValid: false,
        errors: [`Intelligent validation system error: ${error.message}`],
        warnings: [],
        suggestions: [],
        optimizations: [],
        cognitiveScore: 0,
        orchestrationCompatibility: 0,
        adaptiveRecommendations: [],
        fixedContent: undefined,
        formatted: false,
      }
    }
  }

  /**
   * Generate intelligent suggestions based on cognition
   */
  private generateIntelligentSuggestions(_context: ValidationContext, cognition: ValidationCognition): string[] {
    const suggestions: string[] = []

    if (cognition.complexity === 'expert') {
      suggestions.push('Consider breaking down this complex logic into smaller, more manageable functions')
    }

    if (cognition.riskLevel === 'high') {
      suggestions.push('Add comprehensive error handling and input validation')
    }

    if (cognition.framework === 'react' && cognition.complexity !== 'simple') {
      suggestions.push('Consider using React.memo() for performance optimization')
    }

    if (cognition.orchestrationLevel >= 8) {
      suggestions.push('This component is part of a complex orchestration - ensure proper event handling')
    }

    return suggestions
  }

  /**
   * Generate optimization recommendations
   */
  private generateOptimizations(context: ValidationContext, cognition: ValidationCognition): string[] {
    const optimizations: string[] = []

    if (cognition.language === 'typescript' && context.content.includes(': any')) {
      optimizations.push('Replace "any" types with specific interfaces for better type safety')
    }

    if (cognition.framework === 'react' && context.content.includes('useEffect')) {
      optimizations.push('Review useEffect dependencies to prevent unnecessary re-renders')
    }

    if (cognition.complexity === 'complex' && !context.content.includes('async')) {
      optimizations.push('Consider using async/await for better readability in complex operations')
    }

    return optimizations
  }

  /**
   * Generate adaptive recommendations based on learning
   */
  private generateAdaptiveRecommendations(_context: ValidationContext, cognition: ValidationCognition): string[] {
    const recommendations: string[] = []

    // Check against learned patterns
    const errorTolerance = this.adaptiveThresholds.get('errorTolerance') || 0.1
    const complexityThreshold = this.adaptiveThresholds.get('complexityThreshold') || 0.7

    if (cognition.complexity === 'expert' && errorTolerance < 0.05) {
      recommendations.push('Based on project patterns, extra scrutiny recommended for expert-level complexity')
    }

    if (cognition.orchestrationLevel >= 8 && complexityThreshold > 0.8) {
      recommendations.push('High orchestration level detected - ensure compatibility with existing agent workflows')
    }

    return recommendations
  }

  /**
   * Calculate cognitive score (0-1)
   */
  private calculateCognitiveScore(errors: string[], warnings: string[], cognition: ValidationCognition): number {
    let score = 1.0

    // Penalty for errors and warnings
    score -= errors.length * 0.1
    score -= warnings.length * 0.05

    // Bonus for good complexity management
    if (cognition.complexity === 'simple') score += 0.1
    if (cognition.riskLevel === 'low') score += 0.1

    // Orchestration awareness bonus
    score += cognition.contextAwareness * 0.1

    return Math.min(1, Math.max(0, score))
  }

  /**
   * Calculate orchestration compatibility (0-1)
   */
  private calculateOrchestrationCompatibility(context: ValidationContext, cognition: ValidationCognition): number {
    let compatibility = 0.5

    // Agent context bonus
    if (context.agentId) compatibility += 0.2

    // Project type alignment
    if (context.projectType) compatibility += 0.1

    // Orchestration level factor
    compatibility += (cognition.orchestrationLevel / 10) * 0.2

    // Context awareness factor
    compatibility += cognition.contextAwareness * 0.1

    return Math.min(1, Math.max(0, compatibility))
  }

  /**
   * Assess validity with cognitive factors
   */
  private assessValidityWithCognition(errors: string[], warnings: string[], cognition: ValidationCognition): boolean {
    const errorTolerance = this.adaptiveThresholds.get('errorTolerance') || 0.1
    const warningTolerance = this.adaptiveThresholds.get('warningTolerance') || 0.3

    // Adjust tolerance based on complexity and risk
    let adjustedErrorTolerance = errorTolerance
    let adjustedWarningTolerance = warningTolerance

    if (cognition.complexity === 'expert') {
      adjustedErrorTolerance *= 1.5
      adjustedWarningTolerance *= 1.2
    }

    if (cognition.riskLevel === 'critical') {
      adjustedErrorTolerance *= 0.5
      adjustedWarningTolerance *= 0.7
    }

    const errorRatio = errors.length / 100 // Normalize against content size
    const warningRatio = warnings.length / 100

    return errorRatio <= adjustedErrorTolerance && warningRatio <= adjustedWarningTolerance
  }

  /**
   * Intelligent auto-fix with cognitive awareness
   */
  private async attemptIntelligentAutoFix(
    content: string,
    filePath: string,
    errors: string[],
    cognition: ValidationCognition
  ): Promise<string> {
    let fixedContent = content

    // Use traditional auto-fix as base
    fixedContent = await this.attemptAutoFix(content, filePath, errors)

    // Apply cognitive-specific fixes
    if (cognition.framework === 'react') {
      fixedContent = this.applyReactCognitiveFixes(fixedContent, errors)
    }

    if (cognition.riskLevel === 'high' || cognition.riskLevel === 'critical') {
      fixedContent = this.applySecurityCognitiveFixes(fixedContent, errors)
    }

    if (cognition.complexity === 'expert') {
      fixedContent = this.applyComplexityCognitiveFixes(fixedContent, errors)
    }

    return fixedContent
  }

  /**
   * Apply React-specific cognitive fixes
   */
  private applyReactCognitiveFixes(content: string, errors: string[]): string {
    let fixedContent = content

    // Add React.memo for performance
    if (errors.some((e) => e.includes('performance')) && !content.includes('React.memo')) {
      fixedContent = fixedContent.replace(
        /export\s+default\s+function\s+(\w+)/,
        'export default React.memo(function $1'
      )
      if (fixedContent !== content) {
        fixedContent += ')' // Close React.memo
      }
    }

    return fixedContent
  }

  /**
   * Apply security-focused cognitive fixes
   */
  private applySecurityCognitiveFixes(content: string, errors: string[]): string {
    let fixedContent = content

    // Add input validation
    if (errors.some((e) => e.includes('security') || e.includes('validation'))) {
      // This is a placeholder - real implementation would be more sophisticated
      if (!content.includes('validateInput') && content.includes('function')) {
        fixedContent = `// TODO: Add input validation\n${fixedContent}`
      }
    }

    return fixedContent
  }

  /**
   * Apply complexity-focused cognitive fixes
   */
  private applyComplexityCognitiveFixes(content: string, errors: string[]): string {
    let fixedContent = content

    // Add complexity reduction suggestions
    if (errors.some((e) => e.includes('complexity'))) {
      if (!content.includes('// TODO: Consider refactoring')) {
        fixedContent = `// TODO: Consider refactoring for reduced complexity\n${fixedContent}`
      }
    }

    return fixedContent
  }

  /**
   * Update adaptive thresholds based on validation results
   */
  private updateAdaptiveThresholds(_context: ValidationContext, result: IntelligentValidationResult): void {
    // Learn from successful validations
    if (result.isValid && result.cognitiveScore > 0.8) {
      const currentTolerance = this.adaptiveThresholds.get('errorTolerance') || 0.1
      this.adaptiveThresholds.set('errorTolerance', Math.min(0.2, currentTolerance * 1.05))
    }

    // Adjust based on orchestration compatibility
    if (result.orchestrationCompatibility > 0.9) {
      const currentCompatibility = this.orchestrationMetrics.get('agentCoordination') || 0.8
      this.orchestrationMetrics.set('agentCoordination', Math.min(1.0, currentCompatibility * 1.02))
    }
  }

  /**
   * Create security-focused validator
   */
  private createSecurityValidator(): ContentValidator {
    return async (content: string, _filePath: string): Promise<ValidationResult> => {
      const errors: string[] = []
      const warnings: string[] = []

      // Security pattern checks
      const securityPatterns = [
        { pattern: /eval\s*\(/, message: 'eval() usage detected - security risk', level: 'error' },
        { pattern: /innerHTML\s*=/, message: 'innerHTML usage - consider textContent for security', level: 'warning' },
        { pattern: /process\.exit\s*\(/, message: 'process.exit() usage - ensure graceful shutdown', level: 'warning' },
        { pattern: /\.exec\s*\(/, message: 'exec() usage detected - validate input thoroughly', level: 'error' },
      ]

      securityPatterns.forEach(({ pattern, message, level }) => {
        if (pattern.test(content)) {
          if (level === 'error') {
            errors.push(message)
          } else {
            warnings.push(message)
          }
        }
      })

      return { isValid: errors.length === 0, errors, warnings }
    }
  }

  /**
   * Create complexity-focused validator
   */
  private createComplexityValidator(): ContentValidator {
    return async (content: string, _filePath: string): Promise<ValidationResult> => {
      const errors: string[] = []
      const warnings: string[] = []

      const lines = content.split('\n').length
      const cyclomaticComplexity = this.calculateCyclomaticComplexity(content)

      if (lines > 500) {
        warnings.push('File is very large (>500 lines) - consider splitting into smaller modules')
      }

      if (cyclomaticComplexity > 15) {
        errors.push('Cyclomatic complexity is too high - consider refactoring')
      } else if (cyclomaticComplexity > 10) {
        warnings.push('Cyclomatic complexity is getting high - consider simplification')
      }

      return { isValid: errors.length === 0, errors, warnings }
    }
  }

  /**
   * Create orchestration-aware validator
   */
  private createOrchestrationValidator(): ContentValidator {
    return async (content: string, filePath: string): Promise<ValidationResult> => {
      const errors: string[] = []
      const warnings: string[] = []

      // Check for orchestration patterns
      if (content.includes('EventEmitter') || content.includes('emit(')) {
        if (!content.includes('removeListener') && !content.includes('off(')) {
          warnings.push('EventEmitter usage detected - ensure proper cleanup to prevent memory leaks')
        }
      }

      if (content.includes('async') && content.includes('await')) {
        if (!content.includes('try') || !content.includes('catch')) {
          warnings.push('Async operations detected - consider proper error handling for orchestration')
        }
      }

      if (filePath.includes('/agents/') || filePath.includes('/services/')) {
        if (!content.includes('interface') && !content.includes('type')) {
          warnings.push('Service/Agent file should have clear type definitions for orchestration')
        }
      }

      return { isValid: errors.length === 0, errors, warnings }
    }
  }

  /**
   * Select appropriate validators based on file context
   */
  private selectValidators(context: ValidationContext): ContentValidator[] {
    const { filePath, agentId, projectType } = context
    const validators: ContentValidator[] = []

    // 1. Auto-select based on file extension (includes LSP validation)
    if (this.config.enableLSP) {
      validators.push(ContentValidators.autoValidator)
    } else {
      // Fallback to syntax-only validation
      if (filePath.match(/\.(tsx?)$/)) {
        validators.push(ContentValidators.typeScriptSyntax)
      }
      if (filePath.match(/\.(jsx|tsx)$/)) {
        validators.push(ContentValidators.reactSyntax)
      }
      if (filePath.endsWith('.json')) {
        validators.push(ContentValidators.jsonSyntax)
      }
    }

    // 2. Add general code quality validators
    validators.push(ContentValidators.codeQuality)
    validators.push(ContentValidators.noAbsolutePaths)

    if (filePath.endsWith('package.json')) {
      validators.push(ContentValidators.noLatestVersions)
    }

    // 3. Add custom validators based on patterns
    for (const [pattern, customValidators] of this.customValidators) {
      if (this.matchesPattern(filePath, pattern) || pattern === agentId) {
        validators.push(...customValidators)
      }
    }

    // 4. Add project-specific validators
    if (projectType) {
      validators.push(...this.getProjectValidators(projectType))
    }

    return validators
  }

  /**
   * Get validators specific to project type
   */
  private getProjectValidators(projectType: string): ContentValidator[] {
    const validators: ContentValidator[] = []

    switch (projectType.toLowerCase()) {
      case 'react':
      case 'next.js':
        validators.push(this.createReactProjectValidator())
        break
      case 'node':
      case 'express':
        validators.push(this.createNodeProjectValidator())
        break
      case 'typescript':
        validators.push(this.createTypeScriptProjectValidator())
        break
    }

    return validators
  }

  /**
   * Create React project specific validator
   */
  private createReactProjectValidator(): ContentValidator {
    return async (content: string, filePath: string): Promise<ValidationResult> => {
      const errors: string[] = []
      const warnings: string[] = []

      if (filePath.match(/\.(tsx|jsx)$/)) {
        // React-specific validations
        if (content.includes('class ') && content.includes('extends Component')) {
          warnings.push('Consider using functional components with hooks instead of class components')
        }

        if (content.includes('componentDidMount') || content.includes('componentWillUnmount')) {
          warnings.push('Consider using useEffect hook instead of lifecycle methods')
        }

        if (content.includes('useState') && !content.includes('import') && !content.includes('React.useState')) {
          errors.push('useState hook used but not imported from React')
        }
      }

      return { isValid: errors.length === 0, errors, warnings }
    }
  }

  /**
   * Create Node.js project specific validator
   */
  private createNodeProjectValidator(): ContentValidator {
    return async (content: string, filePath: string): Promise<ValidationResult> => {
      const errors: string[] = []
      const warnings: string[] = []

      if (filePath.match(/\.(ts|js)$/) && !filePath.includes('test')) {
        // Node.js specific validations
        if (content.includes('process.env.') && !content.includes('dotenv')) {
          warnings.push('Consider using dotenv for environment variable management')
        }

        if (content.includes('require(') && filePath.endsWith('.ts')) {
          warnings.push('Consider using ES6 imports instead of require() in TypeScript')
        }
      }

      return { isValid: errors.length === 0, errors, warnings }
    }
  }

  /**
   * Create TypeScript project specific validator
   */
  private createTypeScriptProjectValidator(): ContentValidator {
    return async (content: string, filePath: string): Promise<ValidationResult> => {
      const errors: string[] = []
      const warnings: string[] = []

      if (filePath.match(/\.(ts|tsx)$/)) {
        // TypeScript specific validations
        if (content.includes(': any')) {
          warnings.push('Avoid using "any" type - consider using specific types')
        }

        if (content.includes('// @ts-ignore')) {
          warnings.push('Avoid @ts-ignore - fix the underlying type issue instead')
        }

        const exportMatches = content.match(
          /export\s+(?:default\s+)?(?:function|class|interface|const|let|var)\s+(\w+)/g
        )
        if (exportMatches && exportMatches.length > 5) {
          warnings.push('Consider splitting large files into smaller modules')
        }
      }

      return { isValid: errors.length === 0, errors, warnings }
    }
  }

  /**
   * Attempt to automatically fix common issues
   */
  private async attemptAutoFix(content: string, _filePath: string, errors: string[]): Promise<string> {
    let fixedContent = content

    advancedUI.logInfo(`🔧 Attempting auto-fix for ${errors.length} errors...`)

    for (const error of errors) {
      try {
        if (error.includes('React import missing')) {
          fixedContent = this.fixMissingReactImport(fixedContent)
        }

        if (error.includes('should start with uppercase letter')) {
          fixedContent = this.fixComponentNaming(fixedContent, error)
        }

        if (error.includes('missing props interface')) {
          fixedContent = this.fixMissingPropsInterface(fixedContent)
        }

        if (error.includes('Missing semicolon')) {
          fixedContent = this.fixMissingSemicolons(fixedContent)
        }

        if (error.includes('JSON contains trailing commas')) {
          fixedContent = this.fixTrailingCommas(fixedContent)
        }
      } catch (fixError: any) {
        advancedUI.logWarning(`Auto-fix failed for error "${error}": ${fixError.message}`)
      }
    }

    if (fixedContent !== content) {
      advancedUI.logSuccess('✓ Auto-fix applied successfully')
    }

    return fixedContent
  }

  /**
   * Fix missing React import
   */
  private fixMissingReactImport(content: string): string {
    if (!content.includes('import React') && !content.includes('import * as React')) {
      return `import React from 'react';\n${content}`
    }
    return content
  }

  /**
   * Fix component naming (lowercase to uppercase)
   */
  private fixComponentNaming(content: string, error: string): string {
    const match = error.match(/'([a-z][a-zA-Z0-9]*)'/)!
    if (match) {
      const oldName = match[1]
      const newName = oldName.charAt(0).toUpperCase() + oldName.slice(1)
      return content.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName)
    }
    return content
  }

  /**
   * Fix missing props interface
   */
  private fixMissingPropsInterface(content: string): string {
    const componentMatch = content.match(/(?:export\s+(?:default\s+)?(?:function|const)\s+)([A-Z][a-zA-Z0-9]*)/)
    if (componentMatch) {
      const componentName = componentMatch[1]
      const propsInterface = `\ninterface ${componentName}Props {\n  // Define component props here\n}\n`

      // Insert interface before component declaration
      const componentIndex = content.indexOf(componentMatch[0])
      const fixedContent = content.slice(0, componentIndex) + propsInterface + content.slice(componentIndex)

      // Update component to use props interface
      return fixedContent.replace(
        new RegExp(`(const\\s+${componentName})[^=]*=`, 'g'),
        `$1: React.FC<${componentName}Props> =`
      )
    }
    return content
  }

  /**
   * Fix missing semicolons
   */
  private fixMissingSemicolons(content: string): string {
    // Add semicolons to import statements
    return content.replace(/^(import.*from\s+['"][^'"]*['"])(?!\s*;)/gm, '$1;')
  }

  /**
   * Fix trailing commas in JSON
   */
  private fixTrailingCommas(content: string): string {
    return content.replace(/,(\s*[}\]])/g, '$1')
  }

  /**
   * Check if error is critical and should block file creation
   */
  private isCriticalError(error: string): boolean {
    const criticalPatterns = ['syntax error', 'cannot find module', 'type error', 'compilation error', 'invalid json']

    return criticalPatterns.some((pattern) => error.toLowerCase().includes(pattern))
  }

  /**
   * Check if file path matches pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'))
      return regex.test(filePath)
    }
    return filePath.includes(pattern)
  }

  /**
   * Log processing results including formatting and validation
   */
  private logProcessingResults(
    filePath: string,
    formatResult: FormatResult | null,
    errors: string[],
    warnings: string[],
    agentId?: string
  ): void {
    const fileName = filePath.split('/').pop()
    const prefix = agentId ? `[${agentId}] ` : ''

    // Log formatting results
    if (formatResult?.formatted) {
      advancedUI.logSuccess(`${prefix}🎨 ${fileName} - Formatted with ${formatResult.formatter}`)
    }

    // Log validation results
    if (errors.length === 0 && warnings.length === 0) {
      advancedUI.logSuccess(`${prefix}✓ ${fileName} - No validation issues found`)
      return
    }

    if (errors.length > 0) {
      advancedUI.logError(`${prefix}❌ ${fileName} - ${errors.length} error(s):`)
      errors.forEach((error, index) => {
        console.log(chalk.red(`   ${index + 1}. ${error}`))
      })
    }

    if (warnings.length > 0) {
      advancedUI.logWarning(`${prefix}⚠️  ${fileName} - ${warnings.length} warning(s):`)
      warnings.forEach((warning, index) => {
        console.log(chalk.yellow(`   ${index + 1}. ${warning}`))
      })
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidationConfig {
    return { ...this.config }
  }

  /**
   * Get cognitive validation metrics
   */
  getCognitiveMetrics(): {
    cacheSize: number
    patternCount: number
    adaptiveThresholds: Record<string, number>
    orchestrationMetrics: Record<string, number>
  } {
    return {
      cacheSize: this.validationCache.size,
      patternCount: this.cognitivePatterns.size,
      adaptiveThresholds: Object.fromEntries(this.adaptiveThresholds),
      orchestrationMetrics: Object.fromEntries(this.orchestrationMetrics),
    }
  }
}

// Export singleton instance
export const validatorManager = ValidatorManager.getInstance({
  enableLSP: true,
  autoFix: true,
  autoFormat: true,
  strictMode: false,
  skipWarnings: false,
})

// Extended validation result interface
export interface ExtendedValidationResult extends ValidationResult {
  fixedContent?: string
  formatted?: boolean
  formatter?: string
}
