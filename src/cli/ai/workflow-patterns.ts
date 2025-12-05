/**
 * AI SDK Workflow Patterns
 * Reference: https://ai-sdk.dev/docs/agents/workflows
 * 
 * Patterns implemented:
 * - Sequential Processing (Chains) - Steps executed in order
 * - Parallel Processing - Independent tasks run simultaneously
 * - Routing - Directing work based on context
 * - Orchestrator-Worker - Primary model coordinates specialized workers
 * - Evaluator-Optimizer - Quality control with evaluation steps
 */

import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import { simpleConfigManager } from '../core/config-manager'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface WorkflowStep<T = any> {
    name: string
    execute: (input: T) => Promise<any>
}

export interface RoutingDecision {
    reasoning: string
    route: string
    confidence: number
}

export interface QualityEvaluation {
    score: number
    issues: string[]
    suggestions: string[]
    passesThreshold: boolean
}

export interface WorkflowResult<T = any> {
    success: boolean
    result: T
    steps: Array<{ name: string; duration: number; output: any }>
    totalDuration: number
}

// ============================================================================
// Model Utilities
// ============================================================================

function getModel(size: 'small' | 'medium' | 'large' = 'medium') {
    const config = simpleConfigManager?.getCurrentModel() as any

    if (config?.provider === 'openrouter') {
        const openrouter = createOpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY,
        })

        // Use different model sizes based on task complexity
        const models = {
            small: 'openai/gpt-5.1',
            medium: config.model || 'openai/gpt-5-codex',
            large: 'anthropic/claude-sonnet-4-20250514',
        }

        return openrouter(models[size])
    }

    // Fallback to configured model
    const { createOpenAI } = require('@ai-sdk/openai')
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai('gpt-5')
}

// ============================================================================
// Pattern 1: Sequential Processing (Chains)
// ============================================================================

/**
 * Execute workflow steps in sequence, where each step's output
 * becomes the next step's input.
 * 
 * @example
 * const result = await sequentialWorkflow([
 *   { name: 'analyze', execute: analyzeCode },
 *   { name: 'improve', execute: improveCode },
 *   { name: 'test', execute: generateTests }
 * ], inputCode)
 */
export async function sequentialWorkflow<T>(
    steps: WorkflowStep[],
    initialInput: T
): Promise<WorkflowResult> {
    const stepResults: Array<{ name: string; duration: number; output: any }> = []
    let currentInput = initialInput
    const startTime = Date.now()

    for (const step of steps) {
        const stepStart = Date.now()

        try {
            const output = await step.execute(currentInput)
            const duration = Date.now() - stepStart

            stepResults.push({
                name: step.name,
                duration,
                output,
            })

            currentInput = output
        } catch (error: any) {
            return {
                success: false,
                result: { error: error.message, failedStep: step.name },
                steps: stepResults,
                totalDuration: Date.now() - startTime,
            }
        }
    }

    return {
        success: true,
        result: currentInput,
        steps: stepResults,
        totalDuration: Date.now() - startTime,
    }
}

/**
 * Code generation pipeline - Sequential processing example
 */
export async function codeGenerationPipeline(requirements: string): Promise<WorkflowResult> {
    const model = getModel('medium')

    const steps: WorkflowStep[] = [
        {
            name: 'analyze_requirements',
            execute: async (input: string) => {
                const { object } = await generateObject({
                    model,
                    schema: z.object({
                        features: z.array(z.string()),
                        technologies: z.array(z.string()),
                        complexity: z.enum(['low', 'medium', 'high']),
                        estimatedFiles: z.number(),
                    }),
                    prompt: `Analyze these requirements and extract key information:\n${input}`,
                })
                return object
            },
        },
        {
            name: 'generate_architecture',
            execute: async (analysis: any) => {
                const { text } = await generateText({
                    model,
                    prompt: `Based on this analysis, design a system architecture:
          Features: ${analysis.features.join(', ')}
          Technologies: ${analysis.technologies.join(', ')}
          Complexity: ${analysis.complexity}
          
          Provide a clear architecture with components and their interactions.`,
                })
                return { ...analysis, architecture: text }
            },
        },
        {
            name: 'generate_code_structure',
            execute: async (data: any) => {
                const { object } = await generateObject({
                    model,
                    schema: z.object({
                        files: z.array(z.object({
                            path: z.string(),
                            purpose: z.string(),
                            dependencies: z.array(z.string()),
                        })),
                        entryPoint: z.string(),
                    }),
                    prompt: `Create a file structure for this architecture:\n${data.architecture}`,
                })
                return { ...data, structure: object }
            },
        },
    ]

    return sequentialWorkflow(steps, requirements)
}

