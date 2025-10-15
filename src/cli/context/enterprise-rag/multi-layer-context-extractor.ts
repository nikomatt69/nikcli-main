import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import chalk from 'chalk'

// Enterprise RAG Architecture - Multi-Layer Context Extractor
// Based on the comprehensive design from NikCLI_Context_Awareness_RAG.md

export interface ContextLayer {
  level: 'workspace' | 'project' | 'file' | 'code' | 'symbol'
  extractor: ContextExtractor
  priority: number
  updateFrequency: UpdateFrequency
  dependencies: string[]
}

export interface ExtractedContext {
  id: string
  layer: string
  content: string
  metadata: ContextMetadata
  embedding: number[]
  timestamp: Date
  confidence: number
}

export interface ContextMetadata {
  type: ContextType
  size: number
  complexity: number
  dependencies: string[]
  relevance: number
  freshness: number
}

export interface ContextExtractor {
  id: string
  extract(target: ExtractionTarget): Promise<RawContext>
  isApplicable(target: ExtractionTarget): Promise<boolean>
}

export interface ExtractionTarget {
  path: string
  type: string
  content?: string
  metadata?: Record<string, any>
}

export interface RawContext {
  content: string
  type: ContextType
  dependencies?: string[]
  metadata?: Record<string, any>
}

export type ContextType = 
  | 'workspace-structure'
  | 'project-config'
  | 'file-content'
  | 'code-symbols'
  | 'dependencies'
  | 'git-history'
  | 'documentation'
  | 'test-coverage'

export type UpdateFrequency = 'always' | 'on-change' | 'periodic' | 'on-demand'

export class MultiLayerContextExtractor {
  private extractors = new Map<string, ContextLayer>()
  private contextStore: ContextStore
  private dependencyGraph: DependencyGraph
  private updateScheduler: UpdateScheduler
  private embeddingGenerator: EmbeddingGenerator

  constructor() {
    this.contextStore = new ContextStore()
    this.dependencyGraph = new DependencyGraph()
    this.updateScheduler = new UpdateScheduler()
    this.embeddingGenerator = new EmbeddingGenerator()
    this.initializeExtractors()
  }

  async extractContext(target: ExtractionTarget): Promise<ExtractedContext[]> {
    const contexts: ExtractedContext[] = []

    console.log(chalk.blue(`🔍 Extracting context for: ${target.path}`))

    // Determine relevant extractors
    const relevantExtractors = await this.determineRelevantExtractors(target)

    // Extract contexts in dependency order
    const extractionOrder = await this.determineExtractionOrder(relevantExtractors)

    for (const extractor of extractionOrder) {
      try {
        // Check if context is fresh
        const existingContext = await this.contextStore.getLatest(
          extractor.id,
          target,
        )
        if (existingContext && (await this.isContextFresh(existingContext))) {
          contexts.push(existingContext)
          continue
        }

        // Extract new context
        const extracted = await extractor.extractor.extract(target)
        const context = await this.processExtractedContext(extracted, extractor)

        // Store context
        await this.contextStore.store(context)
        contexts.push(context)

        console.log(chalk.green(`✓ Extracted ${extractor.id} context`))
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Failed to extract context with ${extractor.id}:`, error))
        // Continue with other extractors
      }
    }

    return contexts
  }

  private async determineRelevantExtractors(
    target: ExtractionTarget,
  ): Promise<ContextLayer[]> {
    const relevant: ContextLayer[] = []

    for (const [id, extractor] of this.extractors) {
      // Check if extractor is applicable to target
      const isApplicable = await extractor.extractor.isApplicable(target)
      if (!isApplicable) continue

      // Check if target has changed since last extraction
      const hasChanged = await this.hasTargetChanged(target, extractor)
      if (!hasChanged && extractor.updateFrequency !== 'always') continue

      relevant.push(extractor)
    }

    return relevant
  }

  private async determineExtractionOrder(
    extractors: ContextLayer[],
  ): Promise<ContextLayer[]> {
    // Build dependency graph
    const graph = new Map<string, string[]>()

    for (const extractor of extractors) {
      graph.set(extractor.id, extractor.dependencies)
    }

    // Topological sort
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const result: ContextLayer[] = []

    const visit = (id: string) => {
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected: ${id}`)
      }

      if (visited.has(id)) return

      visiting.add(id)

      const deps = graph.get(id) || []
      for (const dep of deps) {
        visit(dep)
      }

      visiting.delete(id)
      visited.add(id)

      const extractor = extractors.find((e) => e.id === id)
      if (extractor) {
        result.push(extractor)
      }
    }

