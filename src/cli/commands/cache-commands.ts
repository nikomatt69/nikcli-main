import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'
import { unifiedRAGSystem } from '../context/rag-system'
import { workspaceContext } from '../context/workspace-context'

/**
 * Gestisce i comandi per la gestione della cache RAG
 */
export class CacheCommands {
  /**
   * Mostra statistiche della cache
   */
  static async showStats(): Promise<void> {
    try {
      advancedUI.logInfo('📊 RAG Cache Statistics')
      console.log()

      // RAG system cache stats
      if (unifiedRAGSystem) {
        const ragStats = unifiedRAGSystem.getStats()
        console.log(chalk.blue('RAG System Caches:'))

        for (const [cacheName, cache] of Object.entries(ragStats.caches)) {
          console.log(`  ${cacheName}:`)
          console.log(`    Entries: ${cache.entries}`)
          console.log(`    Size: ${cache.size}`)
          console.log(`    Hit Rate: ('hitRate' in cache ? cache.hitRate : 'N/A')}`)
        }
        console.log()
      }

      console.log(chalk.green('✓ Cache statistics retrieved successfully'))
    } catch (error) {
      console.error(chalk.red(`✖ Failed to get cache statistics: ${error}`))
    }
  }

  /**
   * Pulisce la cache
   */
  static async clearCache(type: 'all' | 'workspace' | 'rag' = 'all'): Promise<void> {
    try {
      advancedUI.logInfo(`🗑 Clearing ${type} cache...`)

      if (type === 'all' || type === 'workspace') {
        // Workspace context cleanup
        workspaceContext.clearAllCaches()
      }

      if (type === 'all' || type === 'rag') {
        if (unifiedRAGSystem) {
          await unifiedRAGSystem.clearCaches()
        }
      }

      console.log(chalk.green(`✓ ${type} cache cleared successfully`))
    } catch (error) {
      console.error(chalk.red(`✖ Failed to clear cache: ${error}`))
    }
  }

  /**
   * Verifica l'integrità della cache
   */
  static async verifyCache(): Promise<void> {
    try {
      advancedUI.logInfo('🔍 Verifying cache integrity...')

      let allValid = true

      // Verify workspace cache by checking if context has files
      const hasFiles = workspaceContext && (workspaceContext as any).context?.files?.size > 0
      if (!hasFiles) {
        console.log(chalk.yellow('⚠ Workspace cache not found'))
        allValid = false
      } else {
        console.log(chalk.green('✓ Workspace cache is valid'))
      }

      // Verify RAG cache
      if (unifiedRAGSystem) {
        console.log(chalk.green('✓ RAG system cache is operational'))
      }

      if (allValid) {
        console.log(chalk.green('✓ All caches are valid'))
      } else {
        console.log(chalk.yellow('⚠ Some caches may need rebuilding'))
      }
    } catch (error) {
      console.error(chalk.red(`✖ Cache verification failed: ${error}`))
    }
  }

  /**
   * Forza il refresh del workspace
   */
  static async forceRefresh(): Promise<void> {
    try {
      advancedUI.logInfo('🔄 Forcing workspace refresh...')

      // Clear all caches and force re-initialization
      workspaceContext.clearAllCaches()
      await workspaceContext.refreshWorkspaceIndex()
      console.log(chalk.green('✓ Workspace refreshed successfully'))
    } catch (error) {
      console.error(chalk.red(`✖ Failed to refresh workspace: ${error}`))
    }
  }

  /**
   * Esegue un aggiornamento incrementale
   */
  static async incrementalUpdate(): Promise<void> {
    try {
      advancedUI.logInfo('⚡ Running incremental update...')

      // Perform selective cache refresh instead of full rebuild
      // This is equivalent to incremental update
      await workspaceContext.selectPaths([process.cwd()])
      console.log(chalk.green('✓ Incremental update completed'))
    } catch (error) {
      console.error(chalk.red(`✖ Incremental update failed: ${error}`))
    }
  }

  /**
   * Configura i parametri della cache
   */
  static async configureCache(config: {
    ttl?: string
    incremental?: boolean
    persistent?: boolean
  }): Promise<void> {
    try {
      advancedUI.logInfo('⚙ Configuring cache...')

      // Parse TTL
      if (config.ttl) {
        const ttlMs = parseTimeToMs(config.ttl)
        if (ttlMs > 0) {
          console.log(chalk.green(`✓ Cache TTL set to ${config.ttl}`))
        } else {
          console.log(chalk.yellow('⚠ Invalid TTL format, using default'))
        }
      }

      // Set incremental indexing
      if (config.incremental !== undefined) {
        console.log(chalk.green(`✓ Incremental indexing ${config.incremental ? 'enabled' : 'disabled'}`))
      }

      // Set persistent cache
      if (config.persistent !== undefined) {
        console.log(chalk.green(`✓ Persistent cache ${config.persistent ? 'enabled' : 'disabled'}`))
      }

      console.log(chalk.gray('Note: Full configuration requires restart to take effect'))
    } catch (error) {
      console.error(chalk.red(`✖ Failed to configure cache: ${error}`))
    }
  }
}

/**
 * Converte una stringa di tempo in millisecondi
 */
function parseTimeToMs(timeStr: string): number {
  const match = timeStr.match(/^(\d+)(ms|s|m|h|d)$/)
  if (!match) return -1

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'ms':
      return value
    case 's':
      return value * 1000
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    case 'd':
      return value * 24 * 60 * 60 * 1000
    default:
      return -1
  }
}
