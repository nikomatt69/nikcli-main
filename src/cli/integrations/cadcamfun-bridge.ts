/**
 * CADCamFun AI System Bridge
 * Connects NikCLI to the existing CADCamFun text-to-CAD AI system
 */

import { exec } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import chalk from 'chalk'

const execAsync = promisify(exec)

export interface CADCamFunConfig {
  systemPath: string
  serverUrl?: string
  apiKey?: string
  defaultFormat: 'stl' | 'step' | 'dwg' | 'json'
}

export interface CADGenerationOptions {
  description: string
  constraints?: Record<string, any>
  outputFormat?: 'stl' | 'step' | 'dwg' | 'json'
  streaming?: boolean
  outputPath?: string
}

export interface CADGenerationResponse {
  success: boolean
  elements?: any[]
  filePath?: string
  error?: string
  metadata?: {
    generationTime: number
    elementsCount: number
    complexity: string
  }
}

export class CADCamFunBridge {
  private config: CADCamFunConfig
  private isSystemAvailable: boolean = false
  private entryFile: string | null = null
  private entryIsTS: boolean = false

  constructor(config: CADCamFunConfig) {
    this.config = config
  }

  /**
   * Initialize connection to CADCamFun system
   */
  async initialize(): Promise<boolean> {
    try {
      // Allow environment override
      const envPath = process.env.NIKCLI_CAD_SYSTEM_PATH || process.env.CADCAMFUN_PATH
      const basePath = envPath || this.config.systemPath

      // Check for TS and JS entry variants
      const candidates = [
        path.join(basePath, 'unifiedAIService.ts'),
        path.join(basePath, 'unifiedAIService.js'),
        path.join(basePath, 'index.ts'),
        path.join(basePath, 'index.js'),
        // common dist build locations
        path.join(basePath, '..', 'dist', 'ai', 'unifiedAIService.js'),
        path.join(basePath, '..', 'build', 'ai', 'unifiedAIService.js'),
      ]

      let found: string | null = null
      for (const p of candidates) {
        try {
          await fs.access(p)
          found = p
          break
        } catch {}
      }

      if (!found) {
        this.isSystemAvailable = false
        console.log(
          chalk.yellow(
            `⚠️ CADCamFun system entry not found. Set NIKCLI_CAD_SYSTEM_PATH or provide a valid systemPath. Tried: ${candidates.join(
              ', '
            )}`
          )
        )
        return false
      }

      this.entryFile = found
      this.entryIsTS = found.endsWith('.ts')
      this.isSystemAvailable = true

      return true
    } catch (error) {
      console.log(chalk.yellow('⚠️ CADCamFun system not available'))
      console.log(chalk.gray(`   Path: ${this.config.systemPath}`))
      if ((error as any)?.message) console.log(chalk.gray(`   Reason: ${(error as any).message}`))
      this.isSystemAvailable = false
      return false
    }
  }

