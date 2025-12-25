import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'
import inquirer from 'inquirer'

export interface CreatedPlugin {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'tool' | 'agent' | 'ui' | 'integration' | 'middleware' | 'other'
  template: 'basic' | 'agent'
  path: string
}

interface WizardState {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'tool' | 'agent' | 'ui' | 'integration' | 'middleware' | 'other'
  template: 'basic' | 'agent'
}

export class PluginCreationWizard {
  private state: WizardState
  private readonly pluginsPath: string

  constructor() {
    this.state = {
      id: '',
      name: '',
      description: '',
      author: '',
      version: '1.0.0',
      category: 'tool',
      template: 'basic',
    }
    this.pluginsPath = path.join(process.cwd(), '.nikcli', 'plugins')
  }

  /**
   * Start the plugin creation wizard
   */
  async start(): Promise<CreatedPlugin | null> {
    console.clear()
    console.log(chalk.cyan.bold('\n🔌 Plugin Creation Wizard'))
    console.log(chalk.gray('Create a new plugin step by step\n'))

    try {
      // Step 1: Plugin ID and Name
      await this.stepIdAndName()

      // Step 2: Description
      await this.stepDescription()

      // Step 3: Author
      await this.stepAuthor()

      // Step 4: Category
      await this.stepCategory()

      // Step 5: Template
      await this.stepTemplate()

      // Step 6: Create plugin
      const plugin = await this.stepCreate()

      return plugin
    } catch (error) {
      console.log(chalk.red('\n✗ Wizard cancelled or error occurred'))
      return null
    }
  }

