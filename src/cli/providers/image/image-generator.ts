import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import chalk from 'chalk'
import { simpleConfigManager } from '../../core/config-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { redisProvider } from '../redis/redis-provider'

export interface ImageGenerationOptions {
  prompt: string
  model?: 'gpt-image-1' | 'dall-e-2' | 'dall-e-3' | 'google/gemini-2.5-flash-image' | 'openai/gpt-5-image-mini' | 'openai/gpt-5-image'
  provider?: 'openai' | 'google' | 'openrouter'
  size?: '1024x1024' | '1536x1024' | '1024x1536' | '1792x1024' | '1024x1792' | '512x512' | '256x256'
  quality?: 'low' | 'medium' | 'high' | 'auto' | 'standard' | 'hd'
  style?: 'vivid' | 'natural'
  n?: number
  outputPath?: string
  cache?: boolean
}

export interface ImageGenerationResult {
  imageUrl: string
  revisedPrompt?: string
  localPath?: string
  metadata: {
    model_used: string
    prompt_original: string
    prompt_revised?: string
    size: string
    quality: string
    style?: string
    processing_time_ms: number
    cost_estimate_usd?: number
  }
}

export interface ImageGeneratorConfig {
  enabled: boolean
  default_model: 'gpt-image-1' | 'dall-e-2' | 'dall-e-3' | 'google/gemini-2.5-flash-image' | 'openai/gpt-5-image-mini' | 'openai/gpt-5-image'
  default_provider: 'openai' | 'google' | 'openrouter'
  fallback_providers: ('openai' | 'google' | 'openrouter')[]
  default_size: '1024x1024' | '1536x1024' | '1024x1536' | '1792x1024' | '1024x1792'
  default_quality: 'low' | 'medium' | 'high' | 'auto' | 'standard' | 'hd'
  default_style: 'vivid' | 'natural'
  cache_enabled: boolean
  cache_ttl: number // seconds
  auto_save: boolean
  output_directory: string
}

/**
 * Image Generator Provider - AI-powered image generation
 * Supports DALL-E 3, DALL-E 2, and GPT-Image-1
 */
export class ImageGenerator extends EventEmitter {
  private config: ImageGeneratorConfig

  constructor() {
    super()

    this.config = {
      enabled: true,
      default_model: 'google/gemini-2.5-flash-image',
      default_provider: 'openrouter',
      fallback_providers: ['openrouter', 'openai', 'google'],
      default_size: '1024x1024',
      default_quality: 'auto',
      default_style: 'vivid',
      cache_enabled: true,
      cache_ttl: 86400, // 24 hours
      auto_save: true,
      output_directory: './generated_images',
    }

    // Create output directory if it doesn't exist
    if (this.config.auto_save && !existsSync(this.config.output_directory)) {
      mkdirSync(this.config.output_directory, { recursive: true })
    }

    advancedUI.logFunctionCall('imagegeneratorinit')
    advancedUI.logFunctionUpdate('success', 'Image Generator initialized', '✓')
  }

  /**
   * Generate an image using AI image generation models
   */
  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    if (!this.config.enabled) {
      throw new Error('Image Generator is disabled')
    }

    const startTime = Date.now()
    const model = options.model || this.config.default_model

