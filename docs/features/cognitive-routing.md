# Cognitive Routing System

## Overview

Il sistema di **Cognitive Routing** analizza intelligentemente le richieste dell'utente e determina il percorso di esecuzione ottimale, selezionando i tool più appropriati con intelligenza multi-dimensionale.

## Caratteristiche Principali

### 🧠 Analisi Cognitiva Completa

Il sistema esegue un'analisi multi-livello di ogni richiesta:

1. **Task Cognition** - Comprensione profonda del task
2. **Intent Analysis** - Analisi multi-dimensionale dell'intento
3. **Tool Routing** - Selezione intelligente dei tool
4. **Execution Strategy** - Strategia di esecuzione ottimale
5. **Risk Assessment** - Valutazione rischi e fallback

### 🎯 Routing Multi-Dimensionale

Analizza l'intento secondo 4 dimensioni:

- **Technical** - Focus su codice e implementazione tecnica
- **Creative** - Enfasi su soluzioni innovative e UX
- **Analytical** - Priorità ad analisi e decisioni data-driven
- **Operational** - Concentrazione su affidabilità e deployment

### 🔧 Tool Selection Intelligente

Combina 3 sistemi di selezione tool:

1. **Tool Router** - Routing basato su keyword e priorità
2. **Dynamic Selector** - Selezione dinamica con diversity bonus
3. **Cognitive Analyzer** - Analisi cognitiva completa

## Architettura

```
User Message
    ↓
CognitiveRouteAnalyzer
    ↓
┌─────────────────────────────────────────┐
│  1. Task Cognition Analysis             │
│     - Extract intent & entities          │
│     - Calculate complexity               │
│     - Assess risk                        │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  2. Multi-Dimensional Intent Analysis   │
│     - Technical dimension                │
│     - Creative dimension                 │
│     - Analytical dimension               │
│     - Operational dimension              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  3. Cognitive Tool Routing               │
│     - Tool Router recommendations        │
│     - Dynamic selector diversity         │
│     - Merge & enhance                    │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  4. Execution Strategy                   │
│     - Sequential / Parallel / Hybrid     │
│     - Resource estimation                │
│     - Duration calculation               │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  5. Route Plan Generation                │
│     - Detailed execution steps           │
│     - Dependencies mapping               │
│     - Critical path identification       │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  6. Risk Assessment & Fallbacks         │
│     - Risk evaluation                    │
│     - Mitigation strategies              │
│     - Alternative routes                 │
└─────────────────────────────────────────┘
    ↓
Tool Recommendations + Execution Plan
```

## Utilizzo

### Abilitare/Disabilitare Cognitive Routing

```typescript
import { toolRouter } from './core/tool-router'

// Abilita cognitive mode (default)
toolRouter.setCognitiveMode(true)

// Disabilita per routing standard
toolRouter.setCognitiveMode(false)
```

### Debug Mode

Abilita log dettagliati per vedere il processo di analisi:

```bash
export NIKCLI_DEBUG_COGNITIVE=1
```

Output:
```
╔══════════════════════════════════════════════════════════════╗
║           🧠 COGNITIVE ROUTE ANALYSIS RESULT                ║
╚══════════════════════════════════════════════════════════════╝

📋 Task Cognition:
   Intent: create
   Complexity: 7/10
   Risk: medium
   Entities: 3

🎯 Intent Analysis:
   Dominant: technical
   Dimensions: technical(85%), creative(40%), analytical(30%)

🔧 Tool Recommendations:
   1. write-file-tool (92%) - Code generation capability
   2. edit-tool (85%) - Modification support
   3. multi-edit-tool (75%) - Batch operations

📊 Execution Strategy:
   Type: hybrid
   Phases: 2
   Duration: 12.5s

⚠️  Risk Assessment:
   Level: medium
   Risks: 2

✅ Overall Confidence: 88%
```

### Ottenere Analisi Cognitiva

