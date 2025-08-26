import { tool, embed, cosineSimilarity, generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { configManager } from './config-manager';
import { createOllama } from 'ollama-ai-provider';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const execAsync = promisify(exec);

export class AdvancedTools {

    private getModel() {
        const currentModelName = configManager.get('currentModel');
        const models = configManager.get('models');
        const configData = models[currentModelName];

        if (!configData) {
            throw new Error(`Model configuration not found for: ${currentModelName}`);
        }

        switch (configData.provider) {
            case 'openai': {
                const apiKey = configManager.getApiKey(currentModelName);
                if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (OpenAI)`);
                const openaiProvider = createOpenAI({ apiKey });
                return openaiProvider(configData.model);
            }
            case 'anthropic': {
                const apiKey = configManager.getApiKey(currentModelName);
                if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (Anthropic)`);
                const anthropicProvider = createAnthropic({ apiKey });
                return anthropicProvider(configData.model);
            }
            case 'ollama': {
                const apiKey = configManager.getApiKey(currentModelName);
                if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (Ollama)`);
                const ollamaProvider = createOllama();
                return ollamaProvider(configData.model);
            }
            case 'google': {
                const apiKey = configManager.getApiKey(currentModelName);
                if (!apiKey) throw new Error(`No API key found for model ${currentModelName} (Google)`);
                const geminiProvider = createGoogleGenerativeAI({ apiKey });
                return geminiProvider(configData.model);
            }
            default:
                throw new Error(`Unsupported provider: ${configData.provider}`);
        }
    }

    private getEmbeddingModel() {
        // Use OpenAI for embeddings
        const apiKey = configManager.getApiKey('gpt-4o-mini') || configManager.getApiKey('claude-sonnet-4-20250514');
        if (!apiKey) throw new Error('No API key found for embeddings');

        const openaiProvider = createOpenAI({ apiKey });
        return openaiProvider('text-embedding-3-small') as any; // Type assertion for embedding model
    }

    // Semantic search tool using embeddings
    getSemanticSearchTool() {
        return tool({
            description: 'Search for semantically similar content in the codebase using embeddings',
            parameters: z.object({
                query: z.string().describe('Search query to find similar content'),
                searchPath: z.string().default('.').describe('Path to search in'),
                fileTypes: z.array(z.string()).default(['.ts', '.js', '.tsx', '.jsx']).describe('File types to search'),
                maxResults: z.number().default(5).describe('Maximum number of results')
            }),
            execute: async ({ query, searchPath, fileTypes, maxResults }) => {
                try {
                    // console.log(chalk.blue(`🔍 Semantic search for: "${query}"`));

                    // Generate embedding for query
                    const queryEmbedding = await embed({
                        model: this.getEmbeddingModel(),
                        value: query
                    });

                    // Find files and generate embeddings
                    const files = this.findFiles(searchPath, fileTypes);
                    const results = [];

                    for (const file of files.slice(0, 20)) { // Limit to 20 files for performance
                        try {
                            const content = readFileSync(file, 'utf-8');
                            const fileEmbedding = await embed({
                                model: this.getEmbeddingModel(),
                                value: content.substring(0, 1000) // Limit content for embedding
                            });

                            const similarity = cosineSimilarity(queryEmbedding.embedding, fileEmbedding.embedding);

                            results.push({
                                file,
                                similarity,
                                content: content.substring(0, 200) + '...'
                            });
                        } catch (error) {
                            // Skip files that can't be read
                        }
                    }

                    // Sort by similarity and return top results
                    const topResults = results
                        .sort((a, b) => b.similarity - a.similarity)
                        .slice(0, maxResults);

                    return {
                        query,
                        results: topResults,
                        totalFiles: files.length,
                        searchTime: new Date().toISOString()
                    };
                } catch (error: any) {
                    return {
                        error: `Semantic search failed: ${error.message}`,
                        query
                    };
                }
            }
        });
    }

    // Code analysis and suggestions tool
    getCodeAnalysisTool() {
        return tool({
            description: 'Analyze code quality, patterns, and provide improvement suggestions',
            parameters: z.object({
                filePath: z.string().describe('Path to the file to analyze'),
                analysisType: z.enum(['quality', 'patterns', 'security', 'performance']).default('quality').describe('Type of analysis to perform')
            }),
            execute: async ({ filePath, analysisType }) => {
                try {
                    console.log(chalk.blue(`🔍 Analyzing code: ${filePath} (${analysisType})`));

                    if (!existsSync(filePath)) {
                        return { error: `File not found: ${filePath}` };
                    }

                    const content = readFileSync(filePath, 'utf-8');
                    const extension = extname(filePath);

                    // Generate analysis using AI
                    const analysis = await generateObject({
                        model: this.getModel() as any,
                        schema: z.object({
                            quality: z.object({
                                score: z.number().min(0).max(100),
                                issues: z.array(z.string()),
                                suggestions: z.array(z.string())
                            }),
                            patterns: z.object({
                                detected: z.array(z.string()),
                                recommendations: z.array(z.string())
                            }),
                            complexity: z.object({
                                cyclomatic: z.number(),
                                cognitive: z.number(),
                                halstead: z.object({
                                    volume: z.number(),
                                    difficulty: z.number(),
                                    effort: z.number()
                                })
                            })
                        }),
                        prompt: `Analyze this ${extension} code for ${analysisType}:

\`\`\`${extension}
${content}
\`\`\`

Provide detailed analysis including:
1. Code quality score and issues
2. Detected patterns and recommendations  
3. Complexity metrics
4. Specific improvement suggestions`
                    });

                    return {
                        filePath,
                        analysisType,
                        analysis: analysis.object,
                        timestamp: new Date().toISOString()
                    };
                } catch (error: any) {
                    return {
                        error: `Code analysis failed: ${error.message}`,
                        filePath,
                        analysisType
                    };
                }
            }
        });
    }

    // Dependency analysis tool
    getDependencyAnalysisTool() {
        return tool({
            description: 'Analyze project dependencies, security vulnerabilities, and optimization opportunities',
            parameters: z.object({
                includeDevDeps: z.boolean().default(true).describe('Include dev dependencies in analysis'),
                checkSecurity: z.boolean().default(true).describe('Check for security vulnerabilities'),
                suggestOptimizations: z.boolean().default(true).describe('Suggest dependency optimizations')
            }),
            execute: async ({ includeDevDeps, checkSecurity, suggestOptimizations }) => {
                try {
                    console.log(chalk.blue('📦 Analyzing project dependencies...'));

                    if (!existsSync('package.json')) {
                        return { error: 'No package.json found in current directory' };
                    }

                    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));

                    // Analyze dependencies
                    const analysis = await generateObject({
                        model: this.getModel() as any,
                        schema: z.object({
                            summary: z.object({
                                totalDeps: z.number(),
                                prodDeps: z.number(),
                                devDeps: z.number(),
                                outdatedCount: z.number(),
                                securityIssues: z.number()
                            }),
                            recommendations: z.array(z.object({
                                type: z.enum(['security', 'performance', 'maintenance', 'optimization']),
                                priority: z.enum(['low', 'medium', 'high', 'critical']),
                                description: z.string(),
                                action: z.string()
                            })),
                            outdated: z.array(z.object({
                                package: z.string(),
                                current: z.string(),
                                latest: z.string(),
                                type: z.enum(['patch', 'minor', 'major'])
                            }))
                        }),
                        prompt: `Analyze this package.json for dependency management:

\`\`\`json
${JSON.stringify(packageJson, null, 2)}
\`\`\`

Provide:
1. Summary of dependencies
2. Security and optimization recommendations
3. List of outdated packages
4. Specific actions to improve dependency management`
                    });

                    return {
                        analysis: analysis.object,
                        packageJson: {
                            name: packageJson.name,
                            version: packageJson.version,
                            dependencies: Object.keys(packageJson.dependencies || {}).length,
                            devDependencies: Object.keys(packageJson.devDependencies || {}).length
                        },
                        timestamp: new Date().toISOString()
                    };
                } catch (error: any) {
                    return {
                        error: `Dependency analysis failed: ${error.message}`
                    };
                }
            }
        });
    }

    // Git workflow analysis tool
    getGitWorkflowTool() {
        return tool({
            description: 'Analyze Git repository, commit patterns, and suggest workflow improvements',
            parameters: z.object({
                analyzeCommits: z.boolean().default(true).describe('Analyze recent commit patterns'),
                checkBranching: z.boolean().default(true).describe('Check branching strategy'),
                suggestWorkflow: z.boolean().default(true).describe('Suggest workflow improvements')
            }),
            execute: async ({ analyzeCommits, checkBranching, suggestWorkflow }) => {
                try {
                    console.log(chalk.blue('📊 Analyzing Git workflow...'));

                    // Get Git information
                    const { stdout: branch } = await execAsync('git branch --show-current');
                    const { stdout: status } = await execAsync('git status --porcelain');
                    const { stdout: recentCommits } = await execAsync('git log --oneline -10');
                    const { stdout: allBranches } = await execAsync('git branch -a');

                    const analysis = await generateObject({
                        model: this.getModel() as any,
                        schema: z.object({
                            currentState: z.object({
                                branch: z.string(),
                                hasChanges: z.boolean(),
                                changeCount: z.number(),
                                lastCommit: z.string()
                            }),
                            workflow: z.object({
                                score: z.number().min(0).max(100),
                                issues: z.array(z.string()),
                                suggestions: z.array(z.string())
                            }),
                            recommendations: z.array(z.object({
                                category: z.enum(['branching', 'commits', 'workflow', 'collaboration']),
                                priority: z.enum(['low', 'medium', 'high']),
                                description: z.string(),
                                action: z.string()
                            }))
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
4. Best practices for this type of project`
                    });

                    return {
                        analysis: analysis.object,
                        gitInfo: {
                            branch: branch.trim(),
                            hasChanges: status.trim().length > 0,
                            changeCount: status.split('\n').filter(line => line.trim()).length
                        },
                        timestamp: new Date().toISOString()
                    };
                } catch (error: any) {
                    return {
                        error: `Git workflow analysis failed: ${error.message}`
                    };
                }
            }
        });
    }

    // Helper function to find files
    private findFiles(dir: string, extensions: string[]): string[] {
        const files: string[] = [];

        try {
            const items = readdirSync(dir, { withFileTypes: true });

            for (const item of items) {
                const fullPath = join(dir, item.name);

                if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
                    files.push(...this.findFiles(fullPath, extensions));
                } else if (item.isFile() && extensions.includes(extname(item.name))) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Skip directories that can't be read
        }

        return files;
    }
}
