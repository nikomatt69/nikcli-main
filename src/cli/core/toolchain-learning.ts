import * as fs from 'node:fs'
import * as path from 'path'
import chalk from 'chalk'
import { z } from 'zod'

// Schema per gli errori di percorso
const PathErrorSchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  originalPath: z.string(),
  workingDirectory: z.string(),
  errorType: z.enum(['not_found', 'is_directory', 'permission_denied', 'invalid_path']),
  errorMessage: z.string(),
  suggestedPath: z.string().optional(),
  correctedPath: z.string().optional(),
  success: z.boolean().optional(),
  context: z.string().optional(),
})

// Schema per i pattern di apprendimento
const LearningPatternSchema = z.object({
  pattern: z.string(),
  correction: z.string(),
  confidence: z.number().min(0).max(1),
  usageCount: z.number(),
  lastUsed: z.date(),
  successRate: z.number().min(0).max(1),
})

// Schema per la configurazione di apprendimento
const LearningConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxPatterns: z.number().default(100),
  confidenceThreshold: z.number().default(0.7),
  autoCorrect: z.boolean().default(true),
  learnFromSuccess: z.boolean().default(true),
  patternDecay: z.number().default(0.95), // Decay factor for old patterns
})

export type PathError = z.infer<typeof PathErrorSchema>
export type LearningPattern = z.infer<typeof LearningPatternSchema>
export type LearningConfig = z.infer<typeof LearningConfigSchema>

/**
 * Sistema di apprendimento per le toolchain che memorizza errori e correzioni
 */
export class ToolchainLearningSystem {
  private config: LearningConfig
  private errors: PathError[] = []
  private patterns: LearningPattern[] = []
  private learningFile: string
  private workingDirectory: string

  constructor(workingDirectory: string, config: Partial<LearningConfig> = {}) {
    this.workingDirectory = workingDirectory
    this.config = LearningConfigSchema.parse(config)
    this.learningFile = path.join(workingDirectory, '.nikcli', 'toolchain-learning.json')
    this.loadLearningData()
  }

  /**
   * Registra un errore di percorso e cerca di apprendere una correzione
   */
  recordPathError(
    originalPath: string,
    errorType: PathError['errorType'],
    errorMessage: string,
    context?: string
  ): string | null {
    if (!this.config.enabled) return null

    const error: PathError = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      originalPath,
      workingDirectory: this.workingDirectory,
      errorType,
      errorMessage,
      context,
    }

    // Cerca pattern esistenti per correggere automaticamente
    const correctedPath = this.findCorrection(originalPath)
    if (correctedPath) {
      error.correctedPath = correctedPath
      error.success = true
      this.updatePatternConfidence(originalPath, correctedPath, true)
    } else {
      // Suggerisci una correzione basata su analisi del percorso
      const suggestedPath = this.suggestCorrection(originalPath, errorType)
      if (suggestedPath) {
        error.suggestedPath = suggestedPath
      }
    }

    this.errors.push(error)
    this.saveLearningData()

    // Log per debugging
    if (process.env.NIKCLI_DEBUG_LEARNING) {
      console.log(chalk.yellow(`🔍 Learning: Recorded path error for "${originalPath}"`))
      if (correctedPath) {
        console.log(chalk.green(`✅ Auto-corrected to: "${correctedPath}"`))
      } else if (error.suggestedPath) {
        console.log(chalk.blue(`💡 Suggested: "${error.suggestedPath}"`))
      }
    }