```typescript
// Dopo un routing
const analysis = toolRouter.getLatestCognitiveAnalysis()

if (analysis) {
  console.log(`Intent: ${analysis.taskCognition.intent.primary}`)
  console.log(`Complexity: ${analysis.taskCognition.estimatedComplexity}/10`)
  console.log(`Confidence: ${(analysis.confidence * 100).toFixed(0)}%`)
  console.log(`Strategy: ${analysis.executionStrategy.type}`)
  console.log(`Tools: ${analysis.toolRecommendations.map(t => t.tool).join(', ')}`)
}
```

### Statistiche Routing

```typescript
const stats = toolRouter.getCognitiveStatistics()

console.log(`Total Analyses: ${stats.totalAnalyses}`)
console.log(`Average Confidence: ${(stats.averageConfidence * 100).toFixed(0)}%`)
console.log(`Average Complexity: ${stats.averageComplexity.toFixed(1)}/10`)

// Intent distribution
console.log('Intent Distribution:')
Object.entries(stats.intentDistribution).forEach(([intent, count]) => {
  console.log(`  ${intent}: ${count}`)
})

// Tool usage
console.log('Most Used Tools:')
Object.entries(stats.toolUsage)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .forEach(([tool, count]) => {
    console.log(`  ${tool}: ${count}x`)
  })
```

## Task Cognition

### Intent Primary

Possibili intent primari:

- `create` - Creazione di nuovi componenti/file
- `read` - Lettura e visualizzazione
- `update` - Modifiche a codice esistente
- `delete` - Rimozione elementi
- `analyze` - Analisi e review
- `optimize` - Ottimizzazione performance
- `deploy` - Deployment e rilascio
- `test` - Testing e validazione
- `debug` - Debugging e troubleshooting
- `refactor` - Refactoring codice

### Complexity Levels

- `low` (1-3) - Task semplici e diretti
- `medium` (4-6) - Task moderati con alcune dipendenze
- `high` (7-8) - Task complessi con molte dipendenze
- `extreme` (9-10) - Task molto complessi, multi-fase

### Risk Levels

- `low` - Operazioni sicure senza rischi
- `medium` - Operazioni che richiedono attenzione
- `high` - Operazioni potenzialmente pericolose

## Intent Analysis

### Dimensioni

#### Technical Dimension
Focus su aspetti tecnici e implementazione:
- Qualità del codice
- Best practices
- Architettura tecnica

**Indicators:**
- `code`, `function`, `class`, `api`, `database`, `algorithm`

#### Creative Dimension
Enfasi su innovazione e user experience:
- Soluzioni innovative
- Design UX
- Approcci creativi

**Indicators:**
- `design`, `create`, `generate`, `innovative`, `new`

#### Analytical Dimension
Priorità ad analisi e decisioni data-driven:
- Analisi approfondita
- Metriche e dati
- Decision making informato

**Indicators:**
- `analyze`, `examine`, `investigate`, `review`, `assess`

#### Operational Dimension
Concentrazione su reliability e deployment:
- Affidabilità
- Deployment
- Manutenzione
- Monitoring

**Indicators:**
- `deploy`, `run`, `execute`, `operate`, `manage`

## Execution Strategies

### Sequential Strategy
Esecuzione uno dopo l'altro, per task con dipendenze forti:

```
Step 1 → Step 2 → Step 3 → Step 4
```

**Quando usare:**
- Task con dipendenze sequenziali
- Modifiche che devono avvenire in ordine
- Operazioni critiche che richiedono validazione step-by-step

### Parallel Strategy
Esecuzione simultanea, per task indipendenti:

```
┌─ Step 1 ─┐
├─ Step 2 ─┤ → Result
├─ Step 3 ─┤
└─ Step 4 ─┘
```

**Quando usare:**
- Task completamente indipendenti
- Operazioni di lettura multiple
- Analisi parallele

### Hybrid Strategy
Gruppi paralleli in sequenza:

```
Group 1: ┌─ Step 1 ─┐     Group 2: ┌─ Step 3 ─┐
         └─ Step 2 ─┘  →           └─ Step 4 ─┘
```

