import blessed, { Widgets } from 'blessed';

// Centralized key mapping for consistent behavior
export const KEY = {
  up: 'up',
  down: 'down', 
  left: 'left',
  right: 'right',
  enter: 'enter',
  esc: 'escape',
  backspace: 'backspace',
  del: 'delete',
  pageUp: 'pageup',
  pageDown: 'pagedown',
  ctrlC: 'C-c',
  tab: 'tab',
  space: 'space',
  // Advanced navigation
  home: 'home',
  end: 'end',
  ctrlUp: 'C-up',
  ctrlDown: 'C-down',
  ctrlLeft: 'C-left',
  ctrlRight: 'C-right',
  ctrlHome: 'C-home',
  ctrlEnd: 'C-end',
  altUp: 'M-up',
  altDown: 'M-down',
  shiftTab: 'S-tab',
} as const;

// Safe render with 60fps throttling
let raf: NodeJS.Timeout | null = null;
export function safeRender(screen: Widgets.Screen) {
  if (raf) return;
  raf = setTimeout(() => { 
    screen.render(); 
    raf = null; 
  }, 16); // ~60fps
}

// Resize debouncing for stable layouts
let resizeTimer: NodeJS.Timeout | null = null;
export function debouncedResize(screen: Widgets.Screen, callback?: () => void) {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Recalculate layout for streaming content
    const minWidth = (screen as any).minWidth || 0;
    const minHeight = (screen as any).minHeight || 0;
    
    if (screen.width && typeof screen.width === 'number' && screen.width < minWidth) {
      (screen as any).minWidth = Math.max(minWidth, screen.width);
    }
    if (screen.height && typeof screen.height === 'number' && screen.height < minHeight) {
      (screen as any).minHeight = Math.max(minHeight, screen.height);
    }
    
    callback?.();
    safeRender(screen);
    resizeTimer = null;
  }, 120); // 120ms debounce
}

// Navigation binding utility for consistent behavior across components
export function bindNav(node: any, opts: {
  onUp?: () => void;
  onDown?: () => void;
  onHome?: () => void;
  onEnd?: () => void;
  onCtrlHome?: () => void;
  onCtrlEnd?: () => void;
  onAltUp?: () => void;
  onAltDown?: () => void;
  onShiftTab?: () => void;
}) {
  if (opts.onUp && node.key) node.key([KEY.up], opts.onUp);
  if (opts.onDown && node.key) node.key([KEY.down], opts.onDown);
  if (opts.onHome && node.key) node.key([KEY.home], opts.onHome);
  if (opts.onEnd && node.key) node.key([KEY.end], opts.onEnd);
  if (opts.onCtrlHome && node.key) node.key([KEY.ctrlHome], opts.onCtrlHome);
  if (opts.onCtrlEnd && node.key) node.key([KEY.ctrlEnd], opts.onCtrlEnd);
  if (opts.onAltUp && node.key) node.key([KEY.altUp], opts.onAltUp);
  if (opts.onAltDown && node.key) node.key([KEY.altDown], opts.onAltDown);
  if (opts.onShiftTab && node.key) node.key([KEY.shiftTab], opts.onShiftTab);
}

export type TerminalContext = {
  screen: Widgets.Screen;
  render: () => void;
};

export function useTerminal(): TerminalContext {
  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    fullUnicode: true,
  });
  
  // Global key handlers
  screen.key([KEY.ctrlC], () => process.exit(0));
  
  return { 
    screen, 
    render: () => safeRender(screen)
  };
}

// Selection history utility for List/Table/Tree components
export class SelectionManager {
  private history = new Map<string, number>();
  private currentId: string | null = null;

  setSelection(id: string, index: number) {
    this.history.set(id, index);
    this.currentId = id;
  }

  getSelection(id: string): number | undefined {
    return this.history.get(id);
  }

  // Try to restore selection by ID, fallback to clamped index
  restoreSelection(id: string, items: any[], fallbackIndex: number = 0): number {
    const savedIndex = this.history.get(id);
    if (savedIndex !== undefined && savedIndex < items.length) {
      return savedIndex;
    }
    return Math.min(fallbackIndex, Math.max(0, items.length - 1));
  }

  clearHistory() {
    this.history.clear();
    this.currentId = null;
  }
}

// Mount screen utility for consistent setup
export function mountScreen(blessed: typeof import('blessed')) {
  const screen = blessed.screen({ 
    smartCSR: true, 
    dockBorders: true,
    fullUnicode: true,
  });
  
  const render = () => safeRender(screen);
  
  screen.key([KEY.ctrlC], () => process.exit(0));
  
  return { screen, render };
}


