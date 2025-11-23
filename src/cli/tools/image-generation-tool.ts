import { resolve } from 'node:path'
import { z } from 'zod'
import { type ImageGenerationOptions, type ImageGenerationResult, imageGenerator } from '../providers/image'
import { BaseTool, type ToolExecutionResult } from './base-tool'

// Zod schemas for type validation
export const ImageGenerationOptionsSchema = z.object({
  prompt: z.string().min(1, 'Prompt must not be empty'),
  model: z
    .enum([
      'dall-e-3',
      'dall-e-2',
      'gpt-image-1',
      'google/gemini-2.5-flash-image',
      'google/gemini-3-pro-image-preview',
      'openai/gpt-5-image-mini',
      'openai/gpt-5-image',
    ])
    .optional(),
  size: z.enum(['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256']).optional(),
  quality: z.enum(['standard', 'hd']).optional(),
  style: z.enum(['vivid', 'natural']).optional(),
  n: z.number().min(1).max(10).optional(),
  outputPath: z.string().optional(),
  cache: z.boolean().default(true),
})

export const ImageGenerationToolResultSchema = z.object({
  success: z.boolean(),
  generation: z
    .object({
      imageUrl: z.string().url(),
      revisedPrompt: z.string().optional(),
      localPath: z.string().optional(),
      metadata: z.object({
        model_used: z.string(),
        prompt_original: z.string(),
        prompt_revised: z.string().optional(),
        size: z.string(),
        quality: z.string(),
        style: z.string().optional(),
        processing_time_ms: z.number(),
        cost_estimate_usd: z.number().optional(),
      }),
    })
    .optional(),
  error: z.string().optional(),
})

export type ImageGenerationToolOptions = z.infer<typeof ImageGenerationOptionsSchema>
export type ImageGenerationToolResult = z.infer<typeof ImageGenerationToolResultSchema>

/**
 * Production-ready Image Generation Tool
 * Enables AI agents to generate images using AI models like DALL-E 3, GPT-Image-1
 */
