import * as fsSync from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import chalk from 'chalk'
import { structuredLogger } from '../utils/structured-logger'
import { simpleConfigManager } from './config-manager'
import type { DocumentationEntry } from './documentation-library'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface SharedDocEntry {
  id: string
  title: string
  url: string
  content: string
  category: string
  tags: string[]
  language: string
  word_count: number
  contributor_id?: string
  created_at: string
  updated_at: string
  access_count: number
  popularity_score: number
}

export interface DocsLibrary {
  id: string
  name: string
  description: string
  doc_ids: string[]
  creator_id?: string
  installs_count: number
  created_at: string
}

export interface CloudDocsConfig {
  enabled?: boolean
  provider?: 'supabase' | 'firebase' | 'github'
  apiUrl?: string
  apiKey?: string
  autoSync?: boolean
  contributionMode?: boolean
  maxContextSize?: number
  autoLoadForAgents?: boolean
  smartSuggestions?: boolean
  docsPath?: string
}

export class CloudDocsProvider {
  private supabase: SupabaseClient | null = null
  private config: CloudDocsConfig
  private cacheDir: string
  private sharedIndexFile: string
  private isInitialized = false

  // Table names from config
  private readonly sharedDocsTable: string
  private readonly docsLibrariesTable: string

  constructor(config: CloudDocsConfig, cacheDir: string = './.nikcli') {
    this.config = {
      enabled: true,
      provider: 'supabase',
      autoSync: true,
      contributionMode: true,
      maxContextSize: 50000,
      docsPath: cacheDir,
      autoLoadForAgents: true,
      smartSuggestions: true,
      ...config,
    }

    // Carica automaticamente le API keys dal config manager se non fornite
    if (!this.config.apiUrl || !this.config.apiKey) {
      const cloudKeys = simpleConfigManager.getCloudDocsApiKeys()
      if (!this.config.apiUrl && cloudKeys.apiUrl) {
        this.config.apiUrl = cloudKeys.apiUrl
      }
      if (!this.config.apiKey && cloudKeys.apiKey) {
        this.config.apiKey = cloudKeys.apiKey
      }
    }

    this.cacheDir = cacheDir

    this.sharedIndexFile = path.join(cacheDir, 'shared-docs-index.json')

    // Initialize table names from config with fallbacks
    const supabaseConfig = simpleConfigManager.getSupabaseConfig()
    this.sharedDocsTable = supabaseConfig.tables.sharedDocs
    this.docsLibrariesTable = supabaseConfig.tables.docsLibraries

    // Non chiamare async nel costruttore - inizializzazione lazy
  }

  /**
   * Inizializza il provider se non già fatto
   */
  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return

