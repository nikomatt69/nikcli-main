import { BaseTool, ToolExecutionResult } from './base-tool';
import { sanitizePath } from './secure-file-tools';
import { visionProvider, VisionAnalysisResult } from '../providers/vision';
import { z } from 'zod';

// Zod schemas for type validation
export const VisionAnalysisOptionsSchema = z.object({
  provider: z.enum(['claude', 'openai', 'google']).optional(),
  prompt: z.string().optional(),
  cache: z.boolean().default(true)
});

export const VisionAnalysisToolResultSchema = z.object({
  success: z.boolean(),
  analysis: z.object({
    description: z.string(),
    objects: z.array(z.string()),
    text: z.string(),
    emotions: z.array(z.string()),
    colors: z.array(z.string()),
    composition: z.string(),
    technical_quality: z.string(),
    confidence: z.number(),
    metadata: z.object({
      model_used: z.string(),
      processing_time_ms: z.number(),
      file_size_bytes: z.number(),
      image_dimensions: z.object({
        width: z.number(),
        height: z.number()
      }).optional()
    })
  }).optional(),
  error: z.string().optional(),
  imagePath: z.string()
});

export type VisionAnalysisOptions = z.infer<typeof VisionAnalysisOptionsSchema>;
export type VisionAnalysisToolResult = z.infer<typeof VisionAnalysisToolResultSchema>;

/**
 * Production-ready Vision Analysis Tool
 * Enables AI agents to analyze images using multimodal AI models
 */
export class VisionAnalysisTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('vision-analysis-tool', workingDirectory);
  }

  /**
   * Execute image analysis
   */
  async execute(imagePath: string, options: VisionAnalysisOptions = { cache: true }): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await this.executeInternal(imagePath, options);

      return {
        success: result.success,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { imagePath, options }
        }
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { imagePath, options }
        }
      };
    }
  }

  private async executeInternal(imagePath: string, options: VisionAnalysisOptions = { cache: true }): Promise<VisionAnalysisToolResult> {
    try {
      // Validate input parameters
      const validatedOptions = VisionAnalysisOptionsSchema.parse(options);
      
      if (typeof imagePath !== 'string' || imagePath.trim().length === 0) {
        throw new Error('imagePath must be a non-empty string');
      }

      // Sanitize and validate image path
      const sanitizedPath = sanitizePath(imagePath, this.workingDirectory);

      // Check if the tool is enabled and providers are available
      const availableProviders = visionProvider.getAvailableProviders();
      if (availableProviders.length === 0) {
        throw new Error('No vision providers available. Please configure API keys.');
      }

      // Validate provider if specified
      if (validatedOptions.provider && !availableProviders.includes(validatedOptions.provider)) {
        throw new Error(`Provider '${validatedOptions.provider}' not available. Available: ${availableProviders.join(', ')}`);
      }

      // Perform vision analysis
      const analysisResult: VisionAnalysisResult = await visionProvider.analyzeImage(sanitizedPath, {
        provider: validatedOptions.provider,
        prompt: validatedOptions.prompt,
        cache: validatedOptions.cache
      });

      // Validate the result structure
      const result: VisionAnalysisToolResult = {
        success: true,
        analysis: analysisResult,
        imagePath: sanitizedPath
      };

      // Validate result with Zod schema
      return VisionAnalysisToolResultSchema.parse(result);

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        imagePath: imagePath
      };
    }
  }

  /**
   * Get available vision providers
   */
  getAvailableProviders(): string[] {
    return visionProvider.getAvailableProviders();
  }

  /**
   * Get vision provider configuration
   */
  getProviderConfig(): any {
    return visionProvider.getConfig();
  }

  /**
   * Static method to validate if a file is a supported image format
   */
  static isSupportedImageFile(filePath: string): boolean {
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const extension = filePath.toLowerCase().split('.').pop();
    return extension ? supportedExtensions.includes('.' + extension) : false;
  }

  /**
   * Get detailed help for the tool
   */
  static getHelp(): string {
    return `
Vision Analysis Tool
===================

Analyzes images using AI vision models (Claude, GPT-4V, Gemini Pro Vision).

Usage:
  execute(imagePath: string, options?: VisionAnalysisOptions)

Parameters:
  - imagePath: Path to the image file (relative to working directory)
  - options: Optional configuration object

Options:
  - provider: 'claude' | 'openai' | 'google' (auto-select if not specified)
  - prompt: Custom analysis prompt (uses default comprehensive analysis if not specified)
  - cache: Enable/disable caching (default: true)

Supported Formats:
  - JPEG (.jpg, .jpeg)
  - PNG (.png)
  - GIF (.gif)
  - WebP (.webp)

Maximum File Size: 20MB

Returns:
  - success: boolean
  - analysis: VisionAnalysisResult (if successful)
  - error: string (if failed)
  - imagePath: string (processed path)

Analysis includes:
  - Detailed description
  - Object detection
  - Text extraction (OCR)
  - Emotion/mood analysis
  - Color palette
  - Composition analysis
  - Technical quality assessment
  - Confidence score
  - Processing metadata

Example:
  const result = await visionTool.execute('./image.png', {
    provider: 'claude',
    prompt: 'Analyze this UI mockup and identify all interactive elements'
  });
`;
  }
}