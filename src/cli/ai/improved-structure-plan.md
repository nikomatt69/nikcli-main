# Miglioramenti Architetturali - src/cli/ai/

## 🏗️ Nuova Struttura Proposta

```
src/cli/ai/
├── core/
│   ├── ai-provider.ts          # Interfaccia astratta base
│   ├── streaming-provider.ts   # Abstrat per streaming
│   ├── model-router.ts         # Router base interface
│   └── reasoning-engine.ts     # Engine base per reasoning
│
├── providers/
│   ├── base/
│   │   ├── base-provider.ts    # Implementazione base
│   │   ├── streaming-base.ts   # Base per streaming
│   │   └── config-validator.ts # Validazione config
│   ├── openai-provider.ts      # Provider OpenAI
│   ├── anthropic-provider.ts   # Provider Anthropic
│   ├── google-provider.ts      # Provider Google
│   ├── openrouter-provider.ts  # Provider OpenRouter
│   └── legacy-provider.ts      # Migrato da model-provider.ts
│
├── routing/
│   ├── adaptive-router.ts      # Router intelligente
│   ├── performance-router.ts   # Router basato su performance
│   ├── cost-router.ts          # Router basato su costi
│   └── routing-strategies.ts   # Strategie di routing
│
├── reasoning/
│   ├── reasoning-detector.ts   # Rilevamento reasoning
│   ├── reasoning-extractor.ts  # Estrazione reasoning
│   └── reasoning-formatter.ts  # Formattazione output
│
├── tools/
│   ├── tool-manager.ts         # Gestione tool calling
│   ├── tool-repair.ts          # Riparazione tool calls
│   └── tool-cache.ts           # Caching tool definitions
│
├── caching/
│   ├── ai-cache.ts             # Cache AI generico
│   ├── token-cache.ts          # Cache token counting
│   └── model-cache.ts          # Cache modelli e pricing
│
├── streaming/
│   ├── stream-handler.ts       # Handler streaming generico
│   ├── chunk-processor.ts      # Processore chunk
│   └── output-styler.ts        # Styling output
│
├── config/
│   ├── model-config.ts         # Configurazioni modelli
│   ├── provider-config.ts      # Configurazioni provider
│   └── validation-schemas.ts   # Schemi Zod validazione
│
└── utils/
    ├── token-counter.ts        # Conteggio token
    ├── cost-calculator.ts      # Calcolo costi
    └── error-handler.ts        # Gestione errori
```

## 🎯 Vantaggi della Nuova Struttura

### 1. **Separazione delle Responsabilità**

- Ogni file ha una responsabilità specifica
- Facilita testing e manutenzione
- Riduce complessità cognitiva

### 2. **Riutilizzabilità**

- Componenti modulari riutilizzabili
- Pattern consistenti
- Interface chiare

### 3. **Testabilità**

- Unit testing più semplice
- Mocking più facile
- Coverage migliore

### 4. **Estensibilità**

- Aggiunta nuovi provider semplificata
- Nuove strategie di routing pluggable
- Nuovi pattern di reasoning modularizzati

## 📋 Fasi di Migrazione

### Fase 1: Creazione Struttura Base

1. Creare directory e file base
2. Definire interfaces principali
3. Setup configurazione TypeScript

### Fase 2: Migrazione Core Components

1. Refactoring `ai-provider.ts` base
2. Migrazione `model-router.ts`
3. Setup `reasoning-engine.ts`

### Fase 3: Migrazione Providers

1. Estrazione provider specifici
2. Migrazione logica streaming
3. Setup tool management

### Fase 4: Migrazione Utilities

1. Estrazione caching logic
2. Migrazione token counting
3. Setup error handling

### Fase 5: Testing e Validazione

1. Test di regressione
2. Performance testing
3. Validazione funzionalità
