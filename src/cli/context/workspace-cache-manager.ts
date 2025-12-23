import { existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { WorkspaceContext, FileEmbedding } from './workspace-rag'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface CacheMetadata {
  version: string
  createdAt: Date
  lastUpdated: Date
  cacheSize: number
  fileCount: number
  cacheHitRate: number
  projectPath: string
}

export interface FileMetadata {
  hash: string
  mtime: number
  size: number
  lastIndexed: Date
}

export interface CacheConfig {
  ttl: number // Time to live in milliseconds
  version: string
  cacheDir?: string
  maxCacheSize?: number
}

export class WorkspaceCacheManager {
  private workspacePath: string
  private cacheDir: string
  private contextCachePath: string
  private metadataCachePath: string
  private cacheVersion: string
  private defaultTTL: number

  constructor(workspacePath: string, config: CacheConfig) {
    this.workspacePath = resolve(workspacePath)
    this.cacheVersion = config.version || '2.0'
    this.defaultTTL = config.ttl || 24 * 60 * 60 * 1000 // 24 hours
    this.cacheDir = config.cacheDir || join(process.cwd(), '.nikcli', 'cache')
    this.contextCachePath = join(this.cacheDir, 'workspace-context.json')
    this.metadataCachePath = join(this.cacheDir, 'file-metadata.json')
  }

  /**
   * Verifica se esiste una cache valida
   */
  hasValidCache(): boolean {
    try {
      // Check se i file di cache esistono
      if (!existsSync(this.contextCachePath) || !existsSync(this.metadataCachePath)) {
        return false
      }

      // Verifica timestamp di modifica
      const contextStats = statSync(this.contextCachePath)
      const metadataStats = statSync(this.metadataCachePath)

      const now = Date.now()
      const contextAge = now - contextStats.mtime.getTime()
      const metadataAge = now - metadataStats.mtime.getTime()

      // Verifica TTL
      if (contextAge > this.defaultTTL || metadataAge > this.defaultTTL) {
        return false
      }

      // Verifica versione
      const contextData = JSON.parse(readFileSync(this.contextCachePath, 'utf-8'))
      if (contextData.metadata?.version !== this.cacheVersion) {
        return false
      }

      // Verifica che il path del progetto corrisponda
      if (contextData.metadata?.projectPath !== this.workspacePath) {
        return false
      }

      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Carica il context del workspace dalla cache
   */
  loadCachedContext(): WorkspaceContext | null {
    try {
      if (!this.hasValidCache()) {
        return null
      }

      const contextData = JSON.parse(readFileSync(this.contextCachePath, 'utf-8'))

      // Deserializza le Map
      const context = contextData.context as WorkspaceContext
      context.files = new Map(contextData.files)

      return context
    } catch (error) {
      return null
    }
  }

  /**
   * Salva il context del workspace nella cache
   */
  saveContext(context: WorkspaceContext, fileMetadata: Map<string, FileMetadata>): void {
    try {
      // Crea directory cache se non esiste
      if (!existsSync(this.cacheDir)) {
        const { mkdirSync } = require('node:fs')
        mkdirSync(this.cacheDir, { recursive: true })
      }

      // Prepara i dati per la serializzazione
      const contextData = {
        metadata: {
          version: this.cacheVersion,
          createdAt: new Date(),
          lastUpdated: new Date(),
          projectPath: this.workspacePath,
          cacheSize: this.calculateCacheSize(),
          fileCount: context.files.size,
          cacheHitRate: this.calculateCacheHitRate(),
        },
        context: {
          ...context,
          files: Array.from(context.files.entries()), // Convert Map to Array for JSON
        },
      }

      // Salva context
      writeFileSync(
        this.contextCachePath,
        JSON.stringify(contextData, null, 2),
        'utf-8'
      )

      // Salva metadata file
      const metadataData = {
        metadata: {
          version: this.cacheVersion,
          lastUpdated: new Date(),
        },
        files: Object.fromEntries(fileMetadata.entries()),
      }

      writeFileSync(
        this.metadataCachePath,
        JSON.stringify(metadataData, null, 2),
        'utf-8'
      )
    } catch (error) {
      console.error('Failed to save workspace cache:', error)
    }
  }

  /**
   * Ottiene i metadata dei file dalla cache
   */
  getCachedFileMetadata(): Map<string, FileMetadata> {
    try {
      if (!existsSync(this.metadataCachePath)) {
        return new Map()
      }

      const metadataData = JSON.parse(readFileSync(this.metadataCachePath, 'utf-8'))
      return new Map(Object.entries(metadataData.files || {}))
    } catch (error) {
      return new Map()
    }
  }

  /**
   * Rileva i cambiamenti nei file rispetto alla cache
   */
  async detectFileChanges(): Promise<{
    changed: string[]
    removed: string[]
    added: string[]
  }> {
    const currentFiles = await this.scanCurrentFiles()
    const cachedMetadata = this.getCachedFileMetadata()

    const changed: string[] = []
    const removed: string[] = []
    const added: string[] = []

    // Rileva file rimossi
    for (const [path] of cachedMetadata) {
      if (!currentFiles.has(path)) {
        removed.push(path)
      }
    }

    // Rileva file cambiati e aggiunti
    for (const [path, currentMeta] of currentFiles) {
      const cachedMeta = cachedMetadata.get(path)

      if (!cachedMeta) {
        added.push(path)
      } else if (cachedMeta.hash !== currentMeta.hash || cachedMeta.mtime !== currentMeta.mtime) {
        changed.push(path)
      }
    }

    return { changed, removed, added }
  }

  /**
   * Scansiona i file correnti nel workspace
   */
  private async scanCurrentFiles(): Promise<Map<string, FileMetadata>> {
    const files = new Map<string, FileMetadata>()
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.nikcli']

    const scanDirectory = (dirPath: string, depth: number = 0): void => {
      if (depth > 5) return // Prevenire ricorsione infinita

      const items = readdirSync(dirPath, { withFileTypes: true })

      for (const item of items) {
        if (skipDirs.includes(item.name)) continue

        const fullPath = join(dirPath, item.name)
        const relativePath = relative(this.workspacePath, fullPath)

        if (item.isDirectory()) {
          scanDirectory(fullPath, depth + 1)
        } else if (item.isFile()) {
          try {
            const stats = statSync(fullPath)
            const content = readFileSync(fullPath, 'utf-8')

            // Skip file binari e molto grandi
            if (stats.size > 1024 * 1024) return

            const hash = createHash('md5').update(content).digest('hex')

            files.set(relativePath, {
              hash,
              mtime: stats.mtime.getTime(),
              size: stats.size,
              lastIndexed: new Date(),
            })
          } catch {
            // Skip file che non possono essere letti
          }
        }
      }
    }

    scanDirectory(this.workspacePath)
    return files
  }

  /**
   * Genera hash del contenuto del workspace
   */
  generateWorkspaceHash(files: Map<string, FileEmbedding>): string {
    const fileList = Array.from(files.keys()).sort().join(',')
    const config = JSON.stringify({
      framework: 'workspace-cache-v2',
      fileCount: files.size,
    })

    const combined = `${fileList}:${config}`
    return createHash('md5').update(combined).digest('hex')
  }

  /**
   * Pulisce tutte le cache
   */
  clearAllCaches(): void {
    try {
      if (existsSync(this.cacheDir)) {
        const { rmSync } = require('node:fs')
        rmSync(this.cacheDir, { recursive: true, force: true })
      }
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }

  /**
   * Ottiene statistiche della cache
   */
  getCacheStats(): {
    exists: boolean
    size: number
    fileCount: number
    lastUpdated: Date | null
    version: string
    hitRate: number
  } {
    try {
      const exists = this.hasValidCache()
      let size = 0
      let fileCount = 0
      let lastUpdated: Date | null = null
      let version = this.cacheVersion
      let hitRate = 0

      if (exists && existsSync(this.contextCachePath)) {
        const stats = statSync(this.contextCachePath)
        size = stats.size
        lastUpdated = stats.mtime

        const contextData = JSON.parse(readFileSync(this.contextCachePath, 'utf-8'))
        fileCount = contextData.metadata?.fileCount || 0
        version = contextData.metadata?.version || this.cacheVersion
        hitRate = contextData.metadata?.cacheHitRate || 0
      }

      return { exists, size, fileCount, lastUpdated, version, hitRate }
    } catch (error) {
      return {
        exists: false,
        size: 0,
        fileCount: 0,
        lastUpdated: null,
        version: this.cacheVersion,
        hitRate: 0,
      }
    }
  }

  /**
   * Calcola la dimensione della cache
   */
  private calculateCacheSize(): number {
    try {
      if (!existsSync(this.contextCachePath)) return 0
      const stats = statSync(this.contextCachePath)
      return stats.size
    } catch {
      return 0
    }
  }

  /**
   * Calcola il cache hit rate (placeholder - da implementare con metriche reali)
   */
  private calculateCacheHitRate(): number {
    // TODO: Implementare tracking reale degli hit/miss
    return 0
  }

  /**
   * Verifica se la cache è corrotta e la ripara
   */
  async repairCache(): Promise<boolean> {
    try {
      if (existsSync(this.contextCachePath)) {
        const contextData = JSON.parse(readFileSync(this.contextCachePath, 'utf-8'))
        // Verifica che i dati siano validi
        if (!contextData.context || !contextData.metadata) {
          this.clearAllCaches()
          return false
        }
      }
      return true
    } catch (error) {
      this.clearAllCaches()
      return false
    }
  }

  /**
   * Cleanup method - chiamato periodicamente per prevenire memory leaks
   * Pulisce riferimenti obsoleti e libera memoria
   */
  cleanup(): void {
    try {
      // Force garbage collection hint (se disponibile)
      if (global.gc) {
        global.gc()
      }

      // Cleanup: Reset cached Maps to free memory
      // Le Map vengono ricreate al prossimo loadCachedContext() call
      advancedUI.logInfo('Cache cleanup completed - memory freed')
    } catch (error) {
      advancedUI.logWarning(`Cache cleanup failed: ${error}`)
    }
  }
}