  /**
   * Generate CAD model using the CADCamFun system
   */
  async generateCAD(options: CADGenerationOptions): Promise<CADGenerationResponse> {
    if (!this.isSystemAvailable) {
      return {
        success: false,
        error: 'CADCamFun system not available',
      }
    }

    const _startTime = Date.now()

    try {
      if (this.config.serverUrl) {
        // Use HTTP API if server is running
        return await this.generateViaAPI(options)
      } else {
        // Use direct Node.js integration
        return await this.generateViaNodeJS(options)
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Generate via HTTP API (if CADCamFun has a server running)
   */
  private async generateViaAPI(options: CADGenerationOptions): Promise<CADGenerationResponse> {
    const response = await fetch(`${this.config.serverUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.config.apiKey ? `Bearer ${this.config.apiKey}` : '',
      },
      body: JSON.stringify({
        description: options.description,
        constraints: options.constraints,
        outputFormat: options.outputFormat || this.config.defaultFormat,
        streaming: options.streaming || false,
      }),
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return await response.json()
  }

  /**
   * Generate via direct Node.js integration
   */
  private async generateViaNodeJS(options: CADGenerationOptions): Promise<CADGenerationResponse> {
    // Create a temporary Node.js script to run your CAD generation
    const scriptPath = '/tmp/cadcamfun-bridge-script.js'
    const outputPath = options.outputPath || `/tmp/cad-output-${Date.now()}.${options.outputFormat || 'json'}`

    const entryFile = this.entryFile || path.join(this.config.systemPath, 'unifiedAIService.ts')
    const useTS = this.entryIsTS || entryFile.endsWith('.ts')
    const script = this.generateBridgeScript(options, outputPath, entryFile, useTS)

    // Write the script
    await fs.writeFile(scriptPath, script)

    try {
      // Execute the script
      const { stdout, stderr } = await execAsync(`node ${scriptPath}`)

      if (stderr) {
        console.log(chalk.yellow(`⚠️ Script warnings: ${stderr}`))
      }

      // Parse the result
      const result = JSON.parse(stdout)

      // Check if output file was created
      let filePath: string | undefined
      try {
        await fs.access(outputPath)
        filePath = outputPath
      } catch {
        // File not created
      }

      return {
        success: true,
        elements: result.elements,
        filePath,
        metadata: result.metadata,
      }
    } finally {
      // Cleanup script
      try {
        await fs.unlink(scriptPath)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Generate bridge script for Node.js execution
   */
  private generateBridgeScript(
    options: CADGenerationOptions,
    outputPath: string,
    entryFile: string,
    useTS: boolean
  ): string {
    return `
// Auto-generated bridge script for CADCamFun integration
const path = require('path');

// Add your CADCamFun system to module path
const entryFile = '${entryFile.replace(/\\/g, '\\\\')}';
const useTS = ${useTS ? 'true' : 'false'};

async function generateCAD() {
  try {
    if (useTS) {
      try { require('ts-node/register/transpile-only'); }
      catch (e) {
        console.error(JSON.stringify({ error: 'ts-node is required to load TypeScript files', detail: e.message }));
        process.exit(1);
      }
    }

    // Import your CAD services (module should export UnifiedAIService)
    const mod = require(entryFile);
    const UnifiedAIService = mod.UnifiedAIService || mod.default || mod.unifiedAIService;
    if (!UnifiedAIService) {
      console.error(JSON.stringify({ error: 'UnifiedAIService not exported by entry module' }));
      process.exit(1);
    }

    const options = ${JSON.stringify(options)};
    const outputPath = '${outputPath}';

    // Use your existing services
    const aiService = new UnifiedAIService();

    // Generate CAD model
    const result = await aiService.generateTextToCAD({
      description: options.description,
      constraints: options.constraints || {},
      outputFormat: options.outputFormat || 'json'
    });

    // If you have export functionality, use it
    if (options.outputFormat !== 'json' && result.elements) {
      // Export to file using your existing export logic
      // await exportToFile(result.elements, outputPath, options.outputFormat);
    }

    // Return result
    const response = {
      elements: result.elements || [],
      metadata: {
        generationTime: Date.now() - ${Date.now()},
        elementsCount: result.elements ? result.elements.length : 0,
        complexity: result.complexity || 'unknown'
      }
    };

    console.log(JSON.stringify(response));

  } catch (error) {
    console.error(JSON.stringify({
      error: error.message,
      stack: error.stack
    }));
    process.exit(1);
  }
}

generateCAD().catch(console.error);
`
  }

  /**
   * Stream CAD generation with real-time updates
   */
  async streamCAD(
    _options: CADGenerationOptions,
    onProgress?: (chunk: any) => void,
    onElement?: (element: any) => void
  ): Promise<CADGenerationResponse> {
    if (!this.isSystemAvailable) {
      return {
        success: false,
        error: 'CADCamFun system not available',
      }
    }

    console.log(chalk.blue('⚡︎ Starting streaming CAD generation...'))

    // Mock streaming for now - replace with your actual TextToCADStreamService
    const elements: any[] = []
    const steps = [
      'Analyzing description',
      'Parsing constraints',
      'Generating base geometry',
      'Adding features',
      'Optimizing structure',
      'Finalizing model',
    ]

    for (let i = 0; i < steps.length; i++) {
      const progress = Math.round(((i + 1) / steps.length) * 100)

      if (onProgress) {
        onProgress({
          step: steps[i],
          progress,
          total: steps.length,
        })
      }

      console.log(chalk.gray(`   ${steps[i]}... ${progress}%`))

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Simulate element generation
      const element = {
        id: `element_${i}`,
        type: 'geometry',
        description: steps[i],
        timestamp: Date.now(),
      }

      elements.push(element)

      if (onElement) {
        onElement(element)
      }
    }

    return {
      success: true,
      elements,
      metadata: {
        generationTime: steps.length * 300,
        elementsCount: elements.length,
        complexity: 'medium',
      },
    }
  }

  /**
   * Check if CADCamFun system is available
   */
  isAvailable(): boolean {
    return this.isSystemAvailable
  }

  /**
   * Get system capabilities
   */
  getCapabilities(): string[] {
    if (!this.isSystemAvailable) {
      return ['System not available']
    }

    return [
      'Text-to-CAD generation',
      'Streaming generation',
      'Multiple output formats',
      'Constraint-based design',
      'Component library',
      'Assembly generation',
      'Geometric validation',
    ]
  }
}

// Default configuration for CADCamFun integration
export const defaultCADConfig: CADCamFunConfig = {
  systemPath: '/Volumes/SSD/Development/dev/cadcamfun/src/lib/ai',
  defaultFormat: 'json',
}

// Factory function to create bridge instance
export function createCADCamFunBridge(config?: Partial<CADCamFunConfig>): CADCamFunBridge {
  const finalConfig = {
    ...defaultCADConfig,
    ...config,
  }

  return new CADCamFunBridge(finalConfig)
}

export default CADCamFunBridge
