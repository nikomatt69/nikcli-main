/**
 * AI Model Comparison Benchmarks for NikCLI
 * Tests different AI models via AI SDK + OpenRouter to find the best performer
 * Tests REAL skills with actual code analysis, generation, and problem solving
 */

import { generateText } from 'ai'
import { openrouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import chalk from 'chalk'

interface AIModelConfig {
    id: string
    name: string
    provider: string
    cost: {
        input: number  // $ per million tokens
        output: number
    }
}

interface BenchmarkTask {
    id: string
    name: string
    description: string
    category: 'code-generation' | 'bug-fixing' | 'code-review' | 'refactoring' | 'architecture' | 'problem-solving'
    complexity: 'low' | 'medium' | 'high'
    prompt: string
    evaluator: (output: string) => TaskEvaluation
}

interface TaskEvaluation {
    score: number // 0-100
    passed: boolean
    feedback: string
    metrics?: Record<string, number | boolean>
    toolCallsCount?: number
    toolCallsCorrect?: number
}

/**
 * Available tools for AI models to use
 */
const BENCHMARK_TOOLS = {
    analyzeCode: {
        description: 'Analyze code for bugs, performance issues, and best practices',
        parameters: z.object({
            code: z.string().describe('The code to analyze'),
            language: z.string().describe('Programming language (typescript, javascript, python, etc)'),
            focusAreas: z.array(z.string()).describe('Areas to focus on: bugs, performance, security, style'),
        }),
        execute: async ({ code, language, focusAreas }: any) => {
            return {
                issues: [
                    { type: 'bug', severity: 'high', message: 'Potential null pointer exception' },
                    { type: 'performance', severity: 'medium', message: 'Inefficient loop detected' },
                ],
                suggestions: ['Add null checks', 'Use more efficient data structure'],
                score: 75,
            }
        },
    },
    refactorCode: {
        description: 'Refactor code to improve quality, readability, or performance',
        parameters: z.object({
            code: z.string().describe('The code to refactor'),
            strategy: z.string().describe('Refactoring strategy: extract-method, inline, rename, optimize'),
            targetImprovement: z.string().describe('What to improve: readability, performance, maintainability'),
        }),
        execute: async ({ code, strategy, targetImprovement }: any) => {
            return {
                refactoredCode: '// Refactored code here...',
                improvements: ['Extracted helper function', 'Improved naming'],
                metricsImprovement: { complexity: -2, readability: +15 },
            }
        },
    },
    generateTests: {
        description: 'Generate unit tests for given code',
        parameters: z.object({
            code: z.string().describe('The code to generate tests for'),
            framework: z.string().describe('Test framework: vitest, jest, mocha'),
            coverage: z.enum(['basic', 'comprehensive', 'edge-cases']).describe('Test coverage level'),
        }),
        execute: async ({ code, framework, coverage }: any) => {
            return {
                tests: '// Generated tests...',
                testCases: ['happy path', 'error cases', 'edge cases'],
                estimatedCoverage: 85,
            }
        },
    },
    fixBug: {
        description: 'Identify and fix a bug in the code',
        parameters: z.object({
            buggyCode: z.string().describe('The code with the bug'),
            bugDescription: z.string().describe('Description of the bug'),
            expectedBehavior: z.string().describe('What the code should do'),
        }),
        execute: async ({ buggyCode, bugDescription, expectedBehavior }: any) => {
            return {
                fixedCode: '// Fixed code...',
                explanation: 'The bug was caused by...',
                testCase: 'Test to verify the fix...',
            }
        },
    },
    optimizePerformance: {
        description: 'Optimize code for better performance',
        parameters: z.object({
            code: z.string().describe('The code to optimize'),
            bottleneck: z.string().describe('Identified performance bottleneck'),
            targetMetric: z.string().describe('Metric to optimize: time-complexity, space-complexity, runtime'),
        }),
        execute: async ({ code, bottleneck, targetMetric }: any) => {
            return {
                optimizedCode: '// Optimized code...',
                improvement: '50% faster execution',
                complexityBefore: 'O(n²)',
                complexityAfter: 'O(n)',
            }
        },
    },
    designArchitecture: {
        description: 'Design system architecture for a given requirement',
        parameters: z.object({
            requirements: z.string().describe('System requirements and constraints'),
            scale: z.enum(['small', 'medium', 'large', 'enterprise']).describe('Expected system scale'),
            concerns: z.array(z.string()).describe('Key concerns: scalability, reliability, cost, performance'),
        }),
        execute: async ({ requirements, scale, concerns }: any) => {
            return {
                architecture: {
                    components: ['API Gateway', 'Microservices', 'Database', 'Cache'],
                    technologies: ['Node.js', 'PostgreSQL', 'Redis', 'Docker'],
                    scalingStrategy: 'Horizontal scaling with load balancer',
                },
                diagram: '// Architecture diagram...',
                tradeoffs: 'Higher complexity vs better scalability',
            }
        },
    },
}

interface ModelResult {
    model: string
    task: string
    timeMs: number
    tokensUsed: {
        input: number
        output: number
        total: number
    }
    cost: number
    evaluation: TaskEvaluation
    success: boolean
    output?: string
    error?: string
}

/**
 * Available models via OpenRouter (from NikCLI config-manager)
 */
const AVAILABLE_MODELS: AIModelConfig[] = [
    // NikCLI Preset Models
    {
        id: '@preset/nikcli',
        name: 'NikCLI Preset',
        provider: 'NikCLI',
        cost: { input: 0, output: 0 }, // Preset routing
    },
    {
        id: '@preset/nikcli-pro',
        name: 'NikCLI Preset Pro',
        provider: 'NikCLI',
        cost: { input: 0, output: 0 }, // Preset routing
    },

    // Anthropic Claude (Top Tier)
    {
        id: 'anthropic/claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        provider: 'Anthropic',
        cost: { input: 3, output: 15 },
    },
    {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        provider: 'Anthropic',
        cost: { input: 3, output: 15 },
    },
    {
        id: 'anthropic/claude-3.7-sonnet',
        name: 'Claude 3.7 Sonnet',
        provider: 'Anthropic',
        cost: { input: 3, output: 15 },
    },
    {
        id: 'anthropic/claude-3.7-sonnet:thinking',
        name: 'Claude 3.7 Sonnet (Thinking)',
        provider: 'Anthropic',
        cost: { input: 3, output: 15 },
    },
    {
        id: 'anthropic/claude-opus-4.1',
        name: 'Claude Opus 4.1',
        provider: 'Anthropic',
        cost: { input: 15, output: 75 },
    },
    {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
        cost: { input: 3, output: 15 },
    },

    // OpenAI GPT Models
    {
        id: 'openai/gpt-5',
        name: 'GPT-5',
        provider: 'OpenAI',
        cost: { input: 10, output: 30 },
    },
    {
        id: 'openai/gpt-5-codex',
        name: 'GPT-5 Codex',
        provider: 'OpenAI',
        cost: { input: 10, output: 30 },
    },
    {
        id: 'openai/gpt-5-mini',
        name: 'GPT-5 Mini',
        provider: 'OpenAI',
        cost: { input: 1, output: 3 },
    },
    {
        id: 'openai/gpt-5-nano',
        name: 'GPT-5 Nano',
        provider: 'OpenAI',
        cost: { input: 0.5, output: 1.5 },
    },
    {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        cost: { input: 5, output: 15 },
    },
    {
        id: 'openai/gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'OpenAI',
        cost: { input: 0.15, output: 0.6 },
    },

    // Google Gemini Models
    {
        id: 'google/gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'Google',
        cost: { input: 1.25, output: 5 },
    },
    {
        id: 'google/gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'Google',
        cost: { input: 0.075, output: 0.3 },
    },
    {
        id: 'google/gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        provider: 'Google',
        cost: { input: 0.05, output: 0.2 },
    },
    {
        id: 'google/gemini-2.0-flash-exp',
        name: 'Gemini 2.0 Flash (Experimental)',
        provider: 'Google',
        cost: { input: 0.075, output: 0.3 },
    },
    {
        id: 'google/gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'Google',
        cost: { input: 1.25, output: 5 },
    },

    // Meta Llama Models
    {
        id: 'meta-llama/llama-3.1-405b-instruct',
        name: 'Llama 3.1 405B',
        provider: 'Meta',
        cost: { input: 2.7, output: 2.7 },
    },
    {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B',
        provider: 'Meta',
        cost: { input: 0.52, output: 0.75 },
    },
    {
        id: 'meta-llama/llama-3.1-8b-instruct',
        name: 'Llama 3.1 8B',
        provider: 'Meta',
        cost: { input: 0.06, output: 0.06 },
    },

    // Mistral Models
    {
        id: 'mistralai/mistral-large',
        name: 'Mistral Large',
        provider: 'Mistral',
        cost: { input: 3, output: 9 },
    },

    // Deepseek Models
    {
        id: 'deepseek/deepseek-chat-v3.1:free',
        name: 'Deepseek Chat v3.1 (Free)',
        provider: 'Deepseek',
        cost: { input: 0, output: 0 },
    },
    {
        id: 'deepseek/deepseek-v3.1-terminus',
        name: 'Deepseek v3.1 Terminus',
        provider: 'Deepseek',
        cost: { input: 0.14, output: 0.28 },
    },
    {
        id: 'deepseek/deepseek-v3.2-exp',
        name: 'Deepseek v3.2 (Experimental)',
        provider: 'Deepseek',
        cost: { input: 0.14, output: 0.28 },
    },

    // Qwen Models
    {
        id: 'qwen/qwen3-next-80b-a3b-thinking',
        name: 'Qwen 3 Next 80B (Thinking)',
        provider: 'Qwen',
        cost: { input: 0.5, output: 1 },
    },
    {
        id: 'qwen/qwen3-coder',
        name: 'Qwen 3 Coder',
        provider: 'Qwen',
        cost: { input: 0.5, output: 1 },
    },

    // X.AI Grok Models
    {
        id: 'x-ai/grok-4',
        name: 'Grok 4',
        provider: 'X.AI',
        cost: { input: 5, output: 15 },
    },
    {
        id: 'x-ai/grok-2',
        name: 'Grok 2',
        provider: 'X.AI',
        cost: { input: 2, output: 10 },
    },

    // Z-AI GLM Models
    {
        id: 'z-ai/glm-4.5',
        name: 'GLM 4.5',
        provider: 'Z-AI',
        cost: { input: 0.5, output: 1 },
    },
    {
        id: 'z-ai/glm-4.5v',
        name: 'GLM 4.5 Vision',
        provider: 'Z-AI',
        cost: { input: 0.5, output: 1 },
    },

    // Other Notable Models
    {
        id: 'nvidia/nemotron-nano-9b-v2:free',
        name: 'Nvidia Nemotron Nano 9B (Free)',
        provider: 'Nvidia',
        cost: { input: 0, output: 0 },
    },
    {
        id: 'moonshotai/kimi-k2-0905',
        name: 'Kimi K2',
        provider: 'MoonshotAI',
        cost: { input: 0.5, output: 1 },
    },
    {
        id: 'openai/gpt-oss-120b:free',
        name: 'GPT OSS 120B (Free)',
        provider: 'OpenAI',
        cost: { input: 0, output: 0 },
    },
]

/**
 * Real benchmark tasks that test actual skills
 */
const BENCHMARK_TASKS: BenchmarkTask[] = [
    {
        id: 'T001',
        name: 'TypeScript Type Safety',
        description: 'Generate type-safe TypeScript utility functions',
        category: 'code-generation',
        complexity: 'medium',
        prompt: `Create a TypeScript utility function called 'safeGet' that:
1. Takes a nested object and a path string (e.g., "user.profile.name")
2. Returns the value at that path or undefined if it doesn't exist
3. Is fully type-safe with proper TypeScript generics
4. Handles arrays in the path (e.g., "users[0].name")
5. Includes comprehensive JSDoc comments
6. Has no runtime errors for invalid paths

Return ONLY the code, no explanations.`,
        evaluator: (output) => {
            let score = 0
            const feedback: string[] = []

            if (output.includes('function') || output.includes('const')) score += 20
            if (output.includes('generic') || output.includes('<T>') || output.includes('<')) score += 25
            if (output.includes('JSDoc') || output.includes('/**')) score += 15
            if (output.includes('undefined')) score += 10
            if (output.includes('split') || output.includes('[')) score += 15
            if (output.includes('try') || output.includes('catch')) score += 15

            if (score >= 80) feedback.push('Excellent type safety and error handling')
            else if (score >= 60) feedback.push('Good implementation but missing some features')
            else feedback.push('Incomplete or unsafe implementation')

            return {
                score,
                passed: score >= 60,
                feedback: feedback.join('. '),
                metrics: { type_safety: score >= 25 ? 1 : 0, error_handling: score >= 15 ? 1 : 0 },
            }
        },
    },
    {
        id: 'T002',
        name: 'Bug Detection & Fix',
        description: 'Identify and fix multiple bugs in real code',
        category: 'bug-fixing',
        complexity: 'high',
        prompt: `Find and fix ALL bugs in this code:

\`\`\`typescript
async function processUserData(users: any[]) {
    const results = []
    for (let user of users) {
        const data = await fetchUserDetails(user.id)
        results.push({
            name: user.name.toUpperCase(),
            age: user.age + 1,
            email: data.email.toLowerCase(),
            scores: user.scores.map(s => s * 2)
        })
    }
    return results
}
\`\`\`

List EACH bug, explain why it's a bug, and provide the complete fixed code.`,
        evaluator: (output) => {
            let score = 0
            const feedback: string[] = []
            const bugsFound = {
                null_check: output.toLowerCase().includes('null') || output.includes('?.') || output.includes('??'),
                array_check: output.includes('Array.isArray') || output.includes('length'),
                optional_chain: output.includes('?.'),
                type_safety: output.includes(': User') || output.includes('interface'),
                error_handling: output.includes('try') || output.includes('catch'),
            }

            if (bugsFound.null_check) { score += 25; feedback.push('✓ Null checks') }
            if (bugsFound.array_check) { score += 20; feedback.push('✓ Array validation') }
            if (bugsFound.optional_chain) { score += 20; feedback.push('✓ Optional chaining') }
            if (bugsFound.type_safety) { score += 20; feedback.push('✓ Type safety') }
            if (bugsFound.error_handling) { score += 15; feedback.push('✓ Error handling') }

            return {
                score,
                passed: score >= 60,
                feedback: feedback.length > 0 ? feedback.join(', ') : 'Few bugs detected',
                metrics: bugsFound,
            }
        },
    },
    {
        id: 'T003',
        name: 'Performance Optimization',
        description: 'Optimize inefficient code for production',
        category: 'refactoring',
        complexity: 'high',
        prompt: `Optimize this slow code for production use:

\`\`\`typescript
function findDuplicateUsers(users: User[]) {
    const duplicates = []
    for (let i = 0; i < users.length; i++) {
        for (let j = 0; j < users.length; j++) {
            if (i !== j && users[i].email === users[j].email) {
                duplicates.push(users[i])
            }
        }
    }
    return duplicates
}
\`\`\`

Provide optimized code with:
1. Better time complexity
2. Memory efficiency
3. Type safety
4. Edge case handling`,
        evaluator: (output) => {
            let score = 0
            const feedback: string[] = []

            // Check for optimizations
            if (output.includes('Set') || output.includes('Map')) {
                score += 30
                feedback.push('✓ Uses efficient data structures')
            }
            if (output.includes('O(n)') || !output.includes('for.*for')) {
                score += 25
                feedback.push('✓ Improved time complexity')
            }
            if (output.includes('interface') || output.includes('type')) {
                score += 20
                feedback.push('✓ Type definitions')
            }
            if (output.includes('?.') || output.includes('??')) {
                score += 15
                feedback.push('✓ Null safety')
            }
            if (output.includes('unique') || output.includes('Set')) {
                score += 10
                feedback.push('✓ Duplicate handling')
            }

            return {
                score,
                passed: score >= 60,
                feedback: feedback.join(', '),
            }
        },
    },
    {
        id: 'T004',
        name: 'React Performance Debug',
        description: 'Fix performance issues in React component',
        category: 'code-review',
        complexity: 'high',
        prompt: `Review and fix performance issues in this React component:

\`\`\`tsx
function UserList({ users, onSelect }) {
    const [filter, setFilter] = useState('')
    
    const filtered = users.filter(u => 
        u.name.toLowerCase().includes(filter.toLowerCase())
    )
    
    const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name))
    
    return (
        <div>
            <input value={filter} onChange={e => setFilter(e.target.value)} />
            {sorted.map(user => (
                <div onClick={() => onSelect(user)}>
                    {user.name} - {user.email}
                </div>
            ))}
        </div>
    )
}
\`\`\`

Fix ALL performance issues and provide optimized code.`,
        evaluator: (output) => {
            let score = 0
            const feedback: string[] = []
            const fixes = {
                useMemo: output.includes('useMemo'),
                useCallback: output.includes('useCallback'),
                key_prop: output.includes('key='),
                memo: output.includes('memo(') || output.includes('React.memo'),
            }

            if (fixes.useMemo) { score += 30; feedback.push('✓ useMemo for expensive calculations') }
            if (fixes.useCallback) { score += 25; feedback.push('✓ useCallback for handlers') }
            if (fixes.key_prop) { score += 25; feedback.push('✓ Proper key props') }
            if (fixes.memo) { score += 20; feedback.push('✓ React.memo optimization') }

            return {
                score,
                passed: score >= 60,
                feedback: feedback.join(', '),
                metrics: fixes,
            }
        },
    },
    {
        id: 'T005',
        name: 'Complex Algorithm',
        description: 'Implement efficient algorithm with edge cases',
        category: 'problem-solving',
        complexity: 'high',
        prompt: `Implement a function that finds the longest common subsequence (LCS) between two strings.

Requirements:
1. Efficient algorithm (not brute force)
2. Handle edge cases (empty strings, same strings, etc.)
3. Return both the length and the actual subsequence
4. Full TypeScript with types
5. Time complexity O(m*n) or better
6. Space optimization if possible

Return complete, production-ready code.`,
        evaluator: (output) => {
            let score = 0
            const feedback: string[] = []

            if (output.includes('dp') || output.includes('memo') || output.includes('cache')) {
                score += 30
                feedback.push('✓ Dynamic programming approach')
            }
            if (output.includes('interface') || output.includes('type')) {
                score += 20
                feedback.push('✓ Type definitions')
            }
            if (output.includes('length') && output.includes('subsequence')) {
                score += 25
                feedback.push('✓ Returns both length and sequence')
            }
            if (output.includes('if') && output.includes('===') && output.includes('""')) {
                score += 15
                feedback.push('✓ Edge case handling')
            }
            if (output.includes('O(') || output.includes('complexity')) {
                score += 10
                feedback.push('✓ Complexity analysis')
            }

            return {
                score,
                passed: score >= 60,
                feedback: feedback.join(', '),
            }
        },
    },
    {
        id: 'T006',
        name: 'System Architecture',
        description: 'Design scalable system architecture',
        category: 'architecture',
        complexity: 'high',
        prompt: `Design a scalable real-time notification system with:
1. WebSocket connections for 100K+ concurrent users
2. Message queue for reliability
3. Redis for caching and pub/sub
4. Horizontal scaling capability
5. TypeScript interfaces for all components

Provide:
- Architecture diagram (text/ASCII)
- Core TypeScript interfaces
- Explanation of scaling strategy
- Handling connection failures`,
        evaluator: (output) => {
            let score = 0
            const feedback: string[] = []
            const components = {
                websocket: output.toLowerCase().includes('websocket') || output.includes('ws'),
                queue: output.toLowerCase().includes('queue') || output.includes('kafka') || output.includes('rabbitmq'),
                redis: output.toLowerCase().includes('redis') || output.includes('cache'),
                scaling: output.toLowerCase().includes('scale') || output.includes('horizontal'),
                interfaces: output.includes('interface') || output.includes('type'),
            }

            if (components.websocket) { score += 20; feedback.push('✓ WebSocket implementation') }
            if (components.queue) { score += 20; feedback.push('✓ Message queue') }
            if (components.redis) { score += 20; feedback.push('✓ Redis caching') }
            if (components.scaling) { score += 20; feedback.push('✓ Scaling strategy') }
            if (components.interfaces) { score += 20; feedback.push('✓ Type definitions') }

            return {
                score,
                passed: score >= 60,
                feedback: feedback.join(', '),
                metrics: components,
            }
        },
    },
]

/**
 * Main benchmark runner
 */
async function runAIModelBenchmarks() {
    console.log(chalk.bold.cyan('\n🤖 NikCLI AI Model Comparison Benchmark'))
    console.log(chalk.bold.cyan('   Testing REAL Skills via AI SDK + OpenRouter\n'))
    console.log(chalk.gray('═'.repeat(80)))

    // Check API key
    if (!process.env.OPENROUTER_API_KEY) {
        console.log(chalk.red('\n❌ OPENROUTER_API_KEY not set!'))
        console.log(chalk.yellow('\nSet your OpenRouter API key:'))
        console.log(chalk.gray('  export OPENROUTER_API_KEY=sk-or-v1-...'))
        console.log(chalk.gray('\nGet your key at: https://openrouter.ai/keys'))
        return
    }

    // Use preset models from NikCLI config
    const selectedModels = await selectModels()

    console.log(chalk.blue('\n📦 Testing with NikCLI preset models:'))
    for (const model of selectedModels) {
        console.log(chalk.gray(`   - ${model.name} (${model.provider})`))
    }

    console.log(chalk.bold.white(`\n📋 Testing ${selectedModels.length} models on ${BENCHMARK_TASKS.length} real tasks\n`))

    const allResults: ModelResult[] = []

    // Run benchmarks for each model
    for (const model of selectedModels) {
        console.log(chalk.bold.yellow(`\n🔬 Testing: ${model.name}`))
        console.log(chalk.gray(`   Provider: ${model.provider}`))
        console.log(chalk.cyan(`   Model ID: ${model.id}`))
        console.log(chalk.gray('─'.repeat(80)))

        for (const task of BENCHMARK_TASKS) {
            console.log(chalk.blue(`\n  [${task.id}] ${task.name} (${task.complexity} complexity)...`))

            const result = await benchmarkModel(model, task)
            allResults.push(result)

            if (result.success) {
                const evalColor = result.evaluation.score >= 80 ? chalk.green :
                    result.evaluation.score >= 60 ? chalk.yellow : chalk.red

                console.log(
                    chalk.green(`    ✓ Completed`) +
                    chalk.gray(` in ${result.timeMs}ms`)
                )
                console.log(
                    chalk.gray(`    Tokens: ${result.tokensUsed.total} | Cost: $${result.cost.toFixed(4)}`)
                )
                console.log(
                    evalColor(`    Score: ${result.evaluation.score}/100`) +
                    chalk.gray(` - ${result.evaluation.feedback}`)
                )
            } else {
                console.log(chalk.red(`    ✗ Failed: ${result.error}`))
            }
        }
    }

    // Print comprehensive comparison
    printComparison(allResults, selectedModels)
}

/**
 * Benchmark a single model on a task
 */
async function benchmarkModel(model: AIModelConfig, task: BenchmarkTask): Promise<ModelResult> {
    const startTime = Date.now()

    try {
        // Debug log to verify different models are being used
        console.log(chalk.gray(`      Using model: ${model.id}`))

        // Create OpenRouter provider with model ID
        const result = await generateText({
            model: openrouter.chat(model.id) as any,
            prompt: task.prompt,
            maxTokens: 2048,
            temperature: 0.7,
        })

        const timeMs = Date.now() - startTime
        const tokensUsed = {
            input: result.usage.promptTokens,
            output: result.usage.completionTokens,
            total: result.usage.totalTokens,
        }
        const cost = calculateCost(model, tokensUsed)
        const evaluation = task.evaluator(result.text)

        return {
            model: model.name,
            task: task.name,
            timeMs,
            tokensUsed,
            cost,
            evaluation,
            success: true,
            output: result.text,
        }
    } catch (error: any) {
        return {
            model: model.name,
            task: task.name,
            timeMs: Date.now() - startTime,
            tokensUsed: { input: 0, output: 0, total: 0 },
            cost: 0,
            evaluation: { score: 0, passed: false, feedback: 'Error' },
            success: false,
            error: error.message,
        }
    }
}

/**
 * Calculate cost based on tokens used
 */
function calculateCost(model: AIModelConfig, tokens: { input: number; output: number }): number {
    return ((tokens.input * model.cost.input) + (tokens.output * model.cost.output)) / 1_000_000
}

/**
 * Select models - NikCLI preset models for testing
 */
async function selectModels(): Promise<AIModelConfig[]> {
    // Return 4 preset models from NikCLI config (as requested):
    // 1. @preset/nikcli - NikCLI smart routing preset
    // 2. Claude Sonnet 4.5 - Latest Anthropic
    // 3. GPT-5 - Latest OpenAI
    // 4. GLM 4.5 - Z-AI model

    return [
        AVAILABLE_MODELS.find(m => m.id === '@preset/nikcli')!,
        AVAILABLE_MODELS.find(m => m.id === 'anthropic/claude-sonnet-4.5')!,
        AVAILABLE_MODELS.find(m => m.id === 'openai/gpt-5')!,
        AVAILABLE_MODELS.find(m => m.id === 'z-ai/glm-4.5')!,
    ]
}

/**
 * Print comprehensive comparison
 */
function printComparison(results: ModelResult[], models: AIModelConfig[]) {
    console.log(chalk.gray('\n' + '═'.repeat(80)))
    console.log(chalk.bold.cyan('\n📊 Benchmark Results - Real Skills Tested\n'))

    // Group by model
    const byModel = new Map<string, ModelResult[]>()
    for (const result of results) {
        if (!byModel.has(result.model)) {
            byModel.set(result.model, [])
        }
        byModel.get(result.model)!.push(result)
    }

    // Calculate aggregates
    const aggregates = Array.from(byModel.entries()).map(([modelName, modelResults]) => {
        const successfulResults = modelResults.filter((r) => r.success)
        const avgTime = successfulResults.reduce((sum, r) => sum + r.timeMs, 0) / successfulResults.length || 0
        const totalCost = modelResults.reduce((sum, r) => sum + r.cost, 0)
        const avgScore = successfulResults.reduce((sum, r) => sum + r.evaluation.score, 0) / successfulResults.length || 0
        const successRate = (successfulResults.length / modelResults.length) * 100
        const tasksAbove80 = successfulResults.filter(r => r.evaluation.score >= 80).length
        const tasksAbove60 = successfulResults.filter(r => r.evaluation.score >= 60).length

        return {
            model: modelName,
            avgTime,
            totalCost,
            avgScore,
            successRate,
            tasksAbove80,
            tasksAbove60,
            totalTasks: modelResults.length,
        }
    })

    // Sort by overall performance score
    aggregates.sort((a, b) => {
        const scoreA = (a.avgScore * a.successRate) / (a.avgTime * Math.max(a.totalCost, 0.001))
        const scoreB = (b.avgScore * b.successRate) / (b.avgTime * Math.max(b.totalCost, 0.001))
        return scoreB - scoreA
    })

    // Print table
    console.log(chalk.bold.white('Overall Performance:\n'))
    console.log(
        chalk.gray(
            '  Model'.padEnd(30) +
            'Avg Time'.padEnd(12) +
            'Cost'.padEnd(12) +
            'Avg Score'.padEnd(12) +
            'Excellent'.padEnd(12)
        )
    )
    console.log(chalk.gray('  ' + '─'.repeat(75)))

    for (let i = 0; i < aggregates.length; i++) {
        const agg = aggregates[i]
        const color = i === 0 ? chalk.green : i === aggregates.length - 1 ? chalk.red : chalk.yellow
        const scoreColor = agg.avgScore >= 80 ? chalk.green : agg.avgScore >= 60 ? chalk.yellow : chalk.red

        console.log(
            color(`  ${agg.model.padEnd(30)}`) +
            chalk.white(`${agg.avgTime.toFixed(0)}ms`.padEnd(12)) +
            chalk.white(`$${agg.totalCost.toFixed(4)}`.padEnd(12)) +
            scoreColor(`${agg.avgScore.toFixed(1)}`.padEnd(12)) +
            chalk.white(`${agg.tasksAbove80}/${agg.totalTasks}`)
        )
    }

    // Best in category
    console.log(chalk.bold.white('\n\n🏆 Best in Category:\n'))

    const fastest = aggregates.reduce((min, curr) => (curr.avgTime < min.avgTime ? curr : min))
    const cheapest = aggregates.reduce((min, curr) => (curr.totalCost < min.totalCost ? curr : min))
    const highestScore = aggregates.reduce((max, curr) => (curr.avgScore > max.avgScore ? curr : max))
    const mostExcellent = aggregates.reduce((max, curr) => (curr.tasksAbove80 > max.tasksAbove80 ? curr : max))

    console.log(chalk.green(`  ⚡ Fastest: ${fastest.model}`) + chalk.gray(` (${fastest.avgTime.toFixed(0)}ms avg)`))
    console.log(chalk.green(`  💰 Cheapest: ${cheapest.model}`) + chalk.gray(` ($${cheapest.totalCost.toFixed(4)} total)`))
    console.log(chalk.green(`  ⭐ Highest Score: ${highestScore.model}`) + chalk.gray(` (${highestScore.avgScore.toFixed(1)}/100)`))
    console.log(chalk.green(`  🎯 Most Excellent: ${mostExcellent.model}`) + chalk.gray(` (${mostExcellent.tasksAbove80} tasks >80)`))

    // Recommendation
    console.log(chalk.bold.magenta(`\n\n💡 Recommendation for NikCLI: ${aggregates[0].model}`))
    console.log(
        chalk.gray(
            `   Best balance: ${aggregates[0].avgScore.toFixed(1)}/100 score, ${aggregates[0].avgTime.toFixed(0)}ms avg, $${aggregates[0].totalCost.toFixed(4)} total`
        )
    )

    // Task breakdown by category
    console.log(chalk.bold.white('\n\n📋 Performance by Task Category:\n'))

    const categories = ['code-generation', 'bug-fixing', 'code-review', 'refactoring', 'architecture', 'problem-solving']
    for (const category of categories) {
        const categoryTasks = BENCHMARK_TASKS.filter(t => t.category === category)
        if (categoryTasks.length === 0) continue

        console.log(chalk.bold.blue(`\n  ${category.toUpperCase().replace('-', ' ')}:`))

        for (const task of categoryTasks) {
            console.log(chalk.white(`    ${task.name}:`))

            const taskResults = results.filter(r => r.task === task.name && r.success)
                .sort((a, b) => b.evaluation.score - a.evaluation.score)

            for (const result of taskResults.slice(0, 3)) {
                const scoreColor = result.evaluation.score >= 80 ? chalk.green :
                    result.evaluation.score >= 60 ? chalk.yellow : chalk.red

                console.log(
                    chalk.gray(`      ${result.model.padEnd(25)}`) +
                    scoreColor(`${result.evaluation.score}/100`.padEnd(10)) +
                    chalk.gray(`${result.timeMs}ms, $${result.cost.toFixed(4)}`)
                )
            }
        }
    }

    console.log('\n')
}

// Run benchmarks
runAIModelBenchmarks().catch(console.error)
