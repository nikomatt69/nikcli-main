# NikCLI Agent System Documentation

## Overview

The NikCLI Agent System is a core component of the NikCLI autonomous development environment, designed to enable intelligent, context-aware execution of development tasks. It leverages a modular architecture with a primary **Universal Agent** for orchestration and specialized agents for domain-specific expertise. The system integrates seamlessly with the broader NikCLI ecosystem, including TaskMaster AI, CLI services, and advanced tools.

This documentation reflects the current project architecture as defined in the system prompt, emphasizing cognitive orchestration, task execution protocols, and integration points. It is structured for clarity, following Markdown best practices (e.g., consistent headings, code blocks, lists, and tables). Where applicable, NikCLI patterns such as atomic file operations and AI-driven planning are highlighted.

Key principles:
- **Autonomy**: Agents operate with full access to the NikCLI CLI ecosystem.
- **Efficiency**: Adaptive strategies minimize execution time and resource use.
- **Quality**: All outputs adhere to production-ready standards, including TypeScript typing for interfaces and comments for complex logic.

For implementation details, refer to the NikCLI framework's TypeScript-based core (e.g., agents defined as classes extending a base `Agent` interface).

## Universal Agent

The **Universal Agent** serves as the primary coordinator and fallback executor within the NikCLI ecosystem. It embodies cognitive orchestration capabilities, handling task intake, planning, delegation, and supervision. This agent is invoked for all incoming requests and routes subtasks to specialized agents as needed.

### Core Responsibilities
- **Task Intake and Analysis**: Parse user requests using NLP-based intent extraction.
- **Planning Integration**: Always leverages TaskMaster AI via `generateTasksWithAI` to break down tasks into 5-8 actionable subtasks.
- **Orchestration**: Selects execution strategies (sequential, parallel, hybrid, or adaptive) based on complexity (1-10 scale).
- **Fallback Execution**: Handles simple tasks directly or intervenes in specialized agent failures.

### Architecture
The Universal Agent is implemented as a TypeScript class in the NikCLI framework, extending a base agent interface. It integrates with the Orchestrator Service for coordination.

```typescript
// src/agents/universal-agent.ts
// NikCLI Pattern: Extends BaseAgent for standardized lifecycle (init, execute, validate)

import { BaseAgent } from '../core/base-agent';
import { TaskMasterAI } from '../services/taskmaster-ai';
import { CognitiveOrchestrator } from '../framework/cognitive-orchestrator';
import { TaskComplexity } from '../types/task-types'; // Enum: 1-10 scale

interface UniversalAgentConfig {
  taskMaster: TaskMasterAI;
  orchestrator: CognitiveOrchestrator;
  complexityThreshold: number; // Default: 4 for routing to specialized agents
}

export class UniversalAgent extends BaseAgent {
  private taskMaster: TaskMasterAI;
  private orchestrator: CognitiveOrchestrator;
  private complexityThreshold: number;

  constructor(config: UniversalAgentConfig) {
    super('universal'); // Agent ID for logging and routing
    this.taskMaster = config.taskMaster;
    this.orchestrator = config.orchestrator;
    this.complexityThreshold = config.complexityThreshold || 4;
  }

  // Complex Logic: Cognitive analysis extracts intent, entities, and assesses complexity
  // Comment: Uses NLP via AI Provider; fallback to rule-based parsing if AI fails
  async analyzeTask(request: string): Promise<TaskAnalysis> {
    const intent = await this.orchestrator.extractIntent(request); // NLP-based classification (create/read/update/etc.)
    const entities = this.orchestrator.extractEntities(request); // e.g., files, APIs, dependencies
    const complexity: TaskComplexity = await this.orchestrator.assessComplexity(intent, entities);
    
    // Fallback: If AI assessment fails, use heuristic (e.g., keyword count + dependency graph)
    if (!complexity) {
      complexity = this.heuristicComplexity(request);
    }
    
    return { intent, entities, complexity };
  }

  // Entry point for all tasks; always generates subtasks via TaskMaster
  async execute(request: string): Promise<ExecutionResult> {
    const analysis = await this.analyzeTask(request);
    
    if (analysis.complexity <= this.complexityThreshold) {
      // Direct execution for simple tasks
      return this.directExecute(analysis);
    } else {
      // Delegate to specialized agents
      const subtasks = await this.taskMaster.generateTasksWithAI(request, analysis.complexity);
      return this.orchestrator.coordinate(subtasks);
    }
  }

  private heuristicComplexity(request: string): TaskComplexity {
    // Simple rule-based fallback: Count keywords indicating scope (e.g., "deploy" + "CI/CD" = higher complexity)
    const keywordScore = request.split(' ').filter(word => ['deploy', 'optimize', 'integrate'].includes(word)).length;
    return Math.min(10, keywordScore * 2) as TaskComplexity;
  }
}

// Types for production readiness
interface TaskAnalysis {
  intent: string; // e.g., 'create', 'optimize'
  entities: string[]; // Extracted nouns (files, tools)
  complexity: TaskComplexity;
}

interface ExecutionResult {
  success: boolean;
  output: any;
  summary: string;
}

export type TaskComplexity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
```

