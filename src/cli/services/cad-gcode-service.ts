import { EventEmitter } from 'node:events'
import { CadGcodeProvider, cadGcodeProvider, type CadResult, type GcodeResult } from '../providers/cad-gcode/cad-gcode.provider'

/**
 * Real CAD/GCode services backed by CadGcodeProvider.
 * Thin wrappers that expose a stable API for commands/UI.
 */
export class CadService extends EventEmitter {
  constructor(private provider: CadGcodeProvider = cadGcodeProvider) {
    super()
  }

  async generateCAD(description: string, parameters?: Record<string, any>): Promise<CadResult> {
    this.emit('cad:start', { description })
    const result = await this.provider.generateCad(description, parameters)
    this.emit('cad:complete', { description, success: true })
    return result
  }

  /** Convenience: text -> CAD -> G-code in a single call */
  async generateGcodeFromText(description: string): Promise<GcodeResult> {
    const cad = await this.generateCAD(description)
    return await this.provider.generateGcode(cad.model, description)
  }

  getCapabilities(): string[] {
    return (this.provider as any).getCapabilities?.() || []
  }
}

export class GcodeService extends EventEmitter {
  constructor(private provider: CadGcodeProvider = cadGcodeProvider) {
    super()
  }

  async generateGcode(cadModel: string, description?: string): Promise<GcodeResult> {
    this.emit('gcode:start', { description })
    const result = await this.provider.generateGcode(cadModel, description)
    this.emit('gcode:complete', { description, success: true })
    return result
  }

  validateGcode(gcode: string) {
    return this.provider.validateGcode(gcode)
  }
}

let _cadService: CadService | null = null
let _gcodeService: GcodeService | null = null

export function getCadService(): CadService {
  if (!_cadService) _cadService = new CadService()
  return _cadService
}

export function getGcodeService(): GcodeService {
  if (!_gcodeService) _gcodeService = new GcodeService()
  return _gcodeService
}
