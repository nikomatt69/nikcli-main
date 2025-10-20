# CLI Optimization Migration Guide

Questa guida mostra come migrare il codice esistente per utilizzare i nuovi sistemi ottimizzati senza aggiungere nuove funzionalità.

## 🎯 Obiettivi delle Ottimizzazioni

1. **Ridurre la complessità** del punto di ingresso principale
2. **Migliorare la gestione degli errori** e il logging
3. **Ottimizzare l'uso della memoria** con cleanup automatico
4. **Consolidare i sistemi di cache** multipli
5. **Migliorare la type safety** senza 'any'
6. **Ridurre la duplicazione** di codice negli agenti

## 📁 Nuovi Moduli Creati

### Core Systems
- `core/error-handler.ts` - Sistema unificato di gestione errori e logging
- `core/resource-manager.ts` - Gestione automatica del cleanup delle risorse
- `core/unified-cache.ts` - Sistema di cache consolidato
- `core/async-utils.ts` - Utility per pattern async ottimizzati
- `core/base-agent.ts` - Classe base per tutti gli agenti
- `core/typed-config.ts` - Configurazione type-safe con Zod
- `core/system-initializer.ts` - Inizializzazione sistema unificata

### Barrel Exports
- `core/index.ts` - Export consolidati per il core
- `ai/index.ts` - Export consolidati per AI
- `context/index.ts` - Export consolidati per context
- `providers/index.ts` - Export consolidati per providers

## 🔄 Come Migrare

### 1. Sostituire console.log con Logging Strutturato

**Prima:**
```typescript
console.log('Starting operation...')
console.error('Error occurred:', error)
```

**Dopo:**
```typescript
import { logInfo, logError } from './core'

logInfo('Starting operation...', 'ModuleName')
logError('Error occurred', 'ModuleName', error)
```

### 2. Sostituire Map/Set con Versioni Managed

**Prima:**
```typescript
const cache = new Map<string, any>()
const activeConnections = new Set<Connection>()

// Nessun cleanup automatico
```

**Dopo:**
```typescript
import { createManagedMap, createManagedSet } from './core'

const cache = createManagedMap<string, any>()
const activeConnections = createManagedSet<Connection>()

// Cleanup automatico al shutdown
```

### 3. Consolidare le Cache Multiple

**Prima:**
```typescript
import { tokenCache } from './core/token-cache'
import { completionCache } from './core/completion-protocol-cache'
import { enhancedTokenCache } from './core/enhanced-token-cache'

// Multiple cache implementations
```

**Dopo:**
```typescript
import { unifiedTokenCache, unifiedCompletionCache, semanticCache } from './core'

// Single unified cache system
```

### 4. Aggiornare Pattern Async

**Prima:**
```typescript
async function operation() {
  try {
    const result = await someOperation()
    return result
  } catch (error) {
    console.error('Operation failed:', error)
    throw error
  }
}
```

**Dopo:**
```typescript
import { AsyncUtils, errorHandler } from './core'

async function operation() {
  return errorHandler.handleAsync(
    () => AsyncUtils.withTimeout(
      someOperation(),
      { timeoutMs: 30000 }
    ),
    'operation context',
    'fallback value'
  )
}
```

### 5. Creare Agenti usando BaseAgent

**Prima:**
```typescript
class MyAgent {
  private tasks = new Map()

  async execute(task: any) {
    // Custom implementation for each agent
    try {
      // validation
      // execution
      // error handling
      // metrics
    } catch (error) {
      // custom error handling
    }
  }
}
```

**Dopo:**
```typescript
import { BaseAgent, createAgentTask } from './core'

class MyAgent extends BaseAgent {
  protected getSupportedTaskTypes(): string[] {
    return ['myTask']
  }

  protected canHandleTask(task: AgentTask): boolean {
    return task.type === 'myTask'
  }

  protected async executeInternal(task: AgentTask): Promise<any> {
    // Solo la logica specifica dell'agente
    return this.doMyWork(task.payload)
  }

  private async doMyWork(payload: any): Promise<any> {
    // Implementation
  }
}
```

### 6. Aggiornare Configurazione

**Prima:**
```typescript
interface Config {
  model?: string
  temperature?: number
  // Nessuna validazione
}

const config: Config = {
  model: process.env.MODEL || 'default'
}
```

