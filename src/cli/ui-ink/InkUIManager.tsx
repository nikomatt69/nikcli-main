import React, { ReactNode, useEffect } from 'react';
import { render, Box, Text } from 'ink';
import { create } from 'zustand';

// Types
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

  // actions
  startInteractive: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  upsertPanel: (panel: StructuredPanelData) => void;
  hidePanel: (id: string) => void;
  addLiveUpdate: (update: Omit<LiveUpdate, 'timestamp'>) => void;
  clearPanels: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  isInteractive: false,
  layoutMode: 'single',
  panels: {},
  liveUpdates: [],

  startInteractive: () => set({ isInteractive: true }),
  setLayoutMode: (mode) => set({ layoutMode: mode }),
  upsertPanel: (panel) => set(state => ({ panels: { ...state.panels, [panel.id]: panel } })),
  hidePanel: (id) => set(state => ({ panels: { ...state.panels, [id]: { ...(state.panels[id] || { id, title: '', content: '', type: 'list', visible: false }), visible: false } } })),
  addLiveUpdate: (update) => set(state => ({
    liveUpdates: [...state.liveUpdates.slice(-49), { ...update, timestamp: new Date() }]
  })),
  clearPanels: () => set({ panels: {}, layoutMode: 'single' })
}));

// Components
const StructuredPanel: React.FC<{ panel: StructuredPanelData }> = ({ panel }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={panel.borderColor as any || 'white'}
      paddingX={1}
      paddingY={0}
      marginRight={1}
      width={process.stdout.columns ? Math.min(process.stdout.columns - 4, 120) : undefined}
    >
      <Text>{panel.title}</Text>
      <Text>{panel.content}</Text>
    </Box>
  );
};

const PanelManager: React.FC = () => {
  const panels = useUIStore(s => s.panels);
  const layoutMode = useUIStore(s => s.layoutMode);

  const visiblePanels = Object.values(panels).filter(p => p.visible);

  useEffect(() => {
    if (visiblePanels.length <= 1) {
      useUIStore.getState().setLayoutMode('single');
    } else if (visiblePanels.length === 2) {
      useUIStore.getState().setLayoutMode('dual');
    } else {
      useUIStore.getState().setLayoutMode('triple');
    }
  }, [JSON.stringify(visiblePanels.map(p => p.id))]);

  const direction = layoutMode === 'single' ? 'column' : 'row';

  return (
    <Box flexDirection={direction as any}>
      {visiblePanels.slice(0, layoutMode === 'single' ? 1 : layoutMode === 'dual' ? 2 : 3).map(p => (
        <StructuredPanel key={p.id} panel={p} />
      ))}
    </Box>
  );
};

const LiveUpdates: React.FC = () => {
  const updates = useUIStore(s => s.liveUpdates);
  if (updates.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {updates.slice(-10).map((u, i) => (
        <Text key={i}>
          {u.type === 'error' ? '❌' : u.type === 'warning' ? '⚠️' : u.type === 'log' ? '✅' : u.type === 'progress' ? '📊' : '📝'}{' '}
          {u.content}
          {u.source ? `  [${u.source}]` : ''}
        </Text>
      ))}
    </Box>
  );
};

const MainLayout: React.FC = () => {
  return (
    <Box flexDirection="column">
      <PanelManager />
      <LiveUpdates />
    </Box>
  );
};

class InkUIManagerImpl {
  private app: { rerender: (node: ReactNode) => void; unmount: () => void } | null = null;

  public start(): void {
    if (this.app) return;
    useUIStore.getState().startInteractive();
    this.app = render(<MainLayout />);
  }

  public stop(): void {
    if (this.app) {
      this.app.unmount();
      this.app = null;
    }
  }

  public logInfo(message: string, details?: string): void {
    useUIStore.getState().addLiveUpdate({ type: 'info', content: message, source: details });
  }
  public logSuccess(message: string, details?: string): void {
    useUIStore.getState().addLiveUpdate({ type: 'log', content: message, source: details });
  }
  public logError(message: string, details?: string): void {
    useUIStore.getState().addLiveUpdate({ type: 'error', content: message, source: details });
  }

  public showFileContent(filePath: string, content: string): void {
    useUIStore.getState().upsertPanel({
      id: 'file',
      title: `📄 ${require('path').basename(filePath)}`,
      content,
      type: 'file',
      filePath,
      visible: true,
      borderColor: 'green'
    });
  }

  public showFileList(files: string[], title: string = '📁 Files'): void {
    const listContent = files.map((f) => `• ${f}`).join('\n');
    useUIStore.getState().upsertPanel({
      id: 'list',
      title,
      content: listContent,
      type: 'list',
      visible: true,
      borderColor: 'magenta'
    });
  }

  public showFileDiff(filePath: string, oldContent: string, newContent: string): void {
    // Simple inline diff view for now
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const max = Math.max(oldLines.length, newLines.length);
    const lines: string[] = [];
    for (let i = 0; i < max; i++) {
      const a = oldLines[i] ?? '';
      const b = newLines[i] ?? '';
      if (a !== b) {
        if (a) lines.push(`-${a}`);
        if (b) lines.push(`+${b}`);
      } else if (a) {
        lines.push(` ${a}`);
      }
    }
    useUIStore.getState().upsertPanel({
      id: 'diff',
      title: `📝 ${require('path').basename(filePath)}`,
      content: lines.join('\n'),
      type: 'diff',
      filePath,
      visible: true,
      borderColor: 'yellow'
    });
  }

  public showTodos(items: Array<{ content?: string; title?: string; status?: string; progress?: number }>, title: string = 'Update Todos') {
    const lines = items.map(t => {
      const text = (t.title || t.content || '').trim();
      if (!text) return '';
      const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
      const prog = t.progress != null ? ` [${Math.max(0, Math.min(100, t.progress)).toString().padStart(3, ' ')}%]` : '';
      return `${icon} ${text}${prog}`;
    }).filter(Boolean).join('\n');

    useUIStore.getState().upsertPanel({
      id: 'todos',
      title: `📋 ${title}`,
      content: lines,
      type: 'todos',
      visible: true,
      borderColor: 'cyan'
    });
  }

  public updateBackgroundAgent(agent: { id: string; name: string; status: string; progress?: number; currentTask?: string; startTime?: Date }) {
    // Render a basic agents panel by aggregating into text
    const existing = useUIStore.getState().panels['agents']?.content ?? '';
    const line = `${agent.status === 'working' ? '🔄' : agent.status === 'completed' ? '✅' : agent.status === 'error' ? '❌' : '⏸️'} ${agent.name}${agent.progress != null ? ` ${agent.progress}%` : ''}${agent.currentTask ? `\n    Task: ${agent.currentTask}` : ''}`;
    const merged = existing ? `${existing}\n\n${line}` : line;
    useUIStore.getState().upsertPanel({
      id: 'agents',
      title: '🤖 Background Agents',
      content: merged,
      type: 'agents',
      visible: true,
      borderColor: 'blue'
    });
  }
}

export const inkUIManager = new InkUIManagerImpl();
export default inkUIManager;

