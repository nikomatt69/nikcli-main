# NikCLI Architecture Diagram

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NIKCLI UNIVERSE                                   │
│                    Advanced AI Development Assistant                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            USER INTERFACE LAYER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  CLI Interface  │  StreamTTY  │  WebSocket   │  Interactive  │  Menubar     │
│  (index.ts)     │  UI         │  Server      │  Onboarding   │  Integration │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ORCHESTRATION LAYER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Main Orchestrator     │  TaskMaster AI     │  Agent Service                │
│  (main-orchestrator.ts)│  (generateTasks)   │  (agent-service.ts)           │
│                        │                   │                               │
│  • Phase Management    │  • Task Cognition  │  • 20+ Specialized Agents    │
│  • Dependency Tracking │  • Intent Analysis │  • Agent Orchestration       │
│  • Service Lifecycle   │  • Strategic Planning│  • Concurrent Execution     │
│                        │                   │  • Result Aggregation         │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENT ECOSYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Universal Agent │ React Agent │ Backend Agent │ DevOps Agent │ Code Review  │
│ (cognition,     │ (Frontend)  │ (API/Server)  │ (Infra)      │ Agent        │
│  orchestration) │             │               │              │              │
│                 │             │               │              │              │
│ • Task Understanding│          │               │              │              │
│ • Strategic Planning│          │               │              │              │
│ • Adaptive Learning │          │               │              │              │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI PROVIDER ECOSYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Advanced AI Provider (advanced-ai-provider.ts)                             │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │    OpenAI    │  │  Anthropic   │  │    Google    │  │ OpenRouter   │    │
│  │   (GPT-4)    │  │  (Claude)    │  │  (Gemini)    │  │  (Multi)     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Ollama     │  │    Vercel    │  │   Cerebras   │  │    Groq      │    │
│  │  (Local)     │  │  (AI SDK)   │  │  (Fast)      │  │  (Speed)     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐                                       │
│  │  LMStudio    │  │   Custom     │                                       │
│  │ (Local UI)   │  │  Providers   │                                       │
│  └──────────────┘  └──────────────┘                                       │
│                                                                             │
│  • Cognitive Orchestration  • Intelligent Tool Routing                     │
│  • Streaming Support        • Token Optimization                           │
│  • Context Management       • Performance Monitoring                      │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICE LAYER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Planning Service  │  Tool Service   │  Memory Service │  StreamTTY       │
│  (execution plans) │ (tool registry) │ (context/data) │ (real-time UI)   │
│                    │                │                │                  │
│  • Task Analysis   │ • 50+ Tools    │ • RAG System   │ • Progress Bars  │
│  • Dependency Mgmt │ • Tool Chaining│ • Workspace    │ • Live Updates   │
│  • Strategy Opt    │ • Safety Guards│   Context      │ • Diff Viewing   │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TOOL ECOSYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ File Operations │ Git Operations │ Code Analysis │ AI Integration │ Build     │
│                 │                │               │                │ Tools     │
│ • Read/Write    │ • Full Git     │ • LSP         │ • AI Providers │ • NPM     │
│ • MultiEdit     │   Workflows    │ • Validation  │ • Streaming    │ • Compile │
│ • Atomic Ops    │ • Repository   │ • Formatters  │ • Context      │ • Bundle  │
│ • Backup        │   Management   │ • Linters     │   Injection    │ • Deploy  │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND SERVICES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Background Agents  │ Virtualized Agents │ API Server      │ Database       │
│ (background-agents/)│ (virtualized-agents/)│ (Express/WS)   │ (Supabase)    │
│                    │                    │                │               │
│ • Job Queues       │ • Docker Orchestration│ • WebSocket    │ • Vector DB   │
│ • Authentication   │ • VM Management   │ • REST API      │ • Session Store│
│ • Security         │ • API Key Proxy   │ • Authentication│ • Cache Layer │
│ • Monitoring       │ • Session Mgmt    │ • CORS          │ • Real-time   │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CONTEXT SYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ RAG Context       │ Workspace Context │ Embedding       │ Context-Aware   │
│ (context/)        │ (project-aware)   │ Providers       │ Operations      │
│                   │                   │                │                 │
│ • Vector Embeddings│ • Project State  │ • AI SDK        │ • Smart Context │
│ • Semantic Search │ • File Context    │ • OpenRouter    │ • Prompt Opt    │
│ • Knowledge Base  │ • Dependency Map  │   Reranking     │ • Response Gen  │
│ • Context Injection│ • Language Info  │ • Performance   │ • Error Handling│
└─────────────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATION LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ LSP Integration │ Package Mgmt  │ Cloud Services │ Security Layer │ Monitoring │
│                 │               │                │                │            │
│ • TypeScript    │ • NPM         │ • AWS          │ • API Key Mgmt │ • Health   │
│ • Diagnostics   │ • Dependencies│ • Vercel       │ • Auth System  │   Checks   │
│ • Auto-format   │ • Analysis    │ • Docker       │ • Security     │ • Metrics  │
│ • Error Correction│ • Install    │ • Kubernetes   │   Middleware   │ • Alerting │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Detailed Component Flow