  /**
   * Step 1: Plugin ID and Name
   */
  private async stepIdAndName(): Promise<void> {
    console.log(chalk.yellow('\n📝 Step 1: Plugin Identity'))
    console.log(chalk.gray('Define the unique identifier and display name\n'))

    const { id } = await inquirer.prompt([
      {
        type: 'input',
        name: 'id',
        message: 'Plugin ID (kebab-case, e.g., my-awesome-plugin):',
        validate: (val: string) => {
          if (!val || val.length < 3) return 'ID must be at least 3 characters'
          if (!/^[a-z][a-z0-9-]*$/.test(val)) return 'ID must be kebab-case (lowercase letters, numbers, hyphens)'
          return true
        },
      },
    ])

    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Display name:',
        validate: (val: string) => {
          if (!val || val.length < 3) return 'Name must be at least 3 characters'
          return true
        },
      },
    ])

    this.state.id = id
    this.state.name = name
  }

  /**
   * Step 2: Description
   */
  private async stepDescription(): Promise<void> {
    console.log(chalk.yellow('\n📝 Step 2: Description'))
    console.log(chalk.gray('Describe what your plugin does\n'))

    const { description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        validate: (val: string) => {
          if (!val || val.length < 10) return 'Description must be at least 10 characters'
          return true
        },
      },
    ])

    this.state.description = description
  }

  /**
   * Step 3: Author
   */
  private async stepAuthor(): Promise<void> {
    console.log(chalk.yellow('\n👤 Step 3: Author Information'))
    console.log(chalk.gray('Enter your contact information\n'))

    const { author } = await inquirer.prompt([
      {
        type: 'input',
        name: 'author',
        message: 'Author name:',
        default: 'Your Name',
      },
    ])

    this.state.author = author
  }

  /**
   * Step 4: Category
   */
  private async stepCategory(): Promise<void> {
    console.log(chalk.yellow('\n📁 Step 4: Plugin Category'))
    console.log(chalk.gray('Choose the category that best fits your plugin\n'))

    const { category } = await inquirer.prompt([
      {
        type: 'list',
        name: 'category',
        message: 'Category:',
        choices: [
          { name: 'Tool - Adds new capabilities/actions', value: 'tool' },
          { name: 'Agent - Adds new AI agent types', value: 'agent' },
          { name: 'UI - Adds UI components or themes', value: 'ui' },
          { name: 'Integration - Connects to external services', value: 'integration' },
          { name: 'Middleware - Adds processing/transformations', value: 'middleware' },
          { name: 'Other - Miscellaneous functionality', value: 'other' },
        ],
      },
    ])

    this.state.category = category
  }

  /**
   * Step 5: Template
   */
  private async stepTemplate(): Promise<void> {
    console.log(chalk.yellow('\n📦 Step 5: Choose Template'))
    console.log(chalk.gray('Select a starting template for your plugin\n'))

    const { template } = await inquirer.prompt([
      {
        type: 'list',
        name: 'template',
        message: 'Template:',
        choices: [
          { name: 'Basic - Simple tool plugin', value: 'basic' },
          { name: 'Agent - Full agent with custom behavior', value: 'agent' },
        ],
      },
    ])

    this.state.template = template
  }

  /**
   * Step 6: Create Plugin
   */
  private async stepCreate(): Promise<CreatedPlugin> {
    console.log(chalk.yellow('\n✨ Creating Plugin...'))

    const pluginPath = path.join(this.pluginsPath, this.state.id)
    fs.mkdirSync(pluginPath, { recursive: true })

    // Create nikcli-plugin.json manifest
    const manifest = {
      metadata: {
        id: this.state.id,
        name: this.state.name,
        description: this.state.description,
        version: this.state.version,
        author: {
          name: this.state.author,
        },
        license: 'MIT',
        category: this.state.category,
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
      name: `@nikcli/plugin-${this.state.id}`,
      version: this.state.version,
      description: this.state.description,
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

    // Create TypeScript config
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
        declarationMap: true,
        sourceMap: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    }

    fs.writeFileSync(path.join(pluginPath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))

    // Create src directory and index.ts
    const srcDir = path.join(pluginPath, 'src')
    fs.mkdirSync(srcDir, { recursive: true })

    if (this.state.template === 'basic') {
      this.createBasicTemplate(srcDir)
    } else {
      this.createAgentTemplate(srcDir)
    }

    // Create .gitignore
    const gitignore = ['node_modules', 'dist', '*.log', '.DS_Store']
    fs.writeFileSync(path.join(pluginPath, '.gitignore'), gitignore.join('\n'))

    console.log(chalk.green('\n✓ Plugin created successfully!'))
    console.log(chalk.gray(`Location: ${pluginPath}`))
    console.log(chalk.cyan('\nNext steps:'))
    console.log(chalk.white(`  cd ${pluginPath}`))
    console.log(chalk.white('  npm install'))
    console.log(chalk.white('  npm run dev'))

    return {
      id: this.state.id,
      name: this.state.name,
      description: this.state.description,
      author: this.state.author,
      version: this.state.version,
      category: this.state.category,
      template: this.state.template,
      path: pluginPath,
    }
  }

  /**
   * Create basic template files
   */
  private createBasicTemplate(srcDir: string): void {
    const indexContent = `import { definePlugin, tool } from '@nikcli/core/plugin-sdk';
import { z } from 'zod';

export default definePlugin((context) => {
  // Register custom tools
  context.tools.register('example', tool({
    description: 'An example tool that demonstrates the plugin structure',
    schema: z.object({
      input: z.string().describe('Input value to process'),
    }),
    execute: async (args, ctx) => {
      // Your tool logic here
      return {
        processed: args.input,
        timestamp: Date.now(),
        pluginId: ctx.manifest.metadata.id,
      };
    },
  }));

  // Listen to events
  context.events.on('session.start', () => {
    ctx.logger.info('Plugin activated!');
  });

  return {
    onLoad: () => {
      ctx.logger.info('Plugin loaded');
    },
    onUnload: () => {
      ctx.logger.info('Plugin unloaded');
    },
  };
});
`

    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent)
  }

  /**
   * Create agent template files
   */
  private createAgentTemplate(srcDir: string): void {
    const indexContent = `import { definePlugin, tool } from '@nikcli/core/plugin-sdk';
import { z } from 'zod';
import type { Agent, AgentContext } from '../types/types';

export default definePlugin((context) => {
  // Define a custom agent
  const myAgent: Agent = {
    id: '${this.state.id}-agent',
    name: context.manifest.metadata.name,
    description: context.manifest.metadata.description,
    type: 'custom',
    version: context.manifest.metadata.version,
    capabilities: ['reasoning', 'tool-use', 'memory'],
    maxIterations: 10,
    systemPrompt: \`You are a helpful assistant built with the \${context.manifest.metadata.name} plugin.
You have access to custom tools registered by this plugin.
Always be helpful and provide clear explanations.
\`,
    initialize: async (ctx: AgentContext) => {
      context.logger.info('Custom agent initialized');
    },
    execute: async (task: string, ctx: AgentContext) => {
      // Custom agent logic
      return {
        success: true,
        result: \`Task completed: \${task}\`,
        iterations: 1,
      };
    },
  };

  // Register tools
  context.tools.register('process', tool({
    description: 'Process data with custom logic',
    schema: z.object({
      data: z.string().describe('Data to process'),
      mode: z.enum(['fast', 'detailed']).default('fast').describe('Processing mode'),
    }),
    execute: async (args, ctx) => {
      return {
        processed: args.data.toUpperCase(),
        mode: args.mode,
        pluginId: ctx.manifest.metadata.id,
      };
    },
  }));

  // Register the agent
  context.agents.register(myAgent);

  // Listen to events
  context.events.on('session.start', () => {
    context.logger.info('Agent plugin activated!');
  });

  return {
    onLoad: () => {
      context.logger.info('Agent plugin loaded');
    },
    onUnload: () => {
      context.logger.info('Agent plugin unloaded');
    },
  };
});
`

    fs.writeFileSync(path.join(srcDir, 'index.ts'), indexContent)
  }
}
