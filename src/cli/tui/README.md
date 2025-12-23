# NikCLI TUI - Architettura OpenTUI

## Panoramica

La TUI (Terminal User Interface) di NikCLI è un'interfaccia utente terminale moderna costruita su **OpenTUI** con un'architettura element-based modulare.

## Architettura

### Componenti Core

```
┌─────────────────────────────────────────┐
│              TUIApplication             │
│  - Main event loop                     │
│  - Coordinates all systems             │
└─────────────┬───────────────────────────┘
              │
        ┌─────┴─────┐
        │           │
┌───────▼────┐ ┌────▼────────┐
│  EventBus  │ │  TUIState   │
│ - Events   │ │ - Global    │
│ - Callbacks│ │   state     │
└──────┬─────┘ └────┬────────┘
       │            │
       └────┬───────┘
            │
    ┌───────┴────────┐
    │                │
┌───▼────┐      ┌────▼──────┐
│Element │      │ Navigation│
│Manager │      │  System   │
└──┬─────┘      └────┬──────┘
   │                 │
   └─────┬───────────┘
         │
    ┌────▼─────┐
    │  Layout  │
    │ Manager  │
    └──────────┘
```

### Sistema Elementi

#### BaseElement
Classe base astratta per tutti gli elementi UI:

```typescript
abstract class BaseElement {
  protected element: OpenTUIElement
  protected config: ElementConfig

  abstract mount(parent: OpenTUIElement): void
  abstract unmount(): void
  abstract update(data: any): void
  abstract handleInput(key: string): boolean
  abstract handleMouse(event: any): boolean

  show(), hide(), focus(), blur(), destroy()
}
```

#### ElementManager
Gestisce il ciclo di vita degli elementi:

```typescript
class ElementManager {
  registerElement(element: BaseElement): void
  unregisterElement(id: string): void
  getElement(id: string): BaseElement | undefined
  getAllElements(): BaseElement[]
  getFocusableElements(): BaseElement[]
  setFocusedElement(id: string | null): void
  focusNext(): void
  focusPrevious(): void
}
```

### Pannelli Specializzati

#### PanelElement
Base per tutti i pannelli con funzionalità:
- Titolo e barra del titolo
- Area contenuto scrollabile
- Pin/unpin
- Chiusura
- Split

#### StreamElement
Integra StreamttyService per streaming real-time:
- Buffering batch
- Auto-scroll
- Gestione errori
- Supporto per AI SDK events

#### DiffPanel
Visualizza diff di file:
- Confronto old vs new content
- Statistiche (additions/deletions)
- Navigazione (Tab per toggling)

#### TodoPanel
Gestione todos:
- CRUD operations
- Filtri (all/active/completed)
- Ordinamento (created/priority/text)
- Statistiche

#### ChatPanel
Interfaccia AI chat:
- Messaggi user/assistant/system
- Buffer input
- Modello e provider info
- Storia messaggi

## Layout System

### LayoutManager
Gestisce il layout dei pannelli:

```typescript
class LayoutManager {
  applyLayout(layoutId: string): void
  addPanel(panel: PanelLayout): void
  removePanel(panelId: string): void
  resizePanel(panelId: string, width: number, height: number): void
  splitPanel(panelId: string, direction: 'h' | 'v'): void
  autoLayout(panels: BaseElement[]): LayoutConfig
}
```

### Layout Modes
- **single**: Un pannello a schermo intero
- **dual**: Due pannelli side-by-side
- **triple**: Tre pannelli in colonna
- **quad**: Quattro pannelli in griglia 2x2
- **custom**: Layout personalizzato

## Navigation System

### Focus Management
Sistema di focus con history:

```typescript
class FocusManager {
  setFocus(elementId: string): boolean
  focusNext(): boolean
  focusPrevious(): boolean
  focusFirst(): boolean
  focusLast(): boolean
  clearFocus(): void
}
```

### Key Bindings

#### Global
- `ESC`, `q`, `Ctrl+C` - Exit
- `Tab` - Next element
- `h`, `?` - Show help

#### Panel Management
- `Ctrl+W` - Close panel
- `Ctrl+S` - Split panel
- `Ctrl+P` - Pin/unpin panel

#### Layout
- `1` - Single layout
- `2` - Dual layout
- `3` - Triple layout
- `4` - Quad layout
- `r` - Reset layout

#### Focus
- `↑↓←→` - Navigate panels
- `Ctrl+↑↓←→` - Resize panel
- `Ctrl+G` - Global focus mode
- `Ctrl+N/P` - Next/previous in history

## Integration Layer

### StreamttyAdapter
Bridge tra StreamttyService e OpenTUI:

```typescript
class StreamttyAdapter {
  createStreamElement(id: string, source: 'streamtty' | 'ai' | 'tool' | 'log'): StreamElement
  stream(content: string, type: ChunkType): void
  streamToElement(elementId: string, content: string, type: ChunkType): void
  clearStream(elementId?: string): void
}
```

### ThemeAdapter
Mappa ThemeService a OpenTUI styles:

```typescript
class ThemeAdapter {
  getTheme(): Theme
  setTheme(name: string): void
  toOpenTUIStyles(theme?: Theme): Record<string, any>
  getColor(purpose: keyof ThemeColors): string
  cycleToNextTheme(): void
}
```

