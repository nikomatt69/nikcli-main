import chalk from 'chalk'
import fs from 'fs/promises'
import path from 'path'

export interface AICadSdkConfig {
  moduleName?: string // default: 'ai-cad-sdk'
  modulePath?: string // absolute path override
  defaultFormat?: 'json' | 'stl' | 'step' | 'dwg' | 'scad'
}

export interface AICadSdkOptions {
  description: string
  constraints?: Record<string, any>
  outputFormat?: 'json' | 'stl' | 'step' | 'dwg' | 'scad'
  streaming?: boolean
  outputPath?: string
}

export interface AICadSdkResponse {
  success: boolean
  elements?: any[]
  filePath?: string
  modelText?: string // e.g., SCAD string
  metadata?: {
    generationTime?: number
    elementsCount?: number
    complexity?: string
  }
  error?: string
}

/**
 * Bridge for integrating github.com/nikomatt69/ai-cad-sdk
 * Tries dynamic imports and common export names without failing the app.
 */
export class AICadSdkBridge {
  private config: Required<AICadSdkConfig>
  private available = false
  private moduleRef: any = null
  private entryFn: ((opts: any) => Promise<any>) | null = null

  constructor(config: AICadSdkConfig = {}) {
    this.config = {
      moduleName: config.moduleName || 'ai-cad-sdk',
      modulePath: config.modulePath || process.env.NIKCLI_AI_CAD_SDK_PATH || '',
      defaultFormat: config.defaultFormat || 'json',
    }
  }

  async initialize(): Promise<boolean> {
    if (this.available) return true
    const candidates: Array<() => any> = []

    // Prefer explicit path if provided
    if (this.config.modulePath) {
      candidates.push(() => require(this.config.modulePath))
    }
    // Try regular node resolution
    if (this.config.moduleName) {
      candidates.push(() => require(this.config.moduleName))
    }

    for (const getMod of candidates) {
      try {
        const mod = getMod()
        const fn = this.resolveTextToCadEntry(mod)
        if (fn) {
          this.moduleRef = mod
          this.entryFn = fn
          this.available = true
          console.log(chalk.green('✅ ai-cad-sdk detected and usable'))
          return true
        }
      } catch (e: any) {
        // Continue to next candidate
        console.log(chalk.gray(`ai-cad-sdk candidate failed: ${e?.message || e}`))
      }
    }

    console.log(chalk.yellow('⚠️ ai-cad-sdk not available (set NIKCLI_AI_CAD_SDK_PATH or install package)'))
    this.available = false
    return false
  }

  isAvailable(): boolean {
    return this.available
  }

  async generateCAD(options: AICadSdkOptions): Promise<AICadSdkResponse> {
    if (!this.available || !this.entryFn) {
      return { success: false, error: 'ai-cad-sdk not available' }
    }

    const start = Date.now()
    try {
      const args = {
        description: options.description,
        constraints: options.constraints || {},
        format: options.outputFormat || this.config.defaultFormat,
        streaming: !!options.streaming,
        outputPath: options.outputPath,
      }

      const result = await this.entryFn(args)

      // Normalize output
      let elements: any[] | undefined
      let modelText: string | undefined
      let outPath: string | undefined = result?.filePath || result?.path

      if (Array.isArray(result?.elements)) elements = result.elements
      if (typeof result === 'string') modelText = result
      if (typeof result?.model === 'string') modelText = result.model
      if (!outPath && modelText && options.outputFormat === 'scad') {
        outPath = await this.saveSCAD(modelText, options.outputPath)
      }

      return {
        success: true,
        elements,
        filePath: outPath,
        modelText,
        metadata: {
          generationTime: Date.now() - start,
          elementsCount: elements?.length,
        },
      }
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) }
    }
  }

  private resolveTextToCadEntry(mod: any): ((opts: any) => Promise<any>) | null {
    if (!mod) return null
    const candidates = ['generateTextToCAD', 'textToCad', 'textToCAD', 'generateCad', 'generateCAD']
    for (const name of candidates) {
      const fn = mod[name] || mod.default?.[name]
      if (typeof fn === 'function') return fn.bind(mod)
    }

    // If module exports a service/class instance
    const service = mod.TextToCAD || mod.default?.TextToCAD || mod.AiCad || mod.default?.AiCad
    if (service && typeof service.generate === 'function') {
      return service.generate.bind(service)
    }
    return null
  }

  private async saveSCAD(scad: string, outputPath?: string): Promise<string> {
    const base = outputPath || path.join(process.cwd(), '.nikcli', 'cad')
    const dir = path.extname(base) ? path.dirname(base) : base
    await fs.mkdir(dir, { recursive: true })
    const finalPath = path.extname(base) ? base : path.join(dir, `ai_cad_${Date.now()}.scad`)
    await fs.writeFile(finalPath, scad, 'utf8')
    return finalPath.replace(process.cwd() + path.sep, '')
  }
}

export function createAICadSdkBridge(config?: AICadSdkConfig): AICadSdkBridge {
  return new AICadSdkBridge(config)
}
