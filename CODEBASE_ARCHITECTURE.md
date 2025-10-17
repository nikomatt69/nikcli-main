# NikCLI Codebase Architecture & Design

**Comprehensive technical architecture documentation for NikCLI development ecosystem**

---

## 📐 Architectural Overview

NikCLI follows a **layered, modular architecture** designed for autonomous AI-driven development:

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Interface Layer                         │
│  (Interactive CLI, Terminal UI, Rich Output, Real-time Streams) │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Command Processing Layer                      │
│  (Commander.js, Command Parsing, Routing, Validation)          │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Orchestration Layer                    │
│  (Universal Agent, Specialized Agents, Task Coordination)       │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Context & Intelligence Layer                   │
│  (Context Interceptor SDK, RAG, Embedding, Indexing)           │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Service Integration Layer                    │
│  (AI Providers, Tool Registry, File Operations, Git)            │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                   External Services Layer                       │
│  (OpenAI, Anthropic, Google, Ollama, Vercel, Supabase)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧩 Core Components

### 1. **CLI Entry Point** (`bin/cli.ts`)

**Responsibility**: Bootstrap application and delegate to main CLI

```typescript
// Flow:
bin/cli.ts
  ↓ (imports and calls)
src/cli/index.ts (main)
  ↓ (initializes)
CLI Application
  ├→ Command Parser
  ├→ Agent System
  ├→ Service Registry
  └→ Event Bus
```

**Key Functions**:

- Process initialization
- Error handling and logging
- Graceful shutdown
- Exit code management

---

### 2. **StreamTTY Framework** (`streamtty/`)

**Purpose**: Advanced streaming terminal UI for real-time AI responses

**Architecture Pattern**: Event-Driven, Plugin-Based

```
StreamTTY System
├── Protocol Layer
│   ├── stream-protocol.ts      # Streaming protocol definition
│   ├── parser/                 # Protocol parsing
│   └── events.ts               # Event system
│
├── Rendering Layer
│   ├── renderers/              # Terminal rendering engines
│   │   ├── markdown-renderer   # Markdown to TTY
│   │   ├── code-renderer       # Syntax-highlighted code
│   │   ├── table-renderer      # Tabular data
│   │   ├── progress-renderer   # Progress bars
│   │   └── component-renderer  # UI components
│   ├── themes/                 # Color schemes
│   └── controls/               # Interactive controls
│
├── Integration Layer
│   ├── ai-sdk-adapter.ts       # Vercel AI SDK integration
│   ├── streamdown-compat.ts    # Markdown compatibility
│   └── plugins/                # Plugin system
│
└── Utility Layer
    ├── performance.ts          # Performance monitoring
    ├── errors.ts               # Error handling
    ├── security/               # Security utilities
    └── utils/                  # Helper functions
```

**Key Features**:

- **Streaming Support**: Real-time response streaming with backpressure handling
- **Performance Monitoring**: Track rendering performance and memory usage
- **Security**: Input sanitization, XSS prevention
- **Plugin System**: Extensible rendering and processing
- **Event-Driven**: Observable streams for reactive UI updates

**Integration Points**:

- Vercel AI SDK (streaming LLM responses)
- Terminal I/O (blessed.js)
- Event emitters (Node.js EventEmitter)

---

### 3. **Context Interceptor SDK** (`context-interceptor-sdk/`)

**Purpose**: Intelligent context retrieval and semantic understanding

**Architecture Pattern**: Pipeline-Based, Retrieval-Augmented Generation

```
Context Interceptor Pipeline
│
├─→ Input Analysis
│   └── Workspace Context Extraction
│
├─→ Semantic Processing
│   ├── Code Parsing & AST Analysis
│   ├── Embedding Generation
│   │   ├── OpenAI Embeddings
│   │   └── Local Embeddings
│   └── Vector Normalization
│
├─→ Storage & Indexing
│   ├── Vector Database
│   │   ├── ChromaDB (Vector Storage)
│   │   ├── Supabase (Metadata)
│   │   └── Redis (Cache)
│   └── Indexing Engine
│       ├── Code Indexer
│       ├── File Indexer
│       └── Dependency Indexer
│
├─→ Query & Retrieval
│   ├── Semantic Search
│   ├── Similarity Matching
│   ├── Relevance Ranking
│   └── Result Filtering
│
└─→ Context Injection
    └── Enhanced Prompt Context
```

**Key Modules**:

| Module           | Purpose                       | Key Files |
| ---------------- | ----------------------------- | --------- |
| **Interceptors** | Context capture mechanisms    | 4 files   |
| **Embedding**    | Semantic embedding generation | 4 files   |
| **Indexer**      | Code and file indexing        | 3 files   |
| **Storage**      | Vector database integration   | 2 files   |
| **Query**        | Semantic search engine        | 2 files   |
| **Providers**    | Embedding service providers   | 2 files   |

**Data Flow**:

```
Workspace Files
    ↓
Code Parser
    ↓
Semantic Analyzer
    ↓
Embedding Generator
    ↓
Vector Storage
    ↓
Indexed Knowledge Base
    ↓
Query Engine (on user input)
    ↓
Relevant Context Retrieval
    ↓
Enhanced Prompt
    ↓
AI Model
```

---

### 4. **Agent System Architecture**

**Pattern**: Specialized Agent Orchestration with Cognitive Routing

```
Universal Agent (Coordinator)
├── React Agent
│   ├── Component Generation
│   ├── State Management
│   └── Testing
│
├── Backend Agent
│   ├── API Development
│   ├── Database Design
│   └── Authentication
│
├── DevOps Agent
│   ├── Infrastructure
│   ├── Deployment
│   └── CI/CD
│
├── Code Review Agent
│   ├── Quality Analysis
│   ├── Security Scanning
│   └── Performance Review
│
└── Optimization Agent
    ├── Performance Tuning
    ├── Resource Optimization
    └── Efficiency Improvements
```

**Agent Capabilities** (64+ total):

**Universal Agent**:

- Task orchestration
- Multi-agent coordination
- Context management
- Fallback strategies

**Specialized Agents**:

- Domain-specific expertise
- Optimized for technology stack
- Parallel execution support
- Error recovery

---

### 5. **Service Integration Layer**

**Architecture Pattern**: Provider Abstraction with Fallback Strategy

```
AI Provider Abstraction
├── OpenAI
│   ├── GPT-4 Turbo
│   ├── GPT-3.5
│   └── Embeddings (text-embedding-3-small)
│
├── Anthropic
│   ├── Claude 3 Opus
│   ├── Claude 3 Sonnet
│   └── Claude 3 Haiku
│
├── Google
│   ├── Gemini Pro
│   └── Gemini Vision
│
├── Ollama (Local)
│   ├── Llama 2
│   ├── Mistral
│   └── Local Models
│
└── OpenRouter
    └── Multi-model Gateway
```

**Tool Registry**:

```
Tool System
├── File Operations
│   ├── read_file
│   ├── write_file
│   ├── edit_file
│   └── multi_edit
│
├── Git Operations
│   ├── commit
│   ├── branch
│   ├── merge
│   └── diff
│
├── Package Management
│   ├── install
│   ├── add
│   ├── remove
│   └── audit
│
├── Build Tools
│   ├── compile
│   ├── bundle
│   └── optimize
│
├── Testing
│   ├── run_tests
│   ├── coverage
│   └── debug
│
└── Code Analysis
    ├── analyze
    ├── lint
    └── review
```

---

## 🔄 Request Processing Pipeline

```
1. USER INPUT
   ↓
   Command: "/agent universal-agent create a login form"

2. COMMAND PARSING
   ↓
   Parser: commander.js
   Extract: agent=universal-agent, task="create a login form"

3. CONTEXT RETRIEVAL
   ↓
   Context Interceptor SDK
   ├→ Analyze workspace
   ├→ Semantic search
   └→ Retrieve relevant files

4. AGENT SELECTION
   ↓
   Universal Agent Coordinator
   ├→ Assess task complexity
   ├→ Select appropriate agent
   └→ Plan execution strategy

5. TASK PLANNING
   ↓
   TaskMaster AI
   ├→ Generate subtasks
   ├→ Determine dependencies
   └→ Create execution plan

6. AI PROVIDER SELECTION
   ↓
   Provider Selector
   ├→ Check availability
   ├→ Select optimal model
   └→ Prepare prompt with context

7. EXECUTION
   ↓
   Agent Execution
   ├→ Stream responses via StreamTTY
   ├→ Execute tools as needed
   ├→ Monitor progress
   └→ Handle errors

8. OUTPUT RENDERING
   ↓
   StreamTTY Framework
   ├→ Parse response
   ├→ Render markdown/code
   ├→ Apply syntax highlighting
   └→ Display with formatting

9. COMPLETION
   ↓
   Summary & Next Steps
```

---

## 📊 Data Models & Schemas

### **Task Model**

