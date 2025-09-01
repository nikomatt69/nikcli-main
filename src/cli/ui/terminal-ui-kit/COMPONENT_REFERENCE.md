# Terminal UI Kit - Riferimento Componenti

## 🧩 Architettura Componenti

### Struttura Gerarchica

```
App (Root)
├── Header (Info CLI + Mode)
├── PanelContainer[] (Layout adattivo)
│   ├── ChatPanel
│   ├── StatusPanel  
│   ├── FilesPanel
│   ├── TodosPanel
│   ├── AgentsPanel
│   ├── DiffPanel
│   └── ApprovalPanel
├── StreamComponent (Output live)
└── PromptComponent (Input utente)
```

### Command Components (On-Demand)

```
CommandPanels/
├── HelpCommandPanel      # /help
├── ModelCommandPanel     # /model, /models, /set-key
├── AgentCommandPanel     # /agent, /agents, /auto, /create-agent
├── FileCommandPanel      # /read, /write, /ls, /search
├── VMCommandPanel        # /vm-*, tutte le operazioni VM
├── PlanCommandPanel      # /plan, /todo, /approval
├── ConfigCommandPanel    # /config, /debug
├── VisionCommandPanel    # /analyze-image, /generate-image, /images
└── TerminalCommandPanel  # /run, /install, /npm, /git, etc.
```

## 📱 Componenti Base

### App.tsx
**Componente root dell'applicazione**

```typescript
interface AppProps {
  initialMode?: 'default' | 'auto' | 'plan' | 'vm';
  cliInstance?: any;
  onExit?: () => void;
}
```

**Responsabilità**:
- Layout management automatico
- Event handling globale (Esc, Ctrl+C)
- Panel toggling (Ctrl+1-5)
- Theme application
- State coordination

**Features**:
- Layout adattivo (single/dual/triple/quad)
- Resize handling automatico
- Panel priority management
- Global shortcuts

### StreamComponent.tsx
**Gestione output in tempo reale**

```typescript
interface StreamComponentProps {
  streams: StreamData[];
  isVisible: boolean;
  maxLines?: number;
}
```

**Responsabilità**:
- Display stream data live
- Type-based coloring
- Source tracking
- Auto-scrolling

**Stream Types**:
- `info` 🔵 - Informazioni generali
- `success` 🟢 - Operazioni completate
- `warning` 🟡 - Avvisi
- `error` 🔴 - Errori
- `chat` 🔵 - Messaggi chat
- `progress` 🔄 - Progress updates

### PromptComponent.tsx
**Input utente interattivo**

```typescript
interface PromptComponentProps {
  currentMode: string;
  isProcessing: boolean;
  userInputActive: boolean;
  onInput: (input: string) => void;
  onCommand: (command: string) => void;
}
```

**Responsabilità**:
- Input handling con auto-complete
- Mode indicators
- Processing status
- Command suggestions
- Help integration

**Features**:
- Auto-complete per comandi slash
- Mode-specific prompts
- Processing indicators
- Keyboard shortcuts help

### PanelContainer.tsx
**Container per layout pannelli**

```typescript
interface PanelContainerProps {
  layout: LayoutConfig;
  panelIndex: number;
  theme: UITheme;
  children: React.ReactNode;
}
```

**Responsabilità**:
- Dimensioning automatico
- Positioning basato su layout
- Theme application
- Responsive behavior

## 🎛️ Pannelli Specializzati

### ChatPanel.tsx
**Pannello conversazioni**

**Features**:
- Message history con scroll
- Role-based coloring
- Timestamp display
- Streaming indicators
- Message statistics

**Shortcuts**:
- Scroll automatico ai nuovi messaggi
- Role icons (👤 user, 🤖 assistant, ⚙️ system)

### StatusPanel.tsx
**Pannello status operazioni**

**Features**:
- Active tasks con progress bars
- Live updates feed
- Duration tracking
- Sub-task support
- Status color coding

