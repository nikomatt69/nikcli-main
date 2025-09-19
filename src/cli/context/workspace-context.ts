import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import * as path from 'node:path'
import chalk from 'chalk'
import { toolsManager } from '../tools/tools-manager'
// Import new unified components
import { createFileFilter, type FileFilterSystem } from './file-filter-system'
import { unifiedRAGSystem } from './rag-system'
import { type QueryAnalysis, semanticSearchEngine } from './semantic-search-engine'
import { type EmbeddingResult, unifiedEmbeddingInterface } from './unified-embedding-interface'

export interface FileContext {
  path: string
  content: string
  size: number
  modified: Date
  language: string
  importance: number // 0-100
  summary?: string
  dependencies?: string[]
  exports?: string[]
  // Enhanced properties
  hash?: string
  embedding?: number[]
  semanticScore?: number
  lastAnalyzed?: Date
  cacheVersion?: string
  functions?: string[]
  classes?: string[]
  types?: string[]
  tags?: string[]
}

export interface DirectoryContext {
  path: string
  files: FileContext[]
  subdirectories: DirectoryContext[]
  totalFiles: number
  totalSize: number
  mainLanguages: string[]
  framework?: string
  importance: number
  summary?: string
}

export interface WorkspaceContext {
  rootPath: string
  selectedPaths: string[]
  directories: Map<string, DirectoryContext>
  files: Map<string, FileContext>
  projectMetadata: {
    name?: string
    framework?: string
    languages: string[]
    dependencies: string[]
    structure: any
    // Enhanced metadata
    patterns?: string[]
    architecture?: string
    complexity?: number
    testCoverage?: number
  }
  lastUpdated: Date
  // Enhanced properties
  semanticIndex?: Map<string, number[]>
  ragAvailable?: boolean
  cacheStats?: {
    hits: number
    misses: number
    lastCleanup: Date
  }
}

export interface SemanticSearchOptions {
  query: string
  limit?: number
  threshold?: number
  includeContent?: boolean
  fileTypes?: string[]
  excludePaths?: string[]
  useRAG?: boolean
}

export interface ContextSearchResult {
  file: FileContext
  score: number
  matchType: 'exact' | 'semantic' | 'fuzzy' | 'content'
  snippet?: string
  highlights?: string[]
}

export class WorkspaceContextManager {
  private context: WorkspaceContext
  private watchers: Map<string, fs.FSWatcher> = new Map()
  private analysisCache: Map<string, any> = new Map()

  // Enhanced caching and performance
  private fileContentCache: Map<string, { content: string; mtime: number; hash: string }> = new Map()
  private semanticSearchCache: Map<string, ContextSearchResult[]> = new Map()
  private embeddingsCache: Map<string, number[]> = new Map()
  private readonly CACHE_TTL = 300000 // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000
  private lastCacheCleanup = Date.now()

  // Integrated components
  private fileFilter: FileFilterSystem
  private isInitialized = false

  // RAG integration
  private ragAnalysisPromise: Promise<any> | null = null
  private ragInitialized = false

  constructor(rootPath: string = process.cwd()) {
    this.context = {
      rootPath,
      selectedPaths: [rootPath],
      directories: new Map(),
      files: new Map(),
      projectMetadata: {
        languages: [],
        dependencies: [],
        structure: {},
        patterns: [],
        complexity: 0,
      },
      lastUpdated: new Date(),
      semanticIndex: new Map(),
      ragAvailable: false,
      cacheStats: {
        hits: 0,
        misses: 0,
        lastCleanup: new Date(),
      },
    }

    // Initialize integrated components
    this.fileFilter = createFileFilter(rootPath, {
      respectGitignore: true,
      maxFileSize: 1024 * 1024, // 1MB
      maxTotalFiles: 1000,
      includeExtensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.md', '.json', '.yaml', '.yml'],
      excludeExtensions: [],
      excludeDirectories: ['node_modules', 'dist', 'build', '.cache', '.git'],
      excludePatterns: [],
      customRules: [],
    })

    // Initialize RAG integration
    this.initializeRAGIntegration()
    this.initializeIntegratedComponents()
  }

  // Initialize RAG system integration
  private async initializeRAGIntegration(): Promise<void> {
    try {
      console.log(chalk.blue('🧠 Initializing workspace RAG integration...'))
      this.ragAnalysisPromise = unifiedRAGSystem.analyzeProject(this.context.rootPath)
      const ragResult = await this.ragAnalysisPromise

      this.context.ragAvailable = !ragResult.fallbackMode
      this.ragInitialized = true

      console.log(
        chalk.green(`✅ RAG integration ${this.context.ragAvailable ? 'enabled' : 'disabled (fallback mode)'}`)
      )
    } catch (_error) {
      console.log(chalk.yellow('⚠️ RAG integration failed, using basic workspace analysis'))
      this.context.ragAvailable = false
      this.ragInitialized = true
    }
  }

  // Initialize integrated components
  private async initializeIntegratedComponents(): Promise<void> {
    try {
      console.log(chalk.blue('🔧 Initializing integrated file filtering and semantic search...'))

      // File filter is already initialized in constructor

      // Pre-scan workspace to populate file filter context
      await this.refreshWorkspaceIndex()

      this.isInitialized = true
      console.log(chalk.green('✅ Integrated components initialized successfully'))
    } catch (error) {
      console.log(chalk.yellow('⚠️ Failed to initialize integrated components:', error))
      this.isInitialized = false
    }
  }