```typescript
interface Task {
  id: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  complexity: 1-10
  estimatedDuration: number
  dependencies: string[]
  status: 'pending' | 'in-progress' | 'completed' | 'failed'
  assignedAgent: string
  result?: any
  error?: Error
}
```

### **Context Model**

```typescript
interface WorkspaceContext {
  projectType: string;
  framework?: string;
  language: string;
  dependencies: Dependency[];
  files: FileInfo[];
  gitInfo: GitInfo;
  recentChanges: Change[];
  semanticIndex: VectorIndex;
}
```

### **Agent Model**

```typescript
interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  specialization: string;
  maxConcurrentTasks: number;
  supportedFrameworks: string[];
  execute: (task: Task) => Promise<Result>;
}
```

---

## 🔌 Extension Points

### **Plugin System** (StreamTTY)

```typescript
interface StreamTTYPlugin {
  name: string;
  version: string;
  hooks: {
    beforeRender?: (content: string) => string;
    afterRender?: (output: string) => string;
    onEvent?: (event: Event) => void;
  };
  providers?: {
    renderer?: Renderer;
    theme?: Theme;
  };
}
```

### **Custom Agents**

```typescript
interface CustomAgent extends Agent {
  initialize: () => Promise<void>;
  validate: (task: Task) => boolean;
  execute: (task: Task) => Promise<Result>;
  cleanup: () => Promise<void>;
}
```

### **Tool Integration**

```typescript
interface CustomTool {
  name: string;
  description: string;
  parameters: Schema;
  execute: (params: any) => Promise<any>;
  validate: (params: any) => boolean;
}
```

---

## 🔐 Security Architecture

### **Encryption & Secrets**

```
API Keys
  ↓
Encryption (AES-256-GCM)
  ↓
Secure Storage (~/.nikcli/secrets)
  ↓
Runtime Decryption
  ↓
Provider APIs
```

### **Approval System**

```
Sensitive Operation (e.g., delete file)
  ↓
Trigger Approval Flow
  ├→ Show diff/preview
  ├→ Display confirmation
  └→ Wait for user approval
  ↓
Execute if Approved
  ├→ Log action
  └→ Proceed with operation
```

### **Input Validation**

```
User Input
  ↓
Schema Validation (Zod)
  ├→ Type checking
  ├→ Range validation
  └→ Pattern matching
  ↓
Sanitization
  ├→ Remove dangerous characters
  ├→ Escape special chars
  └→ Normalize paths
  ↓
Safe Processing
```

---

## 📈 Performance Optimization

### **Caching Strategy**

```
Multi-Level Cache
├── L1: In-Memory Cache (Runtime)
│   ├── Recently accessed files
│   ├── Parsed ASTs
│   └── Embedding cache
│
├── L2: Redis Cache (Optional)
│   ├── Semantic search results
│   ├── Computed contexts
│   └── Model responses
│
└── L3: Disk Cache
    ├── Vector database (ChromaDB)
    ├── Indexed files
    └── Compiled code
```

### **Batch Processing**

```
Embedding Batch Optimization
├── EMBED_BATCH_SIZE: 300 files/batch
├── EMBED_MAX_CONCURRENCY: 6 concurrent batches
├── EMBED_INTER_BATCH_DELAY_MS: 25ms between batches
└── EMBED_ADAPTIVE_BATCHING: Dynamic sizing based on content
```

### **Streaming Optimization**

```
Response Streaming
├── Chunk-based transmission
├── Backpressure handling
├── Progressive rendering
└── Memory-efficient buffering
```

---

## 🧪 Testing Architecture

### **Test Pyramid**

```
                    ▲
                   /E2E\
                  /     \
                 /       \
                /_________\
               /Integration\
              /             \
             /               \
            /_________________\
           /     Unit Tests     \
          /                     \
         /_______________________\
```

**Test Categories**:

| Level           | Files | Purpose             | Tools  |
| --------------- | ----- | ------------------- | ------ |
| **Unit**        | 7     | Component isolation | Vitest |
| **Integration** | 2     | Module interaction  | Vitest |
| **E2E**         | 1     | Full workflows      | Vitest |
| **Functional**  | 1     | Feature validation  | Vitest |

**Test Infrastructure**:

- Vitest (fast unit test runner)
- Test setup utilities
- Mock providers
- Fixture management

---

## 🚀 Deployment Architecture

### **Build Targets**

