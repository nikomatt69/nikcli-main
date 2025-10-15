# Circular Dependency Fix Guide

## 🎯 Objective

Eliminate circular dependencies in the NikCLI codebase to prevent initialization deadlocks, improve testability, and reduce memory leak risks.

---

## 🔴 Critical: Context System Loop

### **Current Problem:**

```
workspace-context.ts → rag-system.ts → semantic-search-engine.ts →
unified-embedding-interface.ts → workspace-rag.ts → workspace-context.ts
```

### **Root Cause:**

Each module directly imports and instantiates the next, creating a circular chain.

### **Solution: Dependency Injection Pattern**

#### Step 1: Create Shared Types File

```typescript
// context/context-types.ts (NEW FILE)
export interface IWorkspaceContext {
  getContext(): WorkspaceContextData;
  selectPaths(paths: string[]): Promise<void>;
  refreshWorkspaceIndex(): Promise<void>;
}

export interface IRAGSystem {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  analyzeProject(path: string): Promise<void>;
  updateConfig(config: Partial<RAGConfig>): void;
}

export interface ISemanticSearch {
  search(query: string, limit?: number): Promise<SearchResult[]>;
  indexDocument(doc: Document): Promise<void>;
}

export interface IEmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

export interface WorkspaceContextData {
  rootPath: string;
  selectedPaths: string[];
  files: Map<string, FileMetadata>;
  directories: Map<string, DirectoryMetadata>;
  projectMetadata: ProjectMetadata;
  ragAvailable: boolean;
}
```

#### Step 2: Refactor workspace-context.ts

```typescript
// context/workspace-context.ts (REFACTORED)
import type {
  IRAGSystem,
  ISemanticSearch,
  WorkspaceContextData,
} from "./context-types";

export class WorkspaceContext implements IWorkspaceContext {
  private ragSystem?: IRAGSystem;
  private semanticSearch?: ISemanticSearch;

  // Use setter injection instead of constructor injection
  setRAGSystem(ragSystem: IRAGSystem): void {
    this.ragSystem = ragSystem;
  }

  setSemanticSearch(semanticSearch: ISemanticSearch): void {
    this.semanticSearch = semanticSearch;
  }

  async selectPaths(paths: string[]): Promise<void> {
    // Implementation that uses this.ragSystem if available
    if (this.ragSystem) {
      await this.ragSystem.analyzeProject(this.rootPath);
    }
  }
}

// Singleton with lazy initialization
export const workspaceContext = new WorkspaceContext();
```

#### Step 3: Refactor rag-system.ts

```typescript
// context/rag-system.ts (REFACTORED)
import type {
  IWorkspaceContext,
  ISemanticSearch,
  IEmbeddingProvider,
} from "./context-types";

export class UnifiedRAGSystem implements IRAGSystem {
  private workspaceContext?: IWorkspaceContext;
  private semanticSearch?: ISemanticSearch;
  private embeddingProvider?: IEmbeddingProvider;

  setWorkspaceContext(context: IWorkspaceContext): void {
    this.workspaceContext = context;
  }

  setSemanticSearch(search: ISemanticSearch): void {
    this.semanticSearch = search;
  }

  setEmbeddingProvider(provider: IEmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  async analyzeProject(path: string): Promise<void> {
    // Use injected dependencies
    if (this.semanticSearch && this.embeddingProvider) {
      // Implementation
    }
  }
}

export const unifiedRAGSystem = new UnifiedRAGSystem();
```

#### Step 4: Create Initialization Bootstrap