// ============================================================================
// Pattern 2: Parallel Processing
// ============================================================================

/**
 * Execute multiple independent tasks simultaneously.
 * 
 * @example
 * const results = await parallelWorkflow({
 *   security: securityReview(code),
 *   performance: performanceReview(code),
 *   quality: qualityReview(code)
 * })
 */
export async function parallelWorkflow<T extends Record<string, Promise<any>>>(
    tasks: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
    const entries = Object.entries(tasks)
    const results = await Promise.all(entries.map(([_, promise]) => promise))

    return Object.fromEntries(
        entries.map(([key], index) => [key, results[index]])
    ) as { [K in keyof T]: Awaited<T[K]> }
}

/**
 * Parallel code review - runs security, performance, and quality checks simultaneously
 */
export async function parallelCodeReview(code: string): Promise<{
    reviews: {
        security: { vulnerabilities: string[]; riskLevel: string; suggestions: string[] }
        performance: { issues: string[]; impact: string; optimizations: string[] }
        quality: { concerns: string[]; score: number; recommendations: string[] }
    }
    summary: string
}> {
    const model = getModel('medium')

    // Run all reviews in parallel
    const [securityReview, performanceReview, qualityReview] = await Promise.all([
        generateObject({
            model,
            system: 'You are an expert in code security. Focus on identifying security vulnerabilities, injection risks, and authentication issues.',
            schema: z.object({
                vulnerabilities: z.array(z.string()),
                riskLevel: z.enum(['low', 'medium', 'high']),
                suggestions: z.array(z.string()),
            }),
            prompt: `Review this code for security issues:\n${code}`,
        }),

        generateObject({
            model,
            system: 'You are an expert in code performance. Focus on identifying performance bottlenecks, memory leaks, and optimization opportunities.',
            schema: z.object({
                issues: z.array(z.string()),
                impact: z.enum(['low', 'medium', 'high']),
                optimizations: z.array(z.string()),
            }),
            prompt: `Review this code for performance issues:\n${code}`,
        }),

        generateObject({
            model,
            system: 'You are an expert in code quality. Focus on code structure, readability, and adherence to best practices.',
            schema: z.object({
                concerns: z.array(z.string()),
                qualityScore: z.number().min(1).max(10),
                recommendations: z.array(z.string()),
            }),
            prompt: `Review this code for quality issues:\n${code}`,
        }),
    ])

    const reviews = {
        security: securityReview.object,
        performance: performanceReview.object,
        quality: { ...qualityReview.object, score: qualityReview.object.qualityScore },
    }

    // Synthesize results
    const { text: summary } = await generateText({
        model: getModel('small'),
        system: 'You are a technical lead summarizing multiple code reviews.',
        prompt: `Synthesize these code review results into a concise summary with key actions:
    ${JSON.stringify(reviews, null, 2)}`,
    })

    return { reviews, summary }
}

// ============================================================================
// Pattern 3: Routing
// ============================================================================

/**
 * Route requests to appropriate handlers based on AI classification.
 * 
 * @example
 * const result = await routingWorkflow(
 *   userQuery,
 *   {
 *     technical: handleTechnicalQuery,
 *     billing: handleBillingQuery,
 *     general: handleGeneralQuery
 *   }
 * )
 */
export async function routingWorkflow<T extends Record<string, (input: string) => Promise<any>>>(
    input: string,
    routes: T,
    options?: {
        customClassifier?: (input: string) => Promise<{ route: keyof T; reasoning: string }>
    }
): Promise<{
    route: keyof T
    reasoning: string
    result: any
}> {
    const model = getModel('small')
    const routeNames = Object.keys(routes) as (keyof T)[]

    // Classify the input
    const { object: classification } = await generateObject({
        model,
        schema: z.object({
            reasoning: z.string().describe('Why this route was chosen'),
            route: z.enum(routeNames as [string, ...string[]]).describe('The selected route'),
            confidence: z.number().min(0).max(1).describe('Confidence in the classification'),
        }),
        prompt: `Classify this input and route it to the appropriate handler.
    
Available routes: ${routeNames.join(', ')}

Input: ${input}

Determine the best route with reasoning.`,
    })

    // Execute the selected route
    const handler = routes[classification.route as keyof T]
    const result = await handler(input)

    return {
        route: classification.route as keyof T,
        reasoning: classification.reasoning,
        result,
    }
}

/**
 * Smart query router - routes to specialized handlers based on query type
 */
