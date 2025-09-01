import { LayoutConfig } from '../types';

export function calculateLayout(
  panels: string[],
  terminalWidth: number,
  terminalHeight: number
): LayoutConfig {
  const visiblePanels = panels.filter(Boolean);
  const panelCount = visiblePanels.length;

  let mode: LayoutConfig['mode'] = 'single';
  
  if (panelCount <= 1) {
    mode = 'single';
  } else if (panelCount === 2) {
    mode = 'dual';
  } else if (panelCount === 3) {
    mode = 'triple';
  } else {
    mode = 'quad';
  }

  return {
    mode,
    panels: visiblePanels,
    terminalWidth,
    terminalHeight,
  };
}

export function getPanelDimensions(
  layout: LayoutConfig,
  panelIndex: number
): { width: number; height: number; x: number; y: number } {
  const { mode, terminalWidth, terminalHeight } = layout;
  const headerHeight = 3; // Per header dell'app
  const availableHeight = terminalHeight - headerHeight;
  
  switch (mode) {
    case 'single':
      return {
        width: terminalWidth - 2,
        height: availableHeight - 2,
        x: 1,
        y: headerHeight,
      };
      
    case 'dual':
      const dualWidth = Math.floor((terminalWidth - 3) / 2);
      return {
        width: dualWidth,
        height: availableHeight - 2,
        x: panelIndex === 0 ? 1 : dualWidth + 2,
        y: headerHeight,
      };
      
    case 'triple':
      const tripleWidth = Math.floor((terminalWidth - 4) / 3);
      return {
        width: tripleWidth,
        height: availableHeight - 2,
        x: 1 + (tripleWidth + 1) * panelIndex,
        y: headerHeight,
      };
      
    case 'quad':
      const quadWidth = Math.floor((terminalWidth - 3) / 2);
      const quadHeight = Math.floor((availableHeight - 3) / 2);
      const row = Math.floor(panelIndex / 2);
      const col = panelIndex % 2;
      
      return {
        width: quadWidth,
        height: quadHeight,
        x: 1 + (quadWidth + 1) * col,
        y: headerHeight + (quadHeight + 1) * row,
      };
      
    default:
      return { width: terminalWidth - 2, height: availableHeight - 2, x: 1, y: headerHeight };
  }
}

export function getOptimalPanelLayout(
  panelTypes: string[],
  terminalWidth: number,
  terminalHeight: number
): string[] {
  // Priorità dei pannelli basata sul tipo
  const panelPriority: Record<string, number> = {
    'chat': 100,
    'stream': 95,
    'todos': 90,
    'status': 85,
    'files': 80,
    'diff': 75,
    'agents': 70,
    'approval': 65,
    'terminal': 60,
    'logs': 55,
  };

  // Ordina i pannelli per priorità
  const sortedPanels = panelTypes.sort((a, b) => {
    const priorityA = panelPriority[a] || 0;
    const priorityB = panelPriority[b] || 0;
    return priorityB - priorityA;
  });

  // Determina quanti pannelli possiamo mostrare
  const maxPanels = getMaxPanelsForTerminal(terminalWidth, terminalHeight);
  
  return sortedPanels.slice(0, maxPanels);
}

function getMaxPanelsForTerminal(width: number, height: number): number {
  // Logica per determinare il numero massimo di pannelli
  if (width < 80 || height < 24) return 1;
  if (width < 120 || height < 30) return 2;
  if (width < 160 || height < 40) return 3;
  return 4;
}