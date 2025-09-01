# Terminal UI Kit per NikCLI

Un sistema completo di componenti UI per terminale basato su **Ink** che fornisce un'interfaccia moderna e interattiva per NikCLI.

## 🎨 Caratteristiche

- **Componenti React per Terminal**: Utilizzando Ink per rendering nativo nel terminale
- **Pannelli Interattivi**: Chat, Status, Files, Todos, Agents, Diff, Approval
- **Componenti per Comando**: Un componente UI dedicato per ogni comando slash
- **Stream in Tempo Reale**: Visualizzazione live degli output e degli stream
- **Layout Adattivo**: Layout automatico basato sulla dimensione del terminale
- **Temi Personalizzabili**: Supporto per temi scuri, chiari e personalizzati
- **Integrazione Trasparente**: Compatibilità completa con il sistema CLI esistente

## 📋 Struttura

```
terminal-ui-kit/
├── components/
│   ├── App.tsx                 # Componente principale dell'app
│   ├── StreamComponent.tsx     # Gestione stream in tempo reale
│   ├── PromptComponent.tsx     # Prompt utente interattivo
│   ├── PanelContainer.tsx      # Container per pannelli
│   ├── panels/                 # Pannelli base
│   │   ├── ChatPanel.tsx       # Pannello chat
│   │   ├── StatusPanel.tsx     # Pannello status e indicatori
│   │   ├── FilesPanel.tsx      # Pannello file e contenuti
│   │   ├── TodosPanel.tsx      # Pannello todos e planning
│   │   ├── AgentsPanel.tsx     # Pannello agenti background
│   │   ├── DiffPanel.tsx       # Pannello diff e modifiche
│   │   └── ApprovalPanel.tsx   # Pannello approvazioni
│   └── commands/               # Componenti per comandi specifici
│       ├── HelpCommandPanel.tsx
│       ├── ModelCommandPanel.tsx
│       ├── AgentCommandPanel.tsx
│       ├── FileCommandPanel.tsx
│       ├── VMCommandPanel.tsx
│       ├── PlanCommandPanel.tsx
│       ├── ConfigCommandPanel.tsx
│       ├── VisionCommandPanel.tsx
│       └── TerminalCommandPanel.tsx
├── hooks/                      # React hooks personalizzati
│   ├── useTerminalState.ts     # Gestione stato terminale
│   ├── useCommandHistory.ts    # Cronologia comandi
│   └── useFileWatcher.ts       # Watcher file system
├── utils/                      # Utilities
│   ├── theme.ts               # Sistema temi
│   └── layout.ts              # Gestione layout
├── integration/               # Sistema di integrazione
│   ├── CLIBridge.ts           # Ponte tra CLI e UI Kit
│   ├── CommandRouter.ts       # Router comandi a componenti
│   └── NikCLIIntegration.ts   # Integrazione principale
├── types.ts                   # Definizioni TypeScript
└── index.ts                   # Export pubblici
```

## 🚀 Utilizzo

### Inizializzazione

```typescript
import { initializeTerminalUIKit } from './ui/terminal-ui-kit/integration/NikCLIIntegration';

// Nel costruttore di NikCLI
const uiKit = initializeTerminalUIKit(this);
```

### Abilitazione UI Kit

```typescript
// Abilita UI Kit per modalità specifica
await cliInstance.enableTerminalUIKit('default');

// Toggle tra UI Kit e console
await cliInstance.toggleTerminalUI();

// Disabilita UI Kit
await cliInstance.disableTerminalUIKit();
```

### Utilizzo dei Componenti

I componenti vengono utilizzati automaticamente quando:
- `structuredUIEnabled` è true
- Il comando ha un componente UI dedicato
- La modalità corrente beneficia dell'interfaccia strutturata

## 🎯 Componenti per Comando

Ogni comando slash ha un componente UI dedicato:

### Model Management
- `/model` → `ModelCommandPanel` - Selezione e configurazione modelli AI
- `/models` → `ModelCommandPanel` - Lista modelli disponibili
- `/set-key` → `ModelCommandPanel` - Configurazione API keys

### Agent Management  
- `/agent` → `AgentCommandPanel` - Esecuzione agenti specifici
- `/agents` → `AgentCommandPanel` - Lista agenti disponibili
- `/auto` → `AgentCommandPanel` - Esecuzione autonoma
- `/create-agent` → `AgentCommandPanel` - Creazione nuovi agenti

### File Operations
- `/read` → `FileCommandPanel` - Lettura file con syntax highlighting
- `/write` → `FileCommandPanel` - Scrittura file con preview
- `/edit` → `FileCommandPanel` - Editing interattivo
- `/ls` → `FileCommandPanel` - Browser file navigabile
- `/search` → `FileCommandPanel` - Ricerca file e contenuti

