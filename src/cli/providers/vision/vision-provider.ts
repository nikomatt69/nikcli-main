import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { type CoreMessage, generateObject, LanguageModelV1 } from 'ai'
import chalk from 'chalk'
import { z } from 'zod'
import { simpleConfigManager } from '../../core/config-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { redisProvider } from '../redis/redis-provider'

export interface VisionAnalysisResult {
  description: string
  objects: string[]
  text: string
  emotions: string[]
  colors: string[]
  composition: string
  technical_quality: string
  confidence: number
  metadata: {
    model_used: string
    processing_time_ms: number
    file_size_bytes: number
    image_dimensions?: {
      width: number
      height: number
    }
  }
}

export interface VisionConfig {
  enabled: boolean
  default_provider: 'claude' | 'openai' | 'google' | 'openrouter' | 'sam3'
  fallback_providers: ('claude' | 'openai' | 'google' | 'openrouter' | 'sam3')[]
  cache_enabled: boolean
  cache_ttl: number // seconds
  max_file_size_mb: number
  supported_formats: string[]
  quality: 'low' | 'auto' | 'high'
}

/**
 * Vision Provider - Multimodal AI image analysis
 * Supports Claude 4 Vision, GPT-4V, and Gemini Pro Vision
 */
export class VisionProvider extends EventEmitter {
  private config: VisionConfig

  constructor() {
    super()

    this.config = {
      enabled: true,
      default_provider: 'claude',
      fallback_providers: ['openrouter', 'openai', 'google'],
      cache_enabled: true,
      cache_ttl: 3600, // 1 hour
      max_file_size_mb: 20,
      supported_formats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
      quality: 'auto',
    }

    advancedUI.logFunctionCall('visionproviderinit')
    advancedUI.logFunctionUpdate('success', 'Vision Provider initialized', '✓')
  }

  /**
   * Analyze an image using AI vision models
   */
  async analyzeImage(
    imagePath: string,
    options: {
      provider?: 'claude' | 'openai' | 'google' | 'openrouter' | 'sam3'
      prompt?: string
      cache?: boolean
    } = {}
  ): Promise<VisionAnalysisResult> {
    if (!this.config.enabled) {
      throw new Error('Vision Provider is disabled')
    }

    const startTime = Date.now()
    const provider = options.provider || this.config.default_provider

    try {
      console.log(chalk.blue(`🔍 Analyzing image with ${provider.toUpperCase()}...`))

      // Validate image file
      const fullPath = resolve(imagePath)
      if (!existsSync(fullPath)) {
        throw new Error(`Image file not found: ${imagePath}`)
      }

      const { imageData, metadata } = this.prepareImage(fullPath)

      // Check cache first
      const cacheKey = `vision:${provider}:${this.generateCacheKey(imageData, options.prompt)}`
      if (options.cache !== false && this.config.cache_enabled) {
        const cached = await this.getCachedResult(cacheKey)
        if (cached) {
          console.log(chalk.green('📦 Using cached analysis result'))
          return cached
        }
      }

      // Perform analysis with fallback support
      let result: VisionAnalysisResult | undefined
      const providersToTry = [provider, ...this.config.fallback_providers].filter((p, idx, arr) => arr.indexOf(p) === idx)

      let lastError: Error | null = null
      for (const currentProvider of providersToTry) {
        try {
          switch (currentProvider) {
            case 'claude':
              result = await this.analyzeWithClaude(imageData, options.prompt, metadata)
              break
            case 'openai':
              result = await this.analyzeWithOpenAI(imageData, options.prompt, metadata)
              break
            case 'google':
              result = await this.analyzeWithGoogle(imageData, options.prompt, metadata)
              break
            case 'openrouter':
              result = await this.analyzeWithOpenRouter(imageData, options.prompt, metadata)
              break
            case 'sam3':
              result = await this.analyzeWithSam3(imageData, options.prompt, metadata)
              break
            default:
              throw new Error(`Unsupported vision provider: ${currentProvider}`)
          }

          if (currentProvider !== provider) {
            console.log(chalk.yellow(`⚠️ Used fallback provider: ${currentProvider.toUpperCase()}`))
          }
          break
        } catch (error: any) {
          lastError = error
          console.log(chalk.yellow(`⚠️ ${currentProvider.toUpperCase()} failed: ${error.message}`))
          if (currentProvider === providersToTry[providersToTry.length - 1]) {
            throw lastError || error
          }
          continue
        }
      }
      if (!result || !result?.metadata) {
        throw new Error('No result returned from vision provider')
      }
      result.metadata.processing_time_ms = Date.now() - startTime
      result.metadata.model_used = provider
      return result
    } catch (error: any) {
      console.log(chalk.red(`❌ Vision analysis failed: ${error.message}`))
      this.emit('analysis_failed', { provider, error, imagePath })
      throw error
    }
  }

