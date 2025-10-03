# Documentation Database System

## Overview

Il sistema di documentazione database integra un database persistente per l'indicizzazione e la ricerca intelligente della documentazione, rendendo disponibile all'AI un'intera knowledge base accessibile tramite vari tool di ricerca.

## Caratteristiche Principali

### 1. Archiviazione Persistente

- **Database Supabase** - Storage cloud con PostgreSQL
- **Ricerca Full-Text** - Ricerca testuale veloce e precisa
- **Ricerca Semantica** - Ricerca basata su significato usando vector embeddings
- **Caching Locale** - File JSON per accesso offline

### 2. Indicizzazione Automatica

Quando utilizzi `/doc-add`, il sistema:
1. Scarica e analizza la pagina web
2. Estrae il contenuto e i metadati
3. Salva nella libreria locale (JSON)
4. Salva nel database (se disponibile)
5. Esegue il crawling delle sottopagine (se applicabile)

```bash
/doc-add https://reactjs.org/docs/getting-started.html react
```

### 3. Ricerca Avanzata

#### Smart Docs Search
Ricerca intelligente con auto-caricamento:

```typescript
// L'AI usa automaticamente questo tool
{
  query: "react hooks best practices",
  autoLoad: true,
  maxResults: 5,
  category: "frontend"
}
```

Processo di ricerca:
1. Cerca nella libreria locale
2. Cerca nel database (se nessun risultato locale)
3. Cerca nella documentazione cloud/condivisa
4. Suggerisce fonti web esterne

#### Docs Request
Richiesta automatica quando l'AI incontra concetti sconosciuti:

```typescript
{
  concept: "GraphQL subscriptions",
  context: "Implementing real-time updates",
  urgency: "high"
}
```

### 4. Database Schema

```sql
CREATE TABLE documentation (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[],
  language TEXT,
  word_count INTEGER,
  url TEXT,
  vector_embedding vector(1536),
  popularity_score FLOAT,
  access_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

#### Indici Ottimizzati
- **GIN Index** - Per ricerca full-text e tags
- **IVFFlat Index** - Per ricerca vettoriale
- **B-tree Index** - Per ordinamento per popolarità

### 5. Integrazione con Tool System

#### Tools Service
Nuovi tool registrati:

```typescript
// Documentation tools
doc_search: "Search documentation library"
smart_docs_search: "Smart search with auto-load"
docs_request: "Request documentation for unknown concepts"

// Web and AI tools
web_search: "Search the web"
browse_web: "Browse and analyze websites"
vision_analysis: "Analyze images with AI"
image_generation: "Generate images from text"

// Blockchain and Design
blockchain_operations: "Coinbase AgentKit operations"
figma_operations: "Figma design operations"
```

#### Tool Router Enhancement
Il router ora include:
- **Keyword mapping** per tutti i tool
- **Priority-based selection** per selezione ottimale
- **Context-aware routing** basato sul tipo di task

## Configurazione

### 1. Abilita Supabase

In `.nikcli/config.json`:

```json
{
  "supabase": {
    "enabled": true,
    "url": "https://your-project.supabase.co",
    "anonKey": "your-anon-key",
    "features": {
      "database": true,
      "vector": true,
      "realtime": false
    },
    "tables": {
      "sessions": "sessions",
      "blueprints": "blueprints",
      "documents": "documentation",
      "metrics": "metrics"
    }
  }
}
```

### 2. Setup Database

1. Crea progetto Supabase
2. Abilita estensione pgvector:
   ```sql
   CREATE EXTENSION vector;
   ```
3. Esegui schema da `database/schema.sql`

### 3. Verifica Connessione

```bash
# In chat
/health
```

Dovresti vedere:
```
✓ Documentation database connected (Supabase)
```

## Utilizzo

### Aggiungere Documentazione

```bash
# Singola pagina
/doc-add https://nodejs.org/api/fs.html backend

# Con tag personalizzati
/doc-add https://expressjs.com/en/guide/routing.html backend express,routing,api

# Con crawling automatico
/doc-add https://docs.nestjs.com/
```

### Cercare Documentazione

L'AI cerca automaticamente quando serve:

```
User: Come implemento l'autenticazione JWT in Express?

AI: (usa smart_docs_search automaticamente)
    - Cerca nella libreria locale
    - Cerca nel database
    - Carica documentazione rilevante
    - Fornisce risposta contestualizzata
