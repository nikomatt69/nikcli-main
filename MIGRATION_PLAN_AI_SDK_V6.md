# Piano di Migrazione AI SDK v3.4 → v6

## Executive Summary

**Versione attuale**: `ai@3.4.33`
**Versione target**: `ai@6.0.0-beta`
**File impattati**: 44 files
**Usages totali**: 42+ streamText/generateText, 51+ tool definitions

---

## 1. Analisi Versioni Correnti

### Package.json Attuale

```json
{
  "ai": "^3.4.33",
  "@ai-sdk/anthropic": "^1.0.0",
  "@ai-sdk/cerebras": "^1.0.29",
  "@ai-sdk/gateway": "^1.0.10",
  "@ai-sdk/google": "^1.0.0",
  "@ai-sdk/groq": "^2.0.28",
  "@ai-sdk/openai": "^1.0.66",
  "@ai-sdk/openai-compatible": "^1.0.22",
  "@ai-sdk/vercel": "^1.0.10"
}
```

### Versioni Target v6

```json
{
  "ai": "6.0.0-beta",
  "@ai-sdk/anthropic": "3.0.0-beta",
  "@ai-sdk/cerebras": "3.0.0-beta",
  "@ai-sdk/gateway": "3.0.0-beta",
  "@ai-sdk/google": "3.0.0-beta",
  "@ai-sdk/groq": "3.0.0-beta",
  "@ai-sdk/openai": "3.0.0-beta",
  "@ai-sdk/openai-compatible": "3.0.0-beta",
  "@ai-sdk/vercel": "3.0.0-beta",
  "@ai-sdk/provider": "3.0.0-beta",
  "@ai-sdk/provider-utils": "4.0.0-beta"
}
```

---

## 2. Breaking Changes da Applicare

### 2.1 Migrazione v3.4 → v4.0

| Cambiamento | Prima | Dopo | File Impattati |
|-------------|-------|------|----------------|
| `baseUrl` → `baseURL` | `baseUrl: '...'` | `baseURL: '...'` | model-provider.ts, advanced-ai-provider.ts |
| `StreamingTextResponse` rimosso | `new StreamingTextResponse(...)` | `streamText(...).toDataStreamResponse()` | Nessuno (non usato) |
| `AIStream` rimosso | `AIStream(...)` | `streamText(...).toDataStream()` | Nessuno (non usato) |
| `roundtrips` → `maxSteps` | `roundtrips: 10` | `maxSteps: 11` (roundtrips + 1) | Nessuno (già usa maxSteps) |
| `experimental_addToolResult` → `addToolResult` | `experimental_addToolResult(...)` | `addToolResult(...)` | Nessuno (non usato) |

### 2.2 Migrazione v4.x → v5.0

| Cambiamento | Prima | Dopo | File Impattati |
|-------------|-------|------|----------------|
| Reasoning properties renamed | `experimental_reasoning` | `reasoning` | modern-ai-provider.ts, advanced-ai-provider.ts, reasoning-detector.ts |
| `experimental_continueSteps` rimosso | `experimental_continueSteps: true` | Usare `stopWhen` parameter | Verificare se usato |
| Image model settings → providerOptions | `imageModel: {...}` | `providerOptions: { image: {...} }` | image-generator.ts |
| Specifications V2 | Old spec types | New V2 types | Tutti i provider |

### 2.3 Migrazione v5.x → v6.0

| Cambiamento | Prima | Dopo | File Impattati |
|-------------|-------|------|----------------|
| `experimental_createProviderRegistry` | `experimental_createProviderRegistry` | `createProviderRegistry` | provider-registry.ts |
| `experimental_customProvider` | `experimental_customProvider` | `customProvider` | provider-registry.ts |
| `experimental_wrapLanguageModel` | `experimental_wrapLanguageModel` | `wrapLanguageModel` | reasoning-detector.ts, modern-ai-provider.ts |
| `experimental_repairToolCall` | `experimental_repairToolCall` | `repairToolCall` | modern-ai-provider.ts, advanced-ai-provider.ts |
| `experimental_toolCallStreaming` | `experimental_toolCallStreaming` | `toolCallStreaming` | modern-ai-provider.ts |
| `experimental_providerMetadata` | `experimental_providerMetadata` | `providerOptions` | 6+ files |
| Tool confirmation API | - | New `confirmToolExecution` | Da implementare se necessario |

---

## 3. File da Modificare (44 files)

### 3.1 Provider Core (Priorità ALTA)

| File | Imports | Changes Required |
|------|---------|------------------|
| `src/cli/ai/provider-registry.ts` | experimental_createProviderRegistry, experimental_customProvider | Rimuovere prefix experimental_ |
| `src/cli/ai/model-provider.ts` | generateObject, generateText, streamText | experimental_providerMetadata → providerOptions |
| `src/cli/ai/modern-ai-provider.ts` | CoreMessage, CoreTool, experimental_wrapLanguageModel, generateText, streamText, tool | Rimuovere tutti experimental_ |
| `src/cli/ai/advanced-ai-provider.ts` | CoreMessage, CoreTool, generateText, streamText, ToolCallPart, tool | experimental_repairToolCall → repairToolCall |
| `src/cli/ai/reasoning-detector.ts` | experimental_wrapLanguageModel, LanguageModelV1 | wrapLanguageModel |