```
User Command Input
        │
        ▼
┌─────────────────────────────────────────────────┐
│                CLI ENTRY POINT                   │
│                  (index.ts)                      │
│                                                 │
│ • Interactive Onboarding                        │
│ • Service Initialization                        │
│ • Error Handling                                │
│ • macOS Menubar Integration                     │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│              MAIN ORCHESTRATOR                   │
│            (main-orchestrator.ts)                │
│                                                 │
│ • Phase Management (Initialization phases)      │
│ • Dependency Tracking                           │
│ • Global Error Handling                         │
│ • Service Lifecycle Management                  │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│               TASKMASTER AI                      │
│            (generateTasksWithAI)                 │
│                                                 │
│ • Task Cognition (NLP-based understanding)      │
│ • Intent Extraction                             │
│ • Complexity Assessment (1-10 scale)            │
│ • Dependency Mapping                            │
│ • Strategic Planning                            │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│              AGENT SELECTION                     │
│            (agent-service.ts)                    │
│                                                 │
│ • 20+ Specialized Agents                        │
│ • Intelligent Task Routing                      │
│ • Concurrent Execution                          │
│ • Result Aggregation                            │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│            AGENT EXECUTION                       │
│                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ Universal   │ │ React       │ │ Backend     │ │
│ │ Agent       │ │ Agent       │ │ Agent       │ │
│ │             │ │             │ │             │ │
│ │ • Cognition │ │ • Frontend  │ │ • API Dev   │ │
│ │ • Planning  │ │ • Components│ │ • Server    │ │
│ │ • Learning  │ │ • Styling   │ │ • Database  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ DevOps      │ │ Code Review │ │ Optimization│ │
│ │ Agent       │ │ Agent       │ │ Agent       │ │
│ │             │ │             │ │             │ │
│ │ • Infra     │ │ • Quality   │ │ • Performance│ │
│ │ • Deploy    │ │ • Security  │ │ • Efficiency│ │
│ │ • CI/CD     │ │ • Standards │ │ • Analysis  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│            AI PROVIDER ROUTING                   │
│          (advanced-ai-provider.ts)               │
│                                                 │
│ • Multi-Provider Support (10+ providers)        │
│ • Intelligent Model Selection                   │
│ • Token Optimization                            │
│ • Streaming Support                             │
│ • Context Management                            │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│              TOOL EXECUTION                      │
│               (tools/)                           │
│                                                 │
│ • 50+ Specialized Tools                         │
│ • Tool Chaining                                 │
│ • Safety Guards                                 │
│ • Validation Systems                            │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│              CONTEXT SYSTEM                      │
│              (context/)                          │
│                                                 │
│ • RAG-based Context                             │
│ • Workspace Awareness                           │
│ • Semantic Search                               │
│ • Context Injection                             │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│              RESULT PROCESSING                   │
│                                                 │
│ • Structured Output Generation                  │
│ • Quality Validation                            │
│ • Result Aggregation                            │
│ • User Feedback Integration                     │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────┐
│              STREAMING UI                        │
│             (StreamTTY)                          │
│                                                 │
│ • Real-time Updates                             │
│ • Progress Tracking                             │
│ • Interactive Elements                          │
│ • Error Display                                 │
└─────────────────────────────────────────────────┘
```

## Data Flow Architecture

```
┌─────────────────────────────────────────────────┐
│              INPUT LAYER                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ User CLI    │ │ WebSocket   │ │ Background  │ │
│  │ Commands    │ │ Messages    │ │ Jobs        │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│            PARSING & UNDERSTANDING               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Task        │ │ Intent      │ │ Context     │ │
│  │ Extraction  │ │ Recognition │ │ Analysis    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│            COGNITIVE ORCHESTRATION               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Task        │ │ Agent       │ │ Strategy    │ │
│  │ Planning    │ │ Selection   │ │ Planning    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│            EXECUTION ENGINE                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Agent       │ │ Tool        │ │ AI          │ │
│  │ Execution   │ │ Execution   │ │ Provider    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│            PROCESSING & VALIDATION               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Code        │ │ Quality     │ │ Security    │ │
│  │ Generation  │ │ Validation  │ │ Check       │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│            OUTPUT LAYER                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Structured  │ │ Streaming   │ │ Interactive │ │
│  │ Results     │ │ Updates     │ │ Feedback    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────┐
│              SECURITY LAYER                      │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ API Key     │ │ Execution   │ │ Data        │ │
│  │ Management  │ │ Sandboxing  │ │ Validation  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Session     │ │ Permission  │ │ Audit       │ │
│  │ Security    │ │ Control     │ │ Logging     │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
```

## Performance Optimization Layers

```
┌─────────────────────────────────────────────────┐
│              PERFORMANCE LAYER                   │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Token       │ │ Caching     │ │ Concurrency │ │
│  │ Optimization│ │ Strategy    │ │ Management  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │ Memory      │ │ Resource    │ │ Adaptive    │ │
│  │ Management  │ │ Monitoring  │ │ Strategies  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ │
└─────────────────────────────────────────────────┘
```

This architecture represents a **next-generation AI development platform** that combines enterprise-grade security, sophisticated AI orchestration, comprehensive tool ecosystems, and real-time streaming capabilities into a unified CLI experience.