export async function smartQueryRouter(query: string): Promise<{
    classification: { type: string; complexity: string; reasoning: string }
    response: string
    modelUsed: string
}> {
    const smallModel = getModel('small')
    const largeModel = getModel('large')

    // First: Classify the query
    const { object: classification } = await generateObject({
        model: smallModel,
        schema: z.object({
            reasoning: z.string(),
            type: z.enum(['general', 'technical', 'code_review', 'architecture', 'debugging']),
            complexity: z.enum(['simple', 'moderate', 'complex']),
        }),
        prompt: `Classify this query:
    ${query}
    
    Determine:
    1. Query type (general, technical, code_review, architecture, debugging)
    2. Complexity (simple, moderate, complex)
    3. Brief reasoning`,
    })

    // Route based on classification - use appropriate model size
    const modelForTask = classification.complexity === 'simple' ? smallModel : largeModel
    const modelName = classification.complexity === 'simple' ? 'gpt-4o-mini' : 'claude-sonnet'

    const systemPrompts: Record<string, string> = {
        general: 'You are a helpful assistant providing clear, concise answers.',
        technical: 'You are a technical expert providing detailed technical explanations with examples.',
        code_review: 'You are a senior developer reviewing code. Focus on best practices, potential bugs, and improvements.',
        architecture: 'You are a software architect. Focus on system design, scalability, and maintainability.',
        debugging: 'You are a debugging expert. Systematically analyze issues and provide step-by-step solutions.',
    }

    const { text: response } = await generateText({
        model: modelForTask,
        system: systemPrompts[classification.type],
        prompt: query,
    })

    return {
        classification,
        response,
        modelUsed: modelName,
    }
}

// ============================================================================
// Pattern 4: Orchestrator-Worker
// ============================================================================

/**
 * Orchestrator coordinates multiple specialized workers.
 * 
 * @example
 * const result = await orchestratorWorkflow({
 *   task: 'Implement user authentication',
 *   workers: {
 *     frontend: frontendWorker,
 *     backend: backendWorker,
 *     database: databaseWorker
 *   }
 * })
 */
export interface OrchestratorConfig {
    task: string
    context?: string
    workers: Record<string, (subtask: any) => Promise<any>>
}

export async function orchestratorWorkflow(config: OrchestratorConfig): Promise<{
    plan: any
    workerResults: Record<string, any>
    synthesis: string
}> {
    const orchestratorModel = getModel('large')
    const workerModel = getModel('medium')

    // Orchestrator: Create execution plan
    const { object: plan } = await generateObject({
        model: orchestratorModel,
        schema: z.object({
            subtasks: z.array(z.object({
                worker: z.string().describe('Which worker should handle this'),
                task: z.string().describe('What the worker should do'),
                priority: z.number().describe('Execution priority (1 = highest)'),
                dependencies: z.array(z.string()).describe('Other subtasks this depends on'),
            })),
            estimatedComplexity: z.enum(['low', 'medium', 'high']),
            reasoning: z.string(),
        }),
        system: 'You are a senior software architect planning task execution.',
        prompt: `Create an execution plan for this task:
    ${config.task}
    
    ${config.context ? `Context: ${config.context}` : ''}
    
    Available workers: ${Object.keys(config.workers).join(', ')}
    
    Break down the task into subtasks and assign to workers.`,
    })

    // Sort subtasks by priority
    const sortedSubtasks = [...plan.subtasks].sort((a, b) => a.priority - b.priority)

    // Execute workers (respecting dependencies where possible)
    const workerResults: Record<string, any> = {}

    for (const subtask of sortedSubtasks) {
        const worker = config.workers[subtask.worker]
        if (worker) {
            workerResults[subtask.worker] = await worker({
                task: subtask.task,
                context: config.context,
                previousResults: workerResults,
            })
        }
    }

    // Orchestrator: Synthesize results
    const { text: synthesis } = await generateText({
        model: orchestratorModel,
        system: 'You are a technical lead synthesizing work from multiple team members.',
        prompt: `Synthesize these worker results into a cohesive summary:
    
    Original task: ${config.task}
    
    Worker outputs:
    ${JSON.stringify(workerResults, null, 2)}
    
    Provide a unified summary and any integration notes.`,
    })

    return { plan, workerResults, synthesis }
}

/**
 * Feature implementation orchestrator
 */