**Status Types**:
- ⏳ `pending` - In attesa
- 🔄 `running` - In esecuzione  
- ✅ `completed` - Completato
- ❌ `failed` - Fallito
- ⚠️ `warning` - Warning

### FilesPanel.tsx
**Pannello gestione file**

**Features**:
- File browser navigabile
- Content preview
- Language detection
- Size information
- Selection interface

**File Icons**:
- 📘 TypeScript (.ts)
- ⚛️ React (.tsx, .jsx)
- 🐍 Python (.py)
- ☕ Java (.java)
- 🌐 HTML (.html)
- 🎨 CSS (.css, .scss)
- 📋 JSON (.json)
- 📝 Markdown (.md)

### TodosPanel.tsx
**Pannello todo management**

**Features**:
- Visual progress tracking
- Priority indicators
- Category organization
- Status color coding
- Completion statistics

**Priority Icons**:
- 🔴 Critical
- 🟡 High  
- 🟢 Medium
- 🔵 Low

**Status Icons**:
- ✅ Completed
- 🔄 In Progress
- ❌ Failed
- ⏭️ Skipped
- ⏳ Pending

### AgentsPanel.tsx
**Pannello agenti background**

**Features**:
- Real-time agent monitoring
- Task progress tracking
- Agent type indicators
- Performance statistics
- Multi-agent coordination

**Agent Types**:
- 🤖 Standard agents
- 🐳 VM agents
- 📦 Container agents

### DiffPanel.tsx
**Pannello visualizzazione diff**

**Features**:
- Unified diff display
- Syntax highlighting
- Line numbering
- Statistics (additions/deletions)
- Context lines

**Diff Colors**:
- 🟢 Additions (+)
- 🔴 Deletions (-)
- ⚪ Context ( )

### ApprovalPanel.tsx
**Pannello approvazioni**

**Features**:
- Risk level indicators
- Action details
- Quick approval (Y/N/D)
- Context information
- Timeout tracking

**Risk Levels**:
- 🟢 Low
- 🟡 Medium
- 🔴 High
- 🚨 Critical

## 🔧 Command Panels

### HelpCommandPanel.tsx
**Sistema help interattivo**

**Features**:
- Category-based navigation
- Command search
- Usage examples
- Interactive command execution
- Breadcrumb navigation

**Categories**:
- 🤖 Model Management
- 🤖 Agent Management
- 📁 File Operations
- 🐳 VM Operations
- 📋 Planning & Todos
- 👁️ Vision & Images

### ModelCommandPanel.tsx
**Gestione modelli AI**

**Modes**:
1. **List Mode** - Visualizza modelli disponibili
2. **Configure Mode** - Configura API keys
3. **Switch Mode** - Cambia modello attivo

**Features**:
- Provider icons e colori
- API key validation
- Pricing information
- Connection testing
- Model statistics

### AgentCommandPanel.tsx
**Gestione agenti**

**Modes**:
1. **List Mode** - Lista agenti disponibili
2. **Configure Mode** - Configura task
3. **Execute Mode** - Esecuzione con tracking

**Features**:
- Agent type indicators
- Capability display
- Task configuration wizard
- Real-time execution tracking
- Result formatting

### FileCommandPanel.tsx
**Operazioni file**

**Operations**:
- 📖 Read - Lettura con preview
- ✏️ Write - Scrittura con editor
- 📝 Edit - Editing interattivo
- 📁 List - Browser navigabile
- 🔍 Search - Ricerca avanzata

**Features**:
- Syntax highlighting
- File type detection
- Size formatting
- Language icons
- Content preview

### VMCommandPanel.tsx
**Gestione VM containers**

**Operations**:
- 📋 List - Dashboard containers
- 🚀 Create - Wizard creazione
- 📊 Status - System monitoring
- ⚡ Exec - Command execution
- 🛑 Stop/Remove - Gestione lifecycle

**Features**:
- Container status indicators
- Resource monitoring
- Port management
- Command execution
- Log viewing

