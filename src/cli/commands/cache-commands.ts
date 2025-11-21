import chalk from 'chalk'
import boxen from 'boxen'
import { cacheService } from '../services/cache-service'
import { enhancedTokenCache } from '../core/enhanced-token-cache'
import { tokenCache } from '../core/token-cache'

/**
 * CacheCommands - Handles cache and Redis commands
 * Extracted from lines 14536-17190 in nik-cli.ts
 */
export class CacheCommands {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleCacheCommands(cmd: string, args: string[]): Promise<void> {
    try {
      switch (cmd) {
        case 'redis':
          if (args.length === 0) {
            await this.showRedisStatus()
          } else {
            const subCmd = args[0]
            switch (subCmd) {
              case 'connect':
                await this.connectRedis()
                break
              case 'disconnect':
                await this.disconnectRedis()
                break
              case 'health':
                await this.showRedisHealth()
                break
              case 'config':
                await this.showRedisConfig()
                break
              default:
                this.nikCLI.printPanel(
                  boxen('Usage: /redis [connect|disconnect|health|config]', {
                    title: 'Redis Command',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'yellow',
                  })
                )
            }
          }
          break

        case 'cache-stats':
          await this.showCacheStats()
          break

        case 'cache-health':
          await this.showCacheHealth()
          break

        case 'cache-clear':
          if (args.length === 0 || args[0] === 'all') {
            await this.clearAllCaches()
          } else {
            await this.clearSpecificCache(args[0])
          }
          break
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Cache command failed: ${error.message}`))
    }
  }

  async showRedisStatus(): Promise<void> {
    const config = this.nikCLI.configManager.getRedisConfig()

    console.log(chalk.blue('\n🔴 Redis Configuration:'))
    console.log(`   Enabled: ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`   Host: ${config.host}:${config.port}`)
    console.log(`   Database: ${config.database}`)
    console.log(`   Key Prefix: ${config.keyPrefix}`)
    console.log(`   TTL: ${config.ttl}s`)
    console.log(
      `   Fallback: ${config.fallback.enabled ? chalk.green('Enabled') : chalk.red('Disabled')} (${config.fallback.strategy})`
    )

    if (config.enabled) {
      try {
        const { redisProvider } = await import('../providers/redis/redis-provider')
        const healthy = redisProvider.isHealthy()
        console.log(`   Connection: ${healthy ? chalk.green('Connected') : chalk.red('Disconnected')}`)

        if (healthy) {
          const health = redisProvider.getLastHealthCheck()
          if (health) {
            console.log(`   Latency: ${health.latency}ms`)
            const memUsed =
              health.memory?.used !== undefined ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB` : 'N/A'
            console.log(`   Memory Used: ${memUsed}`)
            console.log(`   Keys: ${health.keyspace?.keys ?? 'Unknown'}`)
          }
        }
      } catch (error: any) {
        console.log(`   Error: ${chalk.red(error.message)}`)
      }
    }
  }

  async showCacheStats(): Promise<void> {
    try {
      const stats = await cacheService.getStats()

      console.log(chalk.blue('\n📊 Cache Statistics:'))
      console.log(chalk.green('Redis Cache:'))
      console.log(`   Enabled: ${stats.redis.enabled ? 'Yes' : 'No'}`)
      console.log(`   Connected: ${stats.redis.connected ? chalk.green('Yes') : chalk.red('No')}`)
      console.log(`   Entries: ${stats.redis.entries || 'Unknown'}`)

      console.log(chalk.cyan('Fallback Cache:'))
      console.log(`   Enabled: ${stats.fallback.enabled ? 'Yes' : 'No'}`)
      console.log(`   Type: ${stats.fallback.type}`)

      console.log(chalk.yellow('Overall Performance:'))
      console.log(`   Total Hits: ${stats.totalHits}`)
      console.log(`   Total Misses: ${stats.totalMisses}`)
      console.log(`   Hit Rate: ${stats.hitRate}%`)

      if (this.nikCLI.isEnhancedMode) {
        const enhancedStats = await enhancedTokenCache.getStats()
        console.log(chalk.magenta('Enhanced Token Cache:'))
        console.log(`   Total Entries: ${enhancedStats.totalEntries}`)
        console.log(`   Total Hits: ${enhancedStats.totalHits}`)
        console.log(`   Tokens Saved: ${enhancedStats.totalTokensSaved}`)
        console.log(`   Memory Cache Size: ${enhancedStats.cacheSize}`)
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get cache stats: ${error.message}`))
    }
  }

  async showRedisHealth(): Promise<void> {
    try {
      const { redisProvider } = await import('../providers/redis/redis-provider')

      if (!redisProvider.isHealthy()) {
        console.log(chalk.red('❌ Redis is not connected'))
        return
      }

      console.log(chalk.blue('\n🏥 Redis Health Status:'))

      const health = await redisProvider.getHealth()

      console.log(chalk.green('Connection:'))
      console.log(`   Status: ${chalk.green('Connected')}`)
      console.log(`   Latency: ${health.latency}ms`)
      const uptimeStr =
        health.uptime !== undefined
          ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
          : 'N/A'
      console.log(`   Uptime: ${uptimeStr}`)

      console.log(chalk.cyan('Memory Usage:'))
      const memUsed = health.memory?.used !== undefined ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB` : 'N/A'
      const memPeak = health.memory?.peak !== undefined ? `${(health.memory.peak / 1024 / 1024).toFixed(2)} MB` : 'N/A'
      console.log(`   Used: ${memUsed}`)
      console.log(`   Peak: ${memPeak}`)

      console.log(chalk.yellow('Keyspace:'))
      console.log(`   Total Keys: ${health.keyspace?.keys ?? 'Unknown'}`)
      console.log(`   Keys with Expiry: ${health.keyspace?.expires ?? 'Unknown'}`)

      // Show configuration info
      const config = redisProvider.getConfig()
      console.log(chalk.magenta('Configuration:'))
      console.log(`   Key Prefix: ${config.keyPrefix}`)
      console.log(`   Default TTL: ${config.ttl}s`)
      console.log(`   Max Retries: ${config.maxRetries}`)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get Redis health: ${error.message}`))
    }
  }