```typescript
// context/context-bootstrap.ts (NEW FILE)
import { workspaceContext } from "./workspace-context";
import { unifiedRAGSystem } from "./rag-system";
import { semanticSearchEngine } from "./semantic-search-engine";
import { unifiedEmbeddingInterface } from "./unified-embedding-interface";

/**
 * Initialize context system with proper dependency injection
 * MUST be called before using any context services
 */
export async function initializeContextSystem(): Promise<void> {
  // Wire up dependencies in correct order
  unifiedRAGSystem.setSemanticSearch(semanticSearchEngine);
  unifiedRAGSystem.setEmbeddingProvider(unifiedEmbeddingInterface);

  workspaceContext.setRAGSystem(unifiedRAGSystem);
  workspaceContext.setSemanticSearch(semanticSearchEngine);

  semanticSearchEngine.setEmbeddingProvider(unifiedEmbeddingInterface);

  // Initialize in dependency order
  await unifiedEmbeddingInterface.initialize();
  await semanticSearchEngine.initialize();
  await unifiedRAGSystem.initialize();
  await workspaceContext.initialize();
}

// Export for use in nik-cli.ts
export {
  workspaceContext,
  unifiedRAGSystem,
  semanticSearchEngine,
  unifiedEmbeddingInterface,
};
```

#### Step 5: Update nik-cli.ts

```typescript
// nik-cli.ts (UPDATE)
// BEFORE:
import { workspaceContext } from './context/workspace-context'
import { unifiedRAGSystem } from './context/rag-system'

// AFTER:
import { initializeContextSystem } from './context/context-bootstrap'

// In constructor or initialization:
async initialize(): Promise<void> {
  await initializeContextSystem() // Properly wire dependencies
  // ... rest of initialization
}
```

---

## 🟡 Medium Priority: Agent System Loop

### **Current Problem:**

```
agent-manager.ts → agent-service.ts → agent-factory.ts → agent-manager.ts
```

### **Solution: Factory Pattern with Lazy Loading**

#### Refactor agent-factory.ts

```typescript
// core/agent-factory.ts (REFACTORED)
export class AgentFactory {
  private agentManagerGetter?: () => AgentManager;

  // Use getter function instead of direct import
  setAgentManagerGetter(getter: () => AgentManager): void {
    this.agentManagerGetter = getter;
  }

  async createAgent(blueprint: AgentBlueprint): Promise<Agent> {
    // Lazy load agent manager only when needed
    const agentManager = this.agentManagerGetter?.();
    if (agentManager) {
      // Register with manager
    }
    // Create agent
  }
}
```

#### Update nik-cli.ts initialization

```typescript
// nik-cli.ts
async initializeSystems(): Promise<void> {
  // Create agent manager first
  this.agentManager = new AgentManager(this.configManager)

  // Wire up factory with lazy getter
  agentFactory.setAgentManagerGetter(() => this.agentManager)

  // Now safe to use both
  await this.agentManager.initialize()
}
```

---

## 🟢 Low Priority: UI Rendering Loop

### **Current Problem:**

```
advanced-cli-ui.ts → terminal-output-manager.ts →
streamtty-adapter.ts → advanced-cli-ui.ts
```

### **Status:** Already mitigated with interfaces

### **Verification:**

The circular dependency is type-only and doesn't cause runtime issues. The code uses interface contracts properly.

**No action required** - Monitor for future changes.

---

## 🛠️ Implementation Checklist

### Phase 1: Context System (Week 1)

- [ ] Create `context/context-types.ts` with all interfaces
- [ ] Refactor `workspace-context.ts` to use dependency injection
- [ ] Refactor `rag-system.ts` to use dependency injection
- [ ] Refactor `semantic-search-engine.ts` to use dependency injection
- [ ] Refactor `unified-embedding-interface.ts` to use dependency injection
- [ ] Create `context/context-bootstrap.ts` initialization module
- [ ] Update `nik-cli.ts` to use bootstrap
- [ ] Test context system initialization
- [ ] Verify no circular imports remain

### Phase 2: Agent System (Week 2)

- [ ] Create `core/agent-types.ts` with interfaces
- [ ] Refactor `agent-factory.ts` to use lazy loading
- [ ] Refactor `agent-service.ts` to use dependency injection
- [ ] Update `agent-manager.ts` initialization
- [ ] Test agent system with new pattern
- [ ] Verify no circular imports remain

### Phase 3: Cleanup & Validation (Week 3)