export async function implementFeature(featureRequest: string): Promise<{
    plan: any
    implementations: Array<{ file: string; code: string; explanation: string }>
}> {
    const orchestratorModel = getModel('large')
    const workerModel = getModel('medium')

    // Plan the implementation
    const { object: plan } = await generateObject({
        model: orchestratorModel,
        schema: z.object({
            files: z.array(z.object({
                purpose: z.string(),
                filePath: z.string(),
                changeType: z.enum(['create', 'modify', 'delete']),
            })),
            estimatedComplexity: z.enum(['low', 'medium', 'high']),
        }),
        system: 'You are a senior software architect planning feature implementations.',
        prompt: `Analyze this feature request and create an implementation plan:
    ${featureRequest}`,
    })

    // Workers: Execute the planned changes
    const implementations = await Promise.all(
        plan.files.map(async file => {
            const workerPrompt: Record<string, string> = {
                create: 'You are an expert at implementing new files following best practices.',
                modify: 'You are an expert at modifying existing code while maintaining consistency.',
                delete: 'You are an expert at safely removing code without breaking changes.',
            }

            const { object: implementation } = await generateObject({
                model: workerModel,
                schema: z.object({
                    explanation: z.string(),
                    code: z.string(),
                }),
                system: workerPrompt[file.changeType],
                prompt: `Implement changes for ${file.filePath} to support:
        ${file.purpose}
        
        Feature context: ${featureRequest}`,
            })

            return {
                file: file.filePath,
                ...implementation,
            }
        })
    )

    return { plan, implementations }
}

// ============================================================================
// Pattern 5: Evaluator-Optimizer
// ============================================================================

/**
 * Iteratively improve output based on evaluation feedback.
 * 
 * @example
 * const result = await evaluatorOptimizerWorkflow({
 *   initialInput: roughDraft,
 *   generator: generateContent,
 *   evaluator: evaluateContent,
 *   maxIterations: 3,
 *   qualityThreshold: 0.8
 * })
 */
export interface EvaluatorOptimizerConfig<T> {
    initialInput: string
    generator: (input: string, feedback?: string[]) => Promise<T>
    evaluator: (output: T) => Promise<QualityEvaluation>
    maxIterations?: number
    qualityThreshold?: number
}

export async function evaluatorOptimizerWorkflow<T>(
    config: EvaluatorOptimizerConfig<T>
): Promise<{
    finalOutput: T
    iterations: number
    evaluations: QualityEvaluation[]
}> {
    const maxIterations = config.maxIterations ?? 3
    const qualityThreshold = config.qualityThreshold ?? 0.8

    let currentOutput: T = await config.generator(config.initialInput)
    let iterations = 0
    const evaluations: QualityEvaluation[] = []

    while (iterations < maxIterations) {
        iterations++

        // Evaluate current output
        const evaluation = await config.evaluator(currentOutput)
        evaluations.push(evaluation)

        // Check if quality meets threshold
        if (evaluation.passesThreshold || evaluation.score >= qualityThreshold * 10) {
            break
        }

        // Generate improved output based on feedback
        const feedback = [...evaluation.issues, ...evaluation.suggestions]
        currentOutput = await config.generator(config.initialInput, feedback)
    }

    return {
        finalOutput: currentOutput,
        iterations,
        evaluations,
    }
}

/**
 * Code quality optimizer - iteratively improves code based on review feedback
 */
export async function optimizeCode(code: string): Promise<{
    optimizedCode: string
    iterations: number
    finalScore: number
}> {
    const model = getModel('medium')
    const evaluatorModel = getModel('large')

    const result = await evaluatorOptimizerWorkflow({
        initialInput: code,

        generator: async (input: string, feedback?: string[]) => {
            if (!feedback || feedback.length === 0) {
                return input
            }

            const { text: improvedCode } = await generateText({
                model,
                system: 'You are an expert code optimizer. Improve code based on feedback while maintaining functionality.',
                prompt: `Improve this code based on the following feedback:
        
Feedback:
${feedback.map(f => `- ${f}`).join('\n')}

Code:
${input}

Provide only the improved code without explanations.`,
            })

            return improvedCode
        },

        evaluator: async (output: string) => {
            const { object: evaluation } = await generateObject({
                model: evaluatorModel,
                schema: z.object({
                    qualityScore: z.number().min(1).max(10),
                    issues: z.array(z.string()),
                    suggestions: z.array(z.string()),
                    meetsStandards: z.boolean(),
                }),
                system: 'You are a senior code reviewer evaluating code quality.',
                prompt: `Evaluate this code on a scale of 1-10:
        
${output}

Consider:
- Code structure and organization
- Best practices adherence
- Error handling
- Performance
- Readability`,
            })

            return {
                score: evaluation.qualityScore,
                issues: evaluation.issues,
                suggestions: evaluation.suggestions,
                passesThreshold: evaluation.meetsStandards && evaluation.qualityScore >= 8,
            }
        },

        maxIterations: 3,
        qualityThreshold: 0.8,
    })

    return {
        optimizedCode: result.finalOutput,
        iterations: result.iterations,
        finalScore: result.evaluations[result.evaluations.length - 1]?.score ?? 0,
    }
}

