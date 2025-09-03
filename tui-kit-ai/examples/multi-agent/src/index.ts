import { useTerminal, Box, Text } from '@tui-kit-ai/core';
import { AgentManager } from '@tui-kit-ai/agents';

const { screen } = useTerminal();
const root = new Box({ parent: screen, top: 0, left: 0, right: 0, bottom: 0, borderStyle: 'line', label: 'Multi-Agent System' });
new Text({ parent: root.el, top: 1, left: 2, text: 'Starting agents...' });

const manager = new AgentManager();
manager.startAllAgents();
screen.render();
