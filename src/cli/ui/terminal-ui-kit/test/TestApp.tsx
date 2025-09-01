/**
 * Test App per Terminal UI Kit
 * Utilizzabile per testare i componenti indipendentemente dal CLI
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import App from '../components/App';
import { ChatMessage, StatusIndicator, TodoItem, BackgroundAgentInfo } from '../types';

const TestApp: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'user',
      content: 'Ciao! Voglio testare il Terminal UI Kit.',
      timestamp: new Date(Date.now() - 60000),
    },
    {
      role: 'assistant', 
      content: 'Perfetto! Il Terminal UI Kit è ora attivo. Puoi vedere tutti i pannelli interattivi.',
      timestamp: new Date(Date.now() - 30000),
    },
    {
      role: 'user',
      content: 'Fantastico! Mostrami i componenti disponibili.',
      timestamp: new Date(),
    }
  ]);

  const [indicators, setIndicators] = useState<StatusIndicator[]>([
    {
      id: 'test-1',
      title: 'Analyzing codebase',
      status: 'running',
      progress: 75,
      startTime: new Date(Date.now() - 45000),
      details: 'Processing TypeScript files...'
    },
    {
      id: 'test-2', 
      title: 'Installing dependencies',
      status: 'completed',
      progress: 100,
      startTime: new Date(Date.now() - 120000),
      endTime: new Date(Date.now() - 60000),
      details: 'All packages installed successfully'
    }
  ]);

  const [todos, setTodos] = useState<TodoItem[]>([
    {
      content: 'Creare componenti base del Terminal UI Kit',
      status: 'completed',
      priority: 'high',
      category: 'implementation'
    },
    {
      content: 'Integrare con sistema CLI esistente', 
      status: 'in_progress',
      progress: 80,
      priority: 'high',
      category: 'integration'
    },
    {
      content: 'Testare tutti i componenti comando',
      status: 'pending',
      priority: 'medium',
      category: 'testing'
    },
    {
      content: 'Documentare API e utilizzo',
      status: 'pending', 
      priority: 'low',
      category: 'documentation'
    }
  ]);

  const [agents, setAgents] = useState<BackgroundAgentInfo[]>([
    {
      id: 'agent-1',
      name: 'Code Analyzer',
      status: 'working',
      currentTask: 'Analyzing TypeScript files for optimization opportunities',
      progress: 60,
      startTime: new Date(Date.now() - 180000)
    },
    {
      id: 'agent-2',
      name: 'Test Runner',
      status: 'completed',
      currentTask: 'Running unit tests for UI components',
      progress: 100,
      startTime: new Date(Date.now() - 300000)
    },
    {
      id: 'agent-3',
      name: 'Documentation Bot',
      status: 'idle',
      startTime: new Date(Date.now() - 600000)
    }
  ]);

  // Simula aggiornamenti in tempo reale
  useEffect(() => {
    const interval = setInterval(() => {
      // Aggiorna progress del primo indicator
      setIndicators(prev => prev.map(indicator => {
        if (indicator.id === 'test-1' && indicator.status === 'running') {
          const newProgress = Math.min(100, (indicator.progress || 0) + Math.random() * 5);
          if (newProgress >= 100) {
            return {
              ...indicator,
              status: 'completed',
              progress: 100,
              endTime: new Date(),
              details: 'Codebase analysis completed'
            };
          }
          return { ...indicator, progress: newProgress };
        }
        return indicator;
      }));

      // Aggiorna progress dell'agente
      setAgents(prev => prev.map(agent => {
        if (agent.id === 'agent-1' && agent.status === 'working') {
          const newProgress = Math.min(100, (agent.progress || 0) + Math.random() * 3);
          if (newProgress >= 100) {
            return {
              ...agent,
              status: 'completed',
              progress: 100,
              currentTask: 'Analysis completed successfully'
            };
          }
          return { ...agent, progress: newProgress };
        }
        return agent;
      }));

      // Aggiorna progress todo
      setTodos(prev => prev.map(todo => {
        if (todo.status === 'in_progress' && todo.progress !== undefined) {
          const newProgress = Math.min(100, todo.progress + Math.random() * 2);
          if (newProgress >= 100) {
            return { ...todo, status: 'completed', progress: 100 };
          }
          return { ...todo, progress: newProgress };
        }
        return todo;
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Mock CLI instance per testing
  const mockCLIInstance = {
    currentMode: 'default',
    structuredUIEnabled: true,
    handleChatInput: (input: string) => {
      console.log('Mock chat input:', input);
      setMessages(prev => [...prev, {
        role: 'user',
        content: input,
        timestamp: new Date()
      }]);
    },
    dispatchSlash: (command: string) => {
      console.log('Mock slash command:', command);
    },
    emit: (event: string, data?: any) => {
      console.log('Mock emit:', event, data);
    },
    on: (event: string, handler: Function) => {
      console.log('Mock on:', event);
    },
    off: (event: string, handler: Function) => {
      console.log('Mock off:', event);
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="double" borderColor="cyan" padding={1} marginBottom={1}>
        <Box flexDirection="column">
          <Text color="cyan" bold>🧪 Terminal UI Kit Test Environment</Text>
          <Text color="gray" dimColor>
            Testing all components with mock data and real-time updates
          </Text>
        </Box>
      </Box>

      <App
        initialMode="default"
        cliInstance={mockCLIInstance}
        onExit={() => process.exit(0)}
      />
    </Box>
  );
};

export default TestApp;