  /**
   * Analyze image with Claude Vision
   */
  private async analyzeWithClaude(
    imageData: string,
    customPrompt?: string,
    metadata?: any
  ): Promise<VisionAnalysisResult> {
    const _currentModel = simpleConfigManager.get('currentModel')
    const apiKey =
      simpleConfigManager.getApiKey('claude-sonnet-4-20250514') || simpleConfigManager.getApiKey('anthropic')

    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Use /set-key anthropic <key>')
    }

    const anthropicProvider = createAnthropic({ apiKey })
    const model = anthropicProvider('claude-sonnet-4-20250514')

    const systemPrompt =
      customPrompt ||
      `Analyze this image in detail and provide a comprehensive analysis. Focus on:
1. Overall description of what you see
2. Objects and subjects present
3. Any text visible in the image
4. Emotional tone or mood
5. Color palette and visual composition
6. Technical quality assessment
7. Your confidence level in the analysis

Provide structured, detailed insights that would be useful for understanding the image content and context.`

    const result = await generateObject({
      model: model as any as LanguageModelV1,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'image',
              image: imageData,
            },
          ],
        },
      ] as CoreMessage[],
      schema: z.object({
        description: z.string().describe('Detailed description of the image'),
        objects: z.array(z.string()).describe('List of objects/subjects in the image'),
        text: z.string().describe('Any text visible in the image'),
        emotions: z.array(z.string()).describe('Emotional tone or mood conveyed'),
        colors: z.array(z.string()).describe('Dominant colors in the image'),
        composition: z.string().describe('Visual composition and layout analysis'),
        technical_quality: z.string().describe('Assessment of image quality and technical aspects'),
        confidence: z.number().min(0).max(1).describe('Confidence level in the analysis'),
      }),
    })

    return {
      ...(result.object as VisionAnalysisResult),
      metadata: {
        model_used: 'claude-sonnet-4-20250514',
        processing_time_ms: 0, // Will be set by caller
        file_size_bytes: metadata?.size || 0,
        image_dimensions: metadata?.dimensions,
      },
    }
  }

  /**
   * Analyze image with GPT-4V
   */
  private async analyzeWithOpenAI(
    imageData: string,
    customPrompt?: string,
    metadata?: any
  ): Promise<VisionAnalysisResult> {
    const apiKey = simpleConfigManager.getApiKey('gpt-4o') || simpleConfigManager.getApiKey('openai')

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Use /set-key openai <key>')
    }

    const openaiProvider = createOpenAI({ apiKey })
    const model = openaiProvider('gpt-4o')

    const systemPrompt =
      customPrompt ||
      `Analyze this image comprehensively and provide structured insights in the following areas:
- Detailed visual description
- Objects and subjects identification  
- Text extraction (if any)
- Emotional/mood assessment
- Color analysis
- Composition evaluation
- Technical quality review
- Analysis confidence level

Provide thorough, useful insights for understanding the image content and context.`

    const result = await generateObject({
      model: model as any,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'image',
              image: imageData,
            },
          ],
        },
      ] as CoreMessage[],
      schema: z.object({
        description: z.string().describe('Comprehensive description of the image'),
        objects: z.array(z.string()).describe('Objects and subjects present'),
        text: z.string().describe('Text content found in image'),
        emotions: z.array(z.string()).describe('Emotional content and mood'),
        colors: z.array(z.string()).describe('Primary colors identified'),
        composition: z.string().describe('Visual composition analysis'),
        technical_quality: z.string().describe('Technical quality assessment'),
        confidence: z.number().min(0).max(1).describe('Overall confidence score'),
      }),
    })

    return {
      ...(result.object as VisionAnalysisResult),
      metadata: {
        model_used: 'gpt-4o',
        processing_time_ms: 0,
        file_size_bytes: metadata?.size || 0,
        image_dimensions: metadata?.dimensions,
      },
    }
  }

  /**
   * Analyze image with OpenRouter vision models
   */
  private async analyzeWithOpenRouter(
    imageData: string,
    customPrompt?: string,
    metadata?: any,
    model?: string
  ): Promise<VisionAnalysisResult> {
    const apiKey = simpleConfigManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Use /set-key openrouter <key>')
    }

    // Available OpenRouter vision models
    const availableVisionModels = [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/gpt-5',
      'openai/gpt-5.1',
      'anthropic/claude-3-5-sonnet-20241022',
      'anthropic/claude-3-opus-20240229',
      'anthropic/claude-3-haiku-20240307',
      'anthropic/claude-haiku-4.5',
      'google/gemini-pro-vision',
      'google/gemini-1.5-pro',
      'google/gemini-1.5-flash',
      '@preset/nikcli',
      '@preset/nikcli-pro'
    ]

    // Use the current model if it supports vision, otherwise default to gpt-4o
    const currentModel = simpleConfigManager.get('currentModel')
    const selectedModel = model ||
      (availableVisionModels.includes(currentModel) ? currentModel : 'openai/gpt-5.1')

    const systemPrompt =
      customPrompt ||
      `Analyze this image comprehensively and provide structured insights covering:
1. Detailed visual description
2. Objects and subjects identification
3. Text extraction (if any)
4. Emotional/mood assessment
5. Color analysis
6. Composition evaluation
7. Technical quality review
8. Analysis confidence level

Provide thorough, useful insights for understanding the image content and context.`

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nikcli.ai',
        'X-Title': 'NikCLI',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: systemPrompt },
              {
                type: 'image_url',
                image_url: { url: imageData }
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) {
      const errorData: any = await response.json()
      throw new Error(`OpenRouter vision API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data: any = await response.json()
    const analysisText = data.choices?.[0]?.message?.content

    if (!analysisText) {
      throw new Error('No analysis returned from OpenRouter vision API')
    }

    // Parse the analysis text into structured format
    // This is a simplified parser - in production you'd want more robust parsing
    const result = this.parseAnalysisText(analysisText)

    return {
      ...result,
      metadata: {
        model_used: `openrouter-${selectedModel}`,
        processing_time_ms: 0,
        file_size_bytes: metadata?.size || 0,
        image_dimensions: metadata?.dimensions,
      },
    }
  }

  /**
   * Parse unstructured analysis text into structured format
   */
  private parseAnalysisText(text: string): Omit<VisionAnalysisResult, 'metadata'> {
    // This is a basic parser - could be improved with better regex/NLP
    const lines = text.split('\n').filter(line => line.trim())

    return {
      description: text.substring(0, 300) + (text.length > 300 ? '...' : ''),
      objects: this.extractListFromText(text, ['object', 'subject', 'item', 'element']),
      text: this.extractTextContent(text),
      emotions: this.extractListFromText(text, ['emotion', 'mood', 'feeling', 'atmosphere']),
      colors: this.extractListFromText(text, ['color', 'colours', 'hue', 'shade']),
      composition: this.extractComposition(text),
      technical_quality: this.extractTechnicalQuality(text),
      confidence: 0.85, // Default confidence for text parsing
    }
  }

  private extractListFromText(text: string, keywords: string[]): string[] {
    const items: string[] = []
    const lines = text.toLowerCase().split('\n')

    for (const line of lines) {
      if (keywords.some(keyword => line.includes(keyword))) {
        // Extract items from bullet points or comma-separated lists
        const matches = line.match(/[•\-*]\s*([^•\-*\n]+)|([a-zA-Z\s]+)(?:,|$)/g)
        if (matches) {
          items.push(...matches.map(m => m.replace(/[•\-*,]/g, '').trim()).filter(Boolean))
        }
      }
    }

    return [...new Set(items)].slice(0, 10) // Remove duplicates, limit to 10
  }

  private extractTextContent(text: string): string {
    const textMatch = text.match(/text[^:]*:([^\.]+)/i)
    return textMatch ? textMatch[1].trim() : ''
  }

  private extractComposition(text: string): string {
    const compMatch = text.match(/composition[^:]*:([^\.]+)/i)
    return compMatch ? compMatch[1].trim() : 'Standard composition analysis'
  }

  private extractTechnicalQuality(text: string): string {
    const qualityMatch = text.match(/quality[^:]*:([^\.]+)/i)
    return qualityMatch ? qualityMatch[1].trim() : 'Good technical quality'
  }

  /**
   * Analyze image with SAM3 custom endpoint (OpenAI-compatible-ish)
   */
  private async analyzeWithSam3(
    imageData: string,
    customPrompt?: string,
    metadata?: any
  ): Promise<VisionAnalysisResult> {
    const baseURL = process.env.SAM3_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL
    const apiKey = process.env.SAM3_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY

    if (!baseURL) {
      throw new Error('SAM3_BASE_URL not configured')
    }
    if (!apiKey) {
      throw new Error('SAM3_API_KEY not configured')
    }

    const systemPrompt =
      customPrompt ||
      'Esegui la segmentazione dell’immagine e descrivi brevemente cosa è stato rilevato. Ritorna le maschere e le bbox.'

    const response = await fetch(`${baseURL.replace(/\/$/, '')}/v1/images/segment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sam3',
        image: { data: imageData },
        prompt: systemPrompt,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`SAM3 API error: ${response.status} ${errText}`)
    }

    const data: any = await response.json()
    const masks = Array.isArray(data?.data) ? data.data : []

    const objects = masks.map((m: any, idx: number) => {
      const bbox = Array.isArray(m?.bbox) ? m.bbox.map((v: any) => Number(v).toFixed(1)).join(',') : 'n/a'
      return `mask-${idx} bbox(${bbox}) score=${(m?.score ?? 0).toFixed(3)}`
    })

    return {
      description: `SAM3 ha rilevato ${masks.length} maschere`,
      objects,
      text: '',
      emotions: [],
      colors: [],
      composition: 'Segmentazione oggetti',
      technical_quality: 'N/A (segmentazione)',
      confidence: masks.length > 0 ? Math.min(1, Math.max(0, masks[0]?.score ?? 0.8)) : 0.5,
      metadata: {
        model_used: 'sam3',
        processing_time_ms: 0,
        file_size_bytes: metadata?.size || 0,
        image_dimensions: metadata?.dimensions,
      },
    }
  }

  /**
   * Analyze image with Google Gemini Pro Vision
   */
  private async analyzeWithGoogle(
    imageData: string,
    customPrompt?: string,
    metadata?: any
  ): Promise<VisionAnalysisResult> {
    const apiKey = simpleConfigManager.getApiKey('gemini-1.5-pro') || simpleConfigManager.getApiKey('google')

    if (!apiKey) {
      throw new Error('Google AI API key not configured. Use /set-key google <key>')
    }

    const googleProvider = createGoogleGenerativeAI({ apiKey })
    const model = googleProvider('gemini-1.5-pro')

    const systemPrompt =
      customPrompt ||
      `Provide a comprehensive analysis of this image covering:
1. Visual description and main content
2. Objects, people, and subjects present
3. Any visible text or writing
4. Emotional tone and atmosphere
5. Color scheme and visual elements
6. Composition and artistic elements
7. Technical aspects and quality
8. Your confidence in this analysis

Deliver detailed, structured insights for complete image understanding.`

    const result = await generateObject({
      model: model as any,
      messages: [
        { role: 'user', content: systemPrompt },
        { role: 'user', content: imageData },
      ],
      schema: z.object({
        description: z.string().describe('Complete image description'),
        objects: z.array(z.string()).describe('Identified objects and subjects'),
        text: z.string().describe('Extracted text content'),
        emotions: z.array(z.string()).describe('Emotional and mood elements'),
        colors: z.array(z.string()).describe('Key colors present'),
        composition: z.string().describe('Composition and visual structure'),
        technical_quality: z.string().describe('Quality and technical evaluation'),
        confidence: z.number().min(0).max(1).describe('Confidence level'),
      }),
    })

    return {
      ...(result.object as VisionAnalysisResult),
      metadata: {
        model_used: 'gemini-1.5-pro',
        processing_time_ms: 0,
        file_size_bytes: metadata?.size || 0,
        image_dimensions: metadata?.dimensions,
      },
    }
  }

  /**
   * Prepare image for analysis
   */
  private prepareImage(filePath: string): { imageData: string; metadata: any } {
    try {
      const imageBuffer = readFileSync(filePath)
      const stats = require('node:fs').statSync(filePath)

      // Check file size
      const fileSizeMB = stats.size / (1024 * 1024)
      if (fileSizeMB > this.config.max_file_size_mb) {
        throw new Error(`Image file too large: ${fileSizeMB.toFixed(1)}MB (max: ${this.config.max_file_size_mb}MB)`)
      }

      // Check format
      const ext = filePath.split('.').pop()?.toLowerCase()
      if (!ext || !this.config.supported_formats.includes(ext)) {
        throw new Error(`Unsupported image format: ${ext}. Supported: ${this.config.supported_formats.join(', ')}`)
      }

      // Convert to base64
      const mimeType = this.getMimeType(ext)
      const imageData = `data:${mimeType};base64,${imageBuffer.toString('base64')}`

      return {
        imageData,
        metadata: {
          size: stats.size,
          format: ext,
          mimeType,
        },
      }
    } catch (error: any) {
      throw new Error(`Failed to prepare image: ${error.message}`)
    }
  }

  /**
   * Get MIME type for image format
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    return mimeTypes[extension] || 'image/jpeg'
  }

  /**
   * Generate cache key for analysis
   */
  private generateCacheKey(imageData: string, prompt?: string): string {
    const crypto = require('node:crypto')
    const hash = crypto.createHash('sha256')
    hash.update(imageData)
    if (prompt) hash.update(prompt)
    return hash.digest('hex').substring(0, 16)
  }

  /**
   * Get cached analysis result
   */
  private async getCachedResult(cacheKey: string): Promise<VisionAnalysisResult | null> {
    try {
      if (!redisProvider.isHealthy()) return null

      const cached = await redisProvider.get<VisionAnalysisResult>(cacheKey)
      return cached ? cached.value : null
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Cache read failed, proceeding with analysis'))
      return null
    }
  }

  /**
   * Cache analysis result
   */
  private async cacheResult(cacheKey: string, result: VisionAnalysisResult): Promise<void> {
    try {
      if (!redisProvider.isHealthy()) return

      await redisProvider.set(cacheKey, result, this.config.cache_ttl, { type: 'vision_analysis' })
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Failed to cache result'))
    }
  }

  /**
   * Determine the best provider based on current model
   */
  getProviderFromCurrentModel(): 'claude' | 'openai' | 'google' | 'openrouter' | null {
    const currentModel = simpleConfigManager.get('currentModel')

    if (!currentModel) return null

    // Map model names to providers
    if (currentModel.includes('claude') || currentModel.includes('anthropic')) {
      return 'claude'
    }
    if (currentModel.includes('gpt') || currentModel.includes('dall-e') || currentModel.includes('openai')) {
      return 'openai'
    }
    if (currentModel.includes('gemini') || currentModel.includes('google')) {
      return 'google'
    }
    if (currentModel.includes('openrouter') || currentModel.includes('/')) {
      return 'openrouter'
    }

    return null
  }

  /**
   * Get available vision providers
   */
  getAvailableProviders(): string[] {
    const providers: string[] = []

    // Check Anthropic
    try {
      const anthropicKey =
        simpleConfigManager.getApiKey('claude-3-5-sonnet-20241022') || simpleConfigManager.getApiKey('anthropic')
      if (anthropicKey) providers.push('claude')
    } catch { }

    // Check OpenAI
    try {
      const openaiKey = simpleConfigManager.getApiKey('gpt-4o') || simpleConfigManager.getApiKey('openai')
      if (openaiKey) providers.push('openai')
    } catch { }

    // Check Google
    try {
      const googleKey = simpleConfigManager.getApiKey('gemini-1.5-pro') || simpleConfigManager.getApiKey('google')
      if (googleKey) providers.push('google')
    } catch { }

    // Check Vercel
    try {
      const vercelKey = simpleConfigManager.getApiKey('v0-1.0-md') || simpleConfigManager.getApiKey('vercel')
      if (vercelKey) providers.push('vercel')
    } catch { }

    return providers
  }

  /**
   * Get vision provider configuration
   */
  getConfig(): VisionConfig {
    return { ...this.config }
  }

  /**
   * Update vision provider configuration
   */
  updateConfig(newConfig: Partial<VisionConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log(chalk.blue('📷 Vision Provider configuration updated'))
    this.emit('config_updated', this.config)
  }
}

// Singleton instance
export const visionProvider = new VisionProvider()
