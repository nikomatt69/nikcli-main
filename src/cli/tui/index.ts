/**
 * TUI Module Entry Point
 * Main entry point for NikCLI TUI functionality
 */

import { TUIApplication, tuiApplication } from './TUIApplication'
import { eventBus } from './core/EventBus'
import { tuiState, TUIStateManager } from './core/TUIState'
import { navigationSystem } from './core/NavigationSystem'
import { layoutManager } from './layout/LayoutManager'
import { BaseElement, type ElementConfig, type OpenTUIElement } from './elements/base/BaseElement'
import { ElementManager, elementManager } from './elements/base/ElementManager'
import { FocusManager, focusManager } from './elements/base/FocusManager'
import { PanelElement, type PanelElementConfig } from './elements/specialized/PanelElement'
import { StreamElement, type StreamElementConfig } from './elements/specialized/StreamElement'
import { DiffPanel, type DiffPanelConfig } from './elements/panels/DiffPanel'
import { TodoPanel, type TodoPanelConfig, type TodoItem } from './elements/panels/TodoPanel'
import { ChatPanel, type ChatPanelConfig, type ChatMessage } from './elements/panels/ChatPanel'
import { streamttyAdapter } from './integration/StreamttyAdapter'
import { themeAdapter } from './integration/ThemeAdapter'

export { TUIApplication, tuiApplication }
export { eventBus }
export { tuiState, TUIStateManager }
export { navigationSystem }
export { layoutManager }

export { BaseElement, type ElementConfig, type OpenTUIElement }
export { ElementManager, elementManager }
export { FocusManager, focusManager }

export { PanelElement, type PanelElementConfig }
export { StreamElement, type StreamElementConfig }

export { DiffPanel, type DiffPanelConfig }
export { TodoPanel, type TodoPanelConfig, type TodoItem }
export { ChatPanel, type ChatPanelConfig, type ChatMessage }

export { streamttyAdapter }
export { themeAdapter }

/**
 * Start TUI application
 */
export async function startTUI(config?: any): Promise<void> {
  const { TUIApplication } = await import('./TUIApplication')
  const app = new TUIApplication(config)
  await app.initialize()
  await app.start()
}

/**
 * Check if TUI is supported in current environment
 */
export function isTUISupported(): boolean {
  return Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    process.env.TERM &&
    process.env.TERM !== 'dumb'
  )
}

/**
 * Get TUI capabilities
 */
export function getTUICapabilities(): {
  mouse: boolean
  keyboard: boolean
  colors: boolean
  unicode: boolean
} {
  return {
    mouse: true, // TODO: Detect mouse support
    keyboard: true, // TODO: Detect keyboard support
    colors: true, // TODO: Detect color support
    unicode: true // TODO: Detect unicode support
  }
}

/**
 * Default export
 */
export default {
  startTUI,
  isTUISupported,
  getTUICapabilities,
  TUIApplication,
  tuiApplication,
  eventBus,
  tuiState,
  navigationSystem,
  layoutManager,
  elementManager,
  focusManager,
  streamttyAdapter,
  themeAdapter
}
