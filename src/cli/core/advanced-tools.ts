import { exec } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { cosineSimilarity, embed, generateObject, tool } from 'ai'
import chalk from 'chalk'
import { createOllama } from 'ollama-ai-provider'
import { z } from 'zod'
import { configManager } from './config-manager'
import { advancedUI } from '../ui/advanced-cli-ui'

const execAsync = promisify(exec)

export class AdvancedTools {
  private getModel() {
    const currentModelName = configManager.get('currentModel')
    const models = configManager.get('models')
    const configData = models[currentModelName]

    if (!configData) {
      throw new Error(`Model configuration not found for: ${currentModelName}`)
    }

    switch (configData.provider) {
      case 'openai': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (OpenAI)`)
        const openaiProvider = createOpenAI({ apiKey })
        return openaiProvider(configData.model)
      }
      case 'anthropic': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (Anthropic)`)
        const anthropicProvider = createAnthropic({ apiKey })
        return anthropicProvider(configData.model)
      }
      case 'ollama': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (Ollama)`)
        const ollamaProvider = createOllama()
        return ollamaProvider(configData.model)
      }
      case 'google': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (Google)`)
        const geminiProvider = createGoogleGenerativeAI({ apiKey })
        return geminiProvider(configData.model)
      }
      case 'openrouter': {
        const apiKey = configManager.getApiKey(currentModelName)
        if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (OpenRouter)`)
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.ai',
            'X-Title': 'NikCLI',
          },
        })
        return openrouterProvider(configData.model)
      }
      default:
        throw new Error(`Unsupported provider: ${configData.provider}`)
    }
  }

  private getEmbeddingModel(provider?: 'openai' | 'google' | 'openrouter') {
    // Auto-detect provider based on available API keys if not specified
    if (!provider) {
      const openaiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
      const googleKey = configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      const openrouterKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY

      if (openaiKey) provider = 'openai'
      else if (openrouterKey) provider = 'openrouter'
      else if (googleKey) provider = 'google'
      else throw new Error('No API key found for embeddings. Set OPENAI_API_KEY, OPENROUTER_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY')
    }

    switch (provider) {
      case 'openai': {
        const apiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
        if (!apiKey) throw new Error('OpenAI API key not found for embeddings')
        const openaiProvider = createOpenAI({ apiKey })
        return openaiProvider.embedding('text-embedding-3-small')
      }
      case 'google': {
        const apiKey = configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY
        if (!apiKey) throw new Error('Google API key not found for embeddings')
        const googleProvider = createGoogleGenerativeAI({ apiKey })
        return googleProvider.textEmbeddingModel('text-embedding-004')
      }
      case 'openrouter': {
        const apiKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
        if (!apiKey) throw new Error('OpenRouter API key not found for embeddings')
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.ai',
            'X-Title': 'NikCLI',
          },
        })
        return openrouterProvider.embedding('text-embedding-3-small')
      }

      default:
        throw new Error(`Unsupported embedding provider: ${provider}`)
    }
  }

  // Get available embedding providers
  getAvailableEmbeddingProviders(): Array<{ provider: string; available: boolean; model: string }> {
    const providers = []

    try {
      const openaiKey = configManager.getApiKey('openai') || process.env.OPENAI_API_KEY
      providers.push({
        provider: 'openai',
        available: !!openaiKey,
        model: 'text-embedding-3-small',
      })
    } catch { }

    try {
      const googleKey = configManager.getApiKey('google') || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      providers.push({
        provider: 'google',
        available: !!googleKey,
        model: 'text-embedding-004',
      })
    } catch { }

    try {
      const openrouterKey = configManager.getApiKey('openrouter') || process.env.OPENROUTER_API_KEY
      providers.push({
        provider: 'openrouter',
        available: !!openrouterKey,
        model: 'text-embedding-3-small',
      })
    } catch { }

    return providers
  }

  // Semantic search tool using embeddings
  getSemanticSearchTool() {
    return tool({
      description:
        'Search for semantically similar content in the codebase using embeddings with AI SDK support for OpenAI and Google providers',
      parameters: z.object({
        query: z.string().describe('Search query to find similar content'),
        searchPath: z.string().default('.').describe('Path to search in'),
        fileTypes: z.array(z.string()).default(['.ts', '.js', '.tsx', '.jsx']).describe('File types to search'),
        maxResults: z.number().default(5).describe('Maximum number of results'),
        embeddingProvider: z
          .enum(['openai', 'google'])
          .optional()
          .describe('Embedding provider to use (auto-detected if not specified)'),
      }),
      execute: async ({ query, searchPath, fileTypes, maxResults, embeddingProvider }) => {
        try {
          console.log(
            chalk.blue(`🔍 Semantic search for: "${query}" using ${embeddingProvider || 'auto-detected'} embeddings`)
          )

          // Generate embedding for query
          const model = this.getEmbeddingModel(embeddingProvider)
          const queryEmbedding = await embed({
            model,
            value: query,
          })

          // Find files and generate embeddings
          const files = this.findFiles(searchPath, fileTypes)
          const results = []

          for (const file of files.slice(0, 20)) {
            // Limit to 20 files for performance
            try {
              const content = readFileSync(file, 'utf-8')
              const fileEmbedding = await embed({
                model,
                value: content.substring(0, 1000), // Limit content for embedding
              })

              const similarity = cosineSimilarity(queryEmbedding.embedding, fileEmbedding.embedding)

              results.push({
                file,
                similarity,
                content: `${content.substring(0, 200)}...`,
              })
            } catch (_error) {
              // Skip files that can't be read
            }
          }

          // Sort by similarity and return top results
          const topResults = results.sort((a, b) => b.similarity - a.similarity).slice(0, maxResults)

          return {
            query,
            results: topResults,
            totalFiles: files.length,
            processedFiles: Math.min(files.length, 20),
            embeddingProvider: embeddingProvider || 'auto-detected',
            searchTime: new Date().toISOString(),
          }
        } catch (error: any) {
          return {
            error: `Semantic search failed: ${error.message}`,
            query,
          }
        }
      },
    })
  }

  // Tool to show available embedding providers
  getEmbeddingProvidersTool() {
    return tool({
      description: 'Show available embedding providers and their configuration status',
      parameters: z.object({
        showDetails: z.boolean().default(false).describe('Show detailed provider information'),
      }),
      execute: async ({ showDetails }) => {
        try {
          const providers = this.getAvailableEmbeddingProviders()
          const available = providers.filter((p) => p.available)
          const unavailable = providers.filter((p) => !p.available)

          console.log(chalk.blue('🔌 Available Embedding Providers:'))

          if (available.length > 0) {
            available.forEach((provider) => {
              console.log(chalk.green(`✓ ${provider.provider}: ${provider.model}`))
            })
          } else {
            console.log(chalk.yellow('⚠️  No embedding providers are currently available'))
          }

          if (unavailable.length > 0 && showDetails) {
            console.log(chalk.yellow('\n📋 Unavailable Providers (missing API keys):'))
            unavailable.forEach((provider) => {
              console.log(chalk.gray(`❌ ${provider.provider}: ${provider.model}`))
            })
          }

          return {
            total: providers.length,
            available: available.length,
            unavailable: unavailable.length,
            providers: showDetails ? providers : available,
            recommendation:
              available.length === 0
                ? 'Set at least one API key: OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY'
                : `Using ${available[0].provider} as default provider`,
          }
        } catch (error: any) {
          return {
            error: `Failed to check embedding providers: ${error.message}`,
            providers: [],
          }
        }
      },
    })
  }

  // Code analysis and suggestions tool
  getCodeAnalysisTool() {
    return tool({
      description: 'Analyze code quality, patterns, and provide improvement suggestions',
      parameters: z.object({
        filePath: z.string().describe('Path to the file to analyze'),
        analysisType: z
          .enum(['quality', 'patterns', 'security', 'performance'])
          .default('quality')
          .describe('Type of analysis to perform'),
      }),
      execute: async ({ filePath, analysisType }) => {
        try {
          advancedUI.logInfo(`🔍 Analyzing code: ${filePath} (${analysisType})`)

          if (!existsSync(filePath)) {
            return { error: `File not found: ${filePath}` }
          }

          const content = readFileSync(filePath, 'utf-8')
          const extension = extname(filePath)

          // Generate analysis using AI
          const analysis = await generateObject({
            model: this.getModel() as any,
            schema: z.object({
              quality: z.object({
                score: z.number().min(0).max(100),
                issues: z.array(z.string()),
                suggestions: z.array(z.string()),
              }),
              patterns: z.object({
                detected: z.array(z.string()),
                recommendations: z.array(z.string()),
              }),
              complexity: z.object({
                cyclomatic: z.number(),
                cognitive: z.number(),
                halstead: z.object({
                  volume: z.number(),
                  difficulty: z.number(),
                  effort: z.number(),
                }),
              }),
            }),
            prompt: `Analyze this ${extension} code for ${analysisType}:

\`\`\`${extension}
${content}
\`\`\`

Provide detailed analysis including:
1. Code quality score and issues
2. Detected patterns and recommendations  
3. Complexity metrics
4. Specific improvement suggestions`,
          })

          return {
            filePath,
            analysisType,
            analysis: analysis.object,
            timestamp: new Date().toISOString(),
          }
        } catch (error: any) {
          return {
            error: `Code analysis failed: ${error.message}`,
            filePath,
            analysisType,
          }
        }
      },
    })
  }

  // Dependency analysis tool
  getDependencyAnalysisTool() {
    return tool({
      description: 'Analyze project dependencies, security vulnerabilities, and optimization opportunities',
      parameters: z.object({
        includeDevDeps: z.boolean().default(true).describe('Include dev dependencies in analysis'),
        checkSecurity: z.boolean().default(true).describe('Check for security vulnerabilities'),
        suggestOptimizations: z.boolean().default(true).describe('Suggest dependency optimizations'),
      }),
      execute: async ({ includeDevDeps, checkSecurity, suggestOptimizations }) => {
        try {
          advancedUI.logInfo('📦 Analyzing project dependencies...')

          if (!existsSync('package.json')) {
            return { error: 'No package.json found in current directory' }
          }

          const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'))

          // Analyze dependencies
          const analysis = await generateObject({
            model: this.getModel() as any,
            schema: z.object({
              summary: z.object({
                totalDeps: z.number(),
                prodDeps: z.number(),
                devDeps: z.number(),
                outdatedCount: z.number(),
                securityIssues: z.number(),
              }),
              recommendations: z.array(
                z.object({
                  type: z.enum(['security', 'performance', 'maintenance', 'optimization']),
                  priority: z.enum(['low', 'medium', 'high', 'critical']),
                  description: z.string(),
                  action: z.string(),
                })
              ),
              outdated: z.array(
                z.object({
                  package: z.string(),
                  current: z.string(),
                  latest: z.string(),
                  type: z.enum(['patch', 'minor', 'major']),
                })
              ),
            }),
            prompt: `Analyze this package.json for dependency management:

\`\`\`json
${JSON.stringify(packageJson, null, 2)}
\`\`\`

Provide:
1. Summary of dependencies
2. Security and optimization recommendations
3. List of outdated packages
4. Specific actions to improve dependency management`,
          })

          return {
            analysis: analysis.object,
            packageJson: {
              name: packageJson.name,
              version: packageJson.version,
              dependencies: Object.keys(packageJson.dependencies || {}).length,
              devDependencies: Object.keys(packageJson.devDependencies || {}).length,
            },
            timestamp: new Date().toISOString(),
          }
        } catch (error: any) {
          return {
            error: `Dependency analysis failed: ${error.message}`,
          }
        }
      },
    })
  }

  // Git workflow analysis tool
  getGitWorkflowTool() {
    return tool({
      description: 'Analyze Git repository, commit patterns, and suggest workflow improvements',
      parameters: z.object({
        analyzeCommits: z.boolean().default(true).describe('Analyze recent commit patterns'),
        checkBranching: z.boolean().default(true).describe('Check branching strategy'),
        suggestWorkflow: z.boolean().default(true).describe('Suggest workflow improvements'),
      }),
      execute: async ({ analyzeCommits, checkBranching, suggestWorkflow }) => {
        try {
          advancedUI.logInfo('📊 Analyzing Git workflow...')

          // Get Git information
          const { stdout: branch } = await execAsync('git branch --show-current')
          const { stdout: status } = await execAsync('git status --porcelain')
          const { stdout: recentCommits } = await execAsync('git log --oneline -10')
          const { stdout: allBranches } = await execAsync('git branch -a')

          const analysis = await generateObject({
            model: this.getModel() as any,
            schema: z.object({
              currentState: z.object({
                branch: z.string(),
                hasChanges: z.boolean(),
                changeCount: z.number(),
                lastCommit: z.string(),
              }),
              workflow: z.object({
                score: z.number().min(0).max(100),
                issues: z.array(z.string()),
                suggestions: z.array(z.string()),
              }),
              recommendations: z.array(
                z.object({
                  category: z.enum(['branching', 'commits', 'workflow', 'collaboration']),
                  priority: z.enum(['low', 'medium', 'high']),
                  description: z.string(),
                  action: z.string(),
                })
              ),
            }),
            prompt: `Analyze this Git repository state and suggest improvements:

**Current Branch**: ${branch.trim()}
**Status**: ${status.trim() || 'Clean'}
**Recent Commits**:
${recentCommits}
**All Branches**:
${allBranches}

Provide:
1. Current repository state analysis
2. Workflow quality score and issues
3. Specific recommendations for improvement
4. Best practices for this type of project`,
          })

          return {
            analysis: analysis.object,
            gitInfo: {
              branch: branch.trim(),
              hasChanges: status.trim().length > 0,
              changeCount: status.split('\n').filter((line) => line.trim()).length,
            },
            timestamp: new Date().toISOString(),
          }
        } catch (error: any) {
          return {
            error: `Git workflow analysis failed: ${error.message}`,
          }
        }
      },
    })
  }

  // Helper function to find files
  private findFiles(dir: string, extensions: string[]): string[] {
    const files: string[] = []

    try {
      const items = readdirSync(dir, { withFileTypes: true })

      for (const item of items) {
        const fullPath = join(dir, item.name)

        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          files.push(...this.findFiles(fullPath, extensions))
        } else if (item.isFile() && extensions.includes(extname(item.name))) {
          files.push(fullPath)
        }
      }
    } catch (_error) {
      // Skip directories that can't be read
    }

    return files
  }
}