    for (const [id] of graph) {
      visit(id)
    }

    return result
  }

  private async processExtractedContext(
    extracted: RawContext,
    extractor: ContextLayer,
  ): Promise<ExtractedContext> {
    // Generate embedding
    const embedding = await this.embeddingGenerator.generateEmbedding(extracted.content)

    // Calculate metadata
    const metadata = await this.calculateMetadata(extracted, extractor)

    // Generate unique ID
    const id = this.generateContextId(extractor.id, extracted)

    return {
      id,
      layer: extractor.id,
      content: extracted.content,
      metadata,
      embedding,
      timestamp: new Date(),
      confidence: metadata.relevance * metadata.freshness,
    }
  }

  private async calculateMetadata(
    extracted: RawContext,
    extractor: ContextLayer,
  ): Promise<ContextMetadata> {
    return {
      type: extracted.type,
      size: extracted.content.length,
      complexity: await this.calculateComplexity(extracted.content),
      dependencies: extracted.dependencies || [],
      relevance: await this.calculateRelevance(extracted, extractor),
      freshness: await this.calculateFreshness(extracted),
    }
  }

  private async calculateComplexity(content: string): Promise<number> {
    // Simple complexity calculation based on content characteristics
    let complexity = 0

    // Length factor
    complexity += Math.min(content.length / 1000, 5)

    // Code complexity indicators
    const codePatterns = [
      /function\s+\w+/g,
      /class\s+\w+/g,
      /if\s*\(/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /try\s*{/g,
      /catch\s*\(/g,
    ]

    for (const pattern of codePatterns) {
      const matches = content.match(pattern)
      if (matches) {
        complexity += matches.length * 0.5
      }
    }

    return Math.min(complexity, 10)
  }

  private async calculateRelevance(
    extracted: RawContext,
    extractor: ContextLayer,
  ): Promise<number> {
    // Calculate relevance based on content characteristics and extractor type
    let relevance = 0.5 // Base relevance

    // Type-based relevance
    switch (extracted.type) {
      case 'workspace-structure':
        relevance += 0.3
        break
      case 'project-config':
        relevance += 0.4
        break
      case 'file-content':
        relevance += 0.2
        break
      case 'code-symbols':
        relevance += 0.3
        break
      case 'dependencies':
        relevance += 0.2
        break
    }

    // Content quality factors
    if (extracted.content.length > 100) relevance += 0.1
    if (extracted.content.includes('export') || extracted.content.includes('import')) relevance += 0.1

    return Math.min(relevance, 1.0)
  }

  private async calculateFreshness(extracted: RawContext): Promise<number> {
    // For now, assume all extracted content is fresh
    // In a real implementation, this would check modification times
    return 1.0
  }

  private async isContextFresh(context: ExtractedContext): Promise<boolean> {
    // Check if context is still fresh based on timestamp and update frequency
    const now = Date.now()
    const contextAge = now - context.timestamp.getTime()
    const maxAge = 5 * 60 * 1000 // 5 minutes

    return contextAge < maxAge
  }

  private async hasTargetChanged(
    target: ExtractionTarget,
    extractor: ContextLayer,
  ): Promise<boolean> {
    // Check if target has changed since last extraction
    if (!target.path || !existsSync(target.path)) {
      return true // Assume changed if path doesn't exist
    }

    try {
      const stats = statSync(target.path)
      const lastModified = stats.mtime.getTime()
      const lastExtraction = await this.contextStore.getLastExtractionTime(
        extractor.id,
        target.path,
      )

      return lastModified > lastExtraction
    } catch {
      return true // Assume changed if we can't check
    }
  }

  private generateContextId(extractorId: string, extracted: RawContext): string {
    const content = `${extractorId}-${extracted.type}-${extracted.content.substring(0, 100)}`
    return createHash('md5').update(content).digest('hex').substring(0, 16)
  }

  private initializeExtractors(): void {
    // Workspace Structure Extractor
    this.extractors.set('workspace-structure', {
      level: 'workspace',
      extractor: new WorkspaceStructureExtractor(),
      priority: 1,
      updateFrequency: 'on-change',
      dependencies: [],
    })

    // Project Configuration Extractor
    this.extractors.set('project-config', {
      level: 'project',
      extractor: new ProjectConfigExtractor(),
      priority: 2,
      updateFrequency: 'on-change',
      dependencies: ['workspace-structure'],
    })

    // File Content Extractor
    this.extractors.set('file-content', {
      level: 'file',
      extractor: new FileContentExtractor(),
      priority: 3,
      updateFrequency: 'on-change',
      dependencies: ['project-config'],
    })

    // Code Symbols Extractor
    this.extractors.set('code-symbols', {
      level: 'code',
      extractor: new CodeSymbolsExtractor(),
      priority: 4,
      updateFrequency: 'on-change',
      dependencies: ['file-content'],
    })

    // Dependencies Extractor
    this.extractors.set('dependencies', {
      level: 'project',
      extractor: new DependenciesExtractor(),
      priority: 2,
      updateFrequency: 'periodic',
      dependencies: ['project-config'],
    })
  }
}

// Context Store Implementation
class ContextStore {
  private contexts = new Map<string, ExtractedContext>()
  private lastExtractionTimes = new Map<string, number>()

  async store(context: ExtractedContext): Promise<void> {
    this.contexts.set(context.id, context)
    this.lastExtractionTimes.set(context.id, context.timestamp.getTime())
  }

  async getLatest(extractorId: string, target: ExtractionTarget): Promise<ExtractedContext | null> {
    // Find the most recent context for this extractor and target
    for (const context of this.contexts.values()) {
      if (context.layer === extractorId) {
        return context
      }
    }
    return null
  }

  async getLastExtractionTime(extractorId: string, targetPath: string): Promise<number> {
    return this.lastExtractionTimes.get(extractorId) || 0
  }
}

// Dependency Graph Implementation
class DependencyGraph {
  private graph = new Map<string, string[]>()

  addDependency(from: string, to: string): void {
    if (!this.graph.has(from)) {
      this.graph.set(from, [])
    }
    this.graph.get(from)!.push(to)
  }

  getDependencies(node: string): string[] {
    return this.graph.get(node) || []
  }
}

// Update Scheduler Implementation
class UpdateScheduler {
  private schedules = new Map<string, number>()

  scheduleUpdate(extractorId: string, frequency: UpdateFrequency): void {
    const now = Date.now()
    let nextUpdate = now

    switch (frequency) {
      case 'always':
        nextUpdate = now
        break
      case 'on-change':
        nextUpdate = now + 1000 // 1 second
        break
      case 'periodic':
        nextUpdate = now + 5 * 60 * 1000 // 5 minutes
        break
      case 'on-demand':
        nextUpdate = now + 24 * 60 * 60 * 1000 // 24 hours
        break
    }

    this.schedules.set(extractorId, nextUpdate)
  }

  shouldUpdate(extractorId: string): boolean {
    const scheduledTime = this.schedules.get(extractorId) || 0
    return Date.now() >= scheduledTime
  }
}

// Embedding Generator Implementation
class EmbeddingGenerator {
  async generateEmbedding(content: string): Promise<number[]> {
    // Simple TF-IDF-like embedding for now
    // In production, this would use a proper embedding model
    const words = content.toLowerCase().match(/\b\w+\b/g) || []
    const embedding = new Array(128).fill(0)

    // Create frequency map
    const freq = new Map<string, number>()
    words.forEach((word) => {
      freq.set(word, (freq.get(word) || 0) + 1)
    })

    // Map words to embedding dimensions using simple hash
    for (const [word, count] of freq) {
      const hash = this.simpleHash(word) % 128
      embedding[hash] += count
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude
      }
    }

    return embedding
  }

  private simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff
    }
    return Math.abs(hash)
  }
}