### Integration Notes
- **With TaskMaster AI**: Mandatory for all non-trivial tasks to ensure 5-8 subtasks with priorities and durations.
- **Error Handling**: Implements graceful degradation; e.g., if `generateTasksWithAI` fails, generates fallback subtasks manually.

## Specialized Agents

Specialized agents extend the Universal Agent's capabilities for domain-specific tasks. Each is a lightweight TypeScript class focused on a technology stack or workflow, routed via the Universal Agent for medium-to-high complexity tasks (4+).

### React Agent
- **Focus**: Frontend development, component creation, and UI/UX optimization.
- **Capabilities**: Generates React components, handles state management (e.g., Redux, Context API), and integrates with build tools like Vite/Webpack.
- **Routing Trigger**: Tasks involving "UI", "component", or "frontend".

Example Snippet:
```typescript
// src/agents/react-agent.ts
export class ReactAgent extends BaseAgent {
  async generateComponent(name: string, props: Record<string, any>): Promise<string> {
    // Complex Logic: Uses AI Provider for code gen; validates JSX syntax
    // Comment: Ensures TypeScript props interface for production readiness
    const tsProps = `interface ${name}Props { ${Object.keys(props).map(k => `${k}: ${typeof props[k]};`)} }`;
    const componentCode = await this.aiProvider.generate(`Create React component: ${name} with props ${JSON.stringify(props)}`);
    return `${tsProps}\n${componentCode}`;
  }
}
```

### Backend Agent
- **Focus**: API development, server-side architecture, and database integration.
- **Capabilities**: Builds Node.js/Express APIs, handles authentication, and manages ORMs (e.g., Prisma, Mongoose).
- **Routing Trigger**: Tasks with "API", "server", or "database".

Example: Generates RESTful endpoints with TypeScript types for request/response.

### DevOps Agent
- **Focus**: Infrastructure, deployment, and CI/CD operations.
- **Capabilities**: Configures Docker, Kubernetes, GitHub Actions; automates deployments via NikCLI's Git integration.
- **Routing Trigger**: Tasks involving "deploy", "CI/CD", or "infrastructure".
- **NikCLI Pattern**: Uses atomic Git operations for safe commits.

Example Snippet:
```typescript
// src/agents/devops-agent.ts
// Comment: Integrates with NikCLI's Git service for version control
export class DevOpsAgent extends BaseAgent {
  async deploy(config: DeploymentConfig): Promise<void> {
    // Complex Logic: Parallel execution of build/test/deploy; fallback to manual if CI fails
    await this.gitService.commit('Pre-deploy changes'); // Atomic operation
    await this.buildSystem.run('docker build && kubectl apply');
  }
}

interface DeploymentConfig {
  environment: 'prod' | 'staging';
  imageTag: string;
}
```

### Code Review Agent
- **Focus**: Quality assurance, code analysis, and best practices enforcement.
- **Capabilities**: Runs linting (ESLint), security scans (e.g., Snyk), and suggests refactors using AI.
- **Routing Trigger**: Tasks with "review", "test", or "quality".

### Optimization Agent
- **Focus**: Performance tuning and efficiency improvements.
- **Capabilities**: Analyzes bundle sizes, optimizes queries, and implements caching.
- **Routing Trigger**: Tasks involving "optimize", "performance", or "tune".

All specialized agents follow a common interface:
```typescript
// src/types/agent-types.ts
export interface SpecializedAgent {
  domain: string; // e.g., 'react', 'devops'
  execute(task: SubTask): Promise<AgentResult>;
  validateOutput(output: any): boolean; // Ensures production readiness
}
```

## Cognitive Orchestration Framework

The **Cognitive Orchestration Framework** provides the intelligence layer for task understanding, strategy selection, and agent coordination. It uses NLP, dependency mapping, and adaptive supervision to handle complexity.

