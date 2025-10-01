# 🤖 Guida al Benchmark dei Modelli AI per NikCLI

## Panoramica

Questo benchmark usa **AI SDK + OpenRouter** per testare DAVVERO diversi modelli AI su task di programmazione reali. Trova quello che funziona meglio con NikCLI eseguendo task di produzione e misurando:

- ⚡ **Velocità** - Tempo di risposta in millisecondi
- 💰 **Costo** - Costo totale basato sull'utilizzo dei token
- ⭐ **Qualità** - Punteggio della qualità dell'output (0-100)
- ✅ **Tasso di successo** - Percentuale di completamenti riusciti

## 📋 Setup Rapido

### 1. Installa le dipendenze

```bash
pnpm install
```

### 2. Configura OpenRouter

Ottieni la tua API key da OpenRouter che ti dà accesso a TUTTI i modelli:

```bash
# Una sola chiave per accedere a tutti i modelli!
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

**Ottieni la tua chiave su:** https://openrouter.ai/keys

**Vantaggio:** Con una sola chiave API puoi testare modelli di Anthropic, OpenAI, Google, Meta, Mistral, Deepseek e altri!

### 3. Esegui il benchmark

```bash
pnpm run bench:ai
```

## 📊 Task di Test REALI

Il benchmark esegue 6 task di programmazione reali per ogni modello:

### T001: TypeScript Type Safety (Media Complessità)

Genera una funzione TypeScript `safeGet` completamente type-safe con generics per accedere a proprietà nested in modo sicuro. Deve gestire array, null, undefined.

**Valuta:** Type safety, generics, error handling, JSDoc

### T002: Bug Detection & Fix (Alta Complessità)

Identifica e corregge TUTTI i bug in codice async con problemi di null checking, array validation, optional chaining.

**Valuta:** Numero di bug trovati, qualità delle fix, type safety

### T003: Performance Optimization (Alta Complessità)

Ottimizza codice con complessità O(n²) a O(n) usando strutture dati efficienti (Set, Map). Gestisce edge cases.

**Valuta:** Complessità temporale, uso data structures, null safety

### T004: React Performance Debug (Alta Complessità)

Identifica e corregge problemi di performance in componente React: memoization, useCallback, useMemo, keys.

**Valuta:** useMemo, useCallback, React.memo, key props

### T005: Complex Algorithm (Alta Complessità)

Implementa algoritmo Longest Common Subsequence con dynamic programming, complessità O(m*n), gestione edge cases.

**Valuta:** DP implementation, type safety, edge cases, complessità

### T006: System Architecture (Alta Complessità)

Progetta sistema real-time scalabile con WebSocket, message queue, Redis, horizontal scaling. Include TypeScript interfaces.

**Valuta:** Architettura, scalabilità, type definitions, resilienza

## 🎯 Come Interpretare i Risultati

### Tabella Riepilogativa

```
  Model                    Avg Time    Total Cost  Quality   Success
  ─────────────────────────────────────────────────────────────────
  Claude 3.5 Sonnet        1245ms      $0.0156     87.3      100%
  GPT-4o Mini              982ms       $0.0023     84.1      100%
