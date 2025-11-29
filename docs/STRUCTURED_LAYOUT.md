# 📐 Structured Layout UI - 3 Section Design

Il nuovo **Structured Layout UI** per NikCLI implementa un'interfaccia a 3 sezioni divise orizzontalmente, ispirata alle moderne IDE come VSCode, con aree dedicate e fisse per evitare sovrapposizioni.

## 🎯 Architettura del Layout

```
┌────────────────────────────────────────────────────────────────┐
│ TOP BAR (fisso, 3 righe)                                       │
│ 🎛️ Build: OpenCode Gemini Pro 3  │ ~/Documents/local/playground│
│ ──────┬─── esc interrupt  tab Agents  ctrl+p Commands          │
│       │                                    OpenCode v1.0.85     │
├───────┴────────────────────────────────────────────────────────┤
│                                                                 │
│ CENTRO - LOGS/STREAM (scrollabile, auto-scroll)                │
│                                                                 │
│ # Reviewing codebase for test coverage                         │
│                                                                 │
│ are tests included in this starter kit?                        │
│ davidhill · 11:42 AM                                           │
│                                                                 │
│ - Backend: Laravel 12 (PHP 8.2+)                               │
│ - Frontend: React 19                                            │
│ - Glue: Inertia.js 2.0                                          │
│ - Styling: Tailwind CSS 4.0                                     │
│ - UI Library: Radix UI primitives                               │
│ - Authentication: Laravel Fortify                               │
│ - Testing: Pest (PHP testing framework)                         │
│                                                                 │
│ [scroll indicator: ↓ more content below]                       │
├─────────────────────────────────────────────────────────────────┤
│ BOTTOM - PROMPT (fisso, 3-4 righe)                             │
│ ┌─[🎛️:nikcli]─[●…]─[anthropic:claude-sonnet-4.5]              │
│ └─❯ _                                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🏗️ Componenti Principali

### 1. **StructuredLayoutUI** (`src/cli/ui/structured-layout-ui.ts`)

Il componente principale che gestisce il layout a 3 sezioni usando `blessed`.

**Caratteristiche**:
- Top bar fissa con informazioni di stato
- Centro scrollabile per logs e output streaming
- Bottom prompt fisso per input utente
- Supporto per mouse wheel e keyboard scrolling
- Auto-scroll intelligente
- Event-driven architecture

**Uso base**:
```typescript
import { StructuredLayoutUI, type LayoutContext } from './ui/structured-layout-ui'

const context: LayoutContext = {
  workingDirectory: process.cwd(),
  currentModel: 'claude-sonnet-4.5',
  provider: 'anthropic',
  buildStatus: 'OpenCode Gemini Pro 3',
  version: 'v1.0.85',
  contextPercentage: 45,
  planMode: false,
  autoAcceptEdits: false,
  activeAgents: 0,
  processingMessage: false
}

const layout = new StructuredLayoutUI(context)

// Eventi
layout.on('submit', (input: string) => {
  console.log('User input:', input)
})

layout.on('interrupt', () => {
  console.log('Interrupt signal received')
})

// Logging
layout.log('Hello from the center panel!')
layout.showSuccess('Operation completed')
layout.showError('Something went wrong')

// Attivazione
layout.activate()
```

### 2. **StructuredLayoutAdapter** (`src/cli/ui/structured-layout-adapter.ts`)

Adapter che integra `StructuredLayoutUI` con `StreamttyService` per catturare e routare l'output.

**Caratteristiche**:
- Cattura automatica di stdout/stderr
- Integrazione con StreamttyService
- Pulizia dei codici ANSI non necessari
- Helper methods per logging

**Uso base**:
```typescript
import { createStructuredLayout } from './ui/structured-layout-adapter'

const adapter = createStructuredLayout(context, {
  captureStdout: true,
  captureStderr: true,
  formatMarkdown: true
})

adapter.on('submit', (input: string) => {
  // Handle user input
})

adapter.activate()
```

### 3. **Test/Demo Script** (`src/cli/test-structured-layout.ts`)

Script standalone per testare il nuovo layout.

## 🚀 Come Usare

### Opzione 1: Test/Demo Standalone

Esegui il test script per vedere il layout in azione:

```bash
# Usando npm
npm run test:layout

# Usando bun
bun run test:layout

