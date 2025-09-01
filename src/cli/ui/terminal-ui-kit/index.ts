/**
 * Terminal UI Kit per NikCLI
 * Sistema di componenti basato su Ink per interfacce terminale moderne
 */

export { default as App } from './components/App';
export { default as StreamComponent } from './components/StreamComponent';
export { default as PromptComponent } from './components/PromptComponent';
export { default as PanelContainer } from './components/PanelContainer';

// Command Components
export { default as HelpCommandPanel } from './components/commands/HelpCommandPanel';
export { default as ModelCommandPanel } from './components/commands/ModelCommandPanel';
export { default as AgentCommandPanel } from './components/commands/AgentCommandPanel';
export { default as FileCommandPanel } from './components/commands/FileCommandPanel';
export { default as VMCommandPanel } from './components/commands/VMCommandPanel';
export { default as PlanCommandPanel } from './components/commands/PlanCommandPanel';
export { default as ConfigCommandPanel } from './components/commands/ConfigCommandPanel';
export { default as TerminalCommandPanel } from './components/commands/TerminalCommandPanel';
export { default as VisionCommandPanel } from './components/commands/VisionCommandPanel';

// Base Components
export { default as StatusPanel } from './components/panels/StatusPanel';
export { default as FilesPanel } from './components/panels/FilesPanel';
export { default as DiffPanel } from './components/panels/DiffPanel';
export { default as TodosPanel } from './components/panels/TodosPanel';
export { default as AgentsPanel } from './components/panels/AgentsPanel';
export { default as ChatPanel } from './components/panels/ChatPanel';
export { default as ApprovalPanel } from './components/panels/ApprovalPanel';

// Hooks and Utilities
export * from './hooks/useTerminalState';
export * from './hooks/useCommandHistory';
export * from './hooks/useFileWatcher';
export * from './utils/theme';
export * from './utils/layout';
export * from './types';