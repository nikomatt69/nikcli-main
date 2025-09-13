import { createHash } from 'node:crypto'
import * as fsSync from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import chalk from 'chalk'
import { getCloudDocsProvider, type SharedDocEntry } from '../core/cloud-docs-provider'
import { type DocumentationEntry, docLibrary } from '../core/documentation-library'
import { workspaceContext } from './workspace-context'

export interface LoadedDoc {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  source: 'local' | 'shared'
  loadedAt: Date
  summary?: string
  // Enhanced properties
  hash?: string
  relevanceScore?: number
  embedding?: number[]
  lastAccessed?: Date
  accessCount?: number
  autoLoaded?: boolean
  compressionRatio?: number
  preprocessed?: boolean
}

export interface DocsContext {
  loadedDocs: LoadedDoc[]
  totalWords: number
  lastUpdate: Date
  maxContextSize: number
  compressionEnabled: boolean
  // Enhanced properties
  autoLoadingEnabled?: boolean
  semanticSearchEnabled?: boolean
  ragIntegrationEnabled?: boolean
  cacheStats?: {
    hits: number
    misses: number
    lastCleanup: Date
  }
  analytics?: {
    totalLoads: number
    totalSearches: number
    averageRelevance: number
    lastOptimization: Date
  }
}

export interface DocSearchOptions {
  query: string
  limit?: number
  threshold?: number
  categories?: string[]
  sources?: ('local' | 'shared')[]
  useSemanticSearch?: boolean
  autoLoad?: boolean
}

export interface DocRelevanceAnalysis {
  doc: LoadedDoc
  queryRelevance: number
  contextRelevance: number
  combinedScore: number
  reasoningFactors: string[]
}

export class DocsContextManager {
  private loadedDocs: Map<string, LoadedDoc> = new Map()
  private contextFile: string
  private maxContextSize: number = 50000 // Max words in context
  private compressionEnabled: boolean = true

  // Enhanced features
  private autoLoadingEnabled: boolean = true
  private semanticSearchEnabled: boolean = true
  private ragIntegrationEnabled: boolean = true
  private embeddingsCache: Map<string, number[]> = new Map()
  private relevanceCache: Map<string, DocRelevanceAnalysis[]> = new Map()
  private readonly CACHE_TTL = 300000 // 5 minutes
  private readonly MAX_CACHE_SIZE = 500
  private lastCacheCleanup = Date.now()

  // Analytics and monitoring
  private analytics = {
    totalLoads: 0,
    totalSearches: 0,
    totalAutoLoads: 0,
    averageRelevance: 0,
    lastOptimization: new Date(),
    cacheHits: 0,
    cacheMisses: 0,
  }

  constructor(cacheDir: string = './.nikcli') {
    this.contextFile = path.join(cacheDir, 'loaded-docs-context.json')
    // Non chiamare async nel costruttore - caricamento lazy
  }

  /**
   * Inizializza il contesto se non già fatto
   */
  private ensureContextLoaded(): void {
    if (this.loadedDocs.size === 0) {
      this.loadContextSync()
    }
  }

  /**
   * Carica il contesto in modo sincrono per evitare problemi nel costruttore
   */
  private loadContextSync(): void {
    try {
      if (!fsSync.existsSync(this.contextFile)) return

      const data = fsSync.readFileSync(this.contextFile, 'utf-8')
      const context: DocsContext = JSON.parse(data)

      context.loadedDocs.forEach((doc) => {
        this.loadedDocs.set(doc.id, {
          ...doc,
          loadedAt: new Date(doc.loadedAt),
        })
      })

      console.log(chalk.gray(`📚 Restored ${this.loadedDocs.size} documents to context`))
    } catch (error) {
      console.error(chalk.yellow(`⚠️ Could not load docs context: ${error}`))
    }
  }

