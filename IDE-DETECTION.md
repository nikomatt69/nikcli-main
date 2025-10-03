# IDE Detection System

## Problema Risolto

NikCLI non rilevava correttamente quando era in esecuzione dentro VS Code/Cursor, mostrando:
```
Editor: Terminal/CLI (no GUI IDE open)
```

Anche se le variabili d'ambiente VS Code erano presenti:
```bash
TERM_PROGRAM=vscode
VSCODE_GIT_ASKPASS_MAIN=/Applications/Cursor.app/...
```

## Soluzione Implementata

### 1. IDE Detector (`src/cli/core/ide-detector.ts`)

Nuovo modulo che rileva automaticamente l'IDE basandosi su variabili d'ambiente:

```typescript
export class IDEDetector {
  static detect(): IDECapabilities {
    // VS Code / Cursor detection
    if (process.env.TERM_PROGRAM === 'vscode' || process.env.VSCODE_INJECTION) {
      const isCursor = process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('Cursor.app');

      return {
        name: isCursor ? 'cursor' : 'vscode',
        hasGUI: true,
        hasFileTree: true,
        hasTerminalIntegration: true,
        hasDebugger: true,
        hasExtensionSupport: true,
        version: process.env.TERM_PROGRAM_VERSION
      };
    }

    // JetBrains, Vim, Terminal...
  }
}
```

**IDE Supportati:**
- ✅ VS Code
- ✅ Cursor
- ✅ JetBrains (IntelliJ, WebStorm, etc.)
- ✅ Vim/Neovim
- ✅ Terminal generico

### 2. IDE-Aware Formatter (`src/cli/ui/ide-aware-formatter.ts`)

Formatta l'output in base alle capacità dell'IDE rilevato:

```typescript
export class IDEAwareFormatter {
  static formatEnvironmentContext(): string {
    const caps = ideDetector.detect();

    // Mostra informazioni dettagliate sull'IDE
    lines.push(chalk.cyan(`  * Editor: ${caps.name.toUpperCase()} (GUI IDE detected)`));

    if (caps.hasGUI) {
      lines.push(chalk.green('  * GUI Features: Available'));
      lines.push(chalk.gray('    - File tree navigation'));
      lines.push(chalk.gray('    - Interactive panels'));
      lines.push(chalk.gray('    - Webview support'));
    }
  }
}
```

### 3. Integrazione in NikCLI (`src/cli/index.ts`)

#### Startup Info Migliorato

```typescript
static displayStartupInfo() {
  // Display IDE-aware environment context
  console.log('\n' + ideAwareFormatter.formatEnvironmentContext() + '\n')

  // Show IDE-specific suggestions
  const suggestions = ideAwareFormatter.getSuggestions()
  if (suggestions.length > 0) {
    console.log(chalk.bold('💡 IDE-Specific Tips:'))
    suggestions.forEach(suggestion => console.log('  ' + suggestion))
  }
}
```

#### Prompt Adattivo

```typescript
private showPrompt(): void {
  // Use IDE-aware formatter for prompt
  const idePrompt = ideAwareFormatter.createPrompt({
    workingDir: this.context.workingDirectory,
    mode: this.context.planMode ? 'plan' : undefined,
    agentCount: agents > 0 ? agents : undefined
  })

  const prompt = ideDetector.hasGUI() ?
    idePrompt + `${modeStr}─[${contextStr}]─[${statusBadge}]─[${modelBadge}]\n└─❯ ` :
    `\n┌─[🎛️:${chalk.green(dir)}${modeStr}]─[${contextStr}]─[${statusBadge}]─[${modelBadge}]\n└─❯ `
}
```

## Output Nuovo

### Prima (non rilevava VS Code):
```
Editor: Terminal/CLI (no GUI IDE open)
```

### Dopo (rileva correttamente VS Code):
```
🖥️  IDE & Runtime Context
════════════════════════════════════════════════════════════
  * Editor: VSCODE (GUI IDE detected)
  * Version: 1.7.29
  * GUI Features: Available
    - File tree navigation
    - Interactive panels
    - Webview support
  * NikCLI Extension: Available
    - Use extension for config management
    - Launch background agents from GUI
  * Recommended UI Mode: GUI

💡 IDE-Specific Tips:
  💡 Install NikCLI VS Code Extension for enhanced features
  💡 Use Command Palette (Ctrl/Cmd+Shift+P) → "NikCLI: Open Config"
  💡 Launch background agents from the NikCLI sidebar panel
  💡 View live job logs in the agent manager webview
```

