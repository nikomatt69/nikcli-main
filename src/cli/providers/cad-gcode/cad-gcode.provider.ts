import { EventEmitter } from 'events'
import { z } from 'zod'
import { createCADCamFunBridge, type CADCamFunBridge } from '../../integrations/cadcamfun-bridge'
import { TextToGCodeTool } from '../../tools/text-to-gcode-tool'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText, LanguageModelV1 } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export interface CadGcodeConfig {
  workingDirectory?: string
}

export interface CadResult {
  model: string
  description: string
  parameters?: Record<string, any>
  providerUsed: 'cadcamfun-bridge' | 'text-ai-sdk'
}

export interface GcodeResult {
  gcode: string
  metadata?: Record<string, any>
  providerUsed: 'text-to-gcode-tool' | 'text-ai-sdk'
}

const CadInputSchema = z.object({
  description: z.string().min(1, 'Description must not be empty'),
  parameters: z.record(z.any()).optional(),
})

const GcodeInputSchema = z.object({
  cadModel: z.string().min(1, 'CAD model must not be empty'),
  description: z.string().optional(),
})

export class CadGcodeProvider extends EventEmitter {
  private static instance: CadGcodeProvider | null = null
  private workingDirectory: string
  private bridge: CADCamFunBridge
  private initialized = false
  private gcodeTool: TextToGCodeTool
  private openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  private anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  private google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
  private openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

  private constructor(config: CadGcodeConfig = {}) {
    super()
    this.workingDirectory = config.workingDirectory || process.cwd()
    this.bridge = createCADCamFunBridge()
    this.gcodeTool = new TextToGCodeTool(this.workingDirectory)
  }

  static getInstance(config?: CadGcodeConfig): CadGcodeProvider {
    if (!CadGcodeProvider.instance) {
      CadGcodeProvider.instance = new CadGcodeProvider(config)
    }
    return CadGcodeProvider.instance
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true
    try {
      const ok = await this.bridge.initialize()
      this.initialized = ok
      return ok
    } catch {
      return false
    }
  }

  async generateCad(description: string, parameters?: Record<string, any>): Promise<CadResult> {
    const { description: desc, parameters: params } = CadInputSchema.parse({ description, parameters })
    this.emit('generationStart', { type: 'cad' })

    if (!this.initialized) {
      await this.initialize()
    }
    let model: string | null = null
    let usedBridge = false
    try {
      const result = await this.bridge.generateCAD({ description: desc, constraints: params, outputFormat: 'json' })
      if (result.success) {
        usedBridge = true
        model = JSON.stringify({ elements: result.elements || [], metadata: result.metadata || {} }, null, 2)
      }
    } catch (_) {
      // fall through to AI SDK
    }

    if (!model) {
      // Fallback to AI SDK generation of OpenSCAD-like script
      const { text } = await generateText({
        model: this.pickAiModel() as LanguageModelV1,
        system:
          'You are a senior CAD CAM engineer. Generate a valid OpenSCAD script for the given description. Include parameters when appropriate. Output only code without explanations.',
        prompt:
          `${desc}\n\nConstraints: ${params ? JSON.stringify(params) : '{}'}\nEnsure metric units (mm) and pragmatic manufacturable design.`,
        maxTokens: 2000,
      })
      model = text
    }
    const cadResult: CadResult = {
      model,
      description: desc,
      parameters: params,
      providerUsed: usedBridge ? 'cadcamfun-bridge' : 'text-ai-sdk',
    }

    this.emit('generationComplete', { type: 'cad' })
    return cadResult
  }

  async generateGcode(cadModel: string, description?: string): Promise<GcodeResult> {
    const { cadModel: model, description: desc } = GcodeInputSchema.parse({ cadModel, description })
    this.emit('generationStart', { type: 'gcode' })
    const combinedDescription = desc ? `${desc}\n\nCAD Model Summary:\n${model.substring(0, 500)}` : model

    // Try AI SDK direct G-code generation first for parity with other tools
    let gcodeText: string | null = null
    let usedAiSdkForGcode = false
    try {
      const { text } = await generateText({
        model: this.pickAiModel() as LanguageModelV1,
        system:
          'You are an expert CNC/3D printing programmer. Generate safe, efficient G-code for the described operation. Output only G-code lines with comments where helpful.',
        prompt: combinedDescription,
        maxTokens: 2000,
      })
      // Basic sanity check: must include at least one G0/G1
      if (/\bG0\b|\bG1\b/.test(text)) {
        gcodeText = text
        usedAiSdkForGcode = true
      }
    } catch (_) {
      // ignore and fallback
    }

    if (!gcodeText) {
      const result = await this.gcodeTool.execute({ description: combinedDescription })
      if (!result.success) {
        throw new Error(result.error || 'G-code generation failed')
      }
      const data: any = result.data
      gcodeText = data.gcode || ''
    }

    const finalGcode: string = gcodeText || ''
    const gcodeResult: GcodeResult = {
      gcode: finalGcode,
      metadata: { source: usedAiSdkForGcode ? 'ai-sdk' : 'tool' },
      providerUsed: usedAiSdkForGcode ? 'text-ai-sdk' : 'text-to-gcode-tool',
    }

    this.emit('generationComplete', { type: 'gcode' })
    return gcodeResult
  }

  private pickAiModel() {
    // Prefer OpenRouter preset when available
    if (process.env.OPENROUTER_API_KEY) return this.openrouter('@preset/nikcli')
    // Otherwise choose based on available keys (OpenAI > Anthropic > Google)
    if (process.env.OPENAI_API_KEY) return this.openai('gpt-4o-mini')
    if (process.env.ANTHROPIC_API_KEY) return this.anthropic('claude-3-haiku-20240307')
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return this.google('gemini-1.5-flash')
    // Default to OpenRouter preset (may error if no key configured)
    return this.openrouter('@preset/nikcli')
  }

  validateGcode(gcode: string): { isValid: boolean; errors?: string[] } {
    try {
      if (!gcode || typeof gcode !== 'string' || gcode.trim().length === 0) {
        return { isValid: false, errors: ['Empty G-code'] }
      }
      // Minimal validation: ensure at least one motion command exists
      const hasMotion = /\bG0\b|\bG1\b/.test(gcode)
      if (!hasMotion) return { isValid: false, errors: ['No motion commands (G0/G1) found'] }
      return { isValid: true }
    } catch (error: any) {
      return { isValid: false, errors: [error.message] }
    }
  }
}

export const cadGcodeProvider = CadGcodeProvider.getInstance()
export default CadGcodeProvider