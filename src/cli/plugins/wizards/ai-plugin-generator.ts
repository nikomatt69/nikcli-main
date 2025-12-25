import * as fs from 'node:fs'
import * as path from 'node:path'
import { advancedAIProvider } from '../../ai/advanced-ai-provider'

export interface AIPluginSpec {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'tool' | 'agent' | 'ui' | 'integration' | 'middleware' | 'other'
  tools: Array<{
    name: string
    description: string
    parameters: string
    code: string
  }>
  hooks?: {
    onLoad?: string
    onUnload?: string
    onActivate?: string
  }
}

export class AIPluginGenerator {
  private readonly pluginsPath: string

  constructor() {
    this.pluginsPath = path.join(process.cwd(), '.nikcli', 'plugins')
  }

  /**
   * Generate a plugin from natural language description
   */
  async generateFromDescription(description: string): Promise<AIPluginSpec | null> {
    console.log(chalk.cyan.bold('\n🤖 AI Plugin Generator'))
    console.log(chalk.gray('Analyzing your request...\n'))

    const systemPrompt = `You are a NikCLI plugin generator. Your task is to analyze the user's request and generate a plugin specification.

Respond with a valid JSON object (no markdown, no comments) with this structure:
{
  "id": "kebab-case-plugin-id",
  "name": "Plugin Name",
  "description": "Brief description",
  "author": "Author Name",
  "version": "1.0.0",
  "category": "tool | agent | ui | integration | middleware | other",
  "tools": [
    {
      "name": "tool_name",
      "description": "What the tool does",
      "parameters": "JSON schema for tool parameters",
      "code": "JavaScript/TypeScript code for execute function"
    }
  ],
  "hooks": {
    "onLoad": "Optional code for onLoad hook",
    "onUnload": "Optional code for onUnload hook",
    "onActivate": "Optional code for onActivate hook"
  }
}

Rules:
- ID must be kebab-case (lowercase, numbers, hyphens only)
- Name should be human-readable
- Category should match the plugin's primary purpose
- Each tool must have unique name
- Code should be TypeScript compatible
- Tools should use the PluginContext for logging, config, etc.

Example:
Input: "crea un plugin che cerca file per contenuto"
Output: {
  "id": "file-searcher",
  "name": "File Searcher",
  "description": "Search files by content",
  "author": "User",
  "version": "1.0.0",
  "category": "tool",
  "tools": [{
    "name": "search_content",
    "description": "Search files matching a pattern",
    "parameters": "{\\"pattern\\": {\\"type\\": \\"string\\", \\"description\\": \\"Search pattern\\"}, \\"path\\": {\\"type\\": \\"string\\", \\"description\\": \\"Base path\\"}}",
    "code": "async (args, ctx) => { const results = await this.searchFiles(args.pattern, args.path); return { results }; }"
  }]
}`

    try {
      const response = await advancedAIProvider.generateText(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: description },
        ],
        { maxTokens: 2000 }
      )

      const jsonText = response.text.trim()

      // Clean up markdown code blocks if present
      const cleanedJson = jsonText
        .replace(/```json?\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()

      const spec = JSON.parse(cleanedJson) as AIPluginSpec
      return spec
    } catch (error) {
      console.error(chalk.red('Failed to generate plugin spec:'), error)
      return null
    }
  }

  /**
   * Create plugin files from spec
   */
  async createPluginFromSpec(spec: AIPluginSpec): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      const pluginPath = path.join(this.pluginsPath, spec.id)

      // Check if plugin already exists
      if (fs.existsSync(pluginPath)) {
        return { success: false, path: pluginPath, error: 'Plugin already exists' }
      }

      fs.mkdirSync(pluginPath, { recursive: true })

      // Create manifest
      const manifest = {
        metadata: {
          id: spec.id,
          name: spec.name,
          description: spec.description,
          version: spec.version,
          author: { name: spec.author },
          license: 'MIT',
          category: spec.category,
        },
        main: 'src/index.ts',
        permissions: {},
        settings: {
          priority: 0,
          hotReloadable: true,
          sandboxed: true,
        },
      }

      fs.writeFileSync(path.join(pluginPath, 'nikcli-plugin.json'), JSON.stringify(manifest, null, 2))

      // Create package.json
      const packageJson = {
        name: `@nikcli/plugin-${spec.id}`,
        version: spec.version,
        description: spec.description,
        main: 'src/index.ts',
        scripts: {
          build: 'tsc',
          dev: 'ts-node src/index.ts',
        },
        dependencies: {},
        devDependencies: {
          typescript: '^5.0.0',
          '@types/node': '^20.0.0',
        },
      }

      fs.writeFileSync(path.join(pluginPath, 'package.json'), JSON.stringify(packageJson, null, 2))

      // Create tsconfig.json
      const tsconfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          lib: ['ES2020'],
          outDir: './dist',
          rootDir: './src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          declaration: true,
          sourceMap: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
      }

      fs.writeFileSync(path.join(pluginPath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

      // Create .gitignore
      fs.writeFileSync(path.join(pluginPath, '.gitignore'), 'node_modules\ndist\n*.log\n.DS_Store\n')

      // Generate plugin code
      const indexContent = this.generatePluginCode(spec)

      const srcDir = path.join(pluginPath, 'src')
      fs.mkdirSync(srcDir, { recursive: true })
      fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent)

      return { success: true, path: pluginPath }
    } catch (error) {
      return { success: false, path: '', error: (error as Error).message }
    }
  }

  /**
   * Generate plugin TypeScript code from spec
   */
  private generatePluginCode(spec: AIPluginSpec): string {
    const toolsCode = spec.tools
      .map((tool) => {
        let parametersCode = '{}'
        try {
          parametersCode = JSON.stringify(JSON.parse(tool.parameters), null, 2)
        } catch {}

        return `
  context.tools.register('${tool.name}', tool({
    description: '${tool.description}',
    schema: ${parametersCode},
    execute: async (args, ctx) => {
      ${tool.code}
    },
  }))`
      })
      .join('\n')

    const hooksCode: string[] = []
    if (spec.hooks?.onLoad) {
      hooksCode.push(`onLoad: () => { ${spec.hooks.onLoad} },`)
    }
    if (spec.hooks?.onUnload) {
      hooksCode.push(`onUnload: () => { ${spec.hooks.onUnload} },`)
    }
    if (spec.hooks?.onActivate) {
      hooksCode.push(`onActivate: (ctx) => { ${spec.hooks.onActivate} },`)
    }

    return `import { definePlugin, tool } from '@nikcli/core/plugin-sdk';
import { z } from 'zod';

/**
 * ${spec.description}
 * Generated by AI Plugin Generator
 */
export default definePlugin((context) => {
  console.log('[${spec.id}] Plugin loaded');

${toolsCode}

  // Event listeners
  context.events.on('session.start', () => {
    context.logger.info('Plugin activated!');
  });

  return {
${hooksCode.join('\n')}
  };
});
`
  }
}

import chalk from 'chalk'