### 3.2 Workflow & Patterns (Priorità MEDIA)

| File | Changes |
|------|---------|
| `src/cli/ai/workflow-patterns.ts` | generateObject, generateText - verificare providerOptions |
| `src/cli/core/advanced-tools.ts` | cosineSimilarity, embed, generateObject, tool |
| `src/cli/context/ai-sdk-embedding-provider.ts` | embed - verificare V2 spec |
| `src/cli/context/rag-system.ts` | embed |

### 3.3 Tools (Priorità MEDIA)

| File | Tool Count |
|------|------------|
| `src/cli/tools/smart-docs-tool.ts` | 3 tools |
| `src/cli/tools/memory-search-tool.ts` | 2 tools |
| `src/cli/tools/docs-request-tool.ts` | 2 tools |
| `src/cli/tools/snapshot-tool.ts` | 7 tools |
| `src/cli/core/documentation-tool.ts` | 3 tools |
| `src/cli/core/ide-context-enricher.ts` | 1 tool |
| `src/cli/core/web-search-provider.ts` | 1 tool |
| `src/cli/context/workspace-context.ts` | 1 tool |

### 3.4 Providers (Priorità MEDIA)

| File | Providers Used |
|------|----------------|
| `src/cli/providers/vision/vision-provider.ts` | OpenAI, Anthropic, Google |
| `src/cli/providers/browserbase/browserbase-provider.ts` | OpenAI, Anthropic, Google |
| `src/cli/providers/cad-gcode/cad-gcode.provider.ts` | OpenAI, Anthropic, Google |
| `src/cli/providers/image/image-generator.ts` | OpenAI, Google |

### 3.5 Types Only (Priorità BASSA)

| File | Types Used |
|------|------------|
| `src/cli/onchain/coinbase-agentkit-provider.ts` | CoreTool |
| `src/cli/onchain/goat-provider.ts` | CoreTool |
| `src/cli/chat/autonomous-claude-interface.ts` | CoreMessage |
| `src/cli/core/context-manager.ts` | CoreMessage |
| `src/cli/core/context-enhancer.ts` | CoreMessage |
| `src/cli/core/context-token-manager.ts` | CoreMessage |
| `src/cli/core/performance-optimizer.ts` | CoreMessage |
| `src/cli/core/progressive-token-manager.ts` | CoreMessage |
| `src/cli/core/tool-router.ts` | CoreMessage |
| `src/cli/core/enhanced-tool-router.ts` | CoreMessage |
| `src/cli/core/universal-tokenizer-service.ts` | CoreMessage |
| `src/cli/core/validated-ai-provider.ts` | CoreMessage |
| `src/cli/core/feedback-aware-tools.ts` | CoreTool |
| `src/cli/automation/agents/modern-agent-system.ts` | CoreMessage |
| `src/cli/planning/autonomous-planner.ts` | CoreMessage |
| `src/cli/context/context-rag-interceptor.ts` | CoreMessage |
| `src/cli/stores/ai-store.ts` | CoreMessage |

---

## 4. Dettaglio Cambiamenti per File

### 4.1 `src/cli/ai/provider-registry.ts`

```typescript
// PRIMA (v3.4)
import {
  experimental_createProviderRegistry as createProviderRegistry,
  experimental_customProvider as customProvider,
} from 'ai'

// DOPO (v6)
import {
  createProviderRegistry,
  customProvider,
} from 'ai'
```

### 4.2 `src/cli/ai/modern-ai-provider.ts`

```typescript
// PRIMA (v3.4)
import {
  type CoreMessage,
  type CoreTool,
  experimental_wrapLanguageModel,
  generateText,
  streamText,
  tool
} from 'ai'

// Line 1409
experimental_repairToolCall: this.createToolCallRepairHandler(model, tools)

// Line 1453
streamOptions.experimental_toolCallStreaming = false

// Line 1466-1516
experimental_providerMetadata: {
  openrouter: { ... }
}

// DOPO (v6)
import {
  type CoreMessage,
  type CoreTool,
  wrapLanguageModel,
  generateText,
  streamText,
  tool
} from 'ai'

// Line 1409
repairToolCall: this.createToolCallRepairHandler(model, tools)

// Line 1453
streamOptions.toolCallStreaming = false

// Line 1466-1516
providerOptions: {
  openrouter: { ... }
}
```

### 4.3 `src/cli/ai/advanced-ai-provider.ts`

```typescript
// PRIMA (v3.4)
experimental_repairToolCall: this.createToolCallRepairHandler(model, tools)
experimental_providerMetadata: { openrouter: { ... } }

// DOPO (v6)
repairToolCall: this.createToolCallRepairHandler(model, tools)
providerOptions: { openrouter: { ... } }
```

### 4.4 `src/cli/ai/reasoning-detector.ts`

