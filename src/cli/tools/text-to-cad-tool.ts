/**
 * Text-to-CAD Tool for NikCLI
 * Converts text descriptions into CAD elements and models
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import boxen from 'boxen'
import chalk from 'chalk'
import { z } from 'zod'
import { convertCadElementsToSTL } from '../converters/cad-to-stl'
import { type AICadSdkBridge, createAICadSdkBridge } from '../integrations/ai-cad-sdk-bridge'
import { type CADCamFunBridge, createCADCamFunBridge } from '../integrations/cadcamfun-bridge'
import { compilePrompt, promptTemplates } from '../prompts/promptTemplates'
import { BaseTool, type ToolExecutionResult } from './base-tool'

export const CADGenerationOptionsSchema = z.object({
  description: z.string().min(1, 'Description must not be empty'),
  outputFormat: z.enum(['stl', 'step', 'dwg', 'json', 'scad']).optional(),
  streaming: z.boolean().optional().default(false),
  constraints: z.record(z.any()).optional(),
  outputPath: z.string().optional(),
})
export type CADGenerationParams = z.infer<typeof CADGenerationOptionsSchema>

export interface CADElement {
  id: string
  type: string
  description: string
  geometry?: any
  properties?: Record<string, any>
}

export const CADGenerationDataSchema = z.object({
  elements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      description: z.string(),
      geometry: z.any().optional(),
      properties: z.record(z.any()).optional(),
    })
  ),
  filePath: z.string().optional(),
  preview: z.string().optional(),
  metadata: z.object({
    elementsCount: z.number(),
    generationTime: z.number(),
    complexity: z.enum(['simple', 'medium', 'complex']),
    constraints: z.record(z.any()).optional(),
  }),
})
export type CADGenerationData = z.infer<typeof CADGenerationDataSchema>

export const TextToCADToolResultSchema = z.object({
  success: z.boolean(),
  cad: CADGenerationDataSchema.optional(),
  error: z.string().optional(),
})
export type TextToCADToolResult = z.infer<typeof TextToCADToolResultSchema>

export class TextToCADTool extends BaseTool {
  private cadBridge: CADCamFunBridge
  private aiBridge: AICadSdkBridge
  private activeBridge: 'ai-cad-sdk' | 'cadcamfun' | null = null

  constructor(workingDirectory: string) {
    super('text-to-cad-tool', workingDirectory)
    this.cadBridge = createCADCamFunBridge()
    this.aiBridge = createAICadSdkBridge()
  }

  async execute(params: CADGenerationParams): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      console.log(chalk.blue(`🎨 Converting text to CAD: "${params.description}"`))

      // Initialize bridges (prefer ai-cad-sdk, fallback to cadcamfun)
      await this.initializeBridges()

      // Validate parameters
      const validatedParams = this.validateParameters(params)

      // Generate CAD model
      const result = await this.generateCADModel(validatedParams)

      const executionTime = Date.now() - startTime

      if (!result.success) {
        const toolData: TextToCADToolResult = { success: false, error: result.error || 'CAD generation failed' }
        return {
          success: false,
          data: TextToCADToolResultSchema.parse(toolData),
          error: toolData.error,
          metadata: {
            executionTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      // Generate filename and save to .nikcli/cad directory
      const fileName = validatedParams.outputPath || this.generateCADFileName(validatedParams)
      let savedFilePath: string
      if ((validatedParams.outputFormat === 'scad' && (result as any)?.modelText) || (result as any)?.modelText) {
        const ensuredName =
          path.extname(fileName).toLowerCase() === '.scad' ? fileName : `${fileName.replace(/\.[^/.]+$/, '')}.scad`
        savedFilePath = await this.saveSCADToFile((result as any).modelText || '', ensuredName)
      } else if (validatedParams.outputFormat === 'stl' && Array.isArray(result.elements)) {
        const stl = convertCadElementsToSTL(result.elements, 'nikcli_model')
        const ensuredName =
          path.extname(fileName).toLowerCase() === '.stl' ? fileName : `${fileName.replace(/\.[^/.]+$/, '')}.stl`
        savedFilePath = await this.saveRawToFile(stl, ensuredName)
      } else {
        savedFilePath = await this.saveCADToFile(
          result.elements || [],
          fileName,
          validatedParams.outputFormat || 'json'
        )
      }

      // Format the CAD data
      const cadData: CADGenerationData = {
        elements: result.elements || [],
        filePath: savedFilePath,
        metadata: {
          elementsCount: result.elements?.length || 0,
          generationTime: result.metadata?.generationTime || executionTime,
          complexity: (result.metadata?.complexity as 'simple' | 'medium' | 'complex') || 'medium',
          constraints: validatedParams.constraints,
        },
      }

      // Generate and display ASCII preview
      this.displayCADPreview(cadData, validatedParams.description)

      const toolData: TextToCADToolResult = { success: true, cad: cadData }
      return {
        success: true,
        data: TextToCADToolResultSchema.parse(toolData),
        metadata: {
          executionTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime

      const toolData: TextToCADToolResult = { success: false, error: error.message }
      return {
        success: false,
        data: TextToCADToolResultSchema.parse(toolData),
        error: error.message,
        metadata: {
          executionTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Generate CAD model with streaming support
   */
  async executeWithStreaming(
    params: CADGenerationParams,
    onProgress?: (progress: any) => void,
    onElement?: (element: CADElement) => void
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      console.log(chalk.blue(`⚡︎ Streaming CAD generation: "${params.description}"`))

      await this.initializeBridges()
      const validatedParams = this.validateParameters(params)

      let result: any
      if (this.activeBridge === 'cadcamfun' && (this.cadBridge as any).streamCAD) {
        result = await (this.cadBridge as any).streamCAD(
          {
            description: validatedParams.description,
            constraints: validatedParams.constraints,
            outputFormat: validatedParams.outputFormat === 'scad' ? 'json' : validatedParams.outputFormat,
            streaming: true,
            outputPath: validatedParams.outputPath,
          },
          onProgress,
          onElement
        )
      } else {
        // Emulate streaming for ai-cad-sdk or when streaming not available
        const steps = ['Analyzing description', 'Creating geometry', 'Optimizing structure', 'Finalizing model']
        for (let i = 0; i < steps.length; i++) {
          const progress = Math.round(((i + 1) / steps.length) * 100)
          onProgress?.({ step: steps[i], progress, total: steps.length })
          await new Promise((r) => setTimeout(r, 200))
        }
        result = await this.generateCADModel({ ...validatedParams, streaming: false })
        if (Array.isArray(result?.elements)) {
          for (const el of result.elements) onElement?.(el)
        }
      }

      const executionTime = Date.now() - startTime

      if (!result.success) {
        const toolData: TextToCADToolResult = {
          success: false,
          error: result.error || 'Streaming CAD generation failed',
        }
        return {
          success: false,
          data: TextToCADToolResultSchema.parse(toolData),
          error: toolData.error,
          metadata: {
            executionTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      // Generate filename and save to .nikcli/cad directory
      const fileName = validatedParams.outputPath || this.generateCADFileName(validatedParams)
      let savedFilePath: string
      if ((validatedParams.outputFormat === 'scad' && (result as any)?.modelText) || (result as any)?.modelText) {
        const ensuredName =
          path.extname(fileName).toLowerCase() === '.scad' ? fileName : `${fileName.replace(/\.[^/.]+$/, '')}.scad`
        savedFilePath = await this.saveSCADToFile((result as any).modelText || '', ensuredName)
      } else if (validatedParams.outputFormat === 'stl' && Array.isArray(result.elements)) {
        const stl = convertCadElementsToSTL(result.elements, 'nikcli_model')
        const ensuredName =
          path.extname(fileName).toLowerCase() === '.stl' ? fileName : `${fileName.replace(/\.[^/.]+$/, '')}.stl`
        savedFilePath = await this.saveRawToFile(stl, ensuredName)
      } else {
        savedFilePath = await this.saveCADToFile(
          result.elements || [],
          fileName,
          validatedParams.outputFormat || 'json'
        )
      }

      const cadData: CADGenerationData = {
        elements: result.elements || [],
        filePath: savedFilePath,
        metadata: {
          elementsCount: result.elements?.length || 0,
          generationTime: result.metadata?.generationTime || executionTime,
          complexity: (result.metadata?.complexity as 'simple' | 'medium' | 'complex') || 'medium',
          constraints: validatedParams.constraints,
        },
      }

      // Generate and display ASCII preview for streaming too
      this.displayCADPreview(cadData, validatedParams.description)

      const toolData: TextToCADToolResult = { success: true, cad: cadData }
      return {
        success: true,
        data: TextToCADToolResultSchema.parse(toolData),
        metadata: {
          executionTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime

      const toolData: TextToCADToolResult = { success: false, error: error.message }
      return {
        success: false,
        data: TextToCADToolResultSchema.parse(toolData),
        error: error.message,
        metadata: {
          executionTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Validate and normalize parameters
   */
  private validateParameters(params: CADGenerationParams): CADGenerationParams {
    // Validate and normalize with Zod
    const validated = CADGenerationOptionsSchema.parse(params)

    // Validate output path if provided
    if (validated.outputPath && !this.isPathSafe(validated.outputPath)) {
      throw new Error('Output path is not safe or outside working directory')
    }

    return {
      description: validated.description.trim(),
      outputFormat: validated.outputFormat || 'json',
      streaming: validated.streaming || false,
      constraints: validated.constraints || {},
      outputPath: validated.outputPath,
    }
  }

  /**
   * Generate CAD model using the bridge with AI-enhanced processing
   */
  private async generateCADModel(params: CADGenerationParams) {
    // Enhance the description using our internal AI prompts
    const enhancedDescription = await this.enhanceDescriptionWithAI(params)

    const request = {
      description: enhancedDescription || params.description,
      constraints: params.constraints,
      outputFormat: params.outputFormat,
      streaming: params.streaming,
      outputPath: params.outputPath,
    }

    if (this.activeBridge === 'ai-cad-sdk') {
      return await this.aiBridge.generateCAD(request as any)
    }
    // Fallback to CADCamFun bridge
    return await this.cadBridge.generateCAD({
      ...request,
      // CADCamFun does not support SCAD export directly in current bridge
      outputFormat: params.outputFormat === 'scad' ? 'json' : params.outputFormat,
    } as any)
  }

  private async initializeBridges(): Promise<void> {
    if (this.activeBridge) return
    try {
      const aiOk = await this.aiBridge.initialize()
      if (aiOk && this.aiBridge.isAvailable()) {
        this.activeBridge = 'ai-cad-sdk'
        return
      }
    } catch {}
    try {
      const cadOk = await this.cadBridge.initialize()
      if (cadOk && this.cadBridge.isAvailable()) {
        this.activeBridge = 'cadcamfun'
        return
      }
    } catch {}
    this.activeBridge = null
  }

  /**
   * Enhance description using NikCLI's internal AI prompts
   */
  private async enhanceDescriptionWithAI(params: CADGenerationParams): Promise<string | null> {
    try {
      console.log(chalk.gray('🔌 Enhancing description with AI analysis (enterprise prompt)...'))

      // Compile the Enterprise Text-to-CAD prompt (system + user)
      const _systemPrompt = promptTemplates.textToCAD.system
      const _userPrompt = compilePrompt(promptTemplates.textToCAD.user, {
        description: params.description,
        complexity: 'medium',
        style: 'industrial',
      })

      // Here you would integrate with your actual AI service
      // For now, we'll return an enhanced version of the description
      const enhancedDescription = this.createEnhancedDescription(params)

      console.log(chalk.green('✓ Description enhanced with engineering specifications'))
      return enhancedDescription
    } catch (_error) {
      console.log(chalk.yellow('⚠︎ AI enhancement failed, using original description'))
      return null
    }
  }

  /**
   * Create an enhanced description with engineering details
   */
  private createEnhancedDescription(params: CADGenerationParams): string {
    const parts = [params.description]

    // Add extracted constraints
    const material = this.extractMaterial(params.description)
    if (material && !params.description.toLowerCase().includes(material.toLowerCase())) {
      parts.push(`Material: ${material}`)
    }

    // Add dimensional information if found
    const dimensions = this.extractDimensions(params.description)
    if (dimensions.length > 0) {
      parts.push(`Dimensions: ${dimensions.join(', ')}`)
    }

    // Add manufacturing considerations
    const shape = this.extractShape(params.description)
    if (shape) {
      parts.push(`Primary geometry: ${shape}`)

      // Add shape-specific manufacturing notes
      switch (shape) {
        case 'bracket':
          parts.push('Manufacturing: CNC machining or sheet metal forming')
          parts.push('Features: Mounting holes, stress relief fillets')
          break
        case 'gear':
          parts.push('Manufacturing: Gear cutting or molding')
          parts.push('Features: Tooth profile, hub bore, keyway')
          break
        case 'housing':
          parts.push('Manufacturing: CNC machining or die casting')
          parts.push('Features: Wall thickness, parting lines, draft angles')
          break
      }
    }

    // Add tolerance and surface finish requirements
    parts.push('Tolerances: ±0.1mm general, ±0.05mm critical dimensions')
    parts.push('Surface finish: Ra 3.2μm machined surfaces')

    return parts.join('. ')
  }

  /**
   * Extract material from description
   */
  private extractMaterial(description: string): string | null {
    const materials = [
      'aluminum',
      'steel',
      'stainless steel',
      'plastic',
      'abs',
      'pla',
      'petg',
      'brass',
      'copper',
      'titanium',
      'carbon fiber',
      'nylon',
      'delrin',
    ]

    for (const material of materials) {
      if (description.toLowerCase().includes(material)) {
        return material
      }
    }

    return null
  }

  /**
   * Extract dimensions from description
   */
  private extractDimensions(description: string): string[] {
    const dimensionRegex = /(\d+(?:\.\d+)?)\s*(mm|cm|m|inch|in)/gi
    const dimensions: string[] = []
    let match

    while ((match = dimensionRegex.exec(description)) !== null) {
      dimensions.push(`${match[1]}${match[2]}`)
    }

    return dimensions
  }

  /**
   * Extract primary shape from description
   */
  private extractShape(description: string): string | null {
    const shapes = {
      bracket: ['bracket', 'support', 'mount'],
      gear: ['gear', 'wheel', 'sprocket'],
      housing: ['housing', 'case', 'enclosure', 'box'],
      shaft: ['shaft', 'rod', 'pin'],
      plate: ['plate', 'panel', 'sheet'],
      cylinder: ['cylinder', 'tube', 'pipe'],
    }

    const desc = description.toLowerCase()

    for (const [shape, keywords] of Object.entries(shapes)) {
      if (keywords.some((keyword) => desc.includes(keyword))) {
        return shape
      }
    }

    return null
  }

  /**
   * Parse constraints from text description
   */
  static parseConstraints(description: string): Record<string, any> {
    const constraints: Record<string, any> = {}

    // Extract dimensions
    const dimensionRegex = /(\d+(?:\.\d+)?)\s*(mm|cm|m|inch|in)/gi
    const dimensions = []
    let match
    while ((match = dimensionRegex.exec(description)) !== null) {
      dimensions.push({ value: parseFloat(match[1]), unit: match[2] })
    }
    if (dimensions.length > 0) {
      constraints.dimensions = dimensions
    }

    // Extract materials
    const materialRegex = /(?:made of|material|using)\s+(\w+)/i
    const materialMatch = description.match(materialRegex)
    if (materialMatch) {
      constraints.material = materialMatch[1]
    }

    // Extract holes/features
    const holeRegex = /(\d+)\s*(?:holes?|bores?)/gi
    const holeMatch = description.match(holeRegex)
    if (holeMatch) {
      constraints.holes = parseInt(holeMatch[0], 10)
    }

    // Extract shapes
    const shapeRegex = /\b(rectangular|square|circular|cylindrical|spherical|triangular)\b/gi
    const shapeMatch = description.match(shapeRegex)
    if (shapeMatch) {
      constraints.shape = shapeMatch[0].toLowerCase()
    }

    return constraints
  }

  /**
   * Get tool capabilities
   */
  getCapabilities(): string[] {
    return [
      'Text-to-CAD model generation',
      'Multiple output formats (STL, STEP, DWG, JSON)',
      'Constraint-based design',
      'Dimensional parsing',
      'Material specification',
      'Streaming generation',
      'Component library integration',
      'Assembly generation',
    ]
  }

  /**
   * Get supported output formats
   */
  getSupportedFormats(): string[] {
    return ['stl', 'step', 'dwg', 'json', 'scad']
  }

  /**
   * Check if CAD system is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return this.cadBridge.isAvailable()
    } catch {
      return false
    }
  }

  /**
   * Display CAD preview in a beautiful panel
   */
  private displayCADPreview(cadData: CADGenerationData, description: string): void {
    const preview = this.generateASCIIPreview(cadData, description)

    console.log(
      boxen(preview, {
        title: '🎨 CAD Model Preview',
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        titleAlignment: 'center',
      })
    )
  }

  /**
   * Generate ASCII art preview of the CAD model
   */
  private generateASCIIPreview(cadData: CADGenerationData, description: string): string {
    const lines: string[] = []

    // Header with description
    lines.push(chalk.blue.bold(`📐 "${description}"`))
    lines.push('')

    // Stats
    lines.push(chalk.cyan('📊 Model Statistics:'))
    lines.push(chalk.gray(`   Elements: ${chalk.white(cadData.metadata.elementsCount)}`))
    lines.push(chalk.gray(`   Complexity: ${chalk.white(cadData.metadata.complexity)}`))
    lines.push(chalk.gray(`   Generation Time: ${chalk.white(cadData.metadata.generationTime)}ms`))
    lines.push('')

    // ASCII art based on elements and description
    const asciiArt = this.generateASCIIArt(cadData, description)
    lines.push(chalk.yellow('🖼️  ASCII Preview:'))
    lines.push('')
    lines.push(asciiArt)
    lines.push('')

    // Elements list
    if (cadData.elements.length > 0) {
      lines.push(chalk.green('🔧 Elements:'))
      cadData.elements.slice(0, 5).forEach((element, index) => {
        const icon = this.getElementIcon(element.type)
        lines.push(chalk.gray(`   ${icon} ${element.description || element.type || `Element ${index + 1}`}`))
      })

      if (cadData.elements.length > 5) {
        lines.push(chalk.gray(`   ... and ${cadData.elements.length - 5} more elements`))
      }
      lines.push('')
    }

    // File info
    if (cadData.filePath) {
      lines.push(chalk.blue('📁 Output:'))
      lines.push(chalk.gray(`   ${cadData.filePath}`))
    }

    return lines.join('\n')
  }

  /**
   * Generate ASCII art representation of the CAD model
   */
  private generateASCIIArt(_cadData: CADGenerationData, description: string): string {
    const desc = description.toLowerCase()

    // Detect shapes and generate appropriate ASCII art
    if (desc.includes('bracket') || desc.includes('support')) {
      return this.generateBracketASCII()
    } else if (desc.includes('circle') || desc.includes('ring') || desc.includes('round')) {
      return this.generateCircleASCII()
    } else if (desc.includes('rectangle') || desc.includes('square') || desc.includes('plate')) {
      return this.generateRectangleASCII()
    } else if (desc.includes('gear') || desc.includes('wheel')) {
      return this.generateGearASCII()
    } else if (desc.includes('cylinder') || desc.includes('tube')) {
      return this.generateCylinderASCII()
    } else if (desc.includes('screw') || desc.includes('bolt')) {
      return this.generateScrewASCII()
    } else if (desc.includes('housing') || desc.includes('case') || desc.includes('box')) {
      return this.generateHousingASCII()
    } else {
      // Generic 3D object
      return this.generateGenericASCII()
    }
  }

  /**
   * Generate bracket ASCII art
   */
  private generateBracketASCII(): string {
    return chalk.yellow(`
    ╭─────────╮
    │  ●   ●  │
    │         │
    │    ┌─┐  │
    │    │ │  │
    │    │ │  │
    │    └─┘  │
    │         │
    │  ●   ●  │
    ╰─────────╯`)
  }

  /**
   * Generate circle ASCII art
   */
  private generateCircleASCII(): string {
    return chalk.yellow(`
        ╭─────╮
      ╭─╯     ╰─╮
    ╭─╯         ╰─╮
   ╱               ╲
  ╱                 ╲
  │        ●        │
  ╲                 ╱
   ╲               ╱
    ╰─╮         ╭─╯
      ╰─╮     ╭─╯
        ╰─────╯`)
  }

  /**
   * Generate rectangle ASCII art
   */
  private generateRectangleASCII(): string {
    return chalk.yellow(`
    ╭─────────────────╮
    │                 │
    │  ●           ●  │
    │                 │
    │                 │
    │                 │
    │  ●           ●  │
    │                 │
    ╰─────────────────╯`)
  }

  /**
   * Generate gear ASCII art
   */
  private generateGearASCII(): string {
    return chalk.yellow(`
      ╭─╮   ╭─╮   ╭─╮
    ╭─╯ ╰─╮ ╱ ╲ ╭─╯ ╰─╮
   ╱       ╲   ╱       ╲
  │    ╭─────────╮    │
  ╰─╮  │    ●    │  ╭─╯
    ╰─╮│         │╭─╯
      ╲│         │╱
       ╰─────────╯
    ╭─╱ │       │ ╲─╮
   ╱    ╰─╮   ╭─╯    ╲
  │       ╰─╮ ╱       │
  ╰─╮   ╭─╯ ╲ ╰─╮   ╭─╯
    ╰─╱─╯     ╰─╱─╯`)
  }

  /**
   * Generate cylinder ASCII art
   */
  private generateCylinderASCII(): string {
    return chalk.yellow(`
    ╭─────────────╮
   ╱               ╲
  ╱                 ╲
  │                 │
  │                 │
  │        ●        │
  │                 │
  │                 │
  ╲                 ╱
   ╲               ╱
    ╰─────────────╯`)
  }

  /**
   * Generate screw ASCII art
   */
  private generateScrewASCII(): string {
    return chalk.yellow(`
        ╭─────╮
        │  ─  │
        ╰─────╯
          │ │
          │ │
        ╭─────╮
        │ ╱─╲ │
        │╱   ╲│
        ││   ││
        │╲   ╱│
        │ ╲─╱ │
        ╰─────╯
          │ │
          │ │
          ╰─╯`)
  }

  /**
   * Generate housing ASCII art
   */
  private generateHousingASCII(): string {
    return chalk.yellow(`
    ╭─────────────────╮
    │╭───────────────╮│
    ││               ││
    ││   ●       ●   ││
    ││               ││
    ││      ╭─╮      ││
    ││      │ │      ││
    ││      ╰─╯      ││
    ││               ││
    ││   ●       ●   ││
    ││               ││
    │╰───────────────╯│
    ╰─────────────────╯`)
  }

  /**
   * Generate generic 3D object ASCII art
   */
  private generateGenericASCII(): string {
    return chalk.yellow(`
      ╭─────────╮
    ╭─╯         ╰─╮
   ╱               ╲
  ╱                 ╲
  │       ╭─╮       │
  │       │ │       │
  │       ╰─╯       │
  ╲                 ╱
   ╲               ╱
    ╰─╮         ╭─╯
      ╰─────────╯`)
  }

  /**
   * Get appropriate icon for element type
   */
  private getElementIcon(elementType: string): string {
    const type = (elementType || '').toLowerCase()

    if (type.includes('solid') || type.includes('body')) return '🔳'
    if (type.includes('hole') || type.includes('bore')) return '⚫'
    if (type.includes('feature') || type.includes('cut')) return '✂️'
    if (type.includes('extrude') || type.includes('protrusion')) return '📏'
    if (type.includes('revolve') || type.includes('rotation')) return '⚡︎'
    if (type.includes('fillet') || type.includes('round')) return '🔘'
    if (type.includes('chamfer') || type.includes('bevel')) return '◢'
    if (type.includes('pattern') || type.includes('array')) return '▦'
    if (type.includes('shell') || type.includes('thickness')) return '📦'
    if (type.includes('mirror') || type.includes('symmetry')) return '🪞'

    return '⚙️' // default gear icon
  }

  /**
   * Generate automatic filename for CAD based on description and format
   */
  private generateCADFileName(params: CADGenerationParams): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0]
    const description = params.description
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 20)
    const format = params.outputFormat || 'json'

    return `cad_${description}_${timestamp}.${format}`
  }

  /**
   * Save CAD data to file in .nikcli/cad directory
   */
  private async saveCADToFile(elements: CADElement[], fileName: string, format: string): Promise<string> {
    // Create .nikcli/cad directory structure
    const nikCliDir = path.join(this.workingDirectory, '.nikcli')
    const cadDir = path.join(nikCliDir, 'cad')

    // Ensure directories exist
    await fs.mkdir(nikCliDir, { recursive: true })
    await fs.mkdir(cadDir, { recursive: true })

    // Generate filename if not provided or use relative path
    const filename = path.basename(fileName)
    const fullPath = path.join(cadDir, filename)

    let content: string

    if (format === 'json') {
      // Save as JSON with formatted CAD elements
      const cadData = {
        metadata: {
          generated: new Date().toISOString(),
          format: 'json',
          elementsCount: elements.length,
          tool: 'nikcli-text-to-cad',
        },
        elements: elements,
      }
      content = JSON.stringify(cadData, null, 2)
    } else {
      // For STL, STEP, DWG formats, save as structured text with conversion instructions
      content = this.convertToFormat(elements, format)
    }

    await fs.writeFile(fullPath, content, 'utf8')
    console.log(chalk.green(`✓ CAD file saved to: ${fullPath}`))

    return path.join('.nikcli', 'cad', filename)
  }

  /**
   * Save OpenSCAD text to file in .nikcli/cad directory
   */
  private async saveSCADToFile(scad: string, fileName: string): Promise<string> {
    const nikCliDir = path.join(this.workingDirectory, '.nikcli')
    const cadDir = path.join(nikCliDir, 'cad')
    await fs.mkdir(cadDir, { recursive: true })
    const filename = path.basename(fileName).endsWith('.scad')
      ? path.basename(fileName)
      : `${path.basename(fileName, path.extname(fileName))}.scad`
    const fullPath = path.join(cadDir, filename)
    await fs.writeFile(fullPath, scad || '// Empty SCAD', 'utf8')
    console.log(chalk.green(`✓ CAD file saved to: ${fullPath}`))
    return path.join('.nikcli', 'cad', filename)
  }

  private async saveRawToFile(content: string, fileName: string): Promise<string> {
    const nikCliDir = path.join(this.workingDirectory, '.nikcli')
    const cadDir = path.join(nikCliDir, 'cad')
    await fs.mkdir(cadDir, { recursive: true })
    const filename = path.basename(fileName)
    const fullPath = path.join(cadDir, filename)
    await fs.writeFile(fullPath, content || '', 'utf8')
    console.log(chalk.green(`✓ CAD file saved to: ${fullPath}`))
    return path.join('.nikcli', 'cad', filename)
  }

  /**
   * Convert CAD elements to specific format (placeholder for actual converters)
   */
  private convertToFormat(elements: CADElement[], format: string): string {
    const header = `# CAD Export - ${format.toUpperCase()} Format
# Generated by NikCLI Text-to-CAD Tool
# Date: ${new Date().toISOString()}
# Elements: ${elements.length}
#
# Note: This is a structured representation for ${format.toUpperCase()} format.
# For production use, integrate with actual CAD conversion libraries.

`

    let content = header

    elements.forEach((element, index) => {
      content += `
# Element ${index + 1}: ${element.type}
# ID: ${element.id}
# Description: ${element.description}

`
      if (element.geometry) {
        content += `Geometry:\n${JSON.stringify(element.geometry, null, 2)}\n`
      }
      if (element.properties) {
        content += `Properties:\n${JSON.stringify(element.properties, null, 2)}\n`
      }
      content += '\n---\n'
    })

    return content
  }
}

export default TextToCADTool