## Funzionalità Abilitate

### VS Code Detection
- ✅ Mostra "VSCODE (GUI IDE detected)" invece di "Terminal/CLI"
- ✅ Suggerisce l'uso dell'estensione VS Code
- ✅ Indica disponibilità webview e panel
- ✅ Prompt personalizzato con icona VS Code

### Cursor Detection
- ✅ Riconosce Cursor separatamente da VS Code
- ✅ Stesso set di funzionalità GUI

### JetBrains Detection
- ✅ Rileva IntelliJ, WebStorm, PyCharm
- ✅ Suggerisce integrazione terminale

### Vim Detection
- ✅ Rileva Vim/Neovim
- ✅ Suggerisce vim-mode in chat

## API Pubblica

```typescript
// Check IDE type
ideDetector.isVSCode() // true in VS Code/Cursor
ideDetector.hasGUI() // true if GUI features available
ideDetector.detect() // Full IDECapabilities object

// Get formatting preferences
ideDetector.getFormattingPreferences() // { supportsMarkdown, preferredWidth, ... }

// Get recommended UI mode
ideDetector.getRecommendedUIMode() // 'gui' | 'tui' | 'cli'

// Format output based on IDE
ideAwareFormatter.formatMessage('Success!', 'success')
ideAwareFormatter.createStatusIndicator() // '$(code) VSCODE'
ideAwareFormatter.getSuggestions() // Array of IDE-specific tips
```

## Variabili d'Ambiente Rilevate

### VS Code
```bash
TERM_PROGRAM=vscode
TERM_PROGRAM_VERSION=1.7.29
VSCODE_INJECTION=1
VSCODE_GIT_ASKPASS_MAIN=...
VSCODE_GIT_IPC_HANDLE=...
```

### Cursor
```bash
TERM_PROGRAM=vscode
VSCODE_GIT_ASKPASS_MAIN=/Applications/Cursor.app/...
```

### JetBrains
```bash
TERMINAL_EMULATOR=JetBrains-...
TERM_PROGRAM=jetbrains-...
```

### Vim
```bash
VIM=/usr/bin/vim
NVIM=/usr/bin/nvim
```

## Testing

```bash
# Test in VS Code
cd /path/to/nikcli
npm start

# Should show: Editor: VSCODE (GUI IDE detected)

# Test in terminal normale
cd /path/to/nikcli
npm start

# Should show: Editor: Terminal/CLI (no GUI IDE open)
```

## Estensione VS Code Integration

Con l'estensione VS Code installata (`nikcli-vscode-extension`), il sistema ora:

1. **Rileva VS Code** correttamente
2. **Suggerisce comandi specifici** dell'estensione
3. **Mostra funzionalità disponibili** (webview, panels, config editor)
4. **Indica UI mode consigliato** (GUI invece di CLI)

## Benefici

✅ **Rilevamento Automatico** - Nessuna configurazione richiesta
✅ **Suggerimenti Contestuali** - Tips specifici per ogni IDE
✅ **UI Adattiva** - Prompt e output ottimizzati per l'IDE
✅ **Estensibilità** - Facile aggiungere supporto per nuovi IDE
✅ **Backward Compatible** - Funziona ancora in terminal puro

## File Modificati

- **Creati:**
  - `src/cli/core/ide-detector.ts` - Logica di rilevamento IDE
  - `src/cli/ui/ide-aware-formatter.ts` - Formatting adattivo

- **Modificati:**
  - `src/cli/index.ts` - Integrazione IDE detection in startup e prompt

## Prossimi Passi

1. ✅ Sistema di rilevamento IDE implementato
2. ⏳ Integrazione con estensione VS Code per comunicazione bidirezionale
3. ⏳ Aggiunta supporto per altri IDE (Eclipse, Atom, etc.)
4. ⏳ Telemetria IDE usage per miglioramenti futuri