// Specific Extractor Implementations
class WorkspaceStructureExtractor implements ContextExtractor {
  id = 'workspace-structure'

  async isApplicable(target: ExtractionTarget): Promise<boolean> {
    return existsSync(target.path) && statSync(target.path).isDirectory()
  }

  async extract(target: ExtractionTarget): Promise<RawContext> {
    const structure = await this.analyzeWorkspaceStructure(target.path)
    return {
      content: JSON.stringify(structure, null, 2),
      type: 'workspace-structure',
      metadata: { path: target.path, type: 'directory' },
    }
  }

  private async analyzeWorkspaceStructure(path: string): Promise<any> {
    const structure: any = { directories: [], files: [] }

    try {
      const items = require('fs').readdirSync(path, { withFileTypes: true })
      
      for (const item of items) {
        if (item.name.startsWith('.')) continue // Skip hidden files
        
        if (item.isDirectory()) {
          structure.directories.push(item.name)
        } else {
          structure.files.push(item.name)
        }
      }
    } catch (error) {
      console.warn(`Could not analyze workspace structure for ${path}:`, error)
    }

    return structure
  }
}

class ProjectConfigExtractor implements ContextExtractor {
  id = 'project-config'

  async isApplicable(target: ExtractionTarget): Promise<boolean> {
    return target.path.endsWith('package.json') || target.path.endsWith('tsconfig.json')
  }

