# Piano di Allineamento Documentazione - Codebase

## Analisi delle Discrepanze

Dall'analisi comparativa tra `/docs` e `/src/cli`, emergono le seguenti discrepanze:

---

## 1. COMANDI NON DOCUMENTATI (Alta Priorità)

### 1.1 CAD & Manufacturing Commands (NUOVI)
Il codebase include comandi CAD non presenti nella documentazione:
- `/cad generate <description>` - Genera modelli CAD da testo
- `/cad stream <description>` - Generazione CAD con progresso real-time
- `/cad export <format> <description>` - Esporta CAD in vari formati
- `/cad formats` - Mostra formati supportati
- `/cad examples`, `/cad status` - Info sistema CAD

**Azione**: Creare nuovo file `docs/cli-reference/cad-commands.mdx`

### 1.2 G-code & CNC Operations (NUOVI)
- `/gcode generate <description>` - Genera G-code da descrizione
- `/gcode cnc <description>` - G-code per CNC
- `/gcode 3d <description>` - G-code per stampanti 3D
- `/gcode laser <description>` - G-code per laser cutter
- `/gcode examples` - Esempi di generazione

**Azione**: Creare nuovo file `docs/cli-reference/gcode-commands.mdx`

### 1.3 NikDrive Cloud Storage (NUOVO)
- `/nikdrive status` - Stato connessione e quota
- `/nikdrive upload <path> [dest]` - Upload file/cartella
- `/nikdrive download <fileId> <path>` - Download file
- `/nikdrive sync <localPath> [cloudPath]` - Sincronizzazione bidirezionale
- `/nikdrive search <query> [limit]` - Ricerca file
- `/nikdrive list [folderId]` - Lista contenuti
- `/nikdrive share <fileId> [days]` - Crea link condivisibile
- `/nikdrive delete <fileId>` - Elimina file

**Azione**: Creare nuovo file `docs/cli-reference/nikdrive-commands.mdx`

### 1.4 Browser Mode Interattivo (NUOVO)
Differente dai browse-* commands esistenti:
- `/browser [url]` - Avvia browser interattivo
- `/browser-status` - Stato sessione corrente
- `/browser-screenshot` - Screenshot pagina
- `/browser-exit` - Esci dalla modalità browser
- `/browser-info` - Mostra capabilities

**Azione**: Aggiornare `docs/cli-reference/browse-commands.mdx` o creare sezione dedicata

### 1.5 Documentation System Commands (NUOVI)
- `/docs` - Help sistema documentazione
- `/doc-search <query>` - Cerca nella documentazione
- `/doc-add <url>` - Aggiungi documentazione da URL
- `/doc-stats` - Statistiche documentazione
- `/doc-list` - Lista documentazione indicizzata
- `/doc-tag <id> <tags>` - Tagga documentazione
- `/doc-sync` - Sincronizza indice
- `/doc-load <path>` - Carica documentazione da path
- `/doc-context <query>` - Ottieni contesto doc
- `/doc-unload <id>`, `/doc-suggest <query>` - Gestione

**Azione**: Creare nuovo file `docs/cli-reference/documentation-commands.mdx`

---

## 2. CONFIGURAZIONI NON DOCUMENTATE (Alta Priorità)

### 2.1 Token Limits (Dettagli Mancanti)
File sorgente: `src/cli/config/token-limits.ts`

Valori non documentati:
```typescript
MAX_CONTEXT_TOKENS: 80,000
MAX_RECENT_NON_SYSTEM: 4
HEAD_TAIL_WINDOW: 2
EMERGENCY_TRUNCATE_AT: 50,000
CHUNK_TOKENS: 1,000 (RAG)
CHUNK_OVERLAP_TOKENS: 30
```

**Azione**: Aggiornare `docs/advanced/token-management.mdx` con valori specifici

### 2.2 Feature Flags Sistema
File sorgente: `src/cli/config/feature-flags.ts`

Flags non documentati:
- `NIKCLI_SEMANTIC_CACHE` - configurazione cache semantica
- `NIKCLI_AGENT_MEMORY` - memoria agenti
- `NIKCLI_DEBUG_DASHBOARD` - dashboard debug
- `NIKCLI_QUIET_STARTUP` - avvio silenzioso

**Azione**: Creare nuovo file `docs/advanced/feature-flags.mdx`

### 2.3 Notification Defaults
File sorgente: `src/cli/config/notification-defaults.ts`

Configurazioni:
- Slack, Discord, Linear providers
- Deduplication (5 min window)
- Rate Limiting (10/min)
- Retry config (3 max, exponential backoff)

**Azione**: Aggiungere sezione a `docs/enterprise-monitoring.md`

### 2.4 Model Pricing Database
File sorgente: `src/cli/core/config-manager.ts`

60+ modelli con pricing dettagliato non documentato:
- Input/output costs per 1M tokens
- Context window limits (200K-2M)
- Provider-specific settings

