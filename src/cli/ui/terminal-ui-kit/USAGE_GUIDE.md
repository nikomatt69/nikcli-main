# Terminal UI Kit - Guida Completa all'Utilizzo

## 🎯 Introduzione

Il **Terminal UI Kit** trasforma il tuo NikCLI in un'esperienza terminale moderna con componenti React/Ink interattivi. Ogni comando ora ha una UI dedicata che rende l'utilizzo più intuitivo e produttivo.

## 🚀 Quick Start

### 1. Attivazione

```bash
# Avvia NikCLI normalmente
npm start

# Abilita Terminal UI Kit
/ui-kit enable

# Ora tutti i comandi supportati useranno l'UI interattiva!
```

### 2. Primo Utilizzo

```bash
# Prova il sistema help interattivo
/help

# Gestisci modelli AI con UI
/models

# Esplora agenti disponibili
/agents

# Browser file interattivo
/ls
```

## 🎛️ Pannelli Principali

### 💬 Chat Panel
**Visualizza**: Conversazioni in tempo reale
- Messaggi utente e AI con timestamp
- Indicatori di streaming
- Syntax highlighting per codice
- Scroll automatico

### 📊 Status Panel  
**Visualizza**: Stato operazioni
- Indicatori progress per task attivi
- Live updates con source tracking
- Statistiche completamento
- Durata operazioni

### 📁 Files Panel
**Visualizza**: File e contenuti
- Browser file navigabile
- Preview contenuti con syntax highlighting
- Informazioni file (dimensione, linguaggio)
- Selezione multipla

### 📋 Todos Panel
**Visualizza**: Todo lists e planning
- Progress tracking visuale
- Categorizzazione per priorità
- Statistiche completamento
- Status colorati

### 🤖 Agents Panel
**Visualizza**: Agenti background
- Status agenti in tempo reale
- Progress task correnti
- Durata esecuzione
- Gestione agenti multipli

### 📝 Diff Panel
**Visualizza**: Modifiche file
- Diff unified con syntax highlighting
- Statistiche modifiche
- Navigazione per sezioni
- Preview prima/dopo

### ✅ Approval Panel
**Visualizza**: Approvazioni pending
- Risk assessment visuale
- Dettagli operazioni
- Approvazione rapida (Y/N)
- Context informazioni

## 🔧 Comandi con UI Dedicata

### Model Management

#### `/model` - ModelCommandPanel
- **Lista modelli** con provider icons
- **Selezione interattiva** con arrow keys
- **Configurazione API keys** guidata
- **Pricing information** per ogni modello
- **Status indicators** (configured/missing keys)

```bash
/model                    # Lista e selezione modelli
/model claude-3-5-sonnet  # Switch diretto
/models                   # Vista completa modelli
```

#### `/set-key` - ModelCommandPanel  
- **Input sicuro** con masking
- **Validazione API key** in tempo reale
- **Provider detection** automatico
- **Test connection** dopo configurazione

```bash
/set-key claude-3-5-sonnet sk-ant-...
```

### Agent Management

#### `/agents` - AgentCommandPanel
- **Lista agenti** con capabilities
- **Status indicators** (available/busy/error)
- **Type icons** (standard/VM/container)
- **Specialization info**

#### `/agent` - AgentCommandPanel
- **Selezione agente** interattiva
- **Task configuration** guidata
- **Execution tracking** in tempo reale
- **Result display** formattato

```bash
/agent                           # Selezione guidata
/agent coding-agent "analyze X"  # Esecuzione diretta
```

#### `/auto` - AgentCommandPanel
- **Autonomous execution** con UI
- **Multi-agent coordination** visuale
- **Progress tracking** dettagliato
- **Result aggregation**

```bash
/auto "Create a React todo app"
```

#### `/create-agent` - AgentCommandPanel
- **Wizard creazione** step-by-step
- **Template selection** (standard/VM/container)
- **Capability configuration**
- **Blueprint generation**

```bash
/create-agent react-expert "React optimization specialist"
```

### File Operations

#### `/read` - FileCommandPanel
- **File browser** con preview
- **Syntax highlighting** automatico
- **File info** (size, language, modified)
- **Content search** integrato

```bash
/read                    # Browser interattivo
/read src/index.ts      # Lettura diretta
```

#### `/write` - FileCommandPanel
- **Editor integrato** con preview
- **Diff preview** prima di salvare
- **Backup automatico**
- **Validation** contenuto

```bash
/write                           # Editor guidato
/write newfile.ts "content"     # Scrittura diretta
```

#### `/ls` - FileCommandPanel
- **Directory browser** navigabile
- **File type icons**
- **Size information**
- **Quick actions** (read/edit/delete)

```bash
/ls              # Current directory
/ls src/         # Specific directory
```

#### `/search` - FileCommandPanel
- **Search interface** con filtri
- **Results highlighting**
- **File type filtering**
- **Web search integration**

```bash
/search "function"              # File search
/search --web "React hooks"     # Web search
```

### VM Operations

#### `/vm-list` - VMCommandPanel
- **Container dashboard** con status
- **Resource usage** indicators
- **Port mappings** e connections
- **Quick actions** (stop/remove/connect)