  async extract(target: ExtractionTarget): Promise<RawContext> {
    const content = readFileSync(target.path, 'utf-8')
    const config = JSON.parse(content)
    
    return {
      content: JSON.stringify(config, null, 2),
      type: 'project-config',
      metadata: { path: target.path, configType: this.getConfigType(target.path) },
    }
  }

  private getConfigType(path: string): string {
    if (path.endsWith('package.json')) return 'package'
    if (path.endsWith('tsconfig.json')) return 'typescript'
    return 'unknown'
  }
}

class FileContentExtractor implements ContextExtractor {
  id = 'file-content'

  async isApplicable(target: ExtractionTarget): Promise<boolean> {
    return existsSync(target.path) && statSync(target.path).isFile()
  }

  async extract(target: ExtractionTarget): Promise<RawContext> {
    const content = readFileSync(target.path, 'utf-8')
    
    return {
      content,
      type: 'file-content',
      metadata: { 
        path: target.path, 
        size: content.length,
        language: this.detectLanguage(target.path)
      },
    }
  }

  private detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase()
    const langMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'md': 'markdown',
      'json': 'json',
    }
    return langMap[ext || ''] || 'text'
  }
}

class CodeSymbolsExtractor implements ContextExtractor {
  id = 'code-symbols'

  async isApplicable(target: ExtractionTarget): Promise<boolean> {
    const ext = target.path.split('.').pop()?.toLowerCase()
    return ['ts', 'tsx', 'js', 'jsx'].includes(ext || '')
  }

  async extract(target: ExtractionTarget): Promise<RawContext> {
    const content = readFileSync(target.path, 'utf-8')
    const symbols = this.extractSymbols(content)
    
    return {
      content: JSON.stringify(symbols, null, 2),
      type: 'code-symbols',
      metadata: { path: target.path, symbolCount: symbols.length },
    }
  }

  private extractSymbols(content: string): any[] {
    const symbols: any[] = []

    // Extract functions
    const functions = content.match(/function\s+(\w+)/g)
    if (functions) {
      functions.forEach(fn => {
        symbols.push({
          type: 'function',
          name: fn.replace('function ', ''),
          line: this.findLineNumber(content, fn)
        })
      })
    }

    // Extract classes
    const classes = content.match(/class\s+(\w+)/g)
    if (classes) {
      classes.forEach(cls => {
        symbols.push({
          type: 'class',
          name: cls.replace('class ', ''),
          line: this.findLineNumber(content, cls)
        })
      })
    }

    // Extract exports
    const exports = content.match(/export\s+(?:const|function|class|interface|type)\s+(\w+)/g)
    if (exports) {
      exports.forEach(exp => {
        symbols.push({
          type: 'export',
          name: exp.replace(/export\s+(?:const|function|class|interface|type)\s+/, ''),
          line: this.findLineNumber(content, exp)
        })
      })
    }

    return symbols
  }

  private findLineNumber(content: string, search: string): number {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(search)) {
        return i + 1
      }
    }
    return 0
  }
}

class DependenciesExtractor implements ContextExtractor {
  id = 'dependencies'

  async isApplicable(target: ExtractionTarget): Promise<boolean> {
    return target.path.endsWith('package.json')
  }

  async extract(target: ExtractionTarget): Promise<RawContext> {
    const content = readFileSync(target.path, 'utf-8')
    const pkg = JSON.parse(content)
    
    const dependencies = {
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
      peerDependencies: pkg.peerDependencies || {},
    }
    
    return {
      content: JSON.stringify(dependencies, null, 2),
      type: 'dependencies',
      metadata: { 
        path: target.path,
        dependencyCount: Object.keys(dependencies.dependencies).length,
        devDependencyCount: Object.keys(dependencies.devDependencies).length
      },
    }
  }
}

export const multiLayerContextExtractor = new MultiLayerContextExtractor()