    return correctedPath || null
  }

  /**
   * Registra un successo per migliorare i pattern esistenti
   */
  recordSuccess(originalPath: string, correctedPath: string): void {
    if (!this.config.enabled || !this.config.learnFromSuccess) return

    this.updatePatternConfidence(originalPath, correctedPath, true)
    this.saveLearningData()

    if (process.env.NIKCLI_DEBUG_LEARNING) {
      console.log(chalk.green(`✅ Learning: Recorded success for "${originalPath}" -> "${correctedPath}"`))
    }
  }

  /**
   * Trova una correzione basata sui pattern esistenti
   */
  private findCorrection(originalPath: string): string | null {
    // Cerca pattern esatti
    const exactPattern = this.patterns.find(p => p.pattern === originalPath && p.confidence >= this.config.confidenceThreshold)
    if (exactPattern) {
      exactPattern.lastUsed = new Date()
      exactPattern.usageCount++
      return exactPattern.correction
    }

    // Cerca pattern parziali (per percorsi simili)
    const partialPatterns = this.patterns
      .filter(p => p.confidence >= this.config.confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence)

    for (const pattern of partialPatterns) {
      if (this.isPathSimilar(originalPath, pattern.pattern)) {
        const correctedPath = this.applyPatternCorrection(originalPath, pattern)
        if (correctedPath) {
          pattern.lastUsed = new Date()
          pattern.usageCount++
          return correctedPath
        }
      }
    }

    return null
  }

  /**
   * Suggerisce una correzione basata sull'analisi del percorso
   */
  private suggestCorrection(originalPath: string, errorType: PathError['errorType']): string | null {
    const workingDir = this.workingDirectory

    // Se il percorso è assoluto ma fuori dalla working directory
    if (path.isAbsolute(originalPath) && !originalPath.startsWith(workingDir)) {
      const relativePath = path.relative(workingDir, originalPath)
      if (!relativePath.startsWith('..')) {
        return path.join(workingDir, relativePath)
      }
    }

    // Se il percorso è relativo, prova a risolverlo
    if (!path.isAbsolute(originalPath)) {
      const resolvedPath = path.resolve(workingDir, originalPath)
      if (fs.existsSync(resolvedPath)) {
        return resolvedPath
      }
    }

    // Se è un errore "is_directory", cerca file nella directory
    if (errorType === 'is_directory') {
      return this.findFileInDirectory(originalPath)
    }

    // Se è un errore "not_found", cerca file simili
    if (errorType === 'not_found') {
      return this.findSimilarFile(originalPath)
    }

    return null
  }

  /**
   * Trova un file in una directory
   */
  private findFileInDirectory(dirPath: string): string | null {
    try {
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        return null
      }

      const files = fs.readdirSync(dirPath)
      const commonFiles = ['index.ts', 'index.js', 'index.tsx', 'index.jsx', 'main.ts', 'main.js']
      
      for (const file of commonFiles) {
        const filePath = path.join(dirPath, file)
        if (fs.existsSync(filePath)) {
          return filePath
        }
      }

      // Se non trova file comuni, restituisce il primo file
      if (files.length > 0) {
        return path.join(dirPath, files[0])
      }
    } catch {
      // Ignora errori
    }

    return null
  }

  /**
   * Trova file simili basato sul nome
   */
  private findSimilarFile(originalPath: string): string | null {
    try {
      const dir = path.dirname(originalPath)
      const baseName = path.basename(originalPath, path.extname(originalPath))
      const ext = path.extname(originalPath)

      if (!fs.existsSync(dir)) {
        return null
      }

      const files = fs.readdirSync(dir)
      
      // Cerca file con nome simile
      const similarFiles = files.filter(file => {
        const fileBaseName = path.basename(file, path.extname(file))
        return fileBaseName.toLowerCase().includes(baseName.toLowerCase()) ||
               baseName.toLowerCase().includes(fileBaseName.toLowerCase())
      })

      if (similarFiles.length > 0) {
        return path.join(dir, similarFiles[0])
      }

      // Cerca file con estensione simile
      const extFiles = files.filter(file => path.extname(file) === ext)
      if (extFiles.length > 0) {
        return path.join(dir, extFiles[0])
      }
    } catch {
      // Ignora errori
    }

    return null
  }

  /**
   * Verifica se due percorsi sono simili
   */
  private isPathSimilar(path1: string, path2: string): boolean {
    const normalize = (p: string) => p.toLowerCase().replace(/[\\/]/g, '/')
    const norm1 = normalize(path1)
    const norm2 = normalize(path2)

    // Controlla se uno è contenuto nell'altro
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return true
    }

    // Controlla similarità basata su token
    const tokens1 = norm1.split('/').filter(t => t.length > 0)
    const tokens2 = norm2.split('/').filter(t => t.length > 0)

    if (tokens1.length === 0 || tokens2.length === 0) return false

    const commonTokens = tokens1.filter(t => tokens2.includes(t))
    const similarity = commonTokens.length / Math.max(tokens1.length, tokens2.length)

    return similarity >= 0.5
  }

  /**
   * Applica una correzione basata su pattern
   */
  private applyPatternCorrection(originalPath: string, pattern: LearningPattern): string | null {
    try {
      // Sostituisce il pattern con la correzione
      const correctedPath = originalPath.replace(pattern.pattern, pattern.correction)
      
      // Verifica che il percorso corretto esista
      if (fs.existsSync(correctedPath)) {
        return correctedPath
      }
    } catch {
      // Ignora errori
    }

    return null
  }

  /**
   * Aggiorna la confidenza di un pattern
   */
  private updatePatternConfidence(originalPath: string, correctedPath: string, success: boolean): void {
    let pattern = this.patterns.find(p => p.pattern === originalPath && p.correction === correctedPath)

    if (!pattern) {
      pattern = {
        pattern: originalPath,
        correction: correctedPath,
        confidence: 0.5,
        usageCount: 0,
        lastUsed: new Date(),
        successRate: 0,
      }
      this.patterns.push(pattern)
    }

    pattern.usageCount++
    pattern.lastUsed = new Date()

    // Aggiorna success rate
    const totalAttempts = pattern.usageCount
    const successfulAttempts = Math.round(pattern.successRate * (totalAttempts - 1)) + (success ? 1 : 0)
    pattern.successRate = successfulAttempts / totalAttempts

    // Aggiorna confidenza basata su success rate e usage count
    pattern.confidence = Math.min(0.95, pattern.successRate + (Math.log(totalAttempts) / 10))

    // Applica decay ai pattern vecchi
    this.applyPatternDecay()
  }

  /**
   * Applica decay ai pattern vecchi per evitare overfitting
   */
  private applyPatternDecay(): void {
    const now = Date.now()
    const decayThreshold = 30 * 24 * 60 * 60 * 1000 // 30 giorni

    this.patterns.forEach(pattern => {
      const age = now - pattern.lastUsed.getTime()
      if (age > decayThreshold) {
        pattern.confidence *= this.config.patternDecay
      }
    })

    // Rimuovi pattern con confidenza troppo bassa
    this.patterns = this.patterns.filter(p => p.confidence >= 0.1)
  }

  /**
   * Carica i dati di apprendimento dal file
   */
  private loadLearningData(): void {
    try {
      if (fs.existsSync(this.learningFile)) {
        const data = JSON.parse(fs.readFileSync(this.learningFile, 'utf8'))
        
        if (data.errors) {
          this.errors = data.errors.map((e: any) => ({
            ...e,
            timestamp: new Date(e.timestamp),
          }))
        }
        
        if (data.patterns) {
          this.patterns = data.patterns.map((p: any) => ({
            ...p,
            lastUsed: new Date(p.lastUsed),
          }))
        }
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Failed to load toolchain learning data'), error)
    }
  }

  /**
   * Salva i dati di apprendimento nel file
   */
  private saveLearningData(): void {
    try {
      const dir = path.dirname(this.learningFile)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const data = {
        errors: this.errors.slice(-1000), // Mantieni solo gli ultimi 1000 errori
        patterns: this.patterns,
        config: this.config,
        lastUpdated: new Date().toISOString(),
      }

      fs.writeFileSync(this.learningFile, JSON.stringify(data, null, 2))
    } catch (error) {
      console.warn(chalk.yellow('Warning: Failed to save toolchain learning data'), error)
    }
  }

  /**
   * Ottieni statistiche di apprendimento
   */
  getLearningStats(): {
    totalErrors: number
    totalPatterns: number
    successRate: number
    topPatterns: Array<{ pattern: string; correction: string; confidence: number; usageCount: number }>
  } {
    const totalErrors = this.errors.length
    const totalPatterns = this.patterns.length
    const successfulErrors = this.errors.filter(e => e.success).length
    const successRate = totalErrors > 0 ? successfulErrors / totalErrors : 0

    const topPatterns = this.patterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(p => ({
        pattern: p.pattern,
        correction: p.correction,
        confidence: p.confidence,
        usageCount: p.usageCount,
      }))

    return {
      totalErrors,
      totalPatterns,
      successRate,
      topPatterns,
    }
  }

  /**
   * Resetta i dati di apprendimento
   */
  resetLearningData(): void {
    this.errors = []
    this.patterns = []
    this.saveLearningData()
    console.log(chalk.green('✓ Toolchain learning data reset'))
  }

  /**
   * Esporta i dati di apprendimento
   */
  exportLearningData(): { errors: PathError[]; patterns: LearningPattern[]; config: LearningConfig } {
    return {
      errors: [...this.errors],
      patterns: [...this.patterns],
      config: { ...this.config },
    }
  }

  /**
   * Importa dati di apprendimento
   */
  importLearningData(data: { errors: PathError[]; patterns: LearningPattern[]; config?: Partial<LearningConfig> }): void {
    this.errors = data.errors.map(e => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }))
    
    this.patterns = data.patterns.map(p => ({
      ...p,
      lastUsed: new Date(p.lastUsed),
    }))

    if (data.config) {
      this.config = { ...this.config, ...data.config }
    }

    this.saveLearningData()
    console.log(chalk.green('✓ Toolchain learning data imported'))
  }
}

// Singleton instance
let learningSystemInstance: ToolchainLearningSystem | null = null

export function getToolchainLearningSystem(workingDirectory?: string): ToolchainLearningSystem {
  if (!learningSystemInstance && workingDirectory) {
    learningSystemInstance = new ToolchainLearningSystem(workingDirectory)
  }
  return learningSystemInstance!
}

export function resetToolchainLearningSystem(): void {
  learningSystemInstance = null
}