**Quando usare:**
- Task parzialmente indipendenti
- Operazioni raggruppabili
- Best practice per task complessi

### Adaptive Strategy
Decisione dinamica durante l'esecuzione:

```
Start → Analyze → Choose Strategy → Execute
```

**Quando usare:**
- Task con alta incertezza
- Complessità estrema (9-10)
- Situazioni che richiedono flessibilità

## Route Plan

### Route Steps

Ogni step contiene:

```typescript
{
  id: "step-1",
  type: "tool-execution" | "parallel-execution" | "adaptive-execution",
  tool: "write-file-tool",
  confidence: 0.92,
  dependencies: ["step-0"],
  estimatedDuration: 2000,
  fallback: "edit-tool"
}
```

### Critical Path

Sequenza di step che determina il tempo totale di esecuzione:

```typescript
routePlan.criticalPath
// ["step-1", "parallel-group-2", "step-5"]
```

## Risk Assessment

### Risk Types

- **complexity** - Rischio da alta complessità
- **dependencies** - Rischio da molte dipendenze
- **tool-confidence** - Tool con bassa confidence
- **duration** - Esecuzione potenzialmente lunga

### Mitigation Strategies

```typescript
riskAssessment.mitigationStrategies
// [
//   "Aumentare validazione e monitoraggio",
//   "Implementare fallback robusti",
//   "Preparare tool alternativi"
// ]
```

### Approval Requirements

Se `requiresApproval: true`, il sistema richiede conferma utente prima dell'esecuzione.

## Fallback Routes

### Types

1. **alternative-tools** - Tool alternativi
2. **simplified-strategy** - Strategia semplificata
3. **manual-intervention** - Intervento manuale

### Usage

```typescript
if (primaryExecutionFails) {
  for (const fallback of fallbackRoutes) {
    try {
      await executeFallbackRoute(fallback)
      break
    } catch (error) {
      continue
    }
  }
}
```

## Best Practices

### 1. Messaggi Chiari

✅ **Good:**
```
"Create a React component for user authentication with TypeScript"
```

❌ **Bad:**
```
"make auth thing"
```

### 2. Contesto Adeguato

Fornisci contesto quando necessario:

```typescript
const result = await cognitiveAnalyzer.analyzeCognitiveRoute(
  "Update the API endpoints",
  {
    conversationHistory: previousMessages,
    taskType: 'backend',
    previousCognition: lastCognition
  }
)
```

### 3. Monitora Confidence

Se confidence < 60%, considera di:
- Fornire più dettagli
- Scomporre il task
- Chiedere chiarimenti

### 4. Review Risk Assessment

Per task high-risk:
- Verifica mitigation strategies
- Controlla fallback routes
- Considera dry-run

## Performance

### Metriche Tipiche

- **Analysis Time**: 50-200ms
- **Routing Time**: 100-500ms
- **Total Overhead**: 150-700ms

### Ottimizzazioni

Il sistema include:
- **Caching** - Risultati recenti
- **Parallel Analysis** - Analisi parallele quando possibile
- **Smart Fallback** - Fallback rapidi senza re-analisi completa

## Esempi Pratici

### Esempio 1: Code Generation

**Input:**
```
"Create a TypeScript API endpoint for user registration with validation"
```

**Output:**
```typescript
{
  taskCognition: {
    intent: { primary: "create", complexity: "medium" },
    entities: [{ type: "api", name: "registration endpoint" }],
    estimatedComplexity: 6,
    riskLevel: "medium"
  },
  intentAnalysis: {
    dominantDimension: "technical",
    confidence: 0.85
  },
  toolRecommendations: [
    { tool: "write-file-tool", confidence: 0.90 },
    { tool: "edit-tool", confidence: 0.75 }
  ],
  executionStrategy: {
    type: "sequential",
    estimatedDuration: 8000
  }
}
```

### Esempio 2: Code Analysis

**Input:**
```
"Analyze the performance of the search algorithm and suggest optimizations"
```

