import { exec } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { promisify } from 'node:util'
import chalk from 'chalk'
import { documentationDatabase } from './documentation-database'

const execAsync = promisify(exec)

export interface DocumentationEntry {
  id: string
  url: string
  title: string
  content: string
  category: string
  tags: string[]
  timestamp: Date
  lastAccessed: Date
  accessCount: number
  relevance: number // 0-1 score
  metadata: {
    wordCount: number
    language: string
    source: string
    extractedAt: Date
  }
}

export interface SearchResult {
  entry: DocumentationEntry
  score: number
  matchedTerms: string[]
  snippet: string
}

export class DocumentationLibrary {
  private docs: Map<string, DocumentationEntry> = new Map()
  private docsFile: string
  private searchIndex: Map<string, string[]> = new Map() // term -> entry IDs
  private categories: Set<string> = new Set()
  private maxDocs: number = 1000

  constructor(docsDir: string = './.nikcli') {
    this.docsFile = path.join(docsDir, 'documentation-library.json')
    this.loadLibrary()
  }

  /**
   * Aggiunge documentazione da un URL
   */
  async addDocumentation(url: string, category: string = 'general', tags: string[] = []): Promise<DocumentationEntry> {
    try {
      console.log(chalk.blue(`📖 Fetching documentation from: ${url}`))

      // Scarica HTML e testo in un solo passaggio
      const { html, text } = await this.fetchPage(url)

      if (!text || text.length < 100) {
        throw new Error('Content too short or empty')
      }

      // Crea e salva l'entry per la pagina iniziale
      const entry = await this.createAndStoreEntry(url, text, category, tags)

      // Heuristics: se sembra una root docs, prova a estrarre sotto-pagine
      if (this.shouldCrawlSubpages(url, html)) {
        console.log(chalk.cyan('🔗 Crawling documentation subpages (limited for safety)...'))
        try {
          const added = await this.crawlDocumentation(url, category, tags, { initialHtml: html })
          if (added > 0) {
            console.log(chalk.green(`✓ Added ${added} subpages from ${new URL(url).origin}`))
          }
        } catch (crawlError: any) {
          console.log(
            chalk.yellow(`⚠️ Subpage crawl failed or partially completed: ${crawlError.message || crawlError}`)
          )
        }
      }

      return entry
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to add documentation: ${error.message}`))
      throw error
    }
  }

  /**
   * Cerca nella libreria di documentazione
   */
  async search(query: string, category?: string, limit: number = 10): Promise<SearchResult[]> {
    const normalizedQuery = this.normalizeText(query)
    const queryTerms = normalizedQuery.split(/\s+/).filter((term) => term.length > 2)

    const results: SearchResult[] = []

    for (const [_id, entry] of this.docs) {
      // Filtra per categoria se specificata
      if (category && entry.category !== category) continue

      // Calcola score di rilevanza
      const score = this.calculateRelevanceScore(entry, queryTerms)

      if (score > 0.1) {
        // Soglia minima
        const matchedTerms = this.findMatchedTerms(entry, queryTerms)
        const snippet = this.generateSnippet(entry.content, queryTerms)

        results.push({
          entry,
          score,
          matchedTerms,
          snippet,
        })
      }
    }

    // Ordina per score e limita risultati
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /**
   * Cerca nel web se non trova nulla nella libreria
   */
  async searchWithWebFallback(query: string, category?: string): Promise<SearchResult[]> {
    // Prima cerca nella libreria
    const localResults = await this.search(query, category, 5)

    if (localResults.length > 0 && localResults[0].score > 0.5) {
      console.log(chalk.green(`⚡︎ Found ${localResults.length} relevant docs in library`))
      return localResults
    }

    // Se non trova nulla di rilevante, cerca nel web
    console.log(chalk.yellow(`🔍 No relevant docs found, searching web...`))

    try {
      const webResults = await this.searchWeb(query)

      // Aggiungi i risultati più rilevanti alla libreria
      for (const result of webResults.slice(0, 3)) {
        try {
          await this.addDocumentation((result as any).url, category || 'web-search', [query])
        } catch (_error) {
          // Ignora errori di aggiunta
        }
      }

      return webResults
    } catch (error) {
      console.error(chalk.red(`❌ Web search failed: ${error}`))
      return localResults // Ritorna risultati locali anche se scarsi
    }
  }

  /**
   * Estrae contenuto da una pagina web
   */
  private async extractWebContent(url: string): Promise<string> {
    try {
      // Usa curl per estrarre contenuto HTML
      const { stdout } = await execAsync(`curl -s -L "${url}" -H "User-Agent: Mozilla/5.0"`)

      // Estrai testo dal HTML
      const textContent = this.extractTextFromHTML(stdout)

      return textContent
    } catch (error) {
      throw new Error(`Failed to extract content: ${error}`)
    }
  }

  /**
   * Scarica HTML e testo in una singola chiamata
   */
  private async fetchPage(url: string): Promise<{ html: string; text: string }> {
    try {
      const { stdout } = await execAsync(`curl -s -L "${url}" -H "User-Agent: Mozilla/5.0 NikCLI"`)
      const html = stdout as string
      const text = this.extractTextFromHTML(html)
      return { html, text }
    } catch (error) {
      throw new Error(`Failed to fetch page: ${error}`)
    }
  }

  /**
   * Estrae testo da HTML
   */
  private extractTextFromHTML(html: string): string {
    // Rimuovi tag HTML
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()

    return text
  }

  /**
   * Estrae titolo dal contenuto
   */
  private extractTitle(content: string, url: string): string {
    // Cerca titolo nel contenuto
    const lines = content.split('\n').filter((line) => line.trim().length > 0)

    for (const line of lines.slice(0, 10)) {
      if (line.length > 10 && line.length < 100) {
        return line.substring(0, 80) + (line.length > 80 ? '...' : '')
      }
    }

    // Fallback: usa URL
    try {
      const urlObj = new URL(url)
      return urlObj.hostname + urlObj.pathname
    } catch {
      return url.substring(0, 50)
    }
  }

  /**
   * Crea e memorizza un'entry a partire da contenuto testo
   */
  private async createAndStoreEntry(
    url: string,
    content: string,
    category: string,
    tags: string[]
  ): Promise<DocumentationEntry> {
    // Genera titolo e analisi
    const title = this.extractTitle(content, url)
    const analysis = this.analyzeContent(content)

    const entry: DocumentationEntry = {
      id: this.generateId(),
      url,
      title,
      content: content.substring(0, 50000),
      category,
      tags: [...tags, ...analysis.suggestedTags],
      timestamp: new Date(),
      lastAccessed: new Date(),
      accessCount: 1,
      relevance: 1.0,
      metadata: {
        wordCount: analysis.wordCount,
        language: analysis.language,
        source: 'web',
        extractedAt: new Date(),
      },
    }

    // Gestisci dimensione libreria
    if (this.docs.size >= this.maxDocs) {
      this.evictOldEntries()
    }

    this.docs.set(entry.id, entry)
    this.categories.add(category)
    this.updateSearchIndex(entry)
    await this.saveLibrary()

    // Save to database if available
    await documentationDatabase.saveDocumentation(entry)

    console.log(chalk.green(`✓ Added: ${entry.title} (${analysis.wordCount} words, ${analysis.language})`))
    return entry
  }

  /**
   * Decide se effettuare crawling delle sottopagine per l'URL dato
   */
  private shouldCrawlSubpages(url: string, html: string): boolean {
    try {
      const u = new URL(url)
      const urlHint = /docs|documentation|guide|manual|reference/i.test(`${u.hostname}${u.pathname}`)
      const linkCount = (html.match(/<a\s+[^>]*href=/gi) || []).length
      // Heuristics: se è pagina docs o ha molti link interni
      return urlHint || linkCount > 30
    } catch {
      return false
    }
  }

  /**
   * Estrae link assoluti dal HTML e li filtra per restare nel sito e path base
   */
  private extractAndFilterLinks(html: string, base: URL): string[] {
    const links: string[] = []
    const anchorRegex = /<a\s+[^>]*href=["']([^"'#]+)["'][^>]*>/gi
    let match: RegExpExecArray | null
    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1]
      // Escludi mailto/tel/javascript/anchors
      if (/^(mailto:|tel:|javascript:)/i.test(href)) continue
      try {
        const absolute = new URL(href, base).toString()
        links.push(absolute)
      } catch {
        // ignore invalid
      }
    }

    const basePath = base.pathname.endsWith('/') ? base.pathname : base.pathname + '/'
    const allowed: string[] = []
    const seen = new Set<string>()
    for (const link of links) {
      try {
        const u = new URL(link)
        if (u.hostname !== base.hostname) continue
        // Normalizza: rimuovi hash e query per dedup
        u.hash = ''
        u.search = ''

        // Mantieni solo pagine sotto il path base
        if (!u.pathname.startsWith(basePath) && basePath !== '/') continue

        // Escludi asset statici
        if (/\.(png|jpe?g|gif|svg|webp|css|js|ico|pdf|zip|rar|gz|tgz|mp4|mp3|woff2?|ttf|eot)$/i.test(u.pathname))
          continue

        // Preferisci pagine senza estensione o .html
        const hasExt = /\.[a-zA-Z0-9]+$/.test(u.pathname)
        if (hasExt && !/\.html?$/.test(u.pathname)) continue

        const normalized = u.toString()
        if (!seen.has(normalized)) {
          seen.add(normalized)
          allowed.push(normalized)
        }
      } catch {
        // ignore
      }
    }
    return allowed
  }

  /**
   * Esegue crawling BFS limitato per includere sottopagine di documentazione
   */
  private async crawlDocumentation(
    startUrl: string,
    category: string,
    tags: string[],
    options?: { initialHtml?: string; maxPages?: number; maxDepth?: number }
  ): Promise<number> {
    const maxPages = options?.maxPages ?? 120
    const maxDepth = options?.maxDepth ?? 3
    let addedCount = 0
    const visited = new Set<string>()
    const queue: Array<{ url: string; depth: number }> = []

    let startHtml = options?.initialHtml
    const start = new URL(startUrl)
    const startNormalized = new URL(start.href)
    startNormalized.hash = ''
    startNormalized.search = ''
    queue.push({ url: startNormalized.toString(), depth: 0 })

    while (queue.length > 0 && addedCount < maxPages) {
      const { url, depth } = queue.shift()!
      if (visited.has(url)) continue
      visited.add(url)

      let html: string
      let text: string
      try {
        if (startHtml && url === startNormalized.toString()) {
          html = startHtml
          text = this.extractTextFromHTML(html)
          startHtml = undefined
        } else {
          const page = await this.fetchPage(url)
          html = page.html
          text = page.text
        }
      } catch {
        continue
      }

      // Non ri-aggiungere la prima pagina (già aggiunta da addDocumentation)
      if (url !== startNormalized.toString()) {
        try {
          if (text && text.length > 100) {
            await this.createAndStoreEntry(url, text, category, tags)
            addedCount++
          }
        } catch {
          // continue on errors
        }
      }

      // Espandi link
      if (depth < maxDepth) {
        const links = this.extractAndFilterLinks(html, new URL(startNormalized.toString()))
        for (const link of links) {
          if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 })
          if (queue.length + addedCount >= maxPages) break
        }
      }
    }

    // Persisti stato finale
    try {
      await this.saveLibrary()
    } catch { }

    return addedCount
  }

  /**
   * Analizza contenuto per estrarre metadati
   */
  private analyzeContent(content: string): {
    wordCount: number
    language: string
    suggestedTags: string[]
  } {
    const words = content.split(/\s+/).filter((word) => word.length > 0)
    const wordCount = words.length

    // Rileva lingua (semplice)
    const language = this.detectLanguage(content)

    // Suggerisci tag basati su parole chiave
    const suggestedTags = this.suggestTags(content)

    return {
      wordCount,
      language,
      suggestedTags,
    }
  }

  /**
   * Rileva lingua del testo
   */
  private detectLanguage(text: string): string {
    const italianWords = ['di', 'da', 'del', 'della', 'dello', 'delle', 'degli', 'al', 'dal', 'nel', 'nella']
    const englishWords = ['the', 'and', 'for', 'with', 'this', 'that', 'have', 'will', 'from', 'they']

    const lowerText = text.toLowerCase()
    let italianCount = 0
    let englishCount = 0

    for (const word of italianWords) {
      italianCount += (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length
    }

    for (const word of englishWords) {
      englishCount += (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length
    }

    return italianCount > englishCount ? 'italian' : 'english'
  }

  /**
   * Suggerisce tag basati sul contenuto
   */
  private suggestTags(content: string): string[] {
    const tags: string[] = []
    const lowerContent = content.toLowerCase()

    // Tag tecnici
    if (lowerContent.includes('javascript') || lowerContent.includes('js')) tags.push('javascript')
    if (lowerContent.includes('typescript') || lowerContent.includes('ts')) tags.push('typescript')
    if (lowerContent.includes('react')) tags.push('react')
    if (lowerContent.includes('node')) tags.push('nodejs')
    if (lowerContent.includes('api')) tags.push('api')
    if (lowerContent.includes('database') || lowerContent.includes('db')) tags.push('database')
    if (lowerContent.includes('deployment') || lowerContent.includes('deploy')) tags.push('deployment')
    if (lowerContent.includes('testing') || lowerContent.includes('test')) tags.push('testing')

    return tags.slice(0, 5) // Massimo 5 tag
  }

  /**
   * Calcola score di rilevanza
   */
  private calculateRelevanceScore(entry: DocumentationEntry, queryTerms: string[]): number {
    const normalizedContent = this.normalizeText(entry.content)
    const normalizedTitle = this.normalizeText(entry.title)

    let score = 0

    for (const term of queryTerms) {
      // Peso maggiore per match nel titolo
      if (normalizedTitle.includes(term)) {
        score += 0.4
      }

      // Peso per match nel contenuto
      const contentMatches = (normalizedContent.match(new RegExp(term, 'g')) || []).length
      score += Math.min(0.3, contentMatches * 0.05)

      // Peso per tag
      if (entry.tags.some((tag) => tag.toLowerCase().includes(term))) {
        score += 0.2
      }
    }

    // Normalizza per numero di termini
    score = score / queryTerms.length

    // Applica fattori di boost
    score *= entry.relevance // Rilevanza dell'entry
    score *= 1 + entry.accessCount * 0.1 // Popolarità

    return Math.min(1, score)
  }

  /**
   * Trova termini che hanno fatto match
   */
  private findMatchedTerms(entry: DocumentationEntry, queryTerms: string[]): string[] {
    const normalizedContent = this.normalizeText(`${entry.content} ${entry.title}`)
    return queryTerms.filter((term) => normalizedContent.includes(term))
  }

  /**
   * Genera snippet con termini evidenziati
   */
  private generateSnippet(content: string, queryTerms: string[], maxLength: number = 200): string {
    const normalizedContent = this.normalizeText(content)

    // Trova la posizione del primo match
    let bestPosition = 0
    let bestScore = 0

    for (const term of queryTerms) {
      const position = normalizedContent.indexOf(term)
      if (position >= 0) {
        const score = term.length
        if (score > bestScore) {
          bestScore = score
          bestPosition = position
        }
      }
    }

    // Estrai snippet
    const start = Math.max(0, bestPosition - 50)
    const end = Math.min(content.length, start + maxLength)
    let snippet = content.substring(start, end)

    // Evidenzia termini
    for (const term of queryTerms) {
      const regex = new RegExp(`(${term})`, 'gi')
      snippet = snippet.replace(regex, '**$1**')
    }

    return snippet
  }

  /**
   * Cerca nel web (simulato)
   */
  private async searchWeb(query: string): Promise<SearchResult[]> {
    // Simula ricerca web - in produzione si userebbe un'API
    console.log(chalk.yellow(`🌐 Simulating web search for: ${query}`))

    // Per ora ritorna risultati vuoti
    return []
  }

  /**
   * Normalizza testo
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Aggiorna indice di ricerca
   */
  private updateSearchIndex(entry: DocumentationEntry): void {
    const terms = this.normalizeText(`${entry.content} ${entry.title}`)
      .split(/\s+/)
      .filter((term) => term.length > 2)

    for (const term of terms) {
      if (!this.searchIndex.has(term)) {
        this.searchIndex.set(term, [])
      }
      this.searchIndex.get(term)?.push(entry.id)
    }
  }

  /**
   * Rimuove entry vecchie
   */
  private evictOldEntries(): void {
    const entries = Array.from(this.docs.entries()).sort(
      (a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime()
    )

    // Rimuovi il 20% più vecchio
    const toRemove = Math.ceil(entries.length * 0.2)
    for (let i = 0; i < toRemove; i++) {
      this.docs.delete(entries[i][0])
    }
  }

  /**
   * Genera ID unico
   */
  private generateId(): string {
    return `doc_${Date.now()}_${randomBytes(6).toString('base64url')}`
  }

  /**
   * Carica libreria da file
   */
  private async loadLibrary(): Promise<void> {
    try {
      const data = await fs.readFile(this.docsFile, 'utf-8')
      const parsed = JSON.parse(data)

      for (const [id, entry] of Object.entries(parsed)) {
        const typedEntry = entry as any
        this.docs.set(id, {
          ...typedEntry,
          timestamp: new Date(typedEntry.timestamp),
          lastAccessed: new Date(typedEntry.lastAccessed),
          metadata: {
            ...typedEntry.metadata,
            extractedAt: new Date(typedEntry.metadata.extractedAt),
          },
        })
        this.categories.add(typedEntry.category)
      }

      console.log(chalk.green(`⚡︎ Loaded ${this.docs.size} documentation entries`))
    } catch (_error) {
      // File non esiste, inizia con libreria vuota
    }
  }

  /**
   * Salva libreria su file
   */
  private async saveLibrary(): Promise<void> {
    try {
      // Ensure directory exists before saving
      const dir = path.dirname(this.docsFile)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const data = JSON.stringify(Object.fromEntries(this.docs), null, 2)
      await fs.writeFile(this.docsFile, data)
    } catch (error) {
      console.error('Failed to save documentation library:', error)
    }
  }

  /**
   * Ottieni statistiche
   */
  getStats(): any {
    const entries = Array.from(this.docs.values())

    return {
      totalDocs: this.docs.size,
      categories: Array.from(this.categories),
      totalWords: entries.reduce((sum, e) => sum + e.metadata.wordCount, 0),
      avgAccessCount: entries.reduce((sum, e) => sum + e.accessCount, 0) / entries.length || 0,
      languages: [...new Set(entries.map((e) => e.metadata.language))],
    }
  }

  /**
   * Mostra stato libreria
   */
  showStatus(): void {
    const stats = this.getStats()
    console.log(chalk.blue('\n⚡︎ Documentation Library Status:'))
    console.log(`📖 Total Docs: ${stats.totalDocs}`)
    console.log(`⚡︎ Categories: ${stats.categories.join(', ')}`)
    console.log(`📝 Total Words: ${stats.totalWords.toLocaleString()}`)
    console.log(`📷 Avg Access Count: ${stats.avgAccessCount.toFixed(1)}`)
    console.log(`🌍 Languages: ${stats.languages.join(', ')}`)
  }
}

// Singleton instance
export const docLibrary = new DocumentationLibrary()
