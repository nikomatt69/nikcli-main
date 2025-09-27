import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, type LanguageModelV1 } from 'ai'
import { z } from 'zod'
import { type CADCamFunBridge, createCADCamFunBridge } from '../../integrations/cadcamfun-bridge'
import { TextToGCodeTool } from '../../tools/text-to-gcode-tool'

export interface CadGcodeConfig {
  workingDirectory?: string
}

export interface CadResult {
  model: string
  description: string
  parameters?: Record<string, any>
  providerUsed: 'cadcamfun-bridge' | 'text-ai-sdk'
  filePath?: string
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
    let savedPath: string | undefined
    try {
      const result = await this.bridge.generateCAD({ description: desc, constraints: params, outputFormat: 'json' })
      if (result.success) {
        usedBridge = true
        model = JSON.stringify({ elements: result.elements || [], metadata: result.metadata || {} }, null, 2)
        // Save JSON CAD to .nikcli/cad
        savedPath = await this.saveCadJson(result.elements || [], desc, result.metadata)
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
        prompt: `${desc}\n\nConstraints: ${params ? JSON.stringify(params) : '{}'}\nEnsure metric units (mm) and pragmatic manufacturable design.`,
        maxTokens: 2000,
      })
      model = text
      // Save SCAD fallback to .nikcli/cad
      savedPath = await this.saveCadScad(model || '', desc)
    }
    const cadResult: CadResult = {
      model,
      description: desc,
      parameters: params,
      providerUsed: usedBridge ? 'cadcamfun-bridge' : 'text-ai-sdk',
      filePath: savedPath,
    }

    this.emit('generationComplete', { type: 'cad' })
    return cadResult
  }

  private async ensureCadDir(): Promise<string> {
    const nikCliDir = path.join(this.workingDirectory, '.nikcli')
    const cadDir = path.join(nikCliDir, 'cad')
    await fs.mkdir(cadDir, { recursive: true })
    return cadDir
  }

  private slugify(text: string, max = 24): string {
    return (text || 'model')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, max)
  }

  private timestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0]
  }

  private async saveCadJson(elements: any[], description: string, metadata?: Record<string, any>): Promise<string> {
    const cadDir = await this.ensureCadDir()
    const filename = `cad_${this.slugify(description)}_${this.timestamp()}.json`
    const fullPath = path.join(cadDir, filename)
    const content = JSON.stringify(
      {
        metadata: {
          generated: new Date().toISOString(),
          format: 'json',
          elementsCount: elements?.length || 0,
          tool: 'nikcli-text-to-cad',
          ...(metadata || {}),
        },
        elements: elements || [],
      },
      null,
      2
    )
    await fs.writeFile(fullPath, content, 'utf8')
    return path.join('.nikcli', 'cad', filename)
  }

  private async saveCadScad(scad: string, description: string): Promise<string> {
    const cadDir = await this.ensureCadDir()
    const filename = `cad_${this.slugify(description)}_${this.timestamp()}.scad`
    const fullPath = path.join(cadDir, filename)
    const header = `// Generated by NikCLI (AI SDK fallback)\n// Description: ${description}\n// Date: ${new Date().toISOString()}\n\n`
    const content =
      (scad || '').startsWith('//') || /(cube\(|cylinder\(|sphere\()/.test(scad || '')
        ? header + scad
        : header + `cube([10,10,2]);\n`
    await fs.writeFile(fullPath, content, 'utf8')
    return path.join('.nikcli', 'cad', filename)
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