  // Enhanced semantic search with RAG integration
  async searchSemantic(options: SemanticSearchOptions): Promise<ContextSearchResult[]> {
    const { query, limit = 10, threshold = 0.3, useRAG = true } = options
    const startTime = Date.now()

    // console.log(chalk.blue(`🔍 Semantic search: "${query}"`));

    // Check cache first
    const cacheKey = this.generateCacheKey(options)
    const cached = this.semanticSearchCache.get(cacheKey)
    if (cached) {
      this.context.cacheStats!.hits++
      console.log(chalk.green('✅ Using cached search results'))
      return cached.slice(0, limit)
    }

    // Use semantic search engine for enhanced query analysis
    const queryAnalysis = await semanticSearchEngine.analyzeQuery(query)
    const results: ContextSearchResult[] = []

    // 1. RAG-based search (if available and enabled)
    if (useRAG && this.context.ragAvailable && this.ragInitialized) {
      try {
        const ragResults = await unifiedRAGSystem.search(query, {
          limit: Math.ceil(limit * 0.6),
          semanticOnly: true,
        })

        for (const ragResult of ragResults) {
          const file = this.context.files.get(ragResult.path)
          if (file) {
            results.push({
              file,
              score: ragResult.score,
              matchType: 'semantic',
              snippet: ragResult.content.substring(0, 200) + '...',
              highlights: [query],
            })
          }
        }
      } catch (_error) {
        console.log(chalk.yellow('⚠️ RAG search failed, using local semantic search'))
      }
    }

    // 2. Local semantic search using simple embeddings
    const localResults = await this.performLocalSemanticSearch(query, Math.ceil(limit * 0.4), threshold)
    results.push(...localResults)

    // 3. Deduplicate and rank
    const finalResults = this.deduplicateSearchResults(results, limit)

    // Cache results
    this.cacheSearchResults(cacheKey, finalResults)
    this.context.cacheStats!.misses++

    const _duration = Date.now() - startTime
    // console.log(chalk.green(`✅ Found ${finalResults.length} results in ${duration}ms`));

    return finalResults
  }

  private async performLocalSemanticSearch(
    query: string,
    limit: number,
    threshold: number,
    maxTokens: number = 3000
  ): Promise<ContextSearchResult[]> {
    const results: ContextSearchResult[] = []
    const queryEmbedding = this.createSimpleEmbedding(query)

    for (const [_path, file] of this.context.files) {
      // Get or create embedding for file
      let fileEmbedding = file.embedding
      if (!fileEmbedding) {
        fileEmbedding = this.createSimpleEmbedding(file.content + ' ' + file.summary)
        file.embedding = fileEmbedding
      }

      // Calculate similarity
      const similarity = this.calculateCosineSimilarity(queryEmbedding, fileEmbedding)

      if (similarity >= threshold) {
        // Extract relevant snippet
        const snippet = this.extractRelevantSnippet(file.content, query)

        results.push({
          file,
          score: similarity,
          matchType: 'semantic',
          snippet,
          highlights: this.findHighlights(file.content, query),
        })
      }
    }

    // Sort by score and apply token limiting
    const sortedResults = results.sort((a, b) => b.score - a.score)
    const limitedResults: ContextSearchResult[] = []
    let totalTokens = 0

    for (const result of sortedResults) {
      if (limitedResults.length >= limit) break

      const tokens = this.estimateTokens(result.snippet || result.file.content)
      if (totalTokens + tokens > maxTokens) break

      limitedResults.push(result)
      totalTokens += tokens
    }

    return limitedResults
  }

  private createSimpleEmbedding(text: string): number[] {
    // Simple TF-IDF-like embedding for local semantic similarity
    const words = text.toLowerCase().match(/\b\w+\b/g) || []
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

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
    return magnitude > 0 ? dotProduct / magnitude : 0
  }