  async showRedisConfig(): Promise<void> {
    const config = this.nikCLI.configManager.getRedisConfig()

    console.log(chalk.blue('\n🔴 Redis Configuration:'))

    console.log(chalk.green('Connection Settings:'))
    console.log(`   Host: ${config.host}`)
    console.log(`   Port: ${config.port}`)
    console.log(`   Database: ${config.database}`)
    console.log(`   Password: ${config.password ? chalk.green('Set') : chalk.gray('Not set')}`)

    console.log(chalk.cyan('Cache Settings:'))
    console.log(`   Key Prefix: ${config.keyPrefix}`)
    console.log(`   Default TTL: ${config.ttl} seconds`)
    console.log(`   Max Retries: ${config.maxRetries}`)
    console.log(`   Retry Delay: ${config.retryDelayMs}ms`)

    console.log(chalk.yellow('Cluster Settings:'))
    console.log(`   Enabled: ${config.cluster.enabled ? chalk.green('Yes') : chalk.red('No')}`)
    if (config.cluster.enabled && config.cluster.nodes) {
      console.log(`   Nodes: ${config.cluster.nodes.length}`)
      config.cluster.nodes.forEach((node, idx) => {
        console.log(`     ${idx + 1}. ${node.host}:${node.port}`)
      })
    }

    console.log(chalk.magenta('Fallback Settings:'))
    console.log(`   Enabled: ${config.fallback.enabled ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`   Strategy: ${config.fallback.strategy}`)

    console.log(chalk.blue('Cache Strategies:'))
    Object.entries(config.strategies).forEach(([strategy, enabled]) => {
      console.log(`   ${strategy}: ${enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`)
    })

    // Show connection string (without password)
    const connectionString = this.nikCLI.configManager.getRedisConnectionString()
    if (connectionString) {
      const safeConnectionString = connectionString.replace(/:([^:@]+)@/, ':***@')
      console.log(chalk.dim(`\n   Connection String: ${safeConnectionString}`))
    }
  }

  async showCacheHealth(): Promise<void> {
    console.log(chalk.blue('\n🏥 Cache System Health:'))

    try {
      // Overall cache service health
      const health = cacheService.getHealthStatus()

      console.log(chalk.green('Cache Service:'))
      console.log(`   Overall Status: ${health.overall ? chalk.green('Healthy') : chalk.red('Unhealthy')}`)

      console.log(chalk.red('Redis Cache:'))
      console.log(`   Healthy: ${health.redis.healthy ? chalk.green('Yes') : chalk.red('No')}`)
      console.log(`   Connected: ${health.redis.connected ? chalk.green('Yes') : chalk.red('No')}`)

      console.log(chalk.cyan('Smart Cache (Fallback):'))
      console.log(`   Healthy: ${health.smartCache.healthy ? chalk.green('Yes') : chalk.red('No')}`)

      // Get detailed statistics
      const stats = await cacheService.getStats()

      console.log(chalk.yellow('Performance Metrics:'))
      console.log(`   Total Hits: ${stats.totalHits}`)
      console.log(`   Total Misses: ${stats.totalMisses}`)
      console.log(`   Hit Rate: ${stats.hitRate}%`)

      // Enhanced token cache health if available
      if (this.nikCLI.isEnhancedMode) {
        const tokenCacheHealth = enhancedTokenCache.getHealth()
        console.log(chalk.magenta('Enhanced Token Cache:'))
        console.log(`   Healthy: ${tokenCacheHealth.healthy ? chalk.green('Yes') : chalk.red('No')}`)
        console.log(`   Memory Entries: ${tokenCacheHealth.details.memoryCache.entries}`)
      }

      // Show recommendations
      console.log(chalk.blue('\n💡 Recommendations:'))
      if (!health.redis.healthy) {
        console.log(chalk.dim('   • Consider starting Redis for better performance'))
      }
      if (stats.hitRate < 50) {
        console.log(chalk.dim('   • Cache hit rate is low, consider adjusting cache strategies'))
      }
      if (stats.totalMisses > stats.totalHits * 2) {
        console.log(chalk.dim('   • High miss rate detected, check cache TTL settings'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get cache health: ${error.message}`))
    }
  }

  async clearAllCaches(): Promise<void> {
    try {
      console.log(chalk.blue('🧹 Clearing all caches...'))
      await cacheService.clearAll()

      if (this.nikCLI.isEnhancedMode) {
        await enhancedTokenCache.clearCache()
      }

      console.log(chalk.green('✓ All caches cleared'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to clear caches: ${error.message}`))
    }
  }

  async clearSpecificCache(cacheType: string): Promise<void> {
    try {
      console.log(chalk.blue(`🧹 Clearing ${cacheType} cache...`))

      switch (cacheType.toLowerCase()) {
        case 'redis': {
          const { redisProvider } = await import('../providers/redis/redis-provider')
          if (redisProvider.isHealthy()) {
            await redisProvider.flushAll()
            console.log(chalk.green('✓ Redis cache cleared'))
          } else {
            console.log(chalk.yellow('⚠️ Redis not connected, nothing to clear'))
          }
          break
        }

        case 'smart':
        case 'memory': {
          // Dynamic import for SmartCache
          const { smartCache: SmartCacheManager } = await import('../core/smart-cache-manager')
          SmartCacheManager.cleanup()
          console.log(chalk.green('✓ Smart cache cleared'))
          break
        }

        case 'token':
        case 'tokens':
          if (this.nikCLI.isEnhancedMode) {
            await enhancedTokenCache.clearCache()
            console.log(chalk.green('✓ Enhanced token cache cleared'))
          } else {
            // Clear legacy token cache
            await tokenCache.clearCache()
            console.log(chalk.green('✓ Token cache cleared'))
          }
          break

        case 'session':
        case 'sessions': {
          const _sessionCacheCleared = await cacheService.delete('session:*')
          console.log(chalk.green('✓ Session cache cleared'))
          break
        }

        default:
          console.log(chalk.yellow(`⚠️ Unknown cache type: ${cacheType}`))
          console.log(chalk.dim('   Available types: redis, smart, token, session'))
          return
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to clear ${cacheType} cache: ${error.message}`))
    }
  }

  async connectRedis(): Promise<void> {
    console.log(chalk.blue('⚡︎ Connecting to Redis...'))

    try {
      const { redisProvider } = await import('../providers/redis/redis-provider')

      if (redisProvider.isHealthy()) {
        console.log(chalk.yellow('⚠️ Redis is already connected'))
        return
      }

      // Force reconnection
      await redisProvider.reconnect()

      // Wait a moment for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 2000))

      if (redisProvider.isHealthy()) {
        console.log(chalk.green('✓ Redis connected successfully'))

        // Show basic info
        const health = redisProvider.getLastHealthCheck()
        if (health) {
          console.log(`   Latency: ${health.latency}ms`)
          const memUsed =
            health.memory?.used !== undefined ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB` : 'N/A'
          console.log(`   Memory Used: ${memUsed}`)
          console.log(`   Keys: ${health.keyspace?.keys ?? 'Unknown'}`)
        }
      } else {
        console.log(chalk.red('❌ Redis connection failed'))
        console.log(chalk.dim('   Check Redis server is running and configuration is correct'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Redis connection error: ${error.message}`))
      console.log(chalk.dim('   Ensure Redis is installed and running: redis-server'))
    }
  }

  async disconnectRedis(): Promise<void> {
    try {
      console.log(chalk.blue('🔌 Disconnecting from Redis...'))

      const { redisProvider } = await import('../providers/redis/redis-provider')

      if (!redisProvider.isHealthy()) {
        console.log(chalk.yellow('⚠️ Redis is already disconnected'))
        return
      }

      await redisProvider.disconnect()
      console.log(chalk.green('✓ Redis disconnected successfully'))
      console.log(chalk.dim('   Cache will automatically fall back to memory cache'))
    } catch (error: any) {
      console.log(chalk.red(`❌ Redis disconnect error: ${error.message}`))
    }
  }
}