# Direttamente con ts-node
ts-node src/cli/test-structured-layout.ts
```

**Comandi disponibili nel demo**:
- `help` - Mostra i comandi disponibili
- `clear` - Pulisce i logs
- `stream` - Simula output streaming
- `agents <n>` - Imposta il numero di agenti attivi
- `plan` - Toggle plan mode
- `exit` / `quit` - Esci dal demo

**Keyboard shortcuts**:
- `Esc` - Pulisci input / Interrupt
- `Tab` - Vista agenti
- `Ctrl+P` - Command palette
- `Ctrl+C` - Interrupt / Exit
- `PgUp/PgDn` - Scroll logs
- `Home/End` - Vai all'inizio/fine dei logs

### Opzione 2: Integrazione in NikCLI

Per abilitare il layout a 3 sezioni in NikCLI:

#### Via Environment Variable:
```bash
export NIKCLI_THREE_COLUMN_LAYOUT=true
nikcli
```

#### Via Command Line Flag (TODO):
```bash
nikcli --three-column-layout
```

#### Via Programmatic API:
```typescript
const cli = new NikCLI()
await cli.startChat({
  structuredUI: true,
  threeColumnLayout: true
})
```

## 📋 Sezioni del Layout

### Top Bar (Fixed - 3 lines)

Mostra:
- Build status corrente
- Directory di lavoro
- Shortcuts keyboard
- Versione di OpenCode
- Status indicators

### Centro - Logs/Stream (Scrollable)

Caratteristiche:
- **Auto-scroll**: Scorre automaticamente per mostrare gli ultimi messaggi
- **Buffer**: Mantiene le ultime 1000 righe di log
- **Scrolling**: Supporta mouse wheel, PgUp/PgDn, Home/End
- **Markdown**: Renderizza markdown formattato
- **Syntax highlighting**: Evidenzia codice con colori

Metodi disponibili:
```typescript
layout.log('Messaggio normale')
layout.showSuccess('Operazione riuscita')
layout.showError('Errore')
layout.showInfo('Informazione')
layout.showWarning('Avviso')
layout.showSpinner('Caricamento...')
layout.clearLogs()
```

### Bottom - Prompt (Fixed - 3-4 lines)

Caratteristiche:
- **Status line**: Mostra directory, model, agenti attivi, modalità
- **Input line**: Area di input sempre visibile
- **Indicators**: Mostra status di processing (●… quando attivo)

Metodi disponibili:
```typescript
layout.setInput('Testo preimpostato')
layout.getInput() // Ottieni il valore corrente
layout.clearInput()
layout.focusInput()
```

## 🎨 Vantaggi del Nuovo Layout

1. **No Overlays**: Ogni sezione ha il suo spazio dedicato, nessuna sovrapposizione
2. **Fixed Prompt**: Il prompt rimane sempre visibile in basso, non si muove mai
3. **Infinite Scrolling**: Log infiniti senza disturbare il prompt
4. **Native Performance**: Usa `blessed` già presente nel progetto
5. **Responsive**: Si adatta automaticamente alla dimensione del terminale
6. **Event-Driven**: Facile da integrare con il sistema esistente
7. **Mouse Support**: Scroll con mouse wheel
8. **Keyboard Navigation**: Navigazione completa da tastiera

## 🔧 Integrazione con Sistemi Esistenti

### Integrazione con StreamttyService

Il nuovo layout si integra perfettamente con `StreamttyService`:

```typescript
import { createStructuredLayout } from './ui/structured-layout-adapter'
import { streamttyService } from './services/streamtty-service'

const adapter = createStructuredLayout(context)

// Cattura automatica dell'output di streamtty
adapter.startCapture()

// Tutto l'output di streamttyService verrà routato al centro panel
streamttyService.renderMarkdown('# Hello World')
```

### Integrazione con AdvancedCliUI

Il nuovo layout può coesistere con `AdvancedCliUI` esistente:

```typescript
if (options.threeColumnLayout) {
  // Usa il nuovo layout a 3 sezioni
  const layout = createStructuredLayout(context)
  layout.activate()
} else if (options.structuredUI) {
  // Usa l'AdvancedCliUI esistente
  advancedUI.startInteractiveMode()
} else {
  // Usa console stdout semplice
}
```

## 📊 Confronto con Layout Attuale

| Caratteristica | Layout Attuale | Nuovo Layout 3-Sezioni |
|---|---|---|
| Prompt Position | Top (scorre) | Bottom (fisso) |
| Logs Area | Mista con prompt | Dedicata e scrollabile |
| Status Bar | In prompt | Top bar dedicata |
| Overlays | Possibili | Nessuno |
| Scrolling | Limitato | Infinito con buffer |
| Mouse Support | Parziale | Completo |
| Auto-scroll | No | Sì |
| Responsiveness | Buona | Ottima |

## 🛠️ Sviluppo Futuro

### TODO

- [ ] Aggiungere flag `--three-column-layout` al CLI
- [ ] Integrare completamente con `StreamttyService`
- [ ] Aggiungere supporto per pannelli laterali (agents, todos)
- [ ] Implementare temi personalizzabili
- [ ] Aggiungere split view per diffs
- [ ] Supporto per notifiche toast
- [ ] Integrazione con dashboard metrics

### Possibili Estensioni

1. **Panel Laterale Destro**: Per mostrare agenti attivi, todos, context
2. **Multi-tab**: Tabs nella top bar per passare tra diverse viste
3. **Minimap**: Minimap dello scrolling come VSCode
4. **Search**: Ricerca nei logs con highlighting
5. **Export**: Esporta logs in formato markdown/html
6. **Themes**: Supporto per temi custom (dark/light/solarized)

## 🐛 Troubleshooting

### Il layout non appare correttamente

Verifica che il terminale supporti i codici ANSI:
```bash
echo $TERM
# Dovrebbe essere xterm-256color o simile
```

### Input non funziona

Assicurati che il processo abbia accesso a stdin in raw mode:
```typescript
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
  process.stdin.resume()
}
```

### Scrolling non funziona

Verifica che il mouse sia abilitato:
```typescript
const layout = new StructuredLayoutUI(context)
// Il mouse è abilitato di default nella configurazione blessed
```

## 📝 Note di Implementazione

- **Blessed**: Usa `blessed@0.1.81` già presente nel progetto
- **Compatibilità**: Testato su Linux, macOS (dovrebbe funzionare su Windows con terminale compatibile)
- **Performance**: Buffer limitato a 1000 righe per evitare memory leaks
- **Cleanup**: Gestione automatica del cleanup all'uscita

## 🔗 Collegamenti

- [Blessed Documentation](https://github.com/chjj/blessed)
- [NikCLI Main README](../README.md)
- [Advanced CLI UI Documentation](./ADVANCED_CLI_UI.md)