**Dopo:**
```typescript
import { typedConfigManager, getModelConfig } from './core'

// Carica configurazione type-safe
const config = await typedConfigManager.loadConfig()
const modelConfig = getModelConfig(config)

// Tutti i valori sono validati e hanno defaults
```

### 7. Semplificare Entry Point

**Prima (70+ imports):**
```typescript
import fs from 'node:fs/promises'
import path from 'node:path'
import boxen from 'boxen'
import chalk from 'chalk'
import cliProgress from 'cli-progress'
// ... 65+ more imports

async function main() {
  // Hundreds of lines of initialization
}
```

**Dopo:**
```typescript
import { initializeSystem, logInfo } from './core'
import { advancedAIProvider } from './ai'
import { docsContextManager, unifiedRAGSystem } from './context'

async function main() {
  const config = await initializeSystem()

  await advancedAIProvider.initialize(config.model)
  await docsContextManager.initialize()

  logInfo('System ready', 'main')
}
```

## 🚀 Benefici delle Ottimizzazioni

### Performance
- **Riduzione memoria**: Cleanup automatico di Map, Set, EventEmitter
- **Cache efficiente**: Sistema unificato invece di multiple implementazioni
- **Async ottimizzato**: Timeout, retry, circuit breaker patterns

### Maintainability
- **Meno duplicazione**: BaseAgent elimina codice ripetuto
- **Import puliti**: Barrel exports riducono complexity
- **Error handling consistente**: Sistema unificato

### Type Safety
- **Configurazione validata**: Zod schema per tutti i config
- **Eliminazione 'any'**: Generics e strict typing
- **Runtime validation**: Type safety anche a runtime

### Reliability
- **Graceful shutdown**: Cleanup automatico delle risorse
- **Health checks**: Monitoring automatico del sistema
- **Error recovery**: Gestione intelligente degli errori

## 📋 Checklist di Migrazione

### Immediate (High Impact, Low Effort)
- [ ] Sostituire `console.log` con `logInfo/logError`
- [ ] Aggiungere cleanup per Map/Set esistenti usando `createManagedMap/Set`
- [ ] Usare barrel exports per semplificare import
- [ ] Sostituire try/catch con `errorHandler.handleAsync`

### Short Term
- [ ] Migrare cache multiple a `UnifiedCache`
- [ ] Implementare `BaseAgent` per agenti esistenti
- [ ] Aggiungere timeout agli async operations
- [ ] Setup `typedConfigManager` per configurazione

### Long Term
- [ ] Refactor main entry point usando `initializeSystem`
- [ ] Implementare health checks e monitoring
- [ ] Aggiungere type safety completa
- [ ] Setup graceful shutdown

## 🔧 Script di Migrazione

```bash
#!/bin/bash
# Migration helper script

echo "🔄 Starting CLI optimization migration..."

# 1. Update imports to use barrel exports
find src/cli -name "*.ts" -exec sed -i.bak 's/from "\.\.\/core\/[^"]*"/from "..\/core"/g' {} \;

# 2. Replace console.log with structured logging
find src/cli -name "*.ts" -exec sed -i.bak 's/console\.log(/logInfo(/g' {} \;
find src/cli -name "*.ts" -exec sed -i.bak 's/console\.error(/logError(/g' {} \;

# 3. Add resource management imports where needed
grep -l "new Map\|new Set" src/cli/**/*.ts | xargs sed -i.bak '1i import { createManagedMap, createManagedSet } from "./core"'

echo "✅ Migration helpers applied. Manual review required."
```

## 📈 Metriche di Successo

### Memory Usage
- **Prima**: Multiple cache istanze, nessun cleanup
- **Dopo**: Unified cache con eviction automatica

### Code Complexity
- **Prima**: 70+ imports nel main file
- **Dopo**: ~5-10 import organizzati

### Error Handling
- **Prima**: Inconsistent, 4,499 try/catch blocks
- **Dopo**: Centralized, structured error handling

### Type Safety
- **Prima**: 'any' types in context managers
- **Dopo**: Strict typing con runtime validation

Queste ottimizzazioni mantengono tutte le funzionalità esistenti mentre migliorano significativamente performance, maintainability e reliability del codebase.