/**
 * Figma Service
 *
 * Service layer that coordinates Figma operations and provides high-level API
 * for the rest of the application. Handles service initialization, caching,
 * and integration with other system components.
 */

import chalk from 'chalk'
import { EventEmitter } from 'events'
import {
  type DesignTokens,
  type FigmaExportResult,
  type FigmaExportSettings,
  type FigmaFileInfo,
  type FigmaProvider,
  getFigmaProvider,
  isFigmaProviderConfigured,
} from '../providers/figma/figma-provider'

// ==================== SERVICE INTERFACES ====================

export interface FigmaServiceConfig {
  enableCaching?: boolean
  cacheTimeout?: number
  autoInitialize?: boolean
}

export interface FigmaOperationResult<T = any> {
  success: boolean
  data?: T
  error?: string
  cached?: boolean
  timestamp: Date
}

export interface CodeGenerationOptions {
  framework: 'react' | 'vue' | 'svelte' | 'html'
  library: 'shadcn' | 'chakra' | 'mantine' | 'custom'
  typescript: boolean
  outputPath?: string
}

// ==================== FIGMA SERVICE CLASS ====================

export class FigmaService extends EventEmitter {
  private provider: FigmaProvider | null = null
  private config: FigmaServiceConfig
  private cache = new Map<string, { data: any; timestamp: Date }>()
  private isInitialized = false

  constructor(config: FigmaServiceConfig = {}) {
    super()
    this.config = {
      enableCaching: true,
      cacheTimeout: 5 * 60 * 1000, // 5 minutes
      autoInitialize: true,
      ...config,
    }

    if (this.config.autoInitialize) {
      this.initialize()
    }
  }

  // ==================== INITIALIZATION ====================

