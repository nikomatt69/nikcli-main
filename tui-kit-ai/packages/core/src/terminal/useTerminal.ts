import blessed, { Widgets } from 'blessed';

export type TerminalContext = {
  screen: Widgets.Screen;
};

export function useTerminal(): TerminalContext {
  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    fullUnicode: true,
  });
  screen.key(['C-c', 'q'], () => process.exit(0));
  return { screen };
}