  private simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff
    }
    return Math.abs(hash)
  }

  private extractRelevantSnippet(content: string, query: string): string {
    const lines = content.split('\n')
    const queryWords = query.toLowerCase().split(/\s+/)

    // Find lines that contain query words
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase()
      if (queryWords.some((word) => line.includes(word))) {
        // Return snippet with context
        const start = Math.max(0, i - 2)
        const end = Math.min(lines.length, i + 3)
        return lines.slice(start, end).join('\n')
      }
    }

    // Fallback to first 3 lines
    return lines.slice(0, 3).join('\n')
  }

  private findHighlights(content: string, query: string): string[] {
    const queryWords = query.toLowerCase().split(/\s+/)
    const highlights: string[] = []

    queryWords.forEach((word) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi')
      const matches = content.match(regex)
      if (matches) {
        highlights.push(...matches)
      }
    })

    return Array.from(new Set(highlights))
  }

  private deduplicateSearchResults(results: ContextSearchResult[], limit: number): ContextSearchResult[] {
    const pathMap = new Map<string, ContextSearchResult>()

    for (const result of results) {
      const existing = pathMap.get(result.file.path)
      if (!existing || result.score > existing.score) {
        pathMap.set(result.file.path, result)
      }
    }

    return Array.from(pathMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  // Enhanced caching methods
  private generateCacheKey(options: SemanticSearchOptions): string {
    const key = JSON.stringify({
      query: options.query,
      limit: options.limit,
      threshold: options.threshold,
      fileTypes: options.fileTypes,
      excludePaths: options.excludePaths,
    })
    return createHash('md5').update(key).digest('hex')
  }

  private cacheSearchResults(key: string, results: ContextSearchResult[]): void {
    if (this.semanticSearchCache.size >= this.MAX_CACHE_SIZE) {
      this.cleanupCache()
    }
    this.semanticSearchCache.set(key, results)
  }

  private cleanupCache(): void {
    const now = Date.now()
    if (now - this.lastCacheCleanup > this.CACHE_TTL) {
      // Remove old entries
      const keysToDelete: string[] = []

      for (const key of this.semanticSearchCache.keys()) {
        if (keysToDelete.length < this.MAX_CACHE_SIZE * 0.3) {
          keysToDelete.push(key)
        }
      }

      keysToDelete.forEach((key) => this.semanticSearchCache.delete(key))

      this.lastCacheCleanup = now
      this.context.cacheStats!.lastCleanup = new Date()

      console.log(chalk.yellow(`🧹 Cleaned ${keysToDelete.length} cache entries`))
    }
  }

  // Select specific directories/files for focused context
  async selectPaths(paths: string[]): Promise<void> {
    console.log(chalk.blue(`🎯 Selecting workspace context: ${paths.join(', ')}`))

    this.context.selectedPaths = paths.map((p) => path.resolve(this.context.rootPath, p))

    // Analyze selected paths
    await this.analyzeSelectedPaths()

    console.log(chalk.green(`✅ Workspace context updated with ${this.context.files.size} files`))
  }

  private async analyzeSelectedPaths(): Promise<void> {
    this.context.files.clear()
    this.context.directories.clear()

    for (const selectedPath of this.context.selectedPaths) {
      if (fs.existsSync(selectedPath)) {
        const stat = fs.statSync(selectedPath)

        if (stat.isDirectory()) {
          await this.analyzeDirectory(selectedPath)
        } else if (stat.isFile()) {
          await this.analyzeFile(selectedPath)
        }
      }
    }

    // Update project metadata
    await this.updateProjectMetadata()
    this.context.lastUpdated = new Date()
  }

  private async analyzeDirectory(dirPath: string): Promise<DirectoryContext> {
    const relativePath = path.relative(this.context.rootPath, dirPath)

    // Skip node_modules and other irrelevant directories
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage']
    if (skipDirs.some((skip) => relativePath.includes(skip))) {
      return {
        path: relativePath,
        files: [],
        subdirectories: [],
        totalFiles: 0,
        totalSize: 0,
        mainLanguages: [],
        importance: 0,
        summary: 'Skipped directory',
      }
    }

    console.log(chalk.cyan(`📁 Analyzing directory: ${relativePath}`))

    const files: FileContext[] = []
    const subdirectories: DirectoryContext[] = []
    const items = fs.readdirSync(dirPath)

    for (const item of items) {
      const itemPath = path.join(dirPath, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory()) {
        const subDir = await this.analyzeDirectory(itemPath)
        subdirectories.push(subDir)
      } else if (stat.isFile()) {
        const file = await this.analyzeFile(itemPath)
        if (file) {
          files.push(file)
        }
      }
    }

    // Calculate directory importance and metadata
    const totalFiles = files.length + subdirectories.reduce((sum, d) => sum + d.totalFiles, 0)
    const totalSize =
      files.reduce((sum, f) => sum + f.size, 0) + subdirectories.reduce((sum, d) => sum + d.totalSize, 0)

    const languages = Array.from(
      new Set([...files.map((f) => f.language).filter(Boolean), ...subdirectories.flatMap((d) => d.mainLanguages)])
    )

    const importance = this.calculateDirectoryImportance(relativePath, totalFiles, languages)

    const dirContext: DirectoryContext = {
      path: relativePath,
      files,
      subdirectories,
      totalFiles,
      totalSize,
      mainLanguages: languages,
      importance,
      summary: await this.generateDirectorySummary(relativePath, files, subdirectories),
    }

    this.context.directories.set(relativePath, dirContext)
    return dirContext
  }

  private async analyzeFile(filePath: string): Promise<FileContext | null> {
    // Use the enhanced version with caching
    return this.analyzeFileEnhanced(filePath)
  }

  private detectLanguage(extension: string, content: string): string {
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      html: 'html',
      css: 'css',
      scss: 'scss',
      json: 'json',
      md: 'markdown',
      yml: 'yaml',
      yaml: 'yaml',
    }

    const detected = langMap[extension.toLowerCase()]
    if (detected) return detected

    // Try to detect from content
    if (content.includes('import React') || content.includes('from react')) return 'typescript'
    if (content.includes('#!/usr/bin/env python')) return 'python'
    if (content.includes('#!/bin/bash')) return 'bash'

    return 'text'
  }

  private calculateFileImportance(filePath: string, extension: string, content: string): number {
    let importance = 50 // Base importance

    // Higher importance for certain files
    const importantFiles = ['package.json', 'tsconfig.json', 'README.md', 'index.ts', 'index.js', 'app.ts']
    if (importantFiles.some((f) => filePath.endsWith(f))) {
      importance += 30
    }

    // Higher importance for main source directories
    if (filePath.includes('src/') || filePath.includes('components/')) {
      importance += 20
    }

    // Higher importance based on file size (but not too large)
    const sizeScore = Math.min(content.length / 100, 20)
    importance += sizeScore

    // Higher importance for files with exports
    const exportCount = (content.match(/export\s+/g) || []).length
    importance += Math.min(exportCount * 5, 25)

    return Math.min(importance, 100)
  }

  private calculateDirectoryImportance(path: string, fileCount: number, languages: string[]): number {
    let importance = 30 // Base importance

    // Higher importance for source directories
    const importantDirs = ['src', 'components', 'pages', 'app', 'lib', 'utils', 'api']
    if (importantDirs.some((dir) => path.includes(dir))) {
      importance += 40
    }

    // Higher importance based on file count
    importance += Math.min(fileCount * 2, 30)

    // Higher importance for TypeScript/JavaScript heavy directories
    const jstsCount = languages.filter((l) => ['javascript', 'typescript'].includes(l)).length
    if (jstsCount > 0) {
      importance += 20
    }

    return Math.min(importance, 100)
  }

  private extractDependencies(content: string, language: string): string[] {
    const dependencies: string[] = []

    if (language === 'typescript' || language === 'javascript') {
      // Extract import statements
      const importMatches = content.match(/import .+ from ['"]([^'"]+)['"]/g)
      if (importMatches) {
        importMatches.forEach((match) => {
          const dep = match.match(/from ['"]([^'"]+)['"]/)?.[1]
          if (dep && !dep.startsWith('.')) {
            dependencies.push(dep)
          }
        })
      }

      // Extract require statements
      const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g)
      if (requireMatches) {
        requireMatches.forEach((match) => {
          const dep = match.match(/require\(['"]([^'"]+)['"]\)/)?.[1]
          if (dep && !dep.startsWith('.')) {
            dependencies.push(dep)
          }
        })
      }
    }

    return Array.from(new Set(dependencies))
  }

  private extractExports(content: string, language: string): string[] {
    const exports: string[] = []

    if (language === 'typescript' || language === 'javascript') {
      // Extract export statements
      const exportMatches = content.match(/export\s+(const|function|class|interface|type)\s+(\w+)/g)
      if (exportMatches) {
        exportMatches.forEach((match) => {
          const exportName = match.match(/export\s+(?:const|function|class|interface|type)\s+(\w+)/)?.[1]
          if (exportName) {
            exports.push(exportName)
          }
        })
      }

      // Extract default exports
      const defaultExportMatch = content.match(/export\s+default\s+(\w+)/)
      if (defaultExportMatch) {
        exports.push(`default:${defaultExportMatch[1]}`)
      }
    }

    return exports
  }

  private async generateFileSummary(filePath: string, content: string, language: string): Promise<string> {
    // Simple rule-based summary generation
    const lines = content.split('\n').length

    if (filePath.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(content)
        return `Package: ${pkg.name} v${pkg.version}`
      } catch {
        return 'Package configuration file'
      }
    }

    if (language === 'typescript' || language === 'javascript') {
      const functions = (content.match(/function\s+\w+/g) || []).length
      const classes = (content.match(/class\s+\w+/g) || []).length
      const components = (content.match(/const\s+\w+.*=.*\(.*\)\s*=>/g) || []).length

      return `${language} file with ${functions} functions, ${classes} classes, ${components} components (${lines} lines)`
    }

    return `${language} file (${lines} lines)`
  }

  private async generateDirectorySummary(
    dirPath: string,
    files: FileContext[],
    subdirs: DirectoryContext[]
  ): Promise<string> {
    const totalFiles = files.length
    const languages = Array.from(new Set(files.map((f) => f.language)))

    if (dirPath.includes('components')) {
      return `React components directory with ${totalFiles} files (${languages.join(', ')})`
    }

    if (dirPath.includes('pages') || dirPath.includes('app')) {
      return `Application pages/routes with ${totalFiles} files`
    }

    return `Directory with ${totalFiles} files in ${languages.join(', ')}`
  }

  private async updateProjectMetadata(): Promise<void> {
    // Analyze project structure
    const projectAnalysis = await toolsManager.analyzeProject()

    this.context.projectMetadata = {
      name: projectAnalysis.packageInfo?.name,
      framework: projectAnalysis.framework,
      languages: projectAnalysis.technologies,
      dependencies: Object.keys(projectAnalysis.packageInfo?.dependencies || {}),
      structure: projectAnalysis.structure,
    }
  }

  // Get context for AI agents with automatic grep filtering
  getContextForAgent(
    agentId: string,
    maxFiles: number = 20,
    searchQuery?: string
  ): {
    selectedPaths: string[]
    relevantFiles: FileContext[]
    projectSummary: string
    totalContext: string
  } {
    // Auto-apply grep filtering if we have too many files or if a search query is provided
    if (searchQuery || this.context.files.size > 50) {
      return this.getFilteredContextForAgent(agentId, maxFiles, searchQuery)
    }
    // Get most important files within selected paths
    const relevantFiles = Array.from(this.context.files.values())
      .filter((file) =>
        this.context.selectedPaths.some((path) => file.path.startsWith(path.replace(this.context.rootPath, '')))
      )
      .sort((a, b) => b.importance - a.importance)
      .slice(0, maxFiles)

    const projectSummary = this.generateProjectSummary()

    // Generate total context string
    const totalContext = this.generateContextString(relevantFiles, projectSummary)

    return {
      selectedPaths: this.context.selectedPaths,
      relevantFiles,
      projectSummary,
      totalContext,
    }
  }

  // Get filtered context using grep-like search
  private getFilteredContextForAgent(
    agentId: string,
    maxFiles: number = 20,
    searchQuery?: string
  ): {
    selectedPaths: string[]
    relevantFiles: FileContext[]
    projectSummary: string
    totalContext: string
  } {
    console.log(
      chalk.yellow(`🔍 Auto-filtering context${searchQuery ? ` for query: "${searchQuery}"` : ' (large workspace)'}...`)
    )

    let relevantFiles: FileContext[]

    if (searchQuery) {
      // Use search query to filter files
      relevantFiles = this.searchFilesWithQuery(searchQuery, maxFiles)
    } else {
      // Just get the most important files when no search query
      relevantFiles = Array.from(this.context.files.values())
        .sort((a, b) => b.importance - a.importance)
        .slice(0, maxFiles)
    }

    const projectSummary = this.generateProjectSummary()
    const totalContext = this.generateContextString(relevantFiles, projectSummary)

    console.log(chalk.green(`✅ Context filtered to ${relevantFiles.length} relevant files`))

    return {
      selectedPaths: this.context.selectedPaths,
      relevantFiles,
      projectSummary,
      totalContext,
    }
  }

  // Search files using grep-like functionality
  private searchFilesWithQuery(query: string, maxFiles: number): FileContext[] {
    const searchResults: { file: FileContext; score: number }[] = []

    // Search in file content and paths
    for (const file of this.context.files.values()) {
      let score = 0

      // Score based on query matches in file path
      const pathMatches = (file.path.toLowerCase().match(new RegExp(query.toLowerCase(), 'g')) || []).length
      score += pathMatches * 20

      // Score based on query matches in content
      const contentMatches = (file.content.toLowerCase().match(new RegExp(query.toLowerCase(), 'g')) || []).length
      score += contentMatches * 10

      // Score based on query matches in summary
      if (file.summary) {
        const summaryMatches = (file.summary.toLowerCase().match(new RegExp(query.toLowerCase(), 'g')) || []).length
        score += summaryMatches * 15
      }

      // Score based on query matches in exports
      if (file.exports) {
        const exportMatches = file.exports.filter((exp) => exp.toLowerCase().includes(query.toLowerCase())).length
        score += exportMatches * 25
      }

      // Add base importance score
      score += file.importance

      if (score > 0) {
        searchResults.push({ file, score })
      }
    }

    // Sort by relevance score and return top results
    return searchResults
      .sort((a, b) => b.score - a.score)
      .slice(0, maxFiles)
      .map((result) => result.file)
  }

  private generateProjectSummary(): string {
    const metadata = this.context.projectMetadata
    const fileCount = this.context.files.size
    const dirCount = this.context.directories.size

    return `Project: ${metadata.name || 'Unnamed'} (${metadata.framework || 'Unknown framework'})
Files: ${fileCount} files in ${dirCount} directories
Languages: ${metadata.languages.join(', ')}
Dependencies: ${metadata.dependencies.slice(0, 10).join(', ')}${metadata.dependencies.length > 10 ? '...' : ''}
Selected Paths: ${this.context.selectedPaths.join(', ')}`
  }

  private generateContextString(files: FileContext[], projectSummary: string): string {
    let context = `=== WORKSPACE CONTEXT ===\n${projectSummary}\n\n`

    context += `=== SELECTED FILES (${files.length}) ===\n`

    // Calculate if we need to truncate content due to size
    const totalSize = files.reduce((sum, file) => sum + file.content.length, 0)
    const maxContextSize = 50000 // ~50KB limit for context
    const shouldTruncate = totalSize > maxContextSize
    const truncateSize = shouldTruncate ? Math.floor(maxContextSize / files.length) : 4000

    if (shouldTruncate) {
      context += `\n⚠️ Large workspace detected - content truncated to ${truncateSize} chars per file\n`
    }

    files.forEach((file) => {
      context += `\n--- ${file.path} (${file.language}, ${file.size} bytes, importance: ${file.importance}) ---\n`
      context += `Summary: ${file.summary}\n`
      if (file.exports && file.exports.length > 0) {
        context += `Exports: ${file.exports.join(', ')}\n`
      }
      if (file.dependencies && file.dependencies.length > 0) {
        context += `Dependencies: ${file.dependencies.join(', ')}\n`
      }

      // Smart content truncation
      const contentPreview =
        file.content.length > truncateSize
          ? file.content.slice(0, truncateSize) + '\n... [truncated - use /search to find specific content]'
          : file.content
      context += `Content:\n${contentPreview}\n`
    })

    return context
  }

  // Refresh workspace index with file filtering
  async refreshWorkspaceIndex(): Promise<void> {
    if (!this.isInitialized || !this.fileFilter) {
      console.log(chalk.yellow('⚠️ File filter not initialized, skipping workspace refresh'))
      return
    }

    console.log(chalk.blue('🔄 Refreshing workspace index with smart filtering...'))

    try {
      // Get filtered file list by scanning directory
      const filteredFiles = await this.scanDirectoryWithFilter(this.context.rootPath)

      console.log(chalk.green(`✅ Found ${filteredFiles.length} files after filtering`))

      // Update file context with filtered results
      for (const filePath of filteredFiles) {
        if (!this.context.files.has(filePath)) {
          try {
            const stats = fs.statSync(filePath)
            const content = fs.readFileSync(filePath, 'utf-8')
            const language = this.getLanguageFromPath(filePath)

            const fileContext: FileContext = {
              path: filePath,
              content,
              size: stats.size,
              modified: stats.mtime,
              language,
              importance: this.calculateFileImportance(filePath, content, language),
              summary: await this.generateFileSummary(filePath, content, language),
              dependencies: this.extractDependencies(content, language),
              exports: this.extractExports(content, language),
              hash: createHash('md5').update(content).digest('hex'),
              lastAnalyzed: new Date(),
            }

            this.context.files.set(filePath, fileContext)
          } catch (error) {
            console.log(chalk.yellow(`⚠️ Error processing file ${filePath}:`, error))
          }
        }
      }

      // Remove files that are no longer valid
      const existingPaths = Array.from(this.context.files.keys())
      for (const filePath of existingPaths) {
        if (!filteredFiles.includes(filePath)) {
          this.context.files.delete(filePath)
        }
      }

      this.context.lastUpdated = new Date()
    } catch (error) {
      console.log(chalk.red('❌ Error refreshing workspace index:', error))
    }
  }

  // Enhanced file analysis with semantic integration
  async analyzeFileWithSemantics(filePath: string): Promise<FileContext | null> {
    if (!this.fileFilter || !this.fileFilter.shouldIncludeFile(filePath, this.context.rootPath)) {
      return null
    }

    try {
      const stats = fs.statSync(filePath)
      const content = fs.readFileSync(filePath, 'utf-8')
      const language = this.getLanguageFromPath(filePath)

      // Generate semantic embedding using unified interface
      let embedding: number[] | undefined
      try {
        const embeddingResult = await unifiedEmbeddingInterface.generateEmbedding(content)
        embedding = embeddingResult.vector
      } catch {
        // Fallback to simple embedding
        embedding = this.createSimpleEmbedding(content)
      }

      const fileContext: FileContext = {
        path: filePath,
        content,
        size: stats.size,
        modified: stats.mtime,
        language,
        importance: this.calculateFileImportance(filePath, content, language),
        summary: await this.generateFileSummary(filePath, content, language),
        dependencies: this.extractDependencies(content, language),
        exports: this.extractExports(content, language),
        hash: createHash('md5').update(content).digest('hex'),
        embedding,
        lastAnalyzed: new Date(),
        functions: this.extractFunctions(content, language),
        classes: this.extractClasses(content, language),
        types: this.extractTypes(content, language),
      }

      return fileContext
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Error analyzing file ${filePath}:`, error))
      return null
    }
  }

  // Helper method to scan directory with file filter
  private async scanDirectoryWithFilter(dirPath: string): Promise<string[]> {
    const filteredFiles: string[] = []

    const scanDir = async (currentPath: string): Promise<void> => {
      try {
        const entries = await fsPromises.readdir(currentPath, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name)

          if (entry.isDirectory()) {
            // Recursively scan subdirectories
            await scanDir(fullPath)
          } else if (entry.isFile()) {
            // Check if file should be included
            const result = this.fileFilter.shouldIncludeFile(fullPath, this.context.rootPath)
            if (result.allowed) {
              filteredFiles.push(fullPath)
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    }

    await scanDir(dirPath)
    return filteredFiles
  }

  // Helper method to get language from file path
  private getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.md': 'markdown',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.php': 'php',
      '.rb': 'ruby',
    }
    return langMap[ext] || 'text'
  }

  // Watch for file changes in selected paths
  startWatching(): void {
    this.stopWatching() // Clear existing watchers

    this.context.selectedPaths.forEach((selectedPath) => {
      if (fs.existsSync(selectedPath)) {
        const watcher = fs.watch(selectedPath, { recursive: true }, (eventType, filename) => {
          if (filename) {
            console.log(chalk.yellow(`📁 File changed: ${filename} (${eventType})`))
            // Debounced re-analysis
            setTimeout(() => this.analyzeSelectedPaths(), 1000)
          }
        })

        this.watchers.set(selectedPath, watcher)
      }
    })

    console.log(chalk.green(`👀 Watching ${this.context.selectedPaths.length} paths for changes`))
  }

  stopWatching(): void {
    this.watchers.forEach((watcher) => watcher.close())
    this.watchers.clear()
  }

  // Enhanced context extraction using semantic search
  async extractRelevantContext(query: string): Promise<string> {
    // console.log(chalk.blue(`🔍 Extracting context for: "${query}"`));

    // Use enhanced semantic search
    const searchResults = await this.searchSemantic({
      query,
      limit: 10,
      threshold: 0.2,
      includeContent: true,
      useRAG: true,
    })

    if (searchResults.length === 0) {
      return `No relevant files found for query: "${query}"`
    }

    let context = `=== ENHANCED CONTEXT FOR: "${query}" ===\n`
    context += `Found ${searchResults.length} relevant files using ${this.context.ragAvailable ? 'RAG + local' : 'local'} search\n\n`

    searchResults.forEach((result, index) => {
      const { file, score, matchType, snippet, highlights } = result

      context += `\n--- ${index + 1}. ${file.path} (${matchType}, score: ${(score * 100).toFixed(1)}%) ---\n`
      context += `Language: ${file.language}, Importance: ${file.importance}\n`
      context += `Summary: ${file.summary}\n`

      if (highlights && highlights.length > 0) {
        context += `Highlights: ${highlights.slice(0, 5).join(', ')}\n`
      }

      if (file.exports && file.exports.length > 0) {
        context += `Exports: ${file.exports.slice(0, 3).join(', ')}\n`
      }

      // Use snippet if available, otherwise extract relevant parts
      if (snippet) {
        context += `Relevant snippet:\n${snippet}\n`
      } else {
        const extractedSnippets = this.extractRelevantSnippets(file.content, query)
        if (extractedSnippets.length > 0) {
          context += `Code snippets:\n${extractedSnippets.slice(0, 2).join('\n...\n')}\n`
        } else {
          context += `Content preview:\n${file.content.slice(0, 300)}...\n`
        }
      }
    })

    // Add search statistics
    context += `\n=== SEARCH STATISTICS ===\n`
    context += `Cache hits: ${this.context.cacheStats!.hits}, Cache misses: ${this.context.cacheStats!.misses}\n`
    context += `RAG available: ${this.context.ragAvailable ? 'Yes' : 'No'}\n`
    context += `Total indexed files: ${this.context.files.size}\n`

    return context
  }

  // Performance monitoring and statistics
  getPerformanceStats() {
    return {
      totalFiles: this.context.files.size,
      totalDirectories: this.context.directories.size,
      cacheStats: this.context.cacheStats,
      ragAvailable: this.context.ragAvailable,
      ragInitialized: this.ragInitialized,
      cacheSize: {
        semanticSearch: this.semanticSearchCache.size,
        fileContent: this.fileContentCache.size,
        embeddings: this.embeddingsCache.size,
        analysis: this.analysisCache.size,
      },
      lastUpdated: this.context.lastUpdated,
    }
  }

  // Clear all caches
  clearAllCaches(): void {
    this.semanticSearchCache.clear()
    this.fileContentCache.clear()
    this.embeddingsCache.clear()
    this.analysisCache.clear()

    // Reset cache stats
    this.context.cacheStats = {
      hits: 0,
      misses: 0,
      lastCleanup: new Date(),
    }

    console.log(chalk.green('✅ All workspace caches cleared'))
  }

  // Smart file analysis with caching
  private async analyzeFileEnhanced(filePath: string): Promise<FileContext | null> {
    try {
      const relativePath = path.relative(this.context.rootPath, filePath)
      const stat = fs.statSync(filePath)
      const mtime = stat.mtime.getTime()

      // Check content cache
      const cached = this.fileContentCache.get(relativePath)
      let content: string
      let hash: string

      if (cached && cached.mtime === mtime) {
        content = cached.content
        hash = cached.hash
        this.context.cacheStats!.hits++
      } else {
        content = fs.readFileSync(filePath, 'utf8')
        hash = createHash('md5').update(content).digest('hex')

        // Cache content
        this.fileContentCache.set(relativePath, { content, mtime, hash })
        this.context.cacheStats!.misses++
      }

      const extension = path.extname(filePath).slice(1)

      // Skip binary files and irrelevant files
      const skipExtensions = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'zip', 'tar', 'gz']
      if (skipExtensions.includes(extension.toLowerCase())) {
        return null
      }

      const language = this.detectLanguage(extension, content)
      const importance = this.calculateFileImportance(relativePath, extension, content)

      const fileContext: FileContext = {
        path: relativePath,
        content,
        size: stat.size,
        modified: stat.mtime,
        language,
        importance,
        hash,
        lastAnalyzed: new Date(),
        cacheVersion: '1.0',
        summary: await this.generateFileSummary(relativePath, content, language),
        dependencies: this.extractDependencies(content, language),
        exports: this.extractExports(content, language),
        functions: this.extractFunctions(content, language),
        classes: this.extractClasses(content, language),
        types: this.extractTypes(content, language),
        tags: this.generateTags(content, language, relativePath),
      }

      this.context.files.set(relativePath, fileContext)
      return fileContext
    } catch (_error) {
      console.log(chalk.yellow(`⚠️ Could not analyze file: ${filePath}`))
      return null
    }
  }

  private extractFunctions(content: string, language: string): string[] {
    const functions: string[] = []

    if (language === 'typescript' || language === 'javascript') {
      // Function declarations
      const funcDeclarations = content.match(/function\s+(\w+)/g)
      if (funcDeclarations) {
        functions.push(...funcDeclarations.map((f) => f.replace('function ', '')))
      }

      // Arrow functions
      const arrowFunctions = content.match(/const\s+(\w+)\s*=.*=>/g)
      if (arrowFunctions) {
        arrowFunctions.forEach((match) => {
          const name = match.match(/const\s+(\w+)/)?.[1]
          if (name) functions.push(name)
        })
      }

      // Method definitions
      const methods = content.match(/(\w+)\s*\([^)]*\)\s*[:{]/g)
      if (methods) {
        methods.forEach((match) => {
          const name = match.match(/(\w+)\s*\(/)?.[1]
          if (name && !['if', 'for', 'while', 'switch'].includes(name)) {
            functions.push(name)
          }
        })
      }
    }

    return Array.from(new Set(functions))
  }

  private extractClasses(content: string, language: string): string[] {
    const classes: string[] = []

    if (language === 'typescript' || language === 'javascript') {
      const classMatches = content.match(/class\s+(\w+)/g)
      if (classMatches) {
        classes.push(...classMatches.map((c) => c.replace('class ', '')))
      }
    }

    return classes
  }

  private extractTypes(content: string, language: string): string[] {
    const types: string[] = []

    if (language === 'typescript') {
      // Interface declarations
      const interfaces = content.match(/interface\s+(\w+)/g)
      if (interfaces) {
        types.push(...interfaces.map((i) => i.replace('interface ', '')))
      }

      // Type declarations
      const typeDecls = content.match(/type\s+(\w+)/g)
      if (typeDecls) {
        types.push(...typeDecls.map((t) => t.replace('type ', '')))
      }

      // Enum declarations
      const enums = content.match(/enum\s+(\w+)/g)
      if (enums) {
        types.push(...enums.map((e) => e.replace('enum ', '')))
      }
    }

    return types
  }

  private generateTags(content: string, language: string, filePath: string): string[] {
    const tags: string[] = []

    // Path-based tags
    if (filePath.includes('test') || filePath.includes('spec')) tags.push('test')
    if (filePath.includes('component')) tags.push('component')
    if (filePath.includes('api')) tags.push('api')
    if (filePath.includes('util')) tags.push('utility')
    if (filePath.includes('config')) tags.push('configuration')
    if (filePath.includes('type')) tags.push('types')

    // Content-based tags
    if (content.includes('React') || content.includes('jsx')) tags.push('react')
    if (content.includes('useState') || content.includes('useEffect')) tags.push('hooks')
    if (content.includes('async') || content.includes('await')) tags.push('async')
    if (content.includes('express') || content.includes('fastify')) tags.push('server')
    if (content.includes('database') || content.includes('sql')) tags.push('database')
    if (content.includes('auth') || content.includes('login')) tags.push('authentication')

    return Array.from(new Set(tags))
  }

  // Extract relevant code snippets around query matches
  private extractRelevantSnippets(content: string, query: string): string[] {
    const lines = content.split('\n')
    const queryLower = query.toLowerCase()
    const snippets: string[] = []
    const contextLines = 3 // Lines of context around matches

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        const start = Math.max(0, i - contextLines)
        const end = Math.min(lines.length, i + contextLines + 1)

        const snippet = lines
          .slice(start, end)
          .map((line, index) => {
            const lineNum = start + index + 1
            const marker = start + index === i ? '>>> ' : '    '
            return `${marker}${lineNum}: ${line}`
          })
          .join('\n')

        snippets.push(snippet)
      }
    }

    return snippets.slice(0, 5) // Limit to 5 snippets per file
  }

  // Display context summary
  showContextSummary(): void {
    console.log(chalk.blue.bold('\n🌍 Workspace Context Summary'))
    console.log(chalk.gray('═'.repeat(50)))

    console.log(`📁 Root Path: ${this.context.rootPath}`)
    console.log(`🎯 Selected Paths: ${this.context.selectedPaths.length}`)
    this.context.selectedPaths.forEach((p) => {
      console.log(`  • ${p}`)
    })

    console.log(`📄 Files: ${this.context.files.size}`)
    console.log(`📁 Directories: ${this.context.directories.size}`)
    console.log(`🔧 Framework: ${this.context.projectMetadata.framework || 'Unknown'}`)
    console.log(`💻 Languages: ${this.context.projectMetadata.languages.join(', ')}`)
    console.log(`📦 Dependencies: ${this.context.projectMetadata.dependencies.length}`)
    console.log(`🕐 Last Updated: ${this.context.lastUpdated.toLocaleTimeString()}`)

    // Show most important files
    const topFiles = Array.from(this.context.files.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5)

    if (topFiles.length > 0) {
      console.log(chalk.blue.bold('\n📋 Most Important Files:'))
      topFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.path} (${file.language}, importance: ${file.importance})`)
        console.log(`     ${chalk.gray(file.summary)}`)
      })
    }
  }

  /**
   * Estimate token count for a string (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4)
  }
}

export const workspaceContext = new WorkspaceContextManager()
