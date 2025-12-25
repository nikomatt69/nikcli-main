import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import type {
  PluginDiscoveryOptions,
  PluginId,
  PluginManifest,
  PluginMetadata,
  PluginResolutionResult,
  PluginVersion,
} from '../types/plugin-types'

/**
 * Plugin manifest file name
 */
const MANIFEST_FILE = 'nikcli-plugin.json'

/**
 * Schema for validating plugin manifest files
 */
export const PluginManifestSchema = z.object({
  metadata: z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/),
    minNikCLIVersion: z.string().optional(),
    maxNikCLIVersion: z.string().optional(),
    author: z.object({
      name: z.string().min(1),
      email: z.string().email().optional(),
      url: z.string().url().optional(),
    }),
    license: z.string().min(1),
    repository: z
      .object({
        type: z.enum(['git', 'hg', 'svn']),
        url: z.string(),
        directory: z.string().optional(),
      })
      .optional(),
    homepage: z.string().url().optional(),
    keywords: z.array(z.string()).optional(),
    category: z.enum(['tool', 'agent', 'ui', 'integration', 'middleware', 'other']).optional().default('other'),
    dependencies: z
      .array(
        z.object({
          id: z.string(),
          version: z.string().optional(),
          optional: z.boolean().optional(),
          reason: z.string().optional(),
        })
      )
      .optional(),
    incompatibilities: z.array(z.string()).optional(),
    icon: z.string().optional(),
  }),
  main: z.string().min(1),
  permissions: z
    .object({
      filesystem: z
        .object({
          read: z.array(z.string()).optional(),
          write: z.array(z.string()).optional(),
          exec: z.array(z.string()).optional(),
        })
        .optional(),
      network: z
        .object({
          domains: z.array(z.string()).optional(),
          ports: z.array(z.number()).optional(),
          protocols: z.array(z.enum(['http', 'https', 'ws', 'wss', 'tcp', 'udp'])).optional(),
        })
        .optional(),
      env: z
        .object({
          read: z.array(z.string()).optional(),
          write: z.array(z.string()).optional(),
        })
        .optional(),
      tools: z
        .object({
          allowed: z.array(z.string()).optional(),
          blocked: z.array(z.string()).optional(),
        })
        .optional(),
      agents: z
        .object({
          allowed: z.array(z.string()).optional(),
          blocked: z.array(z.string()).optional(),
        })
        .optional(),
      system: z
        .object({
          allowProcesses: z.boolean().optional(),
          allowNotifications: z.boolean().optional(),
          allowClipboard: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  config: z
    .array(
      z.object({
        key: z.string(),
        type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
        default: z.unknown().optional(),
        required: z.boolean().optional(),
        description: z.string().optional(),
        example: z.unknown().optional(),
        envVar: z.string().optional(),
        mutable: z.boolean().optional(),
      })
    )
    .optional(),
  settings: z
    .object({
      priority: z.number().optional(),
      hotReloadable: z.boolean().optional(),
      sandboxed: z.boolean().optional(),
      maxMemory: z.number().optional(),
      maxExecutionTime: z.number().optional(),
    })
    .optional(),
})

/**
 * Plugin registry - handles discovery and metadata management
 */
export class PluginRegistry {
  private discoveredPlugins: Map<PluginId, PluginResolutionResult> = new Map()
  private manifestCache: Map<string, PluginManifest> = new Map()
  private searchPaths: string[] = []

  constructor(options: { searchPaths?: string[] } = {}) {
    this.searchPaths = options.searchPaths || this.getDefaultSearchPaths()
  }

  /**
   * Get default plugin search paths
   */
  private getDefaultSearchPaths(): string[] {
    return [
      path.join(process.cwd(), '.nikcli', 'plugins'),
      path.join(process.env.HOME || '~', '.config', 'nikcli', 'plugins'),
    ]
  }

  /**
   * Add a search path
   */
  addSearchPath(searchPath: string): void {
    if (!this.searchPaths.includes(searchPath)) {
      this.searchPaths.push(searchPath)
    }
  }

  /**
   * Get all search paths
   */
  getSearchPaths(): string[] {
    return [...this.searchPaths]
  }

  /**
   * Discover plugins in configured search paths
   */
  async discoverPlugins(options: PluginDiscoveryOptions = {}): Promise<PluginResolutionResult[]> {
    const results: PluginResolutionResult[] = []
    const searchPaths = options.searchPaths || this.searchPaths
    const processedPaths = new Set<string>()

    for (const searchPath of searchPaths) {
      if (!fs.existsSync(searchPath)) continue

      const entries = await this.scanDirectory(searchPath, options.maxDepth || 2, processedPaths)

      for (const entry of entries) {
        const result = await this.resolvePlugin(entry, options)
        if (result && result.valid) {
          results.push(result)
          this.discoveredPlugins.set(result.id, result)
        }
      }
    }

    return results
  }

  /**
   * Scan a directory for plugins
   */
  private async scanDirectory(dir: string, maxDepth: number, processedPaths: Set<string>): Promise<string[]> {
    if (maxDepth <= 0 || processedPaths.has(dir)) return []

    processedPaths.add(dir)

    const results: string[] = []
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Check if this directory contains a plugin
        const manifestPath = path.join(fullPath, MANIFEST_FILE)
        if (fs.existsSync(manifestPath)) {
          results.push(fullPath)
        } else if (maxDepth > 1) {
          // Recurse into subdirectories
          const subResults = await this.scanDirectory(fullPath, maxDepth - 1, processedPaths)
          results.push(...subResults)
        }
      }
    }

    return results
  }

  /**
   * Resolve a plugin from a path
   */
  async resolvePlugin(
    pluginPath: string,
    _options: PluginDiscoveryOptions = {}
  ): Promise<PluginResolutionResult | null> {
    try {
      const manifestPath = path.join(pluginPath, MANIFEST_FILE)

      if (!fs.existsSync(manifestPath)) {
        return {
          path: pluginPath,
          id: path.basename(pluginPath),
          source: 'local',
          valid: false,
          validationErrors: ['Manifest file not found'],
        }
      }

      const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent)

      // Validate manifest
      const parseResult = PluginManifestSchema.safeParse(manifest)
      if (!parseResult.success) {
        return {
          path: pluginPath,
          id: manifest.metadata?.id || path.basename(pluginPath),
          source: 'local',
          valid: false,
          validationErrors: parseResult.error.errors.map((e) => {
            const path = e.path.join('.')
            return `${path}: ${e.message}`
          }),
        }
      }

      // Cache the manifest
      this.manifestCache.set(pluginPath, parseResult.data as any)

      return {
        path: pluginPath,
        id: parseResult.data.metadata.id,
        source: 'local',
        valid: true,
      }
    } catch (error) {
      return {
        path: pluginPath,
        id: path.basename(pluginPath),
        source: 'local',
        valid: false,
        validationErrors: [`Failed to parse manifest: ${(error as Error).message}`],
      }
    }
  }

  /**
   * Load and validate a plugin manifest
   */
  async loadManifest(pluginPath: string): Promise<PluginManifest | null> {
    // Check cache first
    if (this.manifestCache.has(pluginPath)) {
      return this.manifestCache.get(pluginPath)!
    }

    // Try to resolve the plugin first
    const resolution = await this.resolvePlugin(pluginPath)
    if (!resolution || !resolution.valid) {
      return null
    }

    return this.manifestCache.get(pluginPath) || null
  }

  /**
   * Get plugin metadata by ID
   */
  getPluginMetadata(pluginId: PluginId): PluginMetadata | null {
    for (const [, result] of this.discoveredPlugins) {
      if (result.id === pluginId) {
        const manifest = this.manifestCache.get(result.path)
        return manifest?.metadata || null
      }
    }
    return null
  }

  /**
   * Get all discovered plugins
   */
  getDiscoveredPlugins(): PluginResolutionResult[] {
    return Array.from(this.discoveredPlugins.values())
  }

  /**
   * Check if a plugin is discovered
   */
  isDiscovered(pluginId: PluginId): boolean {
    return this.discoveredPlugins.has(pluginId)
  }

  /**
   * Clear the registry cache
   */
  clearCache(): void {
    this.manifestCache.clear()
  }

  /**
   * Clear all discovered plugins
   */
  clear(): void {
    this.discoveredPlugins.clear()
    this.manifestCache.clear()
  }
}

/**
 * Create a default plugin registry
 */
export function createPluginRegistry(searchPaths?: string[]): PluginRegistry {
  return new PluginRegistry({ searchPaths })
}