    try {
      console.log(chalk.blue(`🎨 Generating image with ${model.toUpperCase()}...`))
      console.log(chalk.gray(`Prompt: "${options.prompt}"`))

      // Check cache first
      const cacheKey = `image-gen:${model}:${this.generateCacheKey(options)}`
      if (options.cache !== false && this.config.cache_enabled) {
        const cached = await this.getCachedResult(cacheKey)
        if (cached) {
          console.log(chalk.green('📦 Using cached generated image'))
          return cached
        }
      }

      // Generate image with fallback support
      let result: ImageGenerationResult | undefined
      const providersToTry = this.getProvidersToTry(options)

      let lastError: Error | null = null
      for (const currentProvider of providersToTry) {
        try {
          switch (model) {
            case 'dall-e-3':
              result = await this.generateWithDALLE3(options)
              break
            case 'dall-e-2':
              result = await this.generateWithDALLE2(options)
              break
            case 'gpt-image-1':
              result = await this.generateWithGPTImage1(options)
              break
            case 'google/gemini-2.5-flash-image':
              result = await this.generateWithOpenRouter(options, 'google/gemini-2.5-flash-image')
              break
            case 'openai/gpt-5-image-mini':
              result = await this.generateWithOpenRouter(options, 'openai/gpt-5-image-mini')
              break
            case 'openai/gpt-5-image':
              result = await this.generateWithOpenRouter(options, 'openai/gpt-5-image')
              break
            default:
              throw new Error(`Unsupported image generation model: ${model}`)
          }

          if (currentProvider !== (options.provider || this.config.default_provider)) {
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

      // Ensure result was assigned
      if (!result) {
        throw new Error('Failed to generate image with any provider')
      }

      // Add processing metadata
      result.metadata.processing_time_ms = Date.now() - startTime
      result.metadata.model_used = model

      // Save image locally if enabled
      if (this.config.auto_save || options.outputPath) {
        result.localPath = await this.saveImageLocally(result.imageUrl, options)
      }

      // Cache result
      if (options.cache !== false && this.config.cache_enabled) {
        await this.cacheResult(cacheKey, result)
      }

      console.log(chalk.green(`✓ Image generated successfully in ${result.metadata.processing_time_ms}ms`))

      this.emit('generation_completed', {
        model,
        result,
        prompt: options.prompt,
        processingTime: result.metadata.processing_time_ms,
      })

      return result
    } catch (error: any) {
      console.log(chalk.red(`❌ Image generation failed: ${error.message}`))
      this.emit('generation_failed', { model, error, prompt: options.prompt })
      throw error
    }
  }

  /**
   * Generate image with DALL-E 3
   */
  private async generateWithDALLE3(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const apiKey = simpleConfigManager.getApiKey('dall-e-3') || simpleConfigManager.getApiKey('openai')

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Use /set-key openai <key>')
    }

    const _openai = createOpenAI({ apiKey })

    const size = options.size || this.config.default_size
    const quality = options.quality || this.config.default_quality
    const style = options.style || this.config.default_style

    // DALL-E 3 restrictions
    if (!['1024x1024', '1792x1024', '1024x1792'].includes(size)) {
      throw new Error('DALL-E 3 only supports sizes: 1024x1024, 1792x1024, 1024x1792')
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: options.prompt,
        size: size,
        quality: quality === 'auto' ? undefined : quality,
        style: style,
        n: 1, // DALL-E 3 only supports n=1
        response_format: 'url',
      }),
    })

    if (!response.ok) {
      const errorData: any = await response.json()
      throw new Error(`DALL-E 3 API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data: any = await response.json()
    const imageData = data.data[0]

    // Calculate cost estimate (approximate)
    const costEstimate = this.calculateCostEstimate('dall-e-3', size, quality)

    return {
      imageUrl: imageData.url,
      revisedPrompt: imageData.revised_prompt,
      metadata: {
        model_used: 'dall-e-3',
        prompt_original: options.prompt,
        prompt_revised: imageData.revised_prompt,
        size,
        quality,
        style,
        processing_time_ms: 0, // Will be set by caller
        cost_estimate_usd: costEstimate,
      },
    }
  }

  /**
   * Generate image with DALL-E 2
   */
  private async generateWithDALLE2(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const apiKey = simpleConfigManager.getApiKey('dall-e-2') || simpleConfigManager.getApiKey('openai')

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Use /set-key openai <key>')
    }

    const _openai = createOpenAI({ apiKey })

    const size = options.size || '1024x1024'
    const n = Math.min(options.n || 1, 10) // DALL-E 2 supports up to 10 images

    // DALL-E 2 size restrictions
    if (!['1024x1024', '512x512', '256x256'].includes(size)) {
      throw new Error('DALL-E 2 only supports sizes: 1024x1024, 512x512, 256x256')
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-2',
        prompt: options.prompt,
        size: size,
        n: n,
        response_format: 'url',
      }),
    })

    if (!response.ok) {
      const errorData: any = await response.json()
      throw new Error(`DALL-E 2 API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data: any = await response.json()
    const imageData = data.data[0] // Return first image

    // Calculate cost estimate
    const costEstimate = this.calculateCostEstimate('dall-e-2', size, 'standard')

    return {
      imageUrl: imageData.url,
      metadata: {
        model_used: 'dall-e-2',
        prompt_original: options.prompt,
        size,
        quality: 'standard',
        processing_time_ms: 0,
        cost_estimate_usd: costEstimate * n,
      },
    }
  }

  /**
   * Get providers to try based on options and configuration
   */
  private getProvidersToTry(options: ImageGenerationOptions): ('openai' | 'google' | 'openrouter')[] {
    const primary = options.provider || this.config.default_provider
    return [primary, ...this.config.fallback_providers].filter((p, idx, arr) => arr.indexOf(p) === idx)
  }

  /**
   * Determine provider from current model
   */
  getProviderFromCurrentModel(): 'openai' | 'google' | 'openrouter' | null {
    const currentModel = simpleConfigManager.get('currentModel')

    if (!currentModel) return null

    // Map model names to providers
    if (currentModel.includes('claude') || currentModel.includes('anthropic')) {
      return 'openrouter' // Claude doesn't have image generation, fallback to OpenRouter
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
    // NikCLI presets use OpenRouter
    if (currentModel.includes('@preset/nikcli')) {
      return 'openrouter'
    }

    return null
  }

  /**
   * Get the default model based on current model
   */
  getModelFromCurrentModel(): string | null {
    const currentModel = simpleConfigManager.get('currentModel')

    if (!currentModel) return null

    // Map NikCLI presets to specific image models
    if (currentModel === '@preset/nikcli') {
      return 'openai/gpt-5-image-mini'
    }
    if (currentModel === '@preset/nikcli-pro') {
      return 'openai/gpt-5-image'
    }

    return null
  }

  /**
   * Generate image with OpenRouter models
   */
  private async generateWithOpenRouter(options: ImageGenerationOptions, model: string): Promise<ImageGenerationResult> {
    const apiKey = simpleConfigManager.getApiKey('openrouter') || simpleConfigManager.getApiKey(model) || process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Use /set-key openrouter <key>')
    }

    const size = options.size || this.config.default_size
    const quality = options.quality || this.config.default_quality

    const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://nikcli.ai',
        'X-Title': 'NikCLI',
      },
      body: JSON.stringify({
        model: model,
        prompt: options.prompt,
        size: size,
        quality: quality === 'auto' ? 'standard' : quality,
        n: 1,
        response_format: 'url',
      }),
    })

    if (!response.ok) {
      const errorData: any = await response.json()
      throw new Error(`OpenRouter ${model} API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data: any = await response.json()

    let imageUrl: string
    let revisedPrompt: string | undefined

    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const imageData = data.data[0]
      imageUrl = imageData.url || imageData.b64_json
      revisedPrompt = imageData.revised_prompt
    } else {
      throw new Error(`No image data returned from OpenRouter ${model}`)
    }

    const costEstimate = this.calculateOpenRouterCost(model, size, quality)

    return {
      imageUrl,
      revisedPrompt,
      metadata: {
        model_used: model,
        prompt_original: options.prompt,
        prompt_revised: revisedPrompt,
        size,
        quality: quality || 'auto',
        processing_time_ms: 0,
        cost_estimate_usd: costEstimate,
      },
    }
  }

  /**
   * Generate image with GPT-Image-1 (2025 model)
   */
  private async generateWithGPTImage1(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const apiKey = simpleConfigManager.getApiKey('gpt-image-1') || simpleConfigManager.getApiKey('openai')

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Use /set-key openai <key>')
    }

    const size = options.size || this.config.default_size
    const quality = options.quality || this.config.default_quality

    // GPT-Image-1 supported sizes
    const supportedSizes = ['1024x1024', '1536x1024', '1024x1536']
    if (!supportedSizes.includes(size)) {
      throw new Error(`GPT-Image-1 supports sizes: ${supportedSizes.join(', ')}`)
    }

    // GPT-Image-1 quality options: low, medium, high, auto
    const supportedQualities = ['low', 'medium', 'high', 'auto']
    if (quality && !supportedQualities.includes(quality)) {
      throw new Error(`GPT-Image-1 supports quality: ${supportedQualities.join(', ')}`)
    }

    const requestBody: any = {
      model: 'gpt-image-1',
      prompt: options.prompt,
      size: size,
      n: 1,
      output_format: 'png',
    }

    // Map quality options for gpt-image-1
    if (quality) {
      if (quality === 'auto' || quality === 'standard') {
        requestBody.quality = 'medium'
      } else if (quality === 'hd') {
        requestBody.quality = 'high'
      } else if (['low', 'medium', 'high'].includes(quality)) {
        requestBody.quality = quality
      }
    }

    console.log('GPT-Image-1 Request Body:', JSON.stringify(requestBody, null, 2))

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    console.log('GPT-Image-1 Response Status:', response.status)

    if (!response.ok) {
      const errorData: any = await response.json()
      console.error('GPT-Image-1 API Error Response:', errorData)
      throw new Error(`GPT-Image-1 API error: ${errorData.error?.message || 'Unknown error'}`)
    }

    const data: any = await response.json()
    console.log('GPT-Image-1 Full Response:', JSON.stringify(data, null, 2))

    // Check if this is the expected response format
    if (!data) {
      throw new Error('Empty response from GPT-Image-1 API')
    }

    // Handle GPT-Image-1 response format
    let imageUrl: string | undefined
    let revisedPrompt: string | undefined

    // GPT-Image-1 returns data in standard OpenAI format
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const imageData = data.data[0]

      // Check for URL format
      if (imageData.url) {
        imageUrl = imageData.url
      }
      // Check for base64 format (which gpt-image-1 often returns)
      else if (imageData.b64_json) {
        imageUrl = `data:image/png;base64,${imageData.b64_json}`
      }

      revisedPrompt = imageData.revised_prompt
    }
    // Fallback: check for direct URL in response
    else if (data.url) {
      imageUrl = data.url
      revisedPrompt = data.revised_prompt
    }

    if (!imageUrl) {
      console.error('No valid image data found in response:', JSON.stringify(data, null, 2))
      throw new Error('No image URL or data returned from GPT-Image-1 API')
    }

    // Calculate cost estimate based on GPT-Image-1 pricing
    const costEstimate = this.calculateCostEstimate('gpt-image-1', size, quality)

    return {
      imageUrl,
      revisedPrompt,
      metadata: {
        model_used: 'gpt-image-1',
        prompt_original: options.prompt,
        prompt_revised: revisedPrompt,
        size,
        quality: quality || 'auto',
        processing_time_ms: 0,
        cost_estimate_usd: costEstimate,
      },
    }
  }

  /**
   * Save generated image locally
   */
  private async saveImageLocally(imageUrl: string, options: ImageGenerationOptions): Promise<string> {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`)
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer())

      // Determine output path
      let outputPath: string
      if (options.outputPath) {
        outputPath = resolve(options.outputPath)
      } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const model = options.model || this.config.default_model
        const filename = `${model}_${timestamp}.png`
        outputPath = resolve(this.config.output_directory, filename)
      }

      // Create directory if needed
      const dir = dirname(outputPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      // Save image
      writeFileSync(outputPath, imageBuffer)

      console.log(chalk.gray(` Image saved to: ${outputPath}`))
      return outputPath
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to save image locally: ${error.message}`))
      throw error
    }
  }

  /**
   * Calculate cost estimate for OpenRouter models
   */
  private calculateOpenRouterCost(model: string, size: string, quality: string): number {
    // OpenRouter pricing estimates (approximate)
    const costs = {
      'google/gemini-2.5-flash-image': {
        '1024x1024': { low: 0.01, medium: 0.02, high: 0.04, auto: 0.02, standard: 0.02 },
        '1536x1024': { low: 0.015, medium: 0.03, high: 0.06, auto: 0.03, standard: 0.03 },
        '1024x1536': { low: 0.015, medium: 0.03, high: 0.06, auto: 0.03, standard: 0.03 },
      },
      'openai/gpt-5-image-mini': {
        '1024x1024': { low: 0.015, medium: 0.03, high: 0.06, auto: 0.03, standard: 0.03 },
        '1536x1024': { low: 0.02, medium: 0.045, high: 0.09, auto: 0.045, standard: 0.045 },
        '1024x1536': { low: 0.02, medium: 0.045, high: 0.09, auto: 0.045, standard: 0.045 },
      },
      'openai/gpt-5-image': {
        '1024x1024': { low: 0.03, medium: 0.06, high: 0.12, auto: 0.06, standard: 0.06 },
        '1536x1024': { low: 0.045, medium: 0.09, high: 0.18, auto: 0.09, standard: 0.09 },
        '1024x1536': { low: 0.045, medium: 0.09, high: 0.18, auto: 0.09, standard: 0.09 },
      },
    }

    const modelCosts = costs[model as keyof typeof costs]
    if (!modelCosts) return 0.05 // Default estimate

    const sizeCosts = modelCosts[size as keyof typeof modelCosts]
    if (!sizeCosts) return 0.05

    return (sizeCosts as any)[quality] || 0.05
  }

  /**
   * Calculate cost estimate based on model and parameters
   */
  private calculateCostEstimate(model: string, size: string, quality: string): number {
    // Cost estimates based on OpenAI pricing (as of 2025)
    const costs = {
      'dall-e-3': {
        '1024x1024': { standard: 0.04, hd: 0.08 },
        '1792x1024': { standard: 0.08, hd: 0.12 },
        '1024x1792': { standard: 0.08, hd: 0.12 },
      },
      'dall-e-2': {
        '1024x1024': { standard: 0.02 },
        '512x512': { standard: 0.018 },
        '256x256': { standard: 0.016 },
      },
      'gpt-image-1': {
        '1024x1024': { low: 0.02, medium: 0.07, high: 0.19, auto: 0.07 },
        '1536x1024': { low: 0.03, medium: 0.1, high: 0.28, auto: 0.1 },
        '1024x1536': { low: 0.03, medium: 0.1, high: 0.28, auto: 0.1 },
      },
    }

    const modelCosts = costs[model as keyof typeof costs]
    if (!modelCosts) return 0

    const sizeCosts = modelCosts[size as keyof typeof modelCosts]
    if (!sizeCosts) return 0

    return (sizeCosts as any)[quality] || 0
  }

  /**
   * Generate cache key for image generation
   */
  private generateCacheKey(options: ImageGenerationOptions): string {
    const crypto = require('node:crypto')
    const hash = crypto.createHash('sha256')
    hash.update(options.prompt)
    hash.update(options.size || this.config.default_size)
    hash.update(options.quality || this.config.default_quality)
    hash.update(options.style || this.config.default_style)
    return hash.digest('hex').substring(0, 16)
  }

  /**
   * Get cached generation result
   */
  private async getCachedResult(cacheKey: string): Promise<ImageGenerationResult | null> {
    try {
      if (!redisProvider.isHealthy()) return null

      const cached = await redisProvider.get<ImageGenerationResult>(cacheKey)
      return cached ? cached.value : null
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Cache read failed, proceeding with generation'))
      return null
    }
  }

  /**
   * Cache generation result
   */
  private async cacheResult(cacheKey: string, result: ImageGenerationResult): Promise<void> {
    try {
      if (!redisProvider.isHealthy()) return

      // Don't cache the actual image data, only metadata and URL
      const cacheableResult = {
        ...result,
        localPath: undefined, // Don't cache local paths as they may be different across sessions
      }

      await redisProvider.set(cacheKey, cacheableResult, this.config.cache_ttl, { type: 'image_generation' })
    } catch (_error) {
      console.log(chalk.yellow('⚠️ Failed to cache result'))
    }
  }

  /**
   * Get available image generation models
   */
  getAvailableModels(): string[] {
    const models: string[] = []

    // Check OpenAI API key
    try {
      const openaiKey =
        simpleConfigManager.getApiKey('dall-e-3') ||
        simpleConfigManager.getApiKey('dall-e-2') ||
        simpleConfigManager.getApiKey('gpt-image-1') ||
        simpleConfigManager.getApiKey('openai')
      if (openaiKey) {
        models.push('gpt-image-1', 'dall-e-2', 'dall-e-3')
      }
    } catch { }

    // Check Google API key
    try {
      const googleKey = simpleConfigManager.getApiKey('google') || simpleConfigManager.getApiKey('gemini-2.5-flash-image')
      if (googleKey) {
        models.push('google/gemini-2.5-flash-image')
      }
    } catch { }

    // Check OpenRouter API key
    try {
      const openrouterKey = simpleConfigManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
      if (openrouterKey) {
        models.push('google/gemini-2.5-flash-image', 'openai/gpt-5-image-mini', 'openai/gpt-5-image')
      }
    } catch { }

    return [...new Set(models)] // Remove duplicates
  }

  /**
   * Get image generator configuration
   */
  getConfig(): ImageGeneratorConfig {
    return { ...this.config }
  }

  /**
   * Update image generator configuration
   */
  updateConfig(newConfig: Partial<ImageGeneratorConfig>): void {
    this.config = { ...this.config, ...newConfig }

    // Create output directory if changed
    if (newConfig.output_directory && !existsSync(this.config.output_directory)) {
      mkdirSync(this.config.output_directory, { recursive: true })
    }

    console.log(chalk.blue('🎨 Image Generator configuration updated'))
    this.emit('config_updated', this.config)
  }
}

// Singleton instance
export const imageGenerator = new ImageGenerator()
