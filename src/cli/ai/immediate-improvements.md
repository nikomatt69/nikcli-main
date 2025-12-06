# 🎯 Miglioramenti Immediati - src/cli/ai/

## 🚀 Quick Wins (1-2 ore di implementazione)

### 1. **Token Counter Ottimizzato** ⭐ PRIORITÀ ALTA

**File**: `src/cli/ai/adaptive-model-router.ts` - linee ~350-380

```typescript
// Aggiungere caching per token counting
private tokenCountCache = new Map<string, { tokens: number; method: string; timestamp: number }>()
private readonly TOKEN_CACHE_TTL = 3600000 // 1 ora

private async getCachedTokenCount(messages: Array<{ role: string; content: string }>, provider: string, model: string) {
  const cacheKey = `${provider}:${model}:${JSON.stringify(messages)}`
  const cached = this.tokenCountCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < this.TOKEN_CACHE_TTL) {
    return { tokens: cached.tokens, method: 'cache' as const }
  }

  // Calculate fresh
  const result = await estimateTokensPrecise(messages, provider, model)

  // Cache result
  this.tokenCountCache.set(cacheKey, {
    ...result,
    timestamp: Date.now()
  })

  // Cache size management (max 1000 entries)
  if (this.tokenCountCache.size > 1000) {
    const firstKey = this.tokenCountCache.keys().next().value
    this.tokenCountCache.delete(firstKey)
  }

  return result
}
```

### 2. **Model Registry Cache** ⭐ PRIORITÀ ALTA

**File**: `src/cli/ai/openrouter-model-registry.ts` - aggiungere persistent cache

```typescript
// Aggiungere cache persistente per model registry
private cache: {
  models: Map<string, OpenRouterModel>
  pricing: Map<string, ModelPricing>
  lastFetch: number
} = {
  models: new Map(),
  pricing: new Map(),
  lastFetch: 0
}

private readonly CACHE_TTL = 900000 // 15 minuti
private readonly CACHE_FILE = '.nikcli/openrouter-cache.json'

async getModelWithCache(modelId: string): Promise<OpenRouterModel | null> {
  // Check in-memory cache first
  const cached = this.cache.models.get(modelId)
  if (cached) return cached

  // Check if cache is fresh
  if (Date.now() - this.cache.lastFetch < this.CACHE_TTL) {
    // Try to load from disk cache
    await this.loadFromDisk()
    return this.cache.models.get(modelId) || null
  }

  // Cache expired or miss - fetch fresh
  const models = await this.fetchAllModels()
  this.cache.models.clear()
  this.cache.pricing.clear()

  models.forEach(model => {
    this.cache.models.set(model.id, model)
    if (model.pricing) {
      this.cache.pricing.set(model.id, model.pricing)
    }
  })

  this.cache.lastFetch = Date.now()
  await this.saveToDisk()

  return this.cache.models.get(modelId) || null
}
```

### 3. **Config Lookups Ottimizzati** ⭐ PRIORITÀ MEDIA

**File**: `src/cli/ai/modern-ai-provider.ts` - linee ~100-150

```typescript
// Aggiungere cache per config lookups
private configCache = new Map<string, any>()
private readonly CONFIG_CACHE_TTL = 300000 // 5 minuti

private getCachedConfig(key: string): any {
  const cached = this.configCache.get(key)
  if (cached && Date.now() - cached.timestamp < this.CONFIG_CACHE_TTL) {
    return cached.value
  }

  const value = simpleConfigManager.get(key)
  this.configCache.set(key, {
    value,
    timestamp: Date.now()
  })

  return value
}
```

## 🔧 Quick Fixes (30 min - 1 ora)

### 4. **Error Handling Migliorato**

**File**: `src/cli/ai/model-provider.ts` - linee ~200-250

```typescript
// Migliorare retry logic con backoff esponenziale
private calculateRetryDelay(attempt: number): number {
  const baseDelay = 1000 // 1 secondo
  const maxDelay = 30000 // 30 secondi
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)

  // Add jitter per prevenire thundering herd
  const jitter = exponentialDelay * 0.1 * Math.random()
  return Math.round(exponentialDelay + jitter)
}
```