### VM Operations
- `/vm-*` → `VMCommandPanel` - Gestione completa VM containers
- Supporto per creazione, lista, status, exec, logs

### Planning & Todos
- `/plan` → `PlanCommandPanel` - Gestione piani esecutivi
- `/todo` → `PlanCommandPanel` - Gestione todo lists
- Visual progress tracking e statistiche

### Vision & Images
- `/analyze-image` → `VisionCommandPanel` - Analisi immagini AI
- `/generate-image` → `VisionCommandPanel` - Generazione immagini
- `/images` → `VisionCommandPanel` - Discovery e gestione immagini

### Configuration
- `/config` → `ConfigCommandPanel` - Editor configurazione interattivo
- `/debug` → `ConfigCommandPanel` - Debug API keys e settings

### Terminal Operations
- `/run` → `TerminalCommandPanel` - Esecuzione comandi con output live
- `/install` → `TerminalCommandPanel` - Installazione pacchetti
- `/npm`, `/yarn`, `/git`, `/docker` → `TerminalCommandPanel`

## 🎨 Pannelli Base

### ChatPanel
- Visualizzazione conversazioni in tempo reale
- Syntax highlighting per codice
- Indicatori di streaming
- Cronologia messaggi

### StatusPanel  
- Indicatori di stato per operazioni attive
- Progress bar per task a lungo termine
- Live updates con timestamp
- Statistiche operazioni

### FilesPanel
- Browser file interattivo
- Preview contenuti con syntax highlighting
- Informazioni file (dimensione, linguaggio, modifiche)
- Selezione multipla

### TodosPanel
- Visualizzazione todos con stati
- Progress tracking per ogni item
- Categorizzazione e priorità
- Statistiche completamento

### AgentsPanel
- Monitoraggio agenti background
- Status in tempo reale
- Progress tracking per task
- Gestione agenti multipli

### DiffPanel
- Visualizzazione diff unified
- Syntax highlighting per linguaggi
- Statistiche modifiche (aggiunte/rimozioni)
- Navigazione modifiche

### ApprovalPanel
- Gestione approvazioni pending
- Visualizzazione dettagli risk assessment
- Approvazione rapida con shortcuts
- Context informazioni

## ⚙️ Configurazione

### Temi

```typescript
import { getTheme, createCustomTheme } from './utils/theme';

// Temi predefiniti: default, dark, light, cyberpunk, retro
const theme = getTheme('cyberpunk');

// Tema personalizzato
const customTheme = createCustomTheme({
  primary: '#FF6B6B',
  secondary: '#4ECDC4',
  success: '#45B7D1',
});
```

### Layout

```typescript
import { calculateLayout, getOptimalPanelLayout } from './utils/layout';

// Layout automatico basato su dimensioni terminale
const layout = calculateLayout(['chat', 'status', 'files'], 120, 30);

// Layout ottimizzato per tipi di pannello
const panels = getOptimalPanelLayout(['chat', 'todos', 'agents'], 100, 25);
```

## 🔗 Integrazione

### Bridge Pattern
Il `CLIBridge` fornisce compatibilità bidirezionale:
- Eventi CLI → UI Kit
- Comandi UI Kit → CLI
- Fallback automatico alla console

### Command Router
Il `CommandRouter` mappa comandi a componenti:
- Routing automatico basato su disponibilità componenti
- Fallback per comandi non mappati
- Categorizzazione comandi

### State Management
Hook personalizzati per gestione stato:
- `useTerminalState` - Stato globale terminale
- `useCommandHistory` - Cronologia comandi
- `useFileWatcher` - Monitoraggio file system

## 🎯 Compatibilità

Il Terminal UI Kit è completamente compatibile con il sistema esistente:
- ✅ Tutti i comandi esistenti funzionano
- ✅ Fallback automatico alla console
- ✅ Nessuna breaking change
- ✅ Migrazione graduale possibile
- ✅ Performance ottimizzate

## 🚀 Quick Start

```typescript
// 1. Inizializza nel costruttore NikCLI
const uiKit = initializeTerminalUIKit(this);

// 2. Abilita per modalità specifica
await this.enableTerminalUIKit('default');

// 3. I comandi useranno automaticamente l'UI Kit quando appropriato
// /help -> HelpCommandPanel
// /model -> ModelCommandPanel  
// /agent -> AgentCommandPanel
// etc.
```

Il sistema è progettato per essere **plug-and-play** con zero configurazione richiesta per l'utilizzo base.