```typescript
// PRIMA (v3.4)
import { experimental_wrapLanguageModel, type LanguageModelV1 } from 'ai'

return experimental_wrapLanguageModel({
  model: languageModel,
  middleware: { ... }
})

// DOPO (v6)
import { wrapLanguageModel, type LanguageModelV1 } from 'ai'

return wrapLanguageModel({
  model: languageModel,
  middleware: { ... }
})
```

### 4.5 `src/cli/ai/model-provider.ts`

```typescript
// PRIMA (v3.4)
experimental_providerMetadata: {
  openrouter: {
    cache: { ... },
    reasoning: { ... }
  }
}

// DOPO (v6)
providerOptions: {
  openrouter: {
    cache: { ... },
    reasoning: { ... }
  }
}
```

### 4.6 `src/cli/background-agents/services/ai-chat-service.ts`

```typescript
// PRIMA (v3.4)
experimental_providerMetadata: {
  openrouter: {
    reasoning: { exclude: true }
  }
}

// DOPO (v6)
providerOptions: {
  openrouter: {
    reasoning: { exclude: true }
  }
}
```

---

## 5. Ordine di Esecuzione Migrazione

### Fase 1: Package Updates (5 minuti)
1. Backup package.json
2. Aggiornare tutte le dipendenze AI SDK a v6 beta
3. Eseguire `bun install`
4. Verificare che non ci siano conflitti

### Fase 2: Core Providers (30 minuti)
1. `provider-registry.ts` - Rimuovere experimental_ prefix (2 occorrenze)
2. `reasoning-detector.ts` - wrapLanguageModel (2 occorrenze)
3. `model-provider.ts` - providerOptions (3+ occorrenze)
4. `modern-ai-provider.ts` - Tutti i cambiamenti (10+ occorrenze)
5. `advanced-ai-provider.ts` - Tutti i cambiamenti (8+ occorrenze)

### Fase 3: Workflow & Tools (20 minuti)
1. `workflow-patterns.ts` - Verificare compatibilità
2. `advanced-tools.ts` - Verificare embed/generateObject
3. `ai-sdk-embedding-provider.ts` - Verificare embed
4. Tutti i file tools - Verificare tool() function

### Fase 4: Providers Specializzati (15 minuti)
1. `vision-provider.ts`
2. `browserbase-provider.ts`
3. `cad-gcode.provider.ts`
4. `image-generator.ts`

### Fase 5: Background Services (10 minuti)
1. `ai-chat-service.ts`
2. Altri file con experimental_providerMetadata

### Fase 6: Verification (20 minuti)
1. Eseguire `bun run typecheck`
2. Eseguire `bun run build`
3. Eseguire test manuali
4. Verificare streaming funziona

---

## 6. Regex per Find & Replace Globali

### 6.1 experimental_providerMetadata → providerOptions
```regex
Pattern: experimental_providerMetadata
Replace: providerOptions
```

### 6.2 experimental_repairToolCall → repairToolCall
```regex
Pattern: experimental_repairToolCall
Replace: repairToolCall
```

### 6.3 experimental_toolCallStreaming → toolCallStreaming
```regex
Pattern: experimental_toolCallStreaming
Replace: toolCallStreaming
```

### 6.4 experimental_wrapLanguageModel → wrapLanguageModel
```regex
Pattern: experimental_wrapLanguageModel
Replace: wrapLanguageModel
```

### 6.5 Import cleanup
```regex
Pattern: experimental_createProviderRegistry as createProviderRegistry
Replace: createProviderRegistry

Pattern: experimental_customProvider as customProvider
Replace: customProvider
```

---

## 7. Verifiche Post-Migrazione

### 7.1 Type Check
```bash
bun run typecheck
```

### 7.2 Build
```bash
bun run build
```

### 7.3 Test Funzionali
- [ ] Test streamText con OpenRouter
- [ ] Test generateText con Anthropic
- [ ] Test generateObject con schema Zod
- [ ] Test tool calling con repair handler
- [ ] Test reasoning detection
- [ ] Test embedding generation
- [ ] Test provider fallback

---

## 8. Rollback Plan

Se la migrazione fallisce:
1. Ripristinare package.json dal backup
2. `git checkout -- .` per ripristinare tutti i file
3. `bun install` per ripristinare dipendenze
4. Verificare che tutto funzioni

---

## 9. Note Importanti

1. **Pin Versions**: In v6 beta, pinnare le versioni esatte (evitare ^ o ~)
2. **Testing**: Testare ogni provider singolarmente
3. **Reasoning**: La nuova API di reasoning è stabile in v6
4. **Tool Confirmation**: Nuova feature per conferma tool (opzionale)
5. **Agent Class**: Nuova classe Agent disponibile (opzionale, stessa funzionalità di generateText loop)

---

## 10. Risorse

- [Migration Guide 3.4 → 4.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-4-0)
- [Migration Guide 4.x → 5.0](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0)
- [Migration Guide 5.x → 6.0](https://v6.ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- [AI SDK 6 Beta Announcement](https://ai-sdk.dev/docs/introduction/announcing-ai-sdk-6-beta)