  /**
   * Enhanced semantic search with auto-loading
   */
  async searchDocsAdvanced(options: DocSearchOptions): Promise<DocRelevanceAnalysis[]> {
    const { query, limit = 10, threshold = 0.3, autoLoad = false } = options
    console.log(chalk.blue(`🔍 Advanced docs search: "${query}"`))

    this.analytics.totalSearches++
    const results: DocRelevanceAnalysis[] = []

    // Search in loaded docs first
    for (const [_id, doc] of this.loadedDocs) {
      const analysis = await this.analyzeDocRelevance(doc, query)
      if (analysis.combinedScore >= threshold) {
        doc.lastAccessed = new Date()
        doc.accessCount = (doc.accessCount || 0) + 1
        results.push(analysis)
      }
    }

    // Search available docs if needed
    if (results.length < limit) {
      const localResults = await docLibrary.search(query.toLowerCase(), undefined, limit)
      for (const result of localResults) {
        const doc = this.convertToLoadedDoc(result.entry, 'local')
        const analysis = await this.analyzeDocRelevance(doc, query)
        if (analysis.combinedScore >= threshold) {
          results.push(analysis)
        }
      }
    }

    return results.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, limit)
  }

  /**
   * Auto-load docs based on workspace context
   */
  async autoLoadRelevantDocs(contextQuery?: string): Promise<LoadedDoc[]> {
    if (!this.autoLoadingEnabled) return []

    console.log(chalk.blue('🤖 Auto-loading relevant documentation...'))

    const workspaceInfo = workspaceContext.getContextForAgent('docs-manager', 5)
    const smartQuery = contextQuery || this.buildSmartQuery(workspaceInfo.projectSummary)

    const searchResults = await this.searchDocsAdvanced({
      query: smartQuery,
      limit: 3,
      threshold: 0.4,
      autoLoad: true,
    })

    const autoLoadedDocs: LoadedDoc[] = []
    for (const result of searchResults) {
      if (!this.loadedDocs.has(result.doc.id)) {
        const loaded = await this.loadSingleDoc(result.doc.id, true)
        if (loaded) autoLoadedDocs.push(loaded)
      }
    }

    if (autoLoadedDocs.length > 0) {
      console.log(chalk.green(`✅ Auto-loaded ${autoLoadedDocs.length} relevant docs`))
    }

    return autoLoadedDocs
  }

  private async analyzeDocRelevance(doc: LoadedDoc, query: string): Promise<DocRelevanceAnalysis> {
    const queryWords = query.toLowerCase().split(/\s+/)
    const docText = (doc.title + ' ' + doc.content + ' ' + doc.tags.join(' ')).toLowerCase()

    let queryRelevance = 0
    const reasoningFactors: string[] = []

    // Text matching
    queryWords.forEach((word) => {
      if (docText.includes(word)) {
        queryRelevance += 0.2
        reasoningFactors.push(`Contains "${word}"`)
      }
    })

    // Title matching (higher weight)
    if (queryWords.some((word) => doc.title.toLowerCase().includes(word))) {
      queryRelevance += 0.4
      reasoningFactors.push('Title match')
    }

    // Context relevance (simplified)
    const contextRelevance = doc.accessCount ? Math.min(doc.accessCount * 0.1, 0.5) : 0.3
    const combinedScore = Math.min(1.0, queryRelevance * 0.7 + contextRelevance * 0.3)

    return {
      doc,
      queryRelevance: Math.min(1.0, queryRelevance),
      contextRelevance,
      combinedScore,
      reasoningFactors,
    }
  }

  private buildSmartQuery(projectSummary: string): string {
    const frameworks = ['react', 'vue', 'angular', 'next'].find((f) => projectSummary.toLowerCase().includes(f))
    const languages = ['typescript', 'javascript', 'python'].find((l) => projectSummary.toLowerCase().includes(l))

    return [frameworks, languages].filter(Boolean).join(' ') || 'getting started'
  }

  private async loadSingleDoc(docId: string, isAutoLoaded: boolean = false): Promise<LoadedDoc | null> {
    const localDoc = await this.findLocalDoc(docId)
    if (localDoc) {
      const loadedDoc = this.convertToLoadedDoc(localDoc, 'local')
      loadedDoc.autoLoaded = isAutoLoaded
      this.loadedDocs.set(loadedDoc.id, loadedDoc)
      this.analytics.totalLoads++
      return loadedDoc
    }
    return null
  }

  /**
   * Carica documenti specifici nel contesto AI (enhanced version)
   */
  async loadDocs(docIdentifiers: string[]): Promise<LoadedDoc[]> {
    this.ensureContextLoaded()
    console.log(chalk.blue(`📚 Loading ${docIdentifiers.length} documents into AI context...`))

    const loadedDocs: LoadedDoc[] = []
    const notFound: string[] = []

    for (const identifier of docIdentifiers) {
      try {
        const localDoc = await this.findLocalDoc(identifier)
        if (localDoc) {
          const loadedDoc = this.convertToLoadedDoc(localDoc, 'local')
          // Enhanced with new properties
          loadedDoc.hash = createHash('md5').update(loadedDoc.content).digest('hex')
          loadedDoc.accessCount = 0
          loadedDoc.autoLoaded = false
          this.loadedDocs.set(loadedDoc.id, loadedDoc)
          loadedDocs.push(loadedDoc)
          continue
        }

        const sharedDoc = await this.findSharedDoc(identifier)
        if (sharedDoc) {
          const loadedDoc = this.convertSharedToLoadedDoc(sharedDoc, 'shared')
          loadedDoc.hash = createHash('md5').update(loadedDoc.content).digest('hex')
          loadedDoc.accessCount = 0
          loadedDoc.autoLoaded = false
          this.loadedDocs.set(loadedDoc.id, loadedDoc)
          loadedDocs.push(loadedDoc)
          continue
        }

        notFound.push(identifier)
      } catch (error) {
        console.error(chalk.red(`❌ Error loading '${identifier}': ${error}`))
        notFound.push(identifier)
      }
    }

    if (loadedDocs.length > 0) {
      await this.optimizeContext()
      await this.saveContext()

      console.log(chalk.green(`✅ Loaded ${loadedDocs.length} documents into context`))
      loadedDocs.forEach((doc) => {
        console.log(chalk.gray(`   • ${doc.title} (${doc.source}, ${doc.content.split(' ').length} words)`))
      })
    }

    if (notFound.length > 0) {
      console.log(chalk.yellow(`⚠️ Not found: ${notFound.join(', ')}`))
    }

    this.analytics.totalLoads += loadedDocs.length
    return loadedDocs
  }

  /**
   * Rimuove documenti dal contesto
   */
  async unloadDocs(docIdentifiers?: string[]): Promise<void> {
    if (!docIdentifiers || docIdentifiers.length === 0) {
      // Rimuovi tutti i documenti
      const count = this.loadedDocs.size
      this.loadedDocs.clear()
      await this.saveContext()
      console.log(chalk.green(`✅ Removed all ${count} documents from context`))
      return
    }

    let removedCount = 0
    for (const identifier of docIdentifiers) {
      // Cerca per ID, titolo o tag
      const docToRemove = Array.from(this.loadedDocs.values()).find(
        (doc) =>
          doc.id === identifier ||
          doc.title.toLowerCase().includes(identifier.toLowerCase()) ||
          doc.tags.some((tag) => tag.toLowerCase().includes(identifier.toLowerCase()))
      )

      if (docToRemove) {
        this.loadedDocs.delete(docToRemove.id)
        removedCount++
        console.log(chalk.gray(`   • Removed: ${docToRemove.title}`))
      }
    }

    if (removedCount > 0) {
      await this.saveContext()
      console.log(chalk.green(`✅ Removed ${removedCount} documents from context`))
    } else {
      console.log(chalk.yellow('⚠️ No matching documents found to remove'))
    }
  }

  /**
   * Ottieni tutti i documenti caricati
   */
  getLoadedDocs(): LoadedDoc[] {
    this.ensureContextLoaded()
    return Array.from(this.loadedDocs.values()).sort((a, b) => b.loadedAt.getTime() - a.loadedAt.getTime())
  }

  /**
   * Ottieni riassunto del contesto per l'AI
   */
  getContextSummary(): string {
    this.ensureContextLoaded()
    if (this.loadedDocs.size === 0) {
      return 'No documentation loaded in context.'
    }

    const docs = this.getLoadedDocs()
    const totalWords = docs.reduce((sum, doc) => sum + doc.content.split(' ').length, 0)

    let summary = `Available documentation context (${docs.length} documents, ~${totalWords.toLocaleString()} words):\n\n`

    docs.forEach((doc, index) => {
      const wordCount = doc.content.split(' ').length
      summary += `${index + 1}. **${doc.title}** (${doc.category})\n`
      summary += `   Source: ${doc.source} | Words: ${wordCount.toLocaleString()} | Tags: ${doc.tags.join(', ')}\n`
      if (doc.summary) {
        summary += `   Summary: ${doc.summary}\n`
      }
      summary += '\n'
    })

    summary += 'Use this documentation to provide accurate, context-aware responses about these topics.'
    return summary
  }

  /**
   * Ottieni contenuto completo per l'AI
   */
  getFullContext(): string {
    if (this.loadedDocs.size === 0) {
      return ''
    }

    const docs = this.getLoadedDocs()
    let context = '# DOCUMENTATION CONTEXT\n\n'

    docs.forEach((doc, index) => {
      context += `## Document ${index + 1}: ${doc.title}\n`
      context += `**Category:** ${doc.category}\n`
      context += `**Tags:** ${doc.tags.join(', ')}\n`
      context += `**Source:** ${doc.source}\n\n`
      context += '**Content:**\n'
      context += doc.content + '\n\n'
      context += '---\n\n'
    })

    return context
  }

  /**
   * Suggerisce documenti basati su una query
   */
  async suggestDocs(query: string, limit: number = 5): Promise<string[]> {
    const suggestions: string[] = []

    // Cerca nei docs locali
    const localResults = await docLibrary.search(query.toLowerCase(), undefined, limit)
    localResults.forEach((result) => {
      suggestions.push(result.entry.title)
    })

    // Cerca nei docs condivisi se disponibile
    const cloudProvider = getCloudDocsProvider()
    if (cloudProvider?.isReady()) {
      try {
        const sharedResults = await cloudProvider.searchShared(query, undefined, limit)
        sharedResults.forEach((doc) => {
          if (!suggestions.includes(doc.title)) {
            suggestions.push(doc.title)
          }
        })
      } catch (_error) {
        // Ignora errori di ricerca cloud
      }
    }

    return suggestions.slice(0, limit)
  }

  /**
   * Enhanced context statistics with analytics
   */
  getContextStats(): {
    loadedCount: number
    totalWords: number
    categories: string[]
    sources: { local: number; shared: number }
    utilizationPercent: number
    // Enhanced analytics
    analytics: {
      totalLoads: number
      totalSearches: number
      totalAutoLoads: number
      averageRelevance: number
      lastOptimization: Date
      cacheHits: number
      cacheMisses: number
    }
    autoLoadedCount: number
    averageAccessCount: number
    cacheStats: {
      embeddingsSize: number
      relevanceSize: number
      hitRate: number
    }
  } {
    this.ensureContextLoaded()
    const docs = this.getLoadedDocs()
    const totalWords = docs.reduce((sum, doc) => sum + doc.content.split(' ').length, 0)
    const categories = [...new Set(docs.map((doc) => doc.category))]
    const sources = {
      local: docs.filter((doc) => doc.source === 'local').length,
      shared: docs.filter((doc) => doc.source === 'shared').length,
    }

    const autoLoadedCount = docs.filter((doc) => doc.autoLoaded).length
    const totalAccess = docs.reduce((sum, doc) => sum + (doc.accessCount || 0), 0)
    const averageAccessCount = docs.length > 0 ? totalAccess / docs.length : 0

    const hitRate =
      this.analytics.cacheHits + this.analytics.cacheMisses > 0
        ? this.analytics.cacheHits / (this.analytics.cacheHits + this.analytics.cacheMisses)
        : 0

    return {
      loadedCount: docs.length,
      totalWords,
      categories,
      sources,
      utilizationPercent: Math.min(100, (totalWords / this.maxContextSize) * 100),
      analytics: this.analytics,
      autoLoadedCount,
      averageAccessCount,
      cacheStats: {
        embeddingsSize: this.embeddingsCache.size,
        relevanceSize: this.relevanceCache.size,
        hitRate,
      },
    }
  }

  /**
   * Get performance analytics
   */
  getAnalytics() {
    return {
      ...this.analytics,
      configuredFeatures: {
        autoLoading: this.autoLoadingEnabled,
        semanticSearch: this.semanticSearchEnabled,
        ragIntegration: this.ragIntegrationEnabled,
        compression: this.compressionEnabled,
      },
      cacheEfficiency: {
        embeddingsCacheSize: this.embeddingsCache.size,
        relevanceCacheSize: this.relevanceCache.size,
        hitRate: this.analytics.cacheHits / Math.max(1, this.analytics.cacheHits + this.analytics.cacheMisses),
        lastCleanup: new Date(this.lastCacheCleanup),
      },
    }
  }

  /**
   * Clear all caches and reset analytics
   */
  clearCaches(): void {
    this.embeddingsCache.clear()
    this.relevanceCache.clear()

    console.log(chalk.green('✅ Docs context caches cleared'))
    console.log(chalk.gray(`   Embeddings: cleared, Relevance: cleared`))
  }

  /**
   * Configure features
   */
  configureFeatures(options: {
    autoLoading?: boolean
    semanticSearch?: boolean
    ragIntegration?: boolean
    compression?: boolean
  }): void {
    if (options.autoLoading !== undefined) this.autoLoadingEnabled = options.autoLoading
    if (options.semanticSearch !== undefined) this.semanticSearchEnabled = options.semanticSearch
    if (options.ragIntegration !== undefined) this.ragIntegrationEnabled = options.ragIntegration
    if (options.compression !== undefined) this.compressionEnabled = options.compression

    console.log(chalk.blue('🔧 Docs context features updated:'))
    console.log(chalk.gray(`   Auto-loading: ${this.autoLoadingEnabled ? 'enabled' : 'disabled'}`))
    console.log(chalk.gray(`   Semantic search: ${this.semanticSearchEnabled ? 'enabled' : 'disabled'}`))
    console.log(chalk.gray(`   RAG integration: ${this.ragIntegrationEnabled ? 'enabled' : 'disabled'}`))
    console.log(chalk.gray(`   Compression: ${this.compressionEnabled ? 'enabled' : 'disabled'}`))
  }

  /**
   * Trova documento locale per identificatore
   */
  private async findLocalDoc(identifier: string): Promise<DocumentationEntry | null> {
    try {
      // Accedi alla mappa privata dei docs
      const allDocs = Array.from((docLibrary as any).docs.values()) as DocumentationEntry[]

      return (
        allDocs.find(
          (doc) =>
            doc.id === identifier ||
            doc.title.toLowerCase().includes(identifier.toLowerCase()) ||
            doc.tags.some((tag) => tag.toLowerCase().includes(identifier.toLowerCase())) ||
            doc.category.toLowerCase() === identifier.toLowerCase()
        ) || null
      )
    } catch (_error) {
      return null
    }
  }

  /**
   * Trova documento condiviso per identificatore
   */
  private async findSharedDoc(identifier: string): Promise<SharedDocEntry | null> {
    const cloudProvider = getCloudDocsProvider()
    if (!cloudProvider?.isReady()) {
      return null
    }

    try {
      const results = await cloudProvider.searchShared(identifier, undefined, 1)
      return results.length > 0 ? results[0] : null
    } catch (_error) {
      return null
    }
  }

  /**
   * Converte DocumentationEntry in LoadedDoc
   */
  private convertToLoadedDoc(doc: DocumentationEntry, source: 'local' | 'shared'): LoadedDoc {
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      category: doc.category,
      tags: doc.tags,
      source,
      loadedAt: new Date(),
      summary: this.generateSummary(doc.content),
    }
  }

  /**
   * Converte SharedDocEntry in LoadedDoc
   */
  private convertSharedToLoadedDoc(doc: SharedDocEntry, source: 'local' | 'shared'): LoadedDoc {
    return {
      id: doc.id,
      title: doc.title,
      content: doc.content,
      category: doc.category,
      tags: doc.tags,
      source,
      loadedAt: new Date(),
      summary: this.generateSummary(doc.content),
    }
  }

  /**
   * Genera riassunto del contenuto
   */
  private generateSummary(content: string): string {
    // Estrai prime 2-3 frasi significative
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20)
    return sentences.slice(0, 2).join('. ').substring(0, 200) + '...'
  }

  /**
   * Ottimizza il contesto se supera i limiti
   */
  private async optimizeContext(): Promise<void> {
    const stats = this.getContextStats()

    if (stats.utilizationPercent > 90) {
      console.log(chalk.yellow('⚠️ Context approaching size limit. Optimizing...'))

      // Rimuovi i documenti più vecchi o meno utilizzati
      const docs = this.getLoadedDocs()
      const toRemove = Math.ceil(docs.length * 0.2) // Rimuovi 20%

      for (let i = docs.length - toRemove; i < docs.length; i++) {
        this.loadedDocs.delete(docs[i].id)
      }

      console.log(chalk.green(`✅ Removed ${toRemove} older documents to optimize context`))
    }

    // Comprimi contenuto se abilitato
    if (this.compressionEnabled && stats.utilizationPercent > 70) {
      this.compressLoadedDocs()
    }
  }

  /**
   * Comprimi i documenti caricati
   */
  private compressLoadedDocs(): void {
    for (const [_id, doc] of this.loadedDocs) {
      if (doc.content.length > 5000) {
        // Mantieni solo le parti più importanti del contenuto
        const paragraphs = doc.content.split('\n\n')
        const important = paragraphs.filter(
          (p) =>
            p.includes('```') || // Code blocks
            p.length < 500 || // Short paragraphs
            p.includes('##') || // Headers
            /\b(important|note|warning|example)\b/i.test(p) // Keywords
        )

        if (important.length < paragraphs.length) {
          doc.content = important.join('\n\n') + '\n\n[Content compressed to fit context limits]'
        }
      }
    }
  }

  /**
   * Carica contesto da file
   */
  private async loadContext(): Promise<void> {
    try {
      const data = await fs.readFile(this.contextFile, 'utf-8')
      const context: DocsContext = JSON.parse(data)

      context.loadedDocs.forEach((doc) => {
        this.loadedDocs.set(doc.id, {
          ...doc,
          loadedAt: new Date(doc.loadedAt),
        })
      })

      console.log(chalk.gray(`📚 Loaded ${this.loadedDocs.size} documents from previous session`))
    } catch (_error) {
      // File non esiste, inizia con contesto vuoto
    }
  }

  /**
   * Salva contesto su file
   */
  private async saveContext(): Promise<void> {
    try {
      const context: DocsContext = {
        loadedDocs: this.getLoadedDocs(),
        totalWords: this.getContextStats().totalWords,
        lastUpdate: new Date(),
        maxContextSize: this.maxContextSize,
        compressionEnabled: this.compressionEnabled,
      }

      await fs.writeFile(this.contextFile, JSON.stringify(context, null, 2))
    } catch (error) {
      console.error('Failed to save docs context:', error)
    }
  }
}

// Singleton instance
export const docsContextManager = new DocsContextManager()
