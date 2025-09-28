/**
 * Figma Design API Provider
 *
 * Enterprise-grade Figma API integration provider that handles:
 * - REST API client configuration and authentication
 * - File and project management operations
 * - Design token extraction and processing
 * - Export operations with multiple format support
 * - Service initialization and configuration management
 * - Error handling and retry logic
 */

import axios, { type AxiosInstance } from 'axios'
import chalk from 'chalk'

// ==================== TYPES & INTERFACES ====================

export interface FigmaConfig {
  apiToken: string
  v0ApiKey?: string
  timeout?: number
  retryAttempts?: number
  rateLimitDelay?: number
}

export interface FigmaFileInfo {
  key: string
  name: string
  last_modified: string
  thumbnail_url: string
  version: string
  role: string
  document?: FigmaDocument
  components?: Record<string, FigmaComponent>
  styles?: Record<string, FigmaStyle>
}

export interface FigmaDocument {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  absoluteBoundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
  backgroundColor?: FigmaColor
  fills?: FigmaFill[]
  strokes?: FigmaStroke[]
  effects?: FigmaEffect[]
  style?: FigmaTextStyle
}

export interface FigmaComponent {
  key: string
  name: string
  description: string
  componentSetId?: string
  documentationLinks: Array<{
    uri: string
  }>
}

export interface FigmaStyle {
  key: string
  name: string
  description: string
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID'
}

export interface FigmaColor {
  r: number
  g: number
  b: number
  a?: number
}

export interface FigmaFill {
  type: string
  color?: FigmaColor
  gradientStops?: Array<{
    position: number
    color: FigmaColor
  }>
}

export interface FigmaStroke {
  type: string
  color: FigmaColor
}

export interface FigmaEffect {
  type: string
  color?: FigmaColor
  offset?: { x: number; y: number }
  radius?: number
}

export interface FigmaTextStyle {
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
}

export interface FigmaExportSettings {
  format: 'png' | 'jpg' | 'svg' | 'pdf'
  scale?: number
  suffix?: string
  constraint?: {
    type: 'SCALE' | 'WIDTH' | 'HEIGHT'
    value: number
  }
}

export interface FigmaExportResult {
  id: string
  url: string
  error?: string
}

export interface DesignTokens {
  colors: Array<{
    name: string
    value: string
    type: 'color'
    description?: string
  }>
  typography: Array<{
    name: string
    fontFamily: string
    fontSize: number
    fontWeight: number
    lineHeight?: number
    letterSpacing?: number
    type: 'typography'
  }>
  spacing: Array<{
    name: string
    value: string
    type: 'spacing'
  }>
  shadows: Array<{
    name: string
    value: string
    type: 'shadow'
  }>
}

// ==================== FIGMA PROVIDER CLASS ====================

export class FigmaProvider {
  private apiClient: AxiosInstance
  private config: FigmaConfig
  private isInitialized = false

  constructor(config: FigmaConfig) {
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      rateLimitDelay: 1000,
      ...config,
    }

    this.apiClient = axios.create({
      baseURL: 'https://api.figma.com/v1',
      timeout: this.config.timeout,
      headers: {
        'X-Figma-Token': this.config.apiToken,
        'Content-Type': 'application/json',
      },
    })