```
TypeScript Source
  ↓
ESBuild Compilation
  ├→ CommonJS (Node.js)
  │   └→ dist/cli/index.js
  │
  ├→ Bun Standalone
  │   └→ public/bin/nikcli (compiled)
  │
  ├→ PKG Binaries
  │   ├→ nikcli-aarch64-apple-darwin
  │   ├→ nikcli-x86_64-apple-darwin
  │   ├→ nikcli-x86_64-linux
  │   └→ nikcli-x86_64-windows.exe
  │
  └→ Docker Image
      └→ nikcli-bg (containerized)
```

### **Deployment Targets**

```
Development
  ├→ Local execution (bun run)
  └→ Watch mode (vitest --watch)

Staging
  ├→ Docker Compose
  └→ Local testing

Production
  ├→ npm Registry (@nicomatt69/nikcli)
  ├→ GitHub Releases (binaries)
  ├→ Docker Hub (containers)
  └→ Vercel (serverless)
```

---

## 📦 Dependency Graph

### **Core Dependencies**

```
NikCLI
├── @ai-sdk/* (Vercel AI SDK)
│   ├── @ai-sdk/openai
│   ├── @ai-sdk/anthropic
│   ├── @ai-sdk/google
│   └── @ai-sdk/vercel
│
├── streamtty (Local package)
│   ├── blessed (Terminal UI)
│   ├── chalk (Colored output)
│   ├── marked (Markdown parsing)
│   └── shiki (Syntax highlighting)
│
├── context-interceptor-sdk (Local package)
│   ├── chromadb (Vector DB)
│   ├── @supabase/supabase-js
│   └── @upstash/redis
│
├── commander (CLI parsing)
├── inquirer (Interactive prompts)
├── express (Web framework)
└── [50+ other utilities]
```

---

## 🎯 Design Patterns

### **Patterns Used**

| Pattern       | Location            | Purpose                                  |
| ------------- | ------------------- | ---------------------------------------- |
| **Singleton** | Agent System        | Single instance per agent type           |
| **Factory**   | Provider Selection  | Create appropriate AI provider           |
| **Strategy**  | Execution Planning  | Different strategies for different tasks |
| **Observer**  | Event System        | Reactive stream processing               |
| **Adapter**   | AI SDK Integration  | Unified interface for different APIs     |
| **Pipeline**  | Context Interceptor | Sequential processing stages             |
| **Plugin**    | StreamTTY           | Extensible rendering system              |
| **Decorator** | Tool Registry       | Augment tool capabilities                |

---

## 🔄 State Management

**State Management Strategy**: Zustand (lightweight, minimal boilerplate)

```
Global State
├── User Configuration
├── Agent Status
├── Active Tasks
├── Cached Context
└── UI State
```

---

## 📝 Code Organization Principles

1. **Modularity**: Each module has single responsibility
2. **Layering**: Clear separation of concerns across layers
3. **Dependency Injection**: Loose coupling between components
4. **Type Safety**: Full TypeScript coverage
5. **Error Handling**: Comprehensive error management
6. **Testability**: All components independently testable
7. **Documentation**: Inline documentation and JSDoc
8. **Performance**: Optimized for speed and memory

---

## 🔗 Integration Points

### **External Services**

```
NikCLI
├→ OpenAI API
│  └→ GPT models, Embeddings
│
├→ Anthropic API
│  └→ Claude models
│
├→ Google API
│  └→ Gemini models
│
├→ Ollama (Local)
│  └→ Local LLM models
│
├→ Vercel
│  ├→ KV Storage
│  └→ Serverless Functions
│
├→ Supabase
│  ├→ Database
│  └→ Auth
│
├→ GitHub
│  ├→ Repository operations
│  └→ Issue tracking
│
└→ Redis
   └→ Caching & Sessions
```

---

## 📊 Metrics & Monitoring

**Tracked Metrics**:

- Response time
- Token usage
- Cache hit rate
- Error rate
- Memory usage
- Concurrent tasks
- Agent utilization

---

## 🎓 Architecture Principles

1. **Separation of Concerns**: Clear boundaries between layers
2. **DRY (Don't Repeat Yourself)**: Reusable components and utilities
3. **KISS (Keep It Simple, Stupid)**: Straightforward design, avoid over-engineering
4. **SOLID Principles**:
   - Single Responsibility
   - Open/Closed
   - Liskov Substitution
   - Interface Segregation
   - Dependency Inversion
5. **Fail-Fast**: Detect errors early
6. **Graceful Degradation**: Continue operation with reduced functionality

---

**Architecture Version**: 0.3.0  
**Last Updated**: October 16, 2025  
**Status**: Production Ready  
**Maintainer**: @nicomatt69