```

- **Avg Time**: Tempo medio di risposta per task

  - < 1000ms = Eccellente
  - 1000-2000ms = Buono
  - > 2000ms = Lento

- **Total Cost**: Costo totale per tutti i 6 task

  - < $0.01 = Molto economico
  - $0.01-0.05 = Economico
  - > $0.05 = Costoso

- **Quality**: Punteggio qualità medio (0-100)

  - > 85 = Eccellente
  - 75-85 = Buono
  - < 75 = Necessita miglioramenti

- **Success**: Percentuale di completamenti riusciti
  - 100% = Perfetto
  - > 90% = Affidabile
  - < 90% = Problematico

### Best in Category

Il benchmark identifica automaticamente:

- 🏆 **Più veloce**: Modello con il tempo medio più basso
- 💰 **Più economico**: Modello con il costo totale più basso
- ⭐ **Qualità migliore**: Modello con il punteggio qualità più alto

### Raccomandazione

Il benchmark fornisce una raccomandazione finale basata sul miglior bilanciamento di velocità, costo e qualità.

## 💡 Casi d'Uso

### Sviluppo in Produzione

Se usi NikCLI per progetti di produzione:

- **Priorità**: Qualità e affidabilità
- **Modelli consigliati**: Claude 3.5 Sonnet, GPT-4o

### Prototipazione Rapida

Per esperimenti e prototipi veloci:

- **Priorità**: Velocità e costo
- **Modelli consigliati**: Claude 3.5 Haiku, GPT-4o Mini

### Budget Limitato

Con vincoli di budget:

- **Priorità**: Costo
- **Modelli consigliati**: GPT-4o Mini, Claude 3.5 Haiku

### Task Complessi

Per task di alta complessità (refactoring, architettura):

- **Priorità**: Qualità
- **Modelli consigliati**: GPT-4o, Claude 3.5 Sonnet

## 📈 Modelli Disponibili via OpenRouter

### Anthropic Claude

**Claude 3.5 Sonnet** (`anthropic/claude-3.5-sonnet`)
- ✅ Qualità eccellente per coding
- ✅ Buona velocità
- ⚠️ Costo medio-alto ($3/$15 per M tokens)
- 💡 **Best for**: Produzione, task complessi

**Claude 3.5 Haiku** (`anthropic/claude-3.5-haiku`)
- ✅ Velocissimo
- ✅ Molto economico ($1/$5)
- ⚠️ Qualità leggermente inferiore
- 💡 **Best for**: Prototipazione rapida, alto volume

### OpenAI

**GPT-4o** (`openai/gpt-4o`)
- ✅ Qualità top tier
- ⚠️ Velocità media
- ⚠️ Più costoso ($5/$15)
- 💡 **Best for**: Task critici, massima qualità

**GPT-4o Mini** (`openai/gpt-4o-mini`)
- ✅ Molto economico ($0.15/$0.6)
- ✅ Buona velocità
- ⚠️ Qualità buona
- 💡 **Best for**: Alto volume, budget limitato

**o1-mini** (`openai/o1-mini`)
- ✅ Reasoning avanzato
- ⚠️ Più lento
- ⚠️ Costo medio ($3/$12)
- 💡 **Best for**: Problemi complessi, algoritmi

### Google

**Gemini Pro 1.5** (`google/gemini-pro-1.5`)
- ✅ Buon bilanciamento qualità/costo
- ✅ Veloce
- ✅ Economico ($1.25/$5)
- 💡 **Best for**: Uso generale, buon compromesso

**Gemini Flash 1.5** (`google/gemini-flash-1.5`)
- ✅ Velocissimo
- ✅ Molto economico ($0.075/$0.3)
- ⚠️ Qualità base
- 💡 **Best for**: Task semplici, altissimo volume

### Altri

**Llama 3.1 70B** (`meta-llama/llama-3.1-70b-instruct`)
- ✅ Open source, economico ($0.52/$0.75)
- ⚠️ Qualità inferiore ai modelli commerciali
- 💡 **Best for**: Budget ridotto, privacy

**Mistral Large** (`mistralai/mistral-large`)
- ✅ Buona qualità per coding
- ✅ Veloce
- ⚠️ Costo medio ($3/$9)
- 💡 **Best for**: Alternativa europea

**Deepseek Coder** (`deepseek/deepseek-coder`)
- ✅ Specializzato in coding
- ✅ Molto economico ($0.14/$0.28)
- ⚠️ Qualità variabile
- 💡 **Best for**: Code generation specifico

## 🔧 Personalizzazione

### Aggiungere Task Personalizzati

Modifica `benchmarks/ai-model-benchmark.ts`:

```typescript
const BENCHMARK_TASKS: BenchmarkTask[] = [
  // ... task esistenti ...
  {
    id: "T007",
    name: "Il mio task personalizzato",
    description: "Descrizione del task",
    prompt: "Il tuo prompt qui...",
    expectedOutputType: "code",
    complexity: "medium",
  },
];
```

### Aggiungere Nuovi Modelli

Modifica la funzione `loadModelsFromEnv()`:

```typescript
// Esempio: aggiungere Mistral AI
if (process.env.MISTRAL_API_KEY) {
  models.push({
    name: "Mistral Large",
    provider: "mistral",
    model: "mistral-large-latest",
    apiKey: process.env.MISTRAL_API_KEY,
  });
}
```

### Configurare Parametri del Modello

Ogni modello può essere configurato con:

```typescript
{
    name: 'Nome Modello',
    provider: 'anthropic' | 'openai',
    model: 'model-id',
    apiKey: 'your-key',
    maxTokens: 2048,      // Opzionale: token massimi di output
    temperature: 0.7,     // Opzionale: creatività (0-1)
}
```

## 🚨 Troubleshooting

### "OPENROUTER_API_KEY not set!"

**Problema**: API key di OpenRouter non configurata.

**Soluzione**: Imposta la tua API key OpenRouter:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
```

Ottieni la chiave su: https://openrouter.ai/keys

### Rate Limit Errors

**Problema**: Troppe richieste in poco tempo.

**Soluzione**:

- Aspetta qualche minuto tra i test
- Usa modelli con rate limit più alti
- Aggiungi delay tra i task nel codice

### Token Limit Exceeded

**Problema**: Risposta troppo lunga.

**Soluzione**: Modifica `maxTokens` nella configurazione del modello:

```typescript
maxTokens: 4096; // Aumenta se necessario
```

### Costi Imprevisti

**Attenzione**: Il benchmark effettua chiamate API reali che costano denaro!

**Suggerimenti**:

- Inizia con modelli economici (GPT-4o Mini, Claude Haiku)
- Monitora i costi sulla dashboard del provider
- Testa con pochi task prima di eseguire tutto

## 📊 Salvare e Confrontare i Risultati

### Salvare l'Output

```bash
pnpm run bench:ai > results/benchmark-$(date +%Y%m%d).txt
```

### Confrontare nel Tempo

Esegui il benchmark periodicamente per:

- Monitorare miglioramenti dei modelli
- Verificare cambiamenti di performance
- Valutare nuovi modelli

### Export per Analisi

L'output è strutturato e può essere parsato facilmente per analisi automatiche.

## 🤝 Contribuire

Hai idee per migliorare il benchmark?

1. Aggiungi nuovi task realistici
2. Supporta nuovi provider AI
3. Migliora le metriche di qualità
4. Aggiungi visualizzazioni dei risultati

## 📄 License

MIT - Vedi LICENSE file per dettagli