export class ImageGenerationTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('image-generation-tool', workingDirectory)
  }

  /**
   * Execute image generation
   */
  async execute(options: ImageGenerationToolOptions): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const result = await this.executeInternal(options)

      return {
        success: result.success,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { options },
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { options },
        },
      }
    }
  }

  private async executeInternal(options: ImageGenerationToolOptions): Promise<ImageGenerationToolResult> {
    try {
      // Validate input parameters
      const validatedOptions = ImageGenerationOptionsSchema.parse(options)

      // Check if image generation is available
      const availableModels = imageGenerator.getAvailableModels()
      if (availableModels.length === 0) {
        throw new Error('No image generation models available. Please configure OpenAI API key.')
      }

      // Validate model if specified
      if (validatedOptions.model && !availableModels.includes(validatedOptions.model)) {
        throw new Error(`Model '${validatedOptions.model}' not available. Available: ${availableModels.join(', ')}`)
      }

      // Validate size compatibility with model
      if (validatedOptions.model && validatedOptions.size) {
        this.validateModelSizeCompatibility(validatedOptions.model, validatedOptions.size)
      }

      // Process output path to be relative to working directory if provided
      const processedOptions: ImageGenerationOptions = {
        ...validatedOptions,
        outputPath: validatedOptions.outputPath
          ? resolve(this.workingDirectory, validatedOptions.outputPath)
          : undefined,
      } as ImageGenerationOptions

      // Perform image generation
      const generationResult: ImageGenerationResult = await imageGenerator.generateImage(processedOptions)

      // Create result object
      const result: ImageGenerationToolResult = {
        success: true,
        generation: generationResult,
      }

      // Validate result with Zod schema
      return ImageGenerationToolResultSchema.parse(result)
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Validate model and size compatibility
   */
  private validateModelSizeCompatibility(model: string, size: string): void {
    const compatibilityMap: Record<string, string[]> = {
      'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
      'dall-e-2': ['1024x1024', '512x512', '256x256'],
      'gpt-image-1': ['1024x1024', '1792x1024', '1024x1792'],
      'google/gemini-2.5-flash-image': ['1024x1024', '1792x1024', '1024x1792'],
      'google/gemini-3-pro-image-preview': ['1024x1024', '1792x1024', '1024x1792'],
      'openai/gpt-5-image-mini': ['1024x1024', '1792x1024', '1024x1792'],
      'openai/gpt-5-image': ['1024x1024', '1792x1024', '1024x1792'],
      '@preset/nikcli': ['1024x1024', '1792x1024', '1024x1792'],
      '@preset/nikcli-pro': ['1024x1024', '1792x1024', '1024x1792'],
    }

    const supportedSizes = compatibilityMap[model]
    if (supportedSizes && !supportedSizes.includes(size)) {
      throw new Error(`Model '${model}' does not support size '${size}'. Supported sizes: ${supportedSizes.join(', ')}`)
    }
  }

  /**
   * Get available image generation models
   */
  getAvailableModels(): string[] {
    return imageGenerator.getAvailableModels()
  }

  /**
   * Get image generator configuration
   */
  getGeneratorConfig(): any {
    return imageGenerator.getConfig()
  }

  /**
   * Get cost estimate for a generation request
   */
  static getCostEstimate(model: string, size: string, quality: string = 'standard'): number {
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
        '1024x1024': { standard: 0.045, hd: 0.09 },
        '1792x1024': { standard: 0.09, hd: 0.135 },
        '1024x1792': { standard: 0.09, hd: 0.135 },
      },
      'google/gemini-2.5-flash-image': {
        '1024x1024': { standard: 0.045, hd: 0.09 },
        '1792x1024': { standard: 0.09, hd: 0.135 },
        '1024x1792': { standard: 0.09, hd: 0.135 },
      },
      'google/gemini-3-pro-image-preview': {
        '1024x1024': { standard: 0.05, hd: 0.1 },
        '1792x1024': { standard: 0.1, hd: 0.15 },
        '1024x1792': { standard: 0.1, hd: 0.15 },
      },
      'openai/gpt-5-image-mini': {
        '1024x1024': { standard: 0.045, hd: 0.09 },
        '1792x1024': { standard: 0.09, hd: 0.135 },
        '1024x1792': { standard: 0.09, hd: 0.135 },
      },
      'openai/gpt-5-image': {
        '1024x1024': { standard: 0.045, hd: 0.09 },
        '1792x1024': { standard: 0.09, hd: 0.135 },
        '1024x1792': { standard: 0.09, hd: 0.135 },
      },
      '@preset/nikcli': {
        '1024x1024': { standard: 0.045, hd: 0.09 },
        '1792x1024': { standard: 0.09, hd: 0.135 },
        '1024x1792': { standard: 0.09, hd: 0.135 },
      },
      '@preset/nikcli-pro': {
        '1024x1024': { standard: 0.045, hd: 0.09 },
        '1792x1024': { standard: 0.09, hd: 0.135 },
        '1024x1792': { standard: 0.09, hd: 0.135 },
      },
    }

    const modelCosts = costs[model as keyof typeof costs]
    if (!modelCosts) return 0

    const sizeCosts = modelCosts[size as keyof typeof modelCosts]
    if (!sizeCosts) return 0

    return (sizeCosts as any)[quality] || 0
  }

  /**
   * Generate multiple image variations of the same prompt
   */
  async generateVariations(
    prompt: string,
    count: number = 2,
    model: 'dall-e-2' | 'dall-e-3' | 'gpt-image-1' | 'google/gemini-2.5-flash-image' | 'openai/gpt-5-image-mini' | 'openai/gpt-5-image' = 'dall-e-2'
  ): Promise<ToolExecutionResult> {
    // For DALL-E 3 and GPT-Image-1, generate multiple single images
    const results: ToolExecutionResult[] = []
    for (let i = 0; i < count; i++) {
      const result = await this.execute({
        prompt,
        model,
        outputPath: `variation_${i + 1}.png`,
        cache: true,
      })
      results.push(result)
    }
    return {
      success: results.every((r) => r.success),
      data: {
        success: results.every((r) => r.success),
        variations: results.map((r) => r.data as ImageGenerationResult),
      },
      metadata: {
        executionTime: results.reduce((sum, r) => sum + r.metadata.executionTime, 0),
        toolName: this.name,
        parameters: { prompt, count, model },
      },
    }
  }

  /**
   * Get detailed help for the tool
   */
  static getHelp(): string {
    return `
Image Generation Tool
====================

Generates images from text prompts using AI models (DALL-E 3, DALL-E 2, GPT-Image-1, Gemini 2.5 Flash Image, GPT-5 Image Mini, GPT-5 Image, NikCLI, NikCLI Pro).

Usage:
  execute(options: ImageGenerationToolOptions)

Required Options:
  - prompt: Text description of the image to generate

Optional Options:
  - model: 'dall-e-3' | 'dall-e-2' | 'gpt-image-1' | 'google/gemini-2.5-flash-image' | 'openai/gpt-5-image-mini' | 'openai/gpt-5-image' | '@preset/nikcli' | '@preset/nikcli-pro' (auto-select if not specified)
  - size: Image dimensions (model-dependent)
  - quality: 'standard' | 'hd' (DALL-E 3, GPT-Image-1, Gemini 2.5 Flash Image, GPT-5 Image Mini, GPT-5 Image only)
  - style: 'vivid' | 'natural' (DALL-E 3, GPT-Image-1, Gemini 2.5 Flash Image, GPT-5 Image Mini, GPT-5 Image only)
  - n: Number of images (max 10)
  - outputPath: Local save path (relative to working directory)
  - cache: Enable/disable caching (default: true)

Model Capabilities:
  - DALL-E 3: Highest quality, HD option, style control
    Sizes: 1024x1024, 1792x1024, 1024x1792
    Cost: ~$0.04-0.12 per image
    
  - GPT-Image-1: 2025 model with enhanced capabilities
    Sizes: 1024x1024, 1792x1024, 1024x1792
    Cost: ~$0.045-0.135 per image
    
  - DALL-E 2: Faster, more economical
    Sizes: 1024x1024, 512x512, 256x256
    Cost: ~$0.016-0.020 per image

  - Gemini 2.5 Flash Image: High quality, HD option, style control
    Sizes: 1024x1024, 1792x1024, 1024x1792
    Cost: ~$0.045-0.09 per image

  - GPT-5 Image Mini: 2025 model with enhanced capabilities
    Sizes: 1024x1024, 1792x1024, 1024x1792
    Cost: ~$0.045-0.09 per image

  - GPT-5 Image: 2025 model with enhanced capabilities
    Sizes: 1024x1024, 1792x1024, 1024x1792
    Cost: ~$0.045-0.09 per image

  - NikCLI: 2025 model with enhanced capabilities
    Sizes: 1024x1024, 1792x1024, 1024x1792
    Cost: ~$0.045-0.09 per image

  - NikCLI Pro: 2025 model with enhanced capabilities
    Sizes: 1024x1024, 1792x1024, 1024x1792
    Cost: ~$0.045-0.09 per image

Returns:
  - success: boolean
  - generation: ImageGenerationResult (if successful)
  - error: string (if failed)

Generation result includes:
  - imageUrl: Direct URL to generated image
  - revisedPrompt: AI-optimized prompt (DALL-E 3, GPT-Image-1)
  - localPath: Local file path (if auto-save enabled)
  - metadata: Model, timing, cost estimates, etc.

Example:
  const result = await imageTool.execute({
    prompt: 'A futuristic city skyline at sunset, cyberpunk style',
    model: 'google/gemini-2.5-flash-image',
    size: '1792x1024',
    quality: 'hd',
    style: 'vivid',
    outputPath: 'city_concept.png'
  });

Special Methods:
  - generateVariations(prompt, count, model): Generate multiple variations
  - getCostEstimate(model, size, quality): Get cost estimate
  - getAvailableModels(): List available models
`
  }
}