## Usage

### Basic Usage

```typescript
import { TUIApplication } from './tui'

const app = new TUIApplication({
  title: 'My App',
  theme: 'dracula',
  defaultLayout: 'dual',
  enableMouse: true,
  enableKeyboard: true
})

await app.initialize()
await app.start()
```

### Custom Panel

```typescript
import { PanelElement, elementManager, eventBus } from './tui'

class MyPanel extends PanelElement {
  protected onUpdate(data: any): void {
    if (data.type === 'custom') {
      this.updateContent(data.content)
    }
  }

  protected onInput(key: string): boolean {
    if (key === 'enter') {
      eventBus.emit('my-panel:action', { id: this.getId() })
      return true
    }
    return false
  }
}

// Register and create
elementManager.registerElementType('my-panel', () => {
  return new MyPanel({ id: 'my-panel', type: 'panel' }, eventBus, theme)
})

const panel = elementManager.createElement('my-panel', { ... }, eventBus, theme)
elementManager.registerElement(panel)
```

### Stream Integration

```typescript
import { streamttyAdapter } from './tui'

// Get default stream
const stream = streamttyAdapter.getDefaultStreamElement()
stream.streamChunk('Hello World!', 'text')

// Create named stream
const aiStream = streamttyAdapter.createStreamElement('ai-stream', 'ai', 'AI Output')
aiStream.streamChunk('AI response...', 'text')

// Stream to specific element
streamttyAdapter.streamToElement('main-stream', 'Message', 'info')
```

## Development

### File Structure

```
src/cli/tui/
├── index.ts                    # Entry point
├── TUIApplication.ts           # Main application
│
├── core/                       # Core systems
│   ├── EventBus.ts            # Event system
│   ├── TUIState.ts            # Global state
│   ├── NavigationSystem.ts    # Keyboard/mouse nav
│   └── OpenTUIScreen.ts       # OpenTUI wrapper (TODO)
│
├── elements/                   # Element system
│   ├── base/                  # Base classes
│   │   ├── BaseElement.ts
│   │   ├── ElementManager.ts
│   │   └── FocusManager.ts
│   │
│   ├── specialized/           # Specialized elements
│   │   ├── PanelElement.ts
│   │   ├── StreamElement.ts
│   │   ├── StatusElement.ts
│   │   ├── TabElement.ts
│   │   ├── LayoutElement.ts
│   │   └── InputElement.ts
│   │
│   └── panels/                # Panel implementations
│       ├── DiffPanel.ts
│       ├── FilePanel.ts
│       ├── ListPanel.ts
│       ├── TodoPanel.ts
│       ├── AgentPanel.ts
│       ├── GitPanel.ts
│       ├── ChatPanel.ts
│       ├── LogPanel.ts
│       └── ProgressPanel.ts
│
├── integration/               # Integration layer
│   ├── StreamttyAdapter.ts
│   ├── ThemeAdapter.ts
│   ├── OutputAdapter.ts
│   └── PanelAdapter.ts
│
├── layout/                     # Layout system
│   ├── LayoutManager.ts
│   ├── SplitManager.ts
│   └── ResizeManager.ts
│
└── utils/                      # Utilities
    ├── OpenTUIHelpers.ts
    ├── KeyBindings.ts
    └── MouseHandlers.ts
```

### Testing

```bash
# Run TUI test
npx ts-node src/cli/tui/test-tui.ts
```

### Best Practices

1. **Element Creation**
   - Extend `BaseElement` for new components
   - Register element types in `ElementManager`
   - Use `eventBus` for communication

2. **State Management**
   - Use `tuiState` for global state
   - Emit events for state changes
   - Listen to events for updates

3. **Event Handling**
   - Use `eventBus.on()` for listening
   - Use `eventBus.emit()` for triggering
   - Clean up subscriptions on destroy

4. **Performance**
   - Use batched updates for streams
   - Limit buffer sizes
   - Clean up resources on destroy

5. **Error Handling**
   - Wrap event handlers in try-catch
   - Emit error events
   - Provide fallback behavior

## Migration from Blessed.js

### Changes

| Blessed.js | OpenTUI |
|-----------|---------|
| `widget` | `element` |
| `screen` | `OpenTUIElement` |
| `box` | `BaseElement` |
| `list` | `PanelElement` |
| Manual rendering | Reconciler pattern |

### API Mapping

```typescript
// Blessed.js
const box = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  content: 'Hello'
})

// OpenTUI
class HelloElement extends BaseElement {
  protected createElement(): OpenTUIElement {
    return {
      // OpenTUI element
    }
  }
}
```

## Future Enhancements

- [ ] True OpenTUI integration (replace mocks)
- [ ] Mouse support implementation
- [ ] Custom widget development guide
- [ ] Performance benchmarking
- [ ] Plugin system
- [ ] Animation support
- [ ] Internationalization
- [ ] Accessibility features
- [ ] Multi-tab support
- [ ] Layout templates

## Resources

- [OpenTUI Documentation](https://github.com/sst/opentui)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Terminal Capabilities](https://terminalguide.namepad.de/)

## License

MIT