```

### Statistiche Database

```typescript
// Ottieni statistiche
const stats = await documentationDatabase.getStatistics()
console.log(stats)
// {
//   totalDocs: 150,
//   categories: ['frontend', 'backend', 'api'],
//   languages: ['english', 'italian'],
//   totalWords: 250000
// }
```

## Dynamic Tool Selector

Sistema intelligente per selezione dinamica dei tool:

### Caratteristiche

1. **Diversity Bonus** - Bonus per tool poco usati
2. **Success Rate Weighting** - Peso basato sul tasso di successo
3. **Usage History** - Tracciamento uso tool
4. **Alternative Discovery** - Scoperta automatica alternative

### Utilizzo

```typescript
import { createDynamicToolSelector } from './core/dynamic-tool-selector'

const selector = createDynamicToolSelector(process.cwd())

// Selezione dinamica
const tools = selector.selectToolsDynamically(
  "analizza i file TypeScript nel progetto",
  {
    taskType: 'analyze',
    maxTools: 5,
    preferredTools: ['grep-tool', 'multi-read-tool']
  }
)

// Registra risultato
selector.recordToolResult('grep-tool', true)

// Visualizza statistiche
selector.showStatistics()
```

### Debug Mode

Abilita debug per vedere la selezione:

```bash
export NIKCLI_DEBUG_TOOLS=1
```

Output:
```
🎯 Dynamic Tool Selection:
  1. grep-tool (confidence: 85%, used: 12x, success: 92%)
  2. multi-read-tool (confidence: 78%, used: 8x, success: 88%)
  3. vision-analysis-tool (confidence: 65%, used: 2x, success: 100%)
```

## Best Practices

### 1. Organizzazione Documentazione

- Usa **categorie** coerenti (frontend, backend, api, etc.)
- Aggiungi **tag** descrittivi
- Mantieni documentazione **aggiornata**

### 2. Ricerca Efficace

- Usa **query specifiche** per risultati migliori
- Specifica **categoria** quando possibile
- Imposta **maxResults** appropriato

### 3. Manutenzione

```bash
# Aggiorna popularity scores settimanalmente
UPDATE documentation
SET popularity_score = (access_count * 0.7 + word_count * 0.0001)
WHERE updated_at > NOW() - INTERVAL '7 days';

# Pulisci vecchie entry mensili
DELETE FROM documentation
WHERE access_count = 0 
  AND created_at < NOW() - INTERVAL '90 days';
```

## Troubleshooting

### Database non connesso

Verifica:
1. Credenziali Supabase corrette
2. Tabella `documentation` esiste
3. Row Level Security configurato

```sql
-- Verifica tabella
SELECT * FROM information_schema.tables 
WHERE table_name = 'documentation';

-- Verifica RLS
SELECT * FROM pg_policies 
WHERE tablename = 'documentation';
```

### Ricerca lenta

Ottimizza:
1. Verifica indici creati
2. Analizza query performance
3. Considera caching applicativo

```sql
-- Check indexes
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE tablename = 'documentation';

-- Analyze query
EXPLAIN ANALYZE 
SELECT * FROM search_documentation('react', 10);
```

### Ricerca vettoriale non funziona

1. Verifica pgvector installato
2. Check embeddings popolati
3. Genera embeddings mancanti

```sql
-- Verifica extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Count embeddings
SELECT COUNT(*) FROM documentation 
WHERE vector_embedding IS NOT NULL;
```

## Roadmap

- [ ] Generazione automatica embeddings
- [ ] Sincronizzazione real-time multi-device
- [ ] Export/import documentazione
- [ ] Analytics avanzati
- [ ] Raccomandazioni basate su ML
- [ ] Integrazione con più fonti (GitHub, Stack Overflow, etc.)

## Esempi Avanzati

### Ricerca Semantica

```typescript
// Genera embedding con OpenAI
const embedding = await openai.embeddings.create({
  model: 'text-embedding-ada-002',
  input: 'React hooks best practices'
})

// Cerca nel database
const results = await documentationDatabase.searchDocumentation(
  'React hooks',
  { 
    category: 'frontend',
    limit: 10,
    threshold: 0.7
  }
)
```

### Batch Import

```typescript
// Importa da directory
const entries = await docLibrary.importFromDirectory('./docs')

// Salva batch nel database
const saved = await documentationDatabase.saveDocumentationBatch(entries)
console.log(`Saved ${saved} documents`)
```

### Custom Tool Chain

```typescript
// Crea chain personalizzata
const customChain = [
  'smart_docs_search',
  'docs_request',
  'web_search',
  'browse_web'
]

// Esegui in sequenza
for (const toolName of customChain) {
  const result = await executeTool(toolName, params)
  if (result.found) break
}
```

## Riferimenti

- [Database Schema](../../database/schema.sql)
- [DocumentationDatabase](../../src/cli/core/documentation-database.ts)
- [DynamicToolSelector](../../src/cli/core/dynamic-tool-selector.ts)
- [Tool Router](../../src/cli/core/tool-router.ts)