/**
 * Translation with quality feedback loop
 */
export async function translateWithFeedback(
    text: string,
    targetLanguage: string
): Promise<{
    translation: string
    iterations: number
    finalQuality: QualityEvaluation
}> {
    const smallModel = getModel('small')
    const largeModel = getModel('large')

    let currentTranslation = ''
    let iterations = 0
    const MAX_ITERATIONS = 3

    // Initial translation with smaller model
    const { text: initialTranslation } = await generateText({
        model: smallModel,
        system: 'You are an expert translator.',
        prompt: `Translate this text to ${targetLanguage}, preserving tone and nuances:
    ${text}`,
    })

    currentTranslation = initialTranslation

    // Evaluation-optimization loop
    let finalEvaluation: QualityEvaluation = {
        score: 0,
        issues: [],
        suggestions: [],
        passesThreshold: false,
    }

    while (iterations < MAX_ITERATIONS) {
        // Evaluate with larger model
        const { object: evaluation } = await generateObject({
            model: largeModel,
            schema: z.object({
                qualityScore: z.number().min(1).max(10),
                preservesTone: z.boolean(),
                preservesNuance: z.boolean(),
                culturallyAccurate: z.boolean(),
                specificIssues: z.array(z.string()),
                improvementSuggestions: z.array(z.string()),
            }),
            system: 'You are an expert in evaluating translations.',
            prompt: `Evaluate this translation:

Original: ${text}
Translation: ${currentTranslation}

Consider tone, nuance, and cultural accuracy.`,
        })

        finalEvaluation = {
            score: evaluation.qualityScore,
            issues: evaluation.specificIssues,
            suggestions: evaluation.improvementSuggestions,
            passesThreshold:
                evaluation.qualityScore >= 8 &&
                evaluation.preservesTone &&
                evaluation.preservesNuance &&
                evaluation.culturallyAccurate,
        }

        if (finalEvaluation.passesThreshold) {
            break
        }

        // Improve with larger model based on feedback
        const { text: improvedTranslation } = await generateText({
            model: largeModel,
            system: 'You are an expert translator improving translations.',
            prompt: `Improve this translation based on feedback:
      
Issues:
${evaluation.specificIssues.join('\n')}

Suggestions:
${evaluation.improvementSuggestions.join('\n')}

Original: ${text}
Current Translation: ${currentTranslation}`,
        })

        currentTranslation = improvedTranslation
        iterations++
    }

    return {
        translation: currentTranslation,
        iterations,
        finalQuality: finalEvaluation,
    }
}

// ============================================================================
// Utility: Workflow Composition
// ============================================================================

/**
 * Compose multiple workflow patterns into a single pipeline
 */
export async function composedWorkflow<T>(
    patterns: Array<{
        type: 'sequential' | 'parallel' | 'routing' | 'orchestrator' | 'evaluator'
        config: any
    }>,
    initialInput: T
): Promise<any> {
    let currentInput: any = initialInput

    for (const pattern of patterns) {
        switch (pattern.type) {
            case 'sequential':
                const seqResult = await sequentialWorkflow(pattern.config.steps, currentInput)
                currentInput = seqResult.result
                break

            case 'parallel':
                currentInput = await parallelWorkflow(pattern.config.tasks)
                break

            case 'routing':
                const routeResult = await routingWorkflow(currentInput, pattern.config.routes)
                currentInput = routeResult.result
                break

            case 'orchestrator':
                const orchResult = await orchestratorWorkflow({ ...pattern.config, task: currentInput })
                currentInput = orchResult
                break

            case 'evaluator':
                const evalResult = await evaluatorOptimizerWorkflow({
                    ...pattern.config,
                    initialInput: currentInput,
                })
                currentInput = evalResult.finalOutput
                break
        }
    }

    return currentInput
}

// ============================================================================
// Export all patterns
// ============================================================================

export const workflowPatterns = {
    // Core patterns
    sequential: sequentialWorkflow,
    parallel: parallelWorkflow,
    routing: routingWorkflow,
    orchestrator: orchestratorWorkflow,
    evaluatorOptimizer: evaluatorOptimizerWorkflow,

    // Pre-built workflows
    codeGeneration: codeGenerationPipeline,
    codeReview: parallelCodeReview,
    queryRouter: smartQueryRouter,
    featureImplementation: implementFeature,
    codeOptimization: optimizeCode,
    translation: translateWithFeedback,

    // Composition
    compose: composedWorkflow,
}

export default workflowPatterns