### PlanCommandPanel.tsx
**Sistema planning**

**Operations**:
- ✨ Create - Generazione piani
- 🚀 Execute - Esecuzione guidata
- ✅ Approve - Approval workflow
- 👁️ Show - Vista dettagliata

**Features**:
- Plan generation wizard
- Todo breakdown visual
- Progress tracking
- Approval workflow
- Execution monitoring

### VisionCommandPanel.tsx
**Vision e immagini**

**Operations**:
- 🔍 Analyze - Analisi AI immagini
- ✨ Generate - Generazione AI
- 📁 Discover - Discovery immagini

**Features**:
- Provider selection
- Custom prompts
- Image format support
- Generation tracking
- Analysis results

### ConfigCommandPanel.tsx
**Editor configurazione**

**Features**:
- Category-based organization
- Type-aware editing
- Value validation
- Real-time preview
- Backup/restore

**Config Types**:
- 📝 String values
- 🔢 Numeric values
- ☑️ Boolean toggles
- 📋 Object/JSON editing

### TerminalCommandPanel.tsx
**Comandi terminale**

**Operations**:
- ⚡ Run - Esecuzione comandi
- 📦 Install - Installazione pacchetti
- 🔄 Process Management
- 📜 Command History

**Features**:
- Live output streaming
- Exit code indicators
- Process monitoring
- Command history
- Package management

## 🎨 Theming System

### Theme Structure
```typescript
interface UITheme {
  primary: string;      // Colore primario
  secondary: string;    // Colore secondario
  success: string;      // Verde per successi
  warning: string;      // Giallo per warning
  error: string;        // Rosso per errori
  info: string;         // Grigio per info
  muted: string;        // Grigio scuro per testo secondario
  background: string;   // Sfondo
  foreground: string;   // Testo principale
  border: string;       // Bordi pannelli
}
```

### Temi Predefiniti

#### Default Theme
- Blu/cyan professionale
- Ottimizzato per leggibilità
- Compatibile con la maggior parte dei terminali

#### Dark Theme  
- Sfondo scuro
- Contrasto elevato
- Ottimizzato per sessioni lunghe

#### Cyberpunk Theme
- Neon colors (magenta/cyan/green)
- Stile futuristico
- Per sviluppatori che amano lo stile retro-futuristico

#### Retro Theme
- Green-on-black classico
- Stile terminale vintage
- Nostalgia anni '80/'90

## 📐 Layout System

### Layout Modes

#### Single Panel
- Un pannello a schermo intero
- Per terminali piccoli (<80 cols)
- Focus su singola operazione

#### Dual Panel
- Due pannelli affiancati
- Per terminali medi (80-120 cols)
- Workflow dual-pane

#### Triple Panel
- Tre pannelli ottimizzati
- Per terminali grandi (120-160 cols)
- Multi-tasking avanzato

#### Quad Panel
- Quattro pannelli in griglia 2x2
- Per terminali molto grandi (>160 cols)
- Dashboard completo

### Panel Priority
1. **Chat** (100) - Sempre visibile se attivo
2. **Stream** (95) - Output live prioritario
3. **Todos** (90) - Planning importante
4. **Status** (85) - Monitoring essenziale
5. **Files** (80) - File operations
6. **Diff** (75) - Code changes
7. **Agents** (70) - Background monitoring
8. **Approval** (65) - Quando necessario

## 🔌 Integration Points

### CLI Bridge
- **Event forwarding** bidirezionale
- **Method patching** trasparente
- **Fallback handling** automatico
- **State synchronization**

### Command Router
- **Command mapping** a componenti
- **Category organization**
- **Alias support**
- **Conditional routing**

### State Management
- **Centralized state** con hooks
- **Event-driven updates**
- **Real-time synchronization**
- **Performance optimization**

---

**Questo riferimento copre tutti i componenti del Terminal UI Kit. Ogni componente è progettato per essere modulare, estensibile e perfettamente integrato con il sistema CLI esistente.**