#### `/vm-create` - VMCommandPanel
- **Repository URL** validation
- **Configuration wizard**
- **Progress tracking** creazione
- **VS Code integration** setup

```bash
/vm-create https://github.com/user/repo.git
```

#### `/vm-status` - VMCommandPanel
- **System status** OS-like
- **Resource monitoring** (CPU/Memory/Disk)
- **Network information**
- **Health indicators**

#### `/vm-exec` - VMCommandPanel
- **Command execution** in VM
- **Output streaming** live
- **Command history**
- **Multi-VM support**

```bash
/vm-exec "npm install"
/vm-exec "git status"
```

### Planning & Todos

#### `/plan` - PlanCommandPanel
- **Plan generation** wizard
- **Execution tracking** visuale
- **Todo breakdown** interattivo
- **Progress analytics**

```bash
/plan create "Build a website"   # Wizard creazione
/plan execute                    # Esecuzione guidata
/plan show                       # Vista dettagliata
```

#### `/todo` - PlanCommandPanel
- **Todo management** completo
- **Status tracking** colorato
- **Priority indicators**
- **Category organization**

```bash
/todo list      # Lista todos
/todo show      # Vista dettagliata
```

### Vision & Images

#### `/images` - VisionCommandPanel
- **Image discovery** nel progetto
- **Format detection** automatico
- **Size information**
- **Quick analysis**

#### `/analyze-image` - VisionCommandPanel
- **Provider selection** (Claude/GPT-4/Gemini)
- **Custom prompts** configurabili
- **Analysis results** formattati
- **Image metadata** display

```bash
/analyze-image screenshot.png
/analyze-image --provider claude --prompt "Describe UI elements"
```

#### `/generate-image` - VisionCommandPanel
- **Prompt optimization** suggestions
- **Model selection** (DALL-E 3/2)
- **Size configuration**
- **Generation tracking**

```bash
/generate-image "a beautiful sunset over mountains"
```

### Configuration

#### `/config` - ConfigCommandPanel
- **Settings browser** categorizzato
- **Type-aware editing** (string/number/boolean/object)
- **Validation** in tempo reale
- **Backup/restore** automatico

```bash
/config         # Browser configurazione
```

#### `/debug` - ConfigCommandPanel
- **API key diagnostics**
- **Connection testing**
- **Environment validation**
- **Troubleshooting** guidato

### Terminal Operations

#### `/run` - TerminalCommandPanel
- **Command execution** con output live
- **Command history** navigabile
- **Process tracking**
- **Exit code** indicators

```bash
/run "npm test"
/run "git status"
```

#### `/install` - TerminalCommandPanel
- **Package installation** con progress
- **Dependency resolution** visuale
- **Error handling** migliorato
- **Manager selection** (npm/yarn/pnpm)

```bash
/install react typescript
/install --dev jest
```

## ⌨️ Shortcuts e Tips

### Global Shortcuts
- **Esc**: Interrompe operazione corrente
- **Ctrl+C**: Esce dall'applicazione  
- **Ctrl+1**: Toggle Chat Panel
- **Ctrl+2**: Toggle Status Panel
- **Ctrl+3**: Toggle Files Panel
- **Ctrl+4**: Toggle Todos Panel
- **Ctrl+5**: Toggle Agents Panel

### Command Shortcuts
- **Y/N**: Approvazione rapida
- **D**: Toggle dettagli
- **R**: Reload/Refresh
- **Q**: Quit panel
- **Arrow Keys**: Navigazione
- **Enter**: Selezione/Conferma
- **Tab**: Auto-completamento

### Pro Tips
1. **Multi-panel workflow**: Tieni aperti Chat + Status + Files per development
2. **Quick toggle**: Usa `/toggle-ui` per switch rapido console/UI
3. **Command palette**: `/help` per navigazione comandi guidata
4. **Agent workflow**: Usa `/agents` → select → configure → execute
5. **File workflow**: Usa `/ls` → select → `/read` → edit → save

## 🎨 Personalizzazione

### Temi
```bash
# Nel codice, modifica utils/theme.ts per temi personalizzati
const customTheme = createCustomTheme({
  primary: '#FF6B6B',
  secondary: '#4ECDC4', 
  success: '#45B7D1',
});
```

### Layout
```bash
# Configura layout preferiti in utils/layout.ts
const preferredPanels = ['chat', 'status', 'todos', 'agents'];
```

## 🔧 Troubleshooting

### UI Non Si Attiva
```bash
/ui-kit status          # Verifica stato
/debug                  # Check configurazione
npm run test:ui-kit     # Test completo
```

### Fallback alla Console
- Il sistema fallback automaticamente se ci sono errori
- Tutti i comandi continuano a funzionare normalmente
- Usa `/ui-kit enable` per riattivare

### Performance
- UI Kit è ottimizzato per terminali moderni
- Layout si adatta automaticamente a dimensioni schermo
- Rendering efficiente con React/Ink

---

**🎉 Il tuo CLI è ora dotato di un'interfaccia terminale moderna e professionale!**

Ogni comando è ora un'esperienza interattiva che mantiene tutta la potenza del CLI originale aggiungendo usabilità e produttività superiori.