### 5. **Memory Management**

**File**: `src/cli/ai/adaptive-model-router.ts` - aggiungere cleanup

```typescript
// Aggiungere cleanup periodico per prevenire memory leaks
constructor() {
  super()
  // Cleanup cache ogni 10 minuti
  setInterval(() => {
    this.cleanupExpiredCache()
  }, 600000)
}

private cleanupExpiredCache(): void {
  const now = Date.now()
  for (const [key, entry] of this.tokenCountCache.entries()) {
    if (now - entry.timestamp > this.TOKEN_CACHE_TTL) {
      this.tokenCountCache.delete(key)
    }
  }
}
```

### 6. **Parallel Tool Execution** ⭐ PRIORITÀ ALTA

**File**: `src/cli/ai/modern-ai-provider.ts` - linee ~800-900

```typescript
// Ottimizzare tool selection con parallel processing
private async selectActiveToolsParallel(
  message: string,
  allTools: Record<string, CoreTool>,
  maxTools = 5
): Promise<Record<string, CoreTool>> {
  // Split tool analysis in parallel
  const toolAnalysis = Object.entries(allTools).map(async ([name, tool]) => {
    const relevance = await this.calculateToolRelevance(message, name, tool)
    return { name, tool, relevance }
  })

  const results = await Promise.all(toolAnalysis)

  // Sort by relevance e take top results
  return results
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxTools)
    .reduce((acc, { name, tool }) => {
      acc[name] = tool
      return acc
    }, {} as Record<string, CoreTool>)
}
```

## 📊 Metriche di Miglioramento Attese

| Miglioramento           | Performance Gain  | Implementation Time |
| ----------------------- | ----------------- | ------------------- |
| Token Counter Cache     | 70-90%            | 1 ora               |
| Model Registry Cache    | 80% API reduction | 2 ore               |
| Config Caching          | 60-80%            | 1 ora               |
| Error Handling          | 50% less failures | 30 min              |
| Memory Management       | Prevent leaks     | 30 min              |
| Parallel Tool Selection | 40% faster        | 1 ora               |

**Totale**: 6-7 ore per miglioramenti significativi (200-500ms faster responses)

## 🎯 Priorità Implementazione

### Settimana 1: Performance Critical

1. ✅ Token Counter Cache (1 ora)
2. ✅ Model Registry Cache (2 ore)
3. ✅ Config Caching (1 ora)

### Settimana 2: Reliability & UX

4. ✅ Error Handling Enhancement (30 min)
5. ✅ Memory Management (30 min)
6. ✅ Parallel Tool Selection (1 ora)

### Settimana 3: Testing & Validation

7. ✅ Unit tests per i nuovi componenti
8. ✅ Integration tests performance
9. ✅ Load testing con cache metrics

## 🔍 Monitoring & Metrics

```typescript
// Aggiungere metrics per tracking miglioramenti
interface AIMetrics {
  tokenCountCacheHitRate: number;
  modelRegistryCacheHitRate: number;
  configCacheHitRate: number;
  averageResponseTime: number;
  errorRate: number;
  memoryUsage: number;
}

class AIMetricsCollector {
  private metrics: AIMetrics = {
    tokenCountCacheHitRate: 0,
    modelRegistryCacheHitRate: 0,
    configCacheHitRate: 0,
    averageResponseTime: 0,
    errorRate: 0,
    memoryUsage: 0,
  };

  recordCacheHit(cacheType: "token" | "model" | "config"): void {
    this.metrics[`${cacheType}CacheHitRate`]++;
  }

  getMetricsReport(): string {
    return `AI Performance Report:
- Token Cache Hit Rate: ${this.metrics.tokenCountCacheHitRate}%
- Model Registry Hit Rate: ${this.metrics.modelRegistryCacheHitRate}%
- Average Response Time: ${this.metrics.averageResponseTime}ms
- Error Rate: ${this.metrics.errorRate}%`;
  }
}
```

Questi miglioramenti possono essere implementati progressivamente senza interrompere la funzionalità esistente, fornendo risultati misurabili e migliorando significativamente l'esperienza utente.
