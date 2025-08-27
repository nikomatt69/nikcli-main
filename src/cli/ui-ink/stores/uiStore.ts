import { create } from 'zustand';

export type PanelType = 'diff' | 'file' | 'list' | 'status' | 'chat' | 'todos' | 'agents';

export interface StructuredPanelData {
  id: string;
  title: string;
  content: string;
  type: PanelType;
  filePath?: string;
  language?: string;
  visible: boolean;
  borderColor?: string;
}

export interface LiveUpdate {
  type: 'status' | 'progress' | 'log' | 'error' | 'warning' | 'info';
  content: string;
  timestamp: Date;
  source?: string;
}

type LayoutMode = 'single' | 'dual' | 'triple';

interface UIState {
  isInteractive: boolean;
  layoutMode: LayoutMode;
  panels: Record<string, StructuredPanelData>;
  liveUpdates: LiveUpdate[];
  startInteractive: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  upsertPanel: (panel: StructuredPanelData) => void;
  hidePanel: (id: string) => void;
  addLiveUpdate: (update: Omit<LiveUpdate, 'timestamp'>) => void;
  clearPanels: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isInteractive: false,
  layoutMode: 'single',
  panels: {},
  liveUpdates: [],
  startInteractive: () => set({ isInteractive: true }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  upsertPanel: (panel) => set(state => ({ panels: { ...state.panels, [panel.id]: panel } })),
  hidePanel: (id) => set(state => ({ panels: { ...state.panels, [id]: state.panels[id] ? { ...state.panels[id], visible: false } : { id, title: '', content: '', type: 'list', visible: false } } })),
  addLiveUpdate: (update) => set(state => ({ liveUpdates: [...state.liveUpdates.slice(-49), { ...update, timestamp: new Date() }] })),
  clearPanels: () => set({ panels: {}, layoutMode: 'single' })
}));