**Output:**
```typescript
{
  taskCognition: {
    intent: { primary: "analyze", complexity: "high" },
    estimatedComplexity: 7,
    riskLevel: "low"
  },
  intentAnalysis: {
    dominantDimension: "analytical",
    confidence: 0.92
  },
  toolRecommendations: [
    { tool: "grep-tool", confidence: 0.88 },
    { tool: "multi-read-tool", confidence: 0.85 },
    { tool: "vision-analysis-tool", confidence: 0.70 }
  ],
  executionStrategy: {
    type: "parallel",
    estimatedDuration: 5000
  }
}
```

### Esempio 3: Complex Refactoring

**Input:**
```
"Refactor the entire authentication system to use JWT tokens instead of sessions"
```

**Output:**
```typescript
{
  taskCognition: {
    intent: { primary: "refactor", complexity: "extreme" },
    entities: [
      { type: "component", name: "authentication system" },
      { type: "api", name: "JWT" }
    ],
    estimatedComplexity: 9,
    riskLevel: "high"
  },
  intentAnalysis: {
    dominantDimension: "technical",
    confidence: 0.88
  },
  toolRecommendations: [
    { tool: "multi-read-tool", confidence: 0.90 },
    { tool: "multi-edit-tool", confidence: 0.85 },
    { tool: "grep-tool", confidence: 0.82 }
  ],
  executionStrategy: {
    type: "adaptive",
    phases: 4,
    estimatedDuration: 45000
  },
  riskAssessment: {
    overallLevel: "high",
    requiresApproval: true
  }
}
```

## Troubleshooting

### Low Confidence

**Problema:** Confidence < 50%

**Soluzioni:**
1. Fornisci più dettagli nel messaggio
2. Specifica il contesto tecnologico
3. Usa termini più specifici
4. Scomponi in task più piccoli

### Wrong Tool Selection

**Problema:** Tool selezionati non appropriati

**Soluzioni:**
1. Verifica keyword usage nel messaggio
2. Controlla tool registry per tool disponibili
3. Usa task type hints nel context
4. Considera disabilitare cognitive mode temporaneamente

### High Execution Time

**Problema:** Strategia troppo lenta

**Soluzioni:**
1. Il sistema sceglie automaticamente parallel/hybrid quando possibile
2. Scomponi task complessi in subtask
3. Verifica che tools non siano ridondanti

## API Reference

### CognitiveRouteAnalyzer

```typescript
class CognitiveRouteAnalyzer {
  // Analizza route cognitivamente
  async analyzeCognitiveRoute(
    userMessage: string,
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>
      taskType?: string
      previousCognition?: TaskCognition
      orchestrationPlan?: OrchestrationPlan
    }
  ): Promise<CognitiveAnalysisResult>

  // Ottieni statistiche
  getRoutingStatistics(): RoutingStatistics
}
```

### ToolRouter

```typescript
class ToolRouter {
  // Routing con cognition
  async routeWithCognition(
    context: RoutingContext
  ): Promise<AdvancedToolRecommendation[]>

  // Enable/disable cognitive mode
  setCognitiveMode(enabled: boolean): void

  // Get latest analysis
  getLatestCognitiveAnalysis(userMessage?: string): CognitiveAnalysisResult | undefined

  // Get statistics
  getCognitiveStatistics(): RoutingStatistics
}
```

## Roadmap

- [ ] Machine Learning per pattern recognition
- [ ] User feedback loop per migliorare accuracy
- [ ] Context persistence tra sessioni
- [ ] Multi-language support per analisi
- [ ] Integration con external knowledge bases
- [ ] Real-time strategy adjustment
- [ ] A/B testing di routing strategies

## Conclusioni

Il sistema di Cognitive Routing fornisce:

✅ **Analisi intelligente** multi-dimensionale
✅ **Tool selection** ottimizzata e dinamica
✅ **Execution strategies** adattive
✅ **Risk assessment** completo
✅ **Fallback routes** automatici
✅ **Performance** ottimizzate

Migliora significativamente la qualità e l'efficacia dell'esecuzione dei task, garantendo che l'AI utilizzi sempre i tool più appropriati con la strategia migliore.
