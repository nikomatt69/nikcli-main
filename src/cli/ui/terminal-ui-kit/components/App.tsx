import React, { useState, useEffect } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { useTerminalState } from '../hooks/useTerminalState';
import { calculateLayout, getOptimalPanelLayout } from '../utils/layout';
import { getTheme } from '../utils/theme';
import StreamComponent from './StreamComponent';
import PromptComponent from './PromptComponent';
import PanelContainer from './PanelContainer';
import ChatPanel from './panels/ChatPanel';
import StatusPanel from './panels/StatusPanel';
import FilesPanel from './panels/FilesPanel';
import TodosPanel from './panels/TodosPanel';
import AgentsPanel from './panels/AgentsPanel';
import DiffPanel from './panels/DiffPanel';
import ApprovalPanel from './panels/ApprovalPanel';

interface AppProps {
  initialMode?: 'default' | 'auto' | 'plan' | 'vm';
  cliInstance?: any;
  onExit?: () => void;
}

const App: React.FC<AppProps> = ({ 
  initialMode = 'default', 
  cliInstance,
  onExit 
}) => {
  const { stdout } = useStdout();
  const terminalState = useTerminalState(initialMode, cliInstance);
  const theme = getTheme('default');
  
  const [activePanels, setActivePanels] = useState<string[]>(['chat', 'status']);
  const [layout, setLayout] = useState(() => 
    calculateLayout(activePanels, stdout.columns || 80, stdout.rows || 24)
  );

  // Aggiorna layout quando cambia la dimensione del terminale
  useEffect(() => {
    const updateLayout = () => {
      const optimalPanels = getOptimalPanelLayout(
        activePanels,
        stdout.columns || 80,
        stdout.rows || 24
      );
      setActivePanels(optimalPanels);
      setLayout(calculateLayout(optimalPanels, stdout.columns || 80, stdout.rows || 24));
    };

    updateLayout();
    
    // Listener per resize del terminale
    const handleResize = () => updateLayout();
    process.stdout.on('resize', handleResize);
    
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, [activePanels, stdout.columns, stdout.rows]);

  // Gestisce input globali
  useInput((input, key) => {
    if (key.escape) {
      terminalState.interruptProcessing();
    }
    
    if (key.ctrl && input === 'c') {
      onExit?.();
      process.exit(0);
    }

    // Shortcuts per pannelli
    if (key.ctrl && input === '1') {
      togglePanel('chat');
    } else if (key.ctrl && input === '2') {
      togglePanel('status');
    } else if (key.ctrl && input === '3') {
      togglePanel('files');
    } else if (key.ctrl && input === '4') {
      togglePanel('todos');
    } else if (key.ctrl && input === '5') {
      togglePanel('agents');
    }
  });

  const togglePanel = (panelType: string) => {
    setActivePanels(prev => {
      if (prev.includes(panelType)) {
        return prev.filter(p => p !== panelType);
      } else {
        return [...prev, panelType];
      }
    });
  };

  const renderPanel = (panelType: string, index: number) => {
    const commonProps = {
      key: panelType,
      title: getPanelTitle(panelType),
      borderColor: getPanelBorderColor(panelType),
      visible: true,
    };

    switch (panelType) {
      case 'chat':
        return (
          <ChatPanel 
            {...commonProps}
            messages={terminalState.chatMessages}
            isStreaming={terminalState.isProcessing}
          />
        );
      case 'status':
        return (
          <StatusPanel 
            {...commonProps}
            indicators={terminalState.statusIndicators}
            liveUpdates={terminalState.liveUpdates}
          />
        );
      case 'files':
        return (
          <FilesPanel 
            {...commonProps}
            currentFile={terminalState.currentFile}
            fileList={terminalState.fileList}
          />
        );
      case 'todos':
        return (
          <TodosPanel 
            {...commonProps}
            todos={terminalState.todos}
            planTitle={terminalState.currentPlan?.title}
          />
        );
      case 'agents':
        return (
          <AgentsPanel 
            {...commonProps}
            agents={terminalState.backgroundAgents}
            currentAgent={terminalState.currentAgent}
          />
        );
      case 'diff':
        return (
          <DiffPanel 
            {...commonProps}
            diffInfo={terminalState.currentDiff}
          />
        );
      case 'approval':
        return (
          <ApprovalPanel 
            {...commonProps}
            pendingApprovals={terminalState.pendingApprovals}
            onApprove={(id) => terminalState.approveRequest(id)}
            onReject={(id) => terminalState.rejectRequest(id)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="round" borderColor={theme.primary} padding={1} marginBottom={1}>
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Box>
              🤖 <Box color={theme.primary}>NikCLI</Box> <Box color={theme.muted}>v0.5.0-beta</Box>
            </Box>
            <Box color={theme.info}>
              Mode: {terminalState.currentMode} | Panels: {layout.panels.length}
            </Box>
          </Box>
          <Box color={theme.muted}>
            Autonomous AI Developer Assistant | Ctrl+C: Exit | Esc: Interrupt
          </Box>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box flex={1} flexDirection={layout.mode === 'dual' ? 'row' : 'column'}>
        {layout.panels.map((panelType, index) => (
          <PanelContainer
            key={panelType}
            layout={layout}
            panelIndex={index}
            theme={theme}
          >
            {renderPanel(panelType, index)}
          </PanelContainer>
        ))}
      </Box>

      {/* Stream Component - sempre visibile per output in tempo reale */}
      <StreamComponent 
        streams={terminalState.streams}
        isVisible={terminalState.isProcessing}
      />

      {/* Prompt Component - sempre in fondo */}
      <PromptComponent 
        currentMode={terminalState.currentMode}
        isProcessing={terminalState.isProcessing}
        userInputActive={terminalState.userInputActive}
        onInput={(input) => terminalState.handleInput(input)}
        onCommand={(command) => terminalState.handleCommand(command)}
      />
    </Box>
  );
};

function getPanelTitle(panelType: string): string {
  const titles: Record<string, string> = {
    'chat': '💬 Chat',
    'status': '📊 Status',
    'files': '📁 Files',
    'todos': '📋 Todos',
    'agents': '🤖 Agents',
    'diff': '📝 Diff',
    'approval': '✅ Approvals',
    'terminal': '⚡ Terminal',
    'logs': '📜 Logs',
  };
  return titles[panelType] || panelType;
}

function getPanelBorderColor(panelType: string): string {
  const colors: Record<string, string> = {
    'chat': 'cyan',
    'status': 'green',
    'files': 'blue',
    'todos': 'yellow',
    'agents': 'magenta',
    'diff': 'red',
    'approval': 'green',
    'terminal': 'white',
    'logs': 'gray',
  };
  return colors[panelType] || 'white';
}

export default App;