**Azione**: Creare `docs/reference/model-pricing.mdx`

---

## 3. DISCREPANZE NUMERICHE (Media Priorità)

### 3.1 Numero Comandi
- **Documentazione**: Dichiara 144+ slash commands
- **Codebase**: Circa 80-90 comandi effettivi

**Azione**: Verificare e aggiornare il conteggio in `commands-overview.mdx` e `introduction.mdx`

### 3.2 Capabilities Universal Agent
- **Documentazione**: 64+ capabilities, 35+ documented
- **Codebase**: Verificare implementazione effettiva

**Azione**: Cross-reference con `agent-factory.ts` e aggiornare

---

## 4. FILE DA AGGIORNARE (Media Priorità)

### 4.1 `docs/introduction.mdx`
- Aggiornare numero comandi
- Aggiungere CAD/G-code/NikDrive nelle features
- Verificare versione corrente (1.6.0)

### 4.2 `docs/cli-reference/commands-overview.mdx`
- Aggiungere nuove categorie:
  - CAD & Manufacturing
  - G-code & CNC
  - Cloud Storage (NikDrive)
  - Documentation System
  - Browser Mode Interattivo

### 4.3 `docs/quickstart/first-steps.mdx`
- Aggiungere esempi per nuove funzionalità
- Verificare comandi di esempio

### 4.4 `docs/architecture/overview.mdx`
- Aggiungere CAD/Manufacturing layer
- Documentare NikDrive integration
- Browser mode architecture

---

## 5. NUOVI FILE DA CREARE (Alta Priorità)

| File | Descrizione |
|------|-------------|
| `docs/cli-reference/cad-commands.mdx` | Comandi CAD & Manufacturing |
| `docs/cli-reference/gcode-commands.mdx` | Comandi G-code & CNC |
| `docs/cli-reference/nikdrive-commands.mdx` | Cloud Storage NikDrive |
| `docs/cli-reference/documentation-commands.mdx` | Sistema documentazione |
| `docs/advanced/feature-flags.mdx` | Feature flags e variabili ambiente |
| `docs/reference/model-pricing.mdx` | Database prezzi modelli AI |

---

## 6. SEZIONI DA ESPANDERE (Media Priorità)

### 6.1 Token Management
- Aggiungere tabella limiti specifici
- Documentare `EMERGENCY_TRUNCATE_AT`
- RAG chunking parameters

### 6.2 Enterprise Monitoring
- Notification defaults dettagliati
- Configurazione Slack/Discord
- Rate limiting settings

### 6.3 Configuration
- Aggiungere tutti i flag environment
- Documentare config-manager options
- Default values tabella

---

## 7. ORDINE DI ESECUZIONE

### Fase 1: Comandi Nuovi (2-3 ore)
1. [ ] Creare `cad-commands.mdx`
2. [ ] Creare `gcode-commands.mdx`
3. [ ] Creare `nikdrive-commands.mdx`
4. [ ] Creare `documentation-commands.mdx`
5. [ ] Aggiornare `browse-commands.mdx` con Browser Mode

### Fase 2: Configurazioni (1-2 ore)
1. [ ] Creare `feature-flags.mdx`
2. [ ] Creare `model-pricing.mdx`
3. [ ] Aggiornare `token-management.mdx`
4. [ ] Aggiornare `enterprise-monitoring.md`

### Fase 3: Aggiornamenti Esistenti (1 ora)
1. [ ] Aggiornare `introduction.mdx`
2. [ ] Aggiornare `commands-overview.mdx`
3. [ ] Aggiornare `first-steps.mdx`
4. [ ] Verificare conteggi numerici

### Fase 4: Architettura (30 min)
1. [ ] Aggiornare `architecture/overview.mdx`
2. [ ] Verificare diagrammi

### Fase 5: Verifica Finale (30 min)
1. [ ] Cross-check tutti i comandi
2. [ ] Verificare link interni
3. [ ] Aggiornare `mint.json` per navigazione

---

## 8. COMANDI DEPRECATI O RINOMINATI

Da verificare nel codebase se esistono:
- Comandi documentati ma non più presenti
- Comandi con sintassi cambiata
- Opzioni rimosse o aggiunte

---

## 9. PRIORITÀ DETTAGLIATE

### 🔴 CRITICO (Da fare subito)
- Documentare CAD/G-code (feature nuova importante)
- Documentare NikDrive (cloud storage)
- Feature flags documentation

### 🟠 ALTO (Entro 1 settimana)
- Aggiornare commands-overview
- Model pricing reference
- Token limits details

### 🟡 MEDIO (Entro 2 settimane)
- Documentation system commands
- Browser mode interattivo
- Notification defaults

### 🟢 BASSO (Nice to have)
- Verifica conteggi numerici
- Architettura updates
- Link interni

---

## Note Tecniche

- Formato file: `.mdx` per consistenza
- Seguire struttura esistente con frontmatter
- Includere code examples funzionanti
- Testare comandi documentati