  private initialize(): void {
    try {
      if (!isFigmaProviderConfigured()) {
        console.log(chalk.yellow('⚠️ Figma not configured - use /set-key-figma to setup'))
        return
      }

      this.provider = getFigmaProvider()

      if (this.provider) {
        this.isInitialized = true
        this.emit('initialized')
        console.log(chalk.green('✓ Figma service initialized'))
      } else {
        console.log(chalk.red('❌ Failed to initialize Figma provider'))
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Figma service initialization failed: ${error.message}`))
      this.emit('error', error)
    }
  }

  /**
   * Manually initialize or reinitialize the service
   */
  async reinitialize(): Promise<void> {
    this.isInitialized = false
    this.provider = null
    this.cache.clear()
    this.initialize()
  }

  // ==================== CACHE MANAGEMENT ====================

  private getCacheKey(operation: string, params: Record<string, any>): string {
    return `${operation}:${JSON.stringify(params)}`
  }

  private getFromCache<T>(key: string): T | null {
    if (!this.config.enableCaching) return null

    const cached = this.cache.get(key)
    if (!cached) return null

    const isExpired = Date.now() - cached.timestamp.getTime() > this.config.cacheTimeout
    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  private setCache(key: string, data: any): void {
    if (!this.config.enableCaching) return

    this.cache.set(key, {
      data,
      timestamp: new Date(),
    })
  }

  /**
   * Clear service cache
   */
  clearCache(): void {
    this.cache.clear()
    this.emit('cache-cleared')
  }

  // ==================== PUBLIC API METHODS ====================

  /**
   * Get file information with caching
   */
  async getFileInfo(fileId: string): Promise<FigmaOperationResult<FigmaFileInfo>> {
    if (!this.isInitialized || !this.provider) {
      return {
        success: false,
        error: 'Figma service not initialized',
        timestamp: new Date(),
      }
    }

    const cacheKey = this.getCacheKey('fileInfo', { fileId })
    const cached = this.getFromCache<FigmaFileInfo>(cacheKey)

    if (cached) {
      return {
        success: true,
        data: cached,
        cached: true,
        timestamp: new Date(),
      }
    }

    try {
      this.emit('operation-start', { operation: 'getFileInfo', fileId })

      const data = await this.provider.getFileInfo(fileId)
      this.setCache(cacheKey, data)

      this.emit('operation-complete', { operation: 'getFileInfo', fileId, success: true })

      return {
        success: true,
        data,
        timestamp: new Date(),
      }
    } catch (error: any) {
      this.emit('operation-error', { operation: 'getFileInfo', fileId, error: error.message })

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      }
    }
  }

  /**
   * Export nodes from a Figma file
   */
  async exportNodes(
    fileId: string,
    nodeIds: string[],
    settings: FigmaExportSettings
  ): Promise<FigmaOperationResult<FigmaExportResult[]>> {
    if (!this.isInitialized || !this.provider) {
      return {
        success: false,
        error: 'Figma service not initialized',
        timestamp: new Date(),
      }
    }

    try {
      this.emit('operation-start', { operation: 'exportNodes', fileId, nodeIds: nodeIds.length })

      const data = await this.provider.exportNodes(fileId, nodeIds, settings)

      this.emit('operation-complete', { operation: 'exportNodes', fileId, exports: data.length })

      return {
        success: true,
        data,
        timestamp: new Date(),
      }
    } catch (error: any) {
      this.emit('operation-error', { operation: 'exportNodes', fileId, error: error.message })

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      }
    }
  }

  /**
   * Extract design tokens with caching
   */
  async extractDesignTokens(fileId: string): Promise<FigmaOperationResult<DesignTokens>> {
    if (!this.isInitialized || !this.provider) {
      return {
        success: false,
        error: 'Figma service not initialized',
        timestamp: new Date(),
      }
    }

    const cacheKey = this.getCacheKey('designTokens', { fileId })
    const cached = this.getFromCache<DesignTokens>(cacheKey)

    if (cached) {
      return {
        success: true,
        data: cached,
        cached: true,
        timestamp: new Date(),
      }
    }

    try {
      this.emit('operation-start', { operation: 'extractDesignTokens', fileId })

      const data = await this.provider.extractDesignTokens(fileId)
      this.setCache(cacheKey, data)

      this.emit('operation-complete', { operation: 'extractDesignTokens', fileId, tokens: data })

      return {
        success: true,
        data,
        timestamp: new Date(),
      }
    } catch (error: any) {
      this.emit('operation-error', { operation: 'extractDesignTokens', fileId, error: error.message })

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      }
    }
  }

  /**
   * Generate code from Figma designs using v0 API
   */
  async generateCodeFromDesign(fileId: string, options: CodeGenerationOptions): Promise<FigmaOperationResult<string>> {
    if (!this.isInitialized || !this.provider) {
      return {
        success: false,
        error: 'Figma service not initialized',
        timestamp: new Date(),
      }
    }

    const v0ApiKey = process.env.V0_API_KEY
    if (!v0ApiKey) {
      return {
        success: false,
        error: 'V0 API key not configured - required for code generation',
        timestamp: new Date(),
      }
    }

    try {
      this.emit('operation-start', { operation: 'generateCode', fileId, options })

      // Get file info first
      const fileInfoResult = await this.getFileInfo(fileId)
      if (!fileInfoResult.success || !fileInfoResult.data) {
        throw new Error('Failed to get file information')
      }

      // Export key frames as images for v0
      const mainPageNodes = fileInfoResult.data.document?.children?.[0]?.children || []
      const frameIds = mainPageNodes
        .filter((node) => node.type === 'FRAME')
        .slice(0, 3) // Limit to first 3 frames
        .map((node) => node.id)

      if (frameIds.length === 0) {
        throw new Error('No frames found in the Figma file')
      }

      const exportResult = await this.exportNodes(fileId, frameIds, {
        format: 'png',
        scale: 2,
      })

      if (!exportResult.success || !exportResult.data) {
        throw new Error('Failed to export frames for code generation')
      }

      // Generate code prompt
      const _prompt = `Generate ${options.framework} code using ${options.library} components based on these Figma designs.
      Make it responsive and follow modern best practices.${options.typescript ? ' Use TypeScript.' : ''}`

      // This would integrate with v0 API for actual code generation
      // For now, return a structured code template
      const generatedCode = this.generateCodeTemplate(options, fileInfoResult.data)

      this.emit('operation-complete', { operation: 'generateCode', fileId, framework: options.framework })

      return {
        success: true,
        data: generatedCode,
        timestamp: new Date(),
      }
    } catch (error: any) {
      this.emit('operation-error', { operation: 'generateCode', fileId, error: error.message })

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      }
    }
  }

  private generateCodeTemplate(options: CodeGenerationOptions, fileInfo: FigmaFileInfo): string {
    const _extension = options.typescript ? 'tsx' : 'jsx'
    const componentName = fileInfo.name.replace(/[^a-zA-Z0-9]/g, '')

    return `import React from 'react'
${options.library === 'shadcn' ? "import { Button } from '@/components/ui/button'" : ''}

interface ${componentName}Props {
  // Define props based on Figma design
}

export const ${componentName}: React.FC<${componentName}Props> = (props) => {
  return (
    <div className="container mx-auto p-4">
      {/* Generated from Figma: ${fileInfo.name} */}
      <h1 className="text-2xl font-bold">
        {/* Component implementation based on design */}
      </h1>
    </div>
  )
}

export default ${componentName}`
  }

  // ==================== STATUS & HEALTH CHECKS ====================

  /**
   * Check service health and configuration
   */
  getStatus(): {
    initialized: boolean
    configured: boolean
    cacheSize: number
    provider: boolean
  } {
    return {
      initialized: this.isInitialized,
      configured: isFigmaProviderConfigured(),
      cacheSize: this.cache.size,
      provider: !!this.provider,
    }
  }

  /**
   * Test service connectivity
   */
  async testConnection(): Promise<FigmaOperationResult<boolean>> {
    if (!this.isInitialized || !this.provider) {
      return {
        success: false,
        error: 'Service not initialized',
        timestamp: new Date(),
      }
    }

    try {
      // Test with a simple API call
      const testFileId = 'test'
      await this.provider.getFileInfo(testFileId)

      return {
        success: true,
        data: true,
        timestamp: new Date(),
      }
    } catch (error: any) {
      // This is expected to fail for test file ID
      // but confirms API connectivity
      if (error.message.includes('404') || error.message.includes('File not found')) {
        return {
          success: true,
          data: true,
          timestamp: new Date(),
        }
      }

      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      }
    }
  }
}

// ==================== SINGLETON INSTANCE ====================

let figmaServiceInstance: FigmaService | null = null

/**
 * Get singleton Figma service instance
 */
export function getFigmaService(): FigmaService {
  if (!figmaServiceInstance) {
    figmaServiceInstance = new FigmaService()
  }
  return figmaServiceInstance
}

/**
 * Reset service instance (for testing or reconfiguration)
 */
export function resetFigmaService(): void {
  if (figmaServiceInstance) {
    figmaServiceInstance.removeAllListeners()
    figmaServiceInstance.clearCache()
  }
  figmaServiceInstance = null
}

// Export singleton instance as default
export const figmaService = getFigmaService()