- [ ] Remove invalid Python imports from `nik-cli.ts`
- [ ] Consolidate duplicate imports
- [ ] Add event listener cleanup in `agent-manager.ts`
- [ ] Implement bounded collections (LRU cache)
- [ ] Add timer tracking to all setTimeout/setInterval
- [ ] Add automated circular dependency detection to CI/CD
- [ ] Run full test suite
- [ ] Performance benchmarking

---

## 🧪 Testing Strategy

### Unit Tests for Dependency Injection

```typescript
// __tests__/context-bootstrap.test.ts
describe("Context System Initialization", () => {
  it("should initialize without circular dependencies", async () => {
    // Reset all singletons
    jest.resetModules();

    // Import and initialize
    const { initializeContextSystem } = await import(
      "../context/context-bootstrap"
    );
    await initializeContextSystem();

    // Verify all services initialized
    expect(workspaceContext.isInitialized()).toBe(true);
    expect(unifiedRAGSystem.isInitialized()).toBe(true);
  });

  it("should handle initialization errors gracefully", async () => {
    // Test error handling
  });
});
```

### Integration Tests

```typescript
// __tests__/orchestration-flow.test.ts
describe("Orchestration Flow", () => {
  it("should complete full flow without deadlock", async () => {
    const nikCLI = new NikCLI();
    await nikCLI.initialize();

    // Simulate user input
    await nikCLI.handleInput("analyze project");

    // Verify no circular dependency errors
    expect(nikCLI.getStatus()).toBe("ready");
  });
});
```

---

## 📊 Success Metrics

### Before Refactoring:

- Circular Dependencies: 3 critical loops
- Memory Leak Risks: 5 identified
- Import Count (nik-cli.ts): 65
- File Size (nik-cli.ts): 20,378 lines

### After Refactoring (Target):

- Circular Dependencies: 0 ✅
- Memory Leak Risks: 0-1 ✅
- Import Count (nik-cli.ts): <40 ✅
- File Size (nik-cli.ts): <5,000 lines ✅

---

## 🔍 Monitoring & Validation

### Automated Tools to Add:

1. **madge** - Circular dependency detection

```bash
npm install --save-dev madge
madge --circular --extensions ts src/cli
```

2. **dependency-cruiser** - Advanced dependency validation

```bash
npm install --save-dev dependency-cruiser
depcruise --validate .dependency-cruiser.json src/cli
```

3. **ESLint plugin** - Prevent new circular dependencies

```json
{
  "plugins": ["import"],
  "rules": {
    "import/no-cycle": ["error", { "maxDepth": 10 }]
  }
}
```

4. **Memory leak detection** - Add to CI/CD

```bash
npm install --save-dev memwatch-next
# Add memory profiling to test suite
```

---

## 📝 Migration Guide

### For Developers:

1. **Before making changes:**
   - Run `madge --circular src/cli` to check current state
   - Review this guide for patterns to avoid

2. **When adding new modules:**
   - Import from types/interfaces, not implementations
   - Use dependency injection for cross-layer dependencies
   - Avoid direct singleton imports in constructors

3. **When refactoring:**
   - Check for circular dependencies after each change
   - Update dependency graph documentation
   - Run full test suite

4. **Code review checklist:**
   - [ ] No new circular dependencies
   - [ ] Imports consolidated (no duplicates)
   - [ ] Event listeners have cleanup
   - [ ] Timers tracked in cleanup system
   - [ ] Maps/Sets have size limits

---

## 🚀 Rollout Plan

### Week 1: Context System

- Day 1-2: Create types and interfaces
- Day 3-4: Refactor workspace-context and rag-system
- Day 5: Create bootstrap and test

### Week 2: Agent System

- Day 1-2: Refactor agent-factory
- Day 3-4: Update agent-manager and agent-service
- Day 5: Integration testing

### Week 3: Validation & Deployment

- Day 1-2: Remove invalid imports and cleanup
- Day 3: Add automated tools to CI/CD
- Day 4: Performance testing
- Day 5: Documentation and deployment

---

**Document Version:** 1.0  
**Last Updated:** ${new Date().toISOString()}  
**Author:** NikCLI Universal Agent  
**Status:** Ready for Implementation