    this.setupInterceptors()
    this.isInitialized = true
  }

  private setupInterceptors(): void {
    // Request interceptor for logging
    this.apiClient.interceptors.request.use(
      (config) => {
        console.log(chalk.gray(`🔄 Figma API: ${config.method?.toUpperCase()} ${config.url}`))
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor for error handling and retries
    this.apiClient.interceptors.response.use(
      (response) => {
        console.log(chalk.green(`✅ Figma API: ${response.status} ${response.statusText}`))
        return response
      },
      async (error) => {
        if (error.response?.status === 429) {
          console.log(chalk.yellow('⚠️ Rate limit hit, waiting...'))
          await this.sleep(this.config.rateLimitDelay!)
          return this.apiClient.request(error.config)
        }

        console.log(chalk.red(`❌ Figma API Error: ${error.response?.status} ${error.message}`))
        return Promise.reject(error)
      }
    )
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // ==================== PUBLIC API METHODS ====================

  /**
   * Get file information and document structure
   */
  async getFileInfo(fileId: string): Promise<FigmaFileInfo> {
    if (!this.isInitialized) {
      throw new Error('Figma provider not initialized')
    }

    try {
      const response = await this.apiClient.get(`/files/${fileId}`)
      return response.data.document ? response.data : { ...response.data, document: response.data.document }
    } catch (error: any) {
      throw new Error(`Failed to get file info: ${error.response?.data?.message || error.message}`)
    }
  }

  /**
   * Export nodes as images or other formats
   */
  async exportNodes(fileId: string, nodeIds: string[], settings: FigmaExportSettings): Promise<FigmaExportResult[]> {
    if (!this.isInitialized) {
      throw new Error('Figma provider not initialized')
    }

    try {
      const params = new URLSearchParams({
        ids: nodeIds.join(','),
        format: settings.format,
        scale: (settings.scale || 1).toString(),
      })

      if (settings.suffix) {
        params.append('suffix', settings.suffix)
      }

      const response = await this.apiClient.get(`/images/${fileId}?${params.toString()}`)

      if (response.data.err) {
        throw new Error(response.data.err)
      }

      return Object.entries(response.data.images || {}).map(([id, url]) => ({
        id,
        url: url as string,
      }))
    } catch (error: any) {
      throw new Error(`Failed to export nodes: ${error.response?.data?.message || error.message}`)
    }
  }

  /**
   * Extract design tokens from a Figma file
   */
  async extractDesignTokens(fileId: string): Promise<DesignTokens> {
    if (!this.isInitialized) {
      throw new Error('Figma provider not initialized')
    }

    try {
      const fileInfo = await this.getFileInfo(fileId)
      const tokens: DesignTokens = {
        colors: [],
        typography: [],
        spacing: [],
        shadows: [],
      }

      // Extract color tokens from styles
      if (fileInfo.styles) {
        for (const [_styleId, style] of Object.entries(fileInfo.styles)) {
          if (style.styleType === 'FILL') {
            tokens.colors.push({
              name: style.name.replace(/\//g, '-').toLowerCase(),
              value: '#000000', // Would need to extract actual color value
              type: 'color',
              description: style.description,
            })
          } else if (style.styleType === 'TEXT') {
            tokens.typography.push({
              name: style.name.replace(/\//g, '-').toLowerCase(),
              fontFamily: 'Inter', // Would need to extract actual font
              fontSize: 16, // Would need to extract actual size
              fontWeight: 400, // Would need to extract actual weight
              type: 'typography',
            })
          }
        }
      }

      // Recursively extract tokens from document nodes
      if (fileInfo.document?.children) {
        this.extractTokensFromNodes(fileInfo.document.children, tokens)
      }

      return tokens
    } catch (error: any) {
      throw new Error(`Failed to extract design tokens: ${error.response?.data?.message || error.message}`)
    }
  }

  private extractTokensFromNodes(nodes: FigmaNode[], tokens: DesignTokens): void {
    for (const node of nodes) {
      // Extract color tokens from fills
      if (node.fills) {
        for (const fill of node.fills) {
          if (fill.type === 'SOLID' && fill.color) {
            const color = fill.color
            const hex = this.rgbToHex(color.r * 255, color.g * 255, color.b * 255)
            tokens.colors.push({
              name: node.name.replace(/\s+/g, '-').toLowerCase(),
              value: hex,
              type: 'color',
            })
          }
        }
      }

      // Extract typography tokens
      if (node.style) {
        tokens.typography.push({
          name: node.name.replace(/\s+/g, '-').toLowerCase(),
          fontFamily: node.style.fontFamily || 'Inter',
          fontSize: node.style.fontSize || 16,
          fontWeight: node.style.fontWeight || 400,
          lineHeight: node.style.lineHeight,
          letterSpacing: node.style.letterSpacing,
          type: 'typography',
        })
      }

      // Extract shadow tokens from effects
      if (node.effects) {
        for (const effect of node.effects) {
          if (effect.type === 'DROP_SHADOW' && effect.color && effect.offset && effect.radius) {
            const color = effect.color
            const rgba = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${color.a || 1})`
            tokens.shadows.push({
              name: node.name.replace(/\s+/g, '-').toLowerCase(),
              value: `${effect.offset.x}px ${effect.offset.y}px ${effect.radius}px ${rgba}`,
              type: 'shadow',
            })
          }
        }
      }

      // Recursively process children
      if (node.children) {
        this.extractTokensFromNodes(node.children, tokens)
      }
    }
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((x) => {
          const hex = Math.round(x).toString(16)
          return hex.length === 1 ? '0' + hex : hex
        })
        .join('')
    )
  }

  /**
   * Get components from a file
   */
  async getComponents(fileId: string): Promise<Record<string, FigmaComponent>> {
    const fileInfo = await this.getFileInfo(fileId)
    return fileInfo.components || {}
  }

  /**
   * Get styles from a file
   */
  async getStyles(fileId: string): Promise<Record<string, FigmaStyle>> {
    const fileInfo = await this.getFileInfo(fileId)
    return fileInfo.styles || {}
  }

  /**
   * Check if provider is properly configured
   */
  isConfigured(): boolean {
    return this.isInitialized && !!this.config.apiToken
  }

  /**
   * Get current configuration status
   */
  getConfigStatus(): {
    apiToken: boolean
    v0ApiKey: boolean
    initialized: boolean
  } {
    return {
      apiToken: !!this.config.apiToken,
      v0ApiKey: !!this.config.v0ApiKey,
      initialized: this.isInitialized,
    }
  }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Create Figma provider instance
 */
export function createFigmaProvider(): FigmaProvider | null {
  const apiToken = process.env.FIGMA_API_TOKEN

  if (!apiToken) {
    console.log(chalk.yellow('⚠️ FIGMA_API_TOKEN not configured'))
    return null
  }

  const config: FigmaConfig = {
    apiToken,
    v0ApiKey: process.env.V0_API_KEY,
    timeout: 30000,
    retryAttempts: 3,
    rateLimitDelay: 1000,
  }

  return new FigmaProvider(config)
}

/**
 * Check if Figma is configured
 */
export function isFigmaProviderConfigured(): boolean {
  return !!process.env.FIGMA_API_TOKEN
}

/**
 * Extract file ID from Figma URL
 */
export function extractFileIdFromUrl(url: string): string | null {
  const patterns = [
    /\/file\/([a-zA-Z0-9_-]+)/, // Legacy format: /file/ID
    /\/design\/([a-zA-Z0-9_-]+)/, // New format: /design/ID
    /\/proto\/([a-zA-Z0-9_-]+)/, // Prototype format: /proto/ID
    /figma\.com\/([a-zA-Z0-9_-]+)/, // Direct ID after domain
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}

// ==================== SINGLETON INSTANCE ====================

let figmaProviderInstance: FigmaProvider | null = null

/**
 * Get singleton Figma provider instance
 */
export function getFigmaProvider(): FigmaProvider | null {
  if (!figmaProviderInstance && isFigmaProviderConfigured()) {
    figmaProviderInstance = createFigmaProvider()
  }
  return figmaProviderInstance
}

/**
 * Reset provider instance (for testing or reconfiguration)
 */
export function resetFigmaProvider(): void {
  figmaProviderInstance = null
}