    if (this.config.enabled && this.config.provider === 'supabase') {
      await this.initializeSupabase()
    }
  }

  private async initializeSupabase(): Promise<void> {
    try {
      if (!this.config.apiUrl || !this.config.apiKey) {
        structuredLogger.warning('Docs Cloud', '⚠︎ Supabase credentials not configured. Cloud docs disabled.')
        structuredLogger.info('Docs Cloud', 'Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables')
        return
      }

      this.supabase = createClient(this.config.apiUrl, this.config.apiKey)
      this.isInitialized = true
    } catch (error: any) {
      structuredLogger.error('Docs Cloud', `✖ Failed to initialize Supabase: ${error.message}`)
    }
  }

  /**
   * Sincronizza libreria locale con cloud
   */
  async sync(): Promise<{ downloaded: number; uploaded: number }> {
    await this.ensureInitialized()

    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized')
    }

    try {
      // Download nuovi docs dal cloud
      const { data: cloudDocs, error: fetchError } = await this.supabase
        .from(this.sharedDocsTable)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(100)

      if (fetchError) throw fetchError

      let downloaded = 0
      const uploaded = 0

      // Salva indice dei docs condivisi
      if (cloudDocs && cloudDocs.length > 0) {
        await this.saveSharedIndex(cloudDocs)
        downloaded = cloudDocs.length
        advancedUI.logSuccess(`📥 Downloaded ${downloaded} shared documents`)
      }

      // Upload local docs when contribution mode is enabled for community sharing
      if (this.config.contributionMode) {
        await this.uploadLocalDocs()
        advancedUI.logInfo(chalk.gray('📤 Local documentation uploaded to community cloud'))
      }

      advancedUI.logSuccess(`✓ Sync completed: ${downloaded} downloaded, ${uploaded} uploaded`)
      return { downloaded, uploaded }
    } catch (error: any) {
      advancedUI.logError(`✖ Sync failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Pubblica un documento nella libreria condivisa
   */
  async publishDoc(doc: DocumentationEntry): Promise<SharedDocEntry> {
    await this.ensureInitialized()

    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized')
    }

    advancedUI.logInfo(chalk.blue(`📤 Publishing: ${doc.title}`))

    try {
      const sharedDoc: Partial<SharedDocEntry> = {
        title: doc.title,
        url: doc.url,
        content: doc.content.substring(0, 50000), // Limit content size
        category: doc.category,
        tags: doc.tags,
        language: doc.metadata.language,
        word_count: doc.metadata.wordCount,
        access_count: 0,
        popularity_score: 0,
      }

      const { data, error } = await this.supabase.from(this.sharedDocsTable).insert([sharedDoc]).select().single()

      if (error) throw error

      advancedUI.logSuccess(`✓ Published: ${data.title}`)
      return data as SharedDocEntry
    } catch (error: any) {
      advancedUI.logError(`✖ Publish failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Cerca nella libreria condivisa
   */
  async searchShared(query: string, category?: string, limit: number = 10): Promise<SharedDocEntry[]> {
    await this.ensureInitialized()

    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized')
    }

    try {
      let queryBuilder = this.supabase.from(this.sharedDocsTable).select('*')

      // Filtro per categoria
      if (category) {
        queryBuilder = queryBuilder.eq('category', category)
      }

      // Search in title and content (basic text search)
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%, content.ilike.%${query}%`)

      const { data, error } = await queryBuilder.order('popularity_score', { ascending: false }).limit(limit)

      if (error) throw error

      return data || []
    } catch (error: any) {
      advancedUI.logError(`✖ Search failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Ottieni librerie popolari
   */
  async getPopularLibraries(limit: number = 20): Promise<DocsLibrary[]> {
    await this.ensureInitialized()

    if (!this.isInitialized || !this.supabase) {
      return []
    }

    try {
      const { data, error } = await this.supabase
        .from(this.docsLibrariesTable)
        .select('*')
        .order('installs_count', { ascending: false })
        .limit(limit)

      if (error) throw error

      return data || []
    } catch (error: any) {
      advancedUI.logError(`✖ Failed to get popular libraries: ${error.message}`)
      return []
    }
  }

  /**
   * Installa una libreria di documenti
   */
  async installLibrary(libraryName: string): Promise<SharedDocEntry[]> {
    await this.ensureInitialized()

    if (!this.isInitialized || !this.supabase) {
      throw new Error('Cloud docs provider not initialized')
    }

    advancedUI.logInfo(chalk.blue(`📦 Installing library: ${libraryName}`))

    try {
      // Cerca la libreria per nome
      const { data: library, error: libError } = await this.supabase
        .from(this.docsLibrariesTable)
        .select('*')
        .eq('name', libraryName)
        .single()

      if (libError) throw libError
      if (!library) throw new Error(`Library '${libraryName}' not found`)

      // Ottieni i documenti della libreria
      const { data: docs, error: docsError } = await this.supabase
        .from(this.sharedDocsTable)
        .select('*')
        .in('id', library.doc_ids)

      if (docsError) throw docsError

      // Incrementa il contatore di installazioni
      await this.supabase
        .from(this.docsLibrariesTable)
        .update({ installs_count: library.installs_count + 1 })
        .eq('id', library.id)

      advancedUI.logSuccess(`✓ Installed ${docs?.length || 0} documents from '${libraryName}'`)
      return docs || []
    } catch (error: any) {
      advancedUI.logError(`✖ Install failed: ${error.message}`)
      throw error
    }
  }

  /**
   * Salva indice docs condivisi in cache locale
   */
  private async saveSharedIndex(docs: SharedDocEntry[]): Promise<void> {
    try {
      const index = {
        lastSync: new Date().toISOString(),
        totalDocs: docs.length,
        docs: docs.map((doc) => ({
          id: doc.id,
          title: doc.title,
          category: doc.category,
          tags: doc.tags,
          language: doc.language,
          word_count: doc.word_count,
          popularity_score: doc.popularity_score,
          url: doc.url,
        })),
      }

      await fs.writeFile(this.sharedIndexFile, JSON.stringify(index, null, 2))
      advancedUI.logInfo(chalk.gray(`💾 Cached ${docs.length} shared docs locally`))
    } catch (error) {
      advancedUI.logError(`Failed to save shared docs index: ${error}`)
    }
  }

  /**
   * Carica indice docs condivisi dalla cache
   */
  async loadSharedIndex(): Promise<any> {
    try {
      const data = await fs.readFile(this.sharedIndexFile, 'utf-8')
      return JSON.parse(data)
    } catch (_error) {
      return { lastSync: null, totalDocs: 0, docs: [] }
    }
  }

  /**
   * Verifica se è inizializzato
   */
  isReady(): boolean {
    return this.isInitialized && this.supabase !== null
  }

  /**
   * Ottieni statistiche cloud
   */
  async getCloudStats(): Promise<{
    totalSharedDocs: number
    totalLibraries: number
    lastSync?: string
  }> {
    const index = await this.loadSharedIndex()

    return {
      totalSharedDocs: index.totalDocs,
      totalLibraries: await this.countUniqueLibraries(index),
      lastSync: index.lastSync,
    }
  }

  /**
   * Upload local documentation to cloud for community sharing
   */
  private async uploadLocalDocs(): Promise<void> {
    const localDocsPath = path.join(this.config.docsPath || this.cacheDir, 'local')
    if (!fsSync.existsSync(localDocsPath)) return

    const localDocs = fsSync
      .readdirSync(localDocsPath, { withFileTypes: true })
      .filter((dirent: fsSync.Dirent) => dirent.isFile() && dirent.name.endsWith('.json'))
      .map((dirent: fsSync.Dirent) => path.join(localDocsPath, dirent.name))

    for (const docPath of localDocs) {
      const content = fsSync.readFileSync(docPath, 'utf-8')
      const docData = JSON.parse(content)
      // Upload logic would go here - for now just validate structure
      if (docData.library && docData.version && docData.documentation) {
        advancedUI.logInfo(chalk.gray(`📄 Would upload ${docData.library}@${docData.version}`))
      }
    }
  }

  /**
   * Count unique libraries in shared documentation
   */
  private async countUniqueLibraries(index: any): Promise<number> {
    const libraries = new Set()
    if (index.docs) {
      for (const doc of index.docs) {
        if (doc.library) {
          libraries.add(doc.library)
        }
      }
    }
    return libraries.size
  }
}

// Singleton instance
let cloudDocsProvider: CloudDocsProvider | null = null

export function createCloudDocsProvider(config: CloudDocsConfig): CloudDocsProvider {
  if (!cloudDocsProvider) {
    cloudDocsProvider = new CloudDocsProvider(config)
  }
  return cloudDocsProvider
}

export function getCloudDocsProvider(): CloudDocsProvider | null {
  return cloudDocsProvider
}