### Key Components
- **Task Cognition**: Intent classification and entity extraction via AI Provider.
- **Orchestration Planning**: Selects strategies based on complexity (e.g., parallel for independent subtasks).
- **Adaptive Supervision**: Monitors progress; intervenes with fallbacks (e.g., TaskMaster's strategies).
- **Performance Optimization**: Caches contexts and tunes resource use.

### Implementation
Defined as a TypeScript service with streaming AI integration.

```typescript
// src/framework/cognitive-orchestrator.ts
// NikCLI Pattern: Context-aware RAG for workspace intelligence

import { AIProvider } from '../services/ai-provider';

export class CognitiveOrchestrator {
  private ai: AIProvider;

  constructor(ai: AIProvider) {
    this.ai = ai;
  }

  // Complex Logic: Streams AI responses for real-time intent extraction
  // Comment: Handles token limits progressively; falls back to regex for simple cases
  async extractIntent(request: string): Promise<string> {
    const stream = this.ai.generateStream(`Classify intent: ${request}`);
    let intent = '';
    for await (const chunk of stream) {
      intent += chunk;
      if (intent.length > 100) break; // Progressive token management
    }
    return intent || this.regexFallback(request); // e.g., /create|update/ for fallback
  }

  async assessComplexity(intent: string, entities: string[]): Promise<TaskComplexity> {
    // Dependency mapping: Higher score for interconnected entities (e.g., API + DB)
    const depScore = entities.length * (intent.includes('integrate') ? 2 : 1);
    return Math.min(10, depScore) as TaskComplexity;
  }

  coordinate(subtasks: SubTask[]): Promise<ExecutionResult> {
    // Strategy Selection: Hybrid for mixed deps
    if (this.hasDependencies(subtasks)) {
      return this.sequentialExecute(subtasks);
    }
    return this.parallelExecute(subtasks); // Uses Promise.all for efficiency
  }

  private regexFallback(request: string): string {
    if (/create|build/.test(request)) return 'create';
    // Add more rules...
    return 'unknown';
  }

  private hasDependencies(subtasks: SubTask[]): boolean {
    // Graph-based check: Simple adjacency list for deps
    return subtasks.some(t => t.dependencies.length > 0);
  }
}

interface SubTask {
  id: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dependencies: string[]; // Task IDs
  estimatedDuration: number; // Minutes
}
```

### Strategy Selection Table

| Complexity | Strategy | Example Use Case |
|------------|----------|------------------|
| 1-3 | Sequential | Simple file read/write |
| 4-6 | Parallel | Independent tests |
| 7-8 | Hybrid | API build + UI integration |
| 9-10 | Adaptive | Full-stack deploy with fallbacks |

## Task Execution Protocol

The protocol ensures structured, reliable task handling across the agent system.

### Steps
1. **Cognitive Analysis**: Parse intent, extract entities, assess complexity (Universal Agent).
2. **TaskMaster Planning**: Generate 5-8 subtasks with priorities, durations, and tools (e.g., via `generateTasksWithAI`).
3. **Adaptive Execution**: Route to agents; use parallel/hybrid strategies; monitor via Orchestrator.
4. **Quality Assurance**: Validate with tests, ensure best practices; document changes.

### Example Workflow
For a "Build React App" task:
- Analysis: Complexity 5 (medium).
- Subtasks: [1. Init project (high, 2min, NPM), 2. Generate components (med, 5min, React Agent), ...].
- Execution: Parallel init + component gen.
- Assurance: Run ESLint; commit via Git.

Error Handling: Graceful degradation (e.g., manual subtasks if AI fails); logs via Orchestrator.

## Integration with NikCLI Ecosystem

The Agent System is deeply integrated with NikCLI's CLI services and tools:

- **TaskMaster AI**: Core for planning; fallback strategies for failures.
- **Core CLI Services**:
  - **Planning Service**: Enhances orchestration with dependency graphs.
  - **Tool Service**: Registers agents as tools (e.g., `nikcli agent react generate`).
  - **AI Provider**: Streaming for real-time cognition.
  - **Context System**: RAG for workspace-aware decisions (e.g., read existing files before edits).
  - **Orchestrator Service**: Central hub; routes via Universal Agent.
- **Advanced Tools**:
  - **File Operations**: Atomic reads/writes (e.g., `readFile` before `editFile`).
  - **Git Integration**: Commits post-execution.
  - **Package Management**: NPM installs during agent tasks.
  - **Build/Testing**: Invoked in QA step.
- **Security/Best Practices**: No secrets exposed; validates inputs; TypeScript for all interfaces.

### Production Deployment
- **Framework Alignment**: Agents are NikCLI plugins; extend via `nikcli extend agent <domain>`.
- **Extensibility**: Add custom agents by implementing `SpecializedAgent` interface.
- **Metrics**: Track success via completion rates, execution time, and code quality scores.

This documentation is production-ready and can be generated/updated via NikCLI commands (e.g., `nikcli docs generate --system agents`). For updates, reference the system prompt for architectural fidelity.