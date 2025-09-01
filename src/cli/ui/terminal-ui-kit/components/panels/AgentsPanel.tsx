import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { BackgroundAgentInfo } from '../../types';

interface AgentsPanelProps {
  title: string;
  borderColor?: string;
  agents: BackgroundAgentInfo[];
  currentAgent?: string;
  onAgentSelect?: (agent: BackgroundAgentInfo) => void;
  interactive?: boolean;
}

const AgentsPanel: React.FC<AgentsPanelProps> = ({
  title,
  borderColor = 'magenta',
  agents,
  currentAgent,
  onAgentSelect,
  interactive = false,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<BackgroundAgentInfo | null>(null);

  const getAgentStatusIcon = (status: BackgroundAgentInfo['status']) => {
    switch (status) {
      case 'idle': return '⏸️';
      case 'working': return '🔄';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '🤖';
    }
  };

  const getAgentStatusColor = (status: BackgroundAgentInfo['status']) => {
    switch (status) {
      case 'idle': return 'gray';
      case 'working': return 'blue';
      case 'completed': return 'green';
      case 'error': return 'red';
      default: return 'white';
    }
  };

  const formatDuration = (startTime?: Date) => {
    if (!startTime) return '';
    const duration = Date.now() - startTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const createProgressBar = (progress: number, width: number = 15) => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const getStats = () => {
    const working = agents.filter(a => a.status === 'working').length;
    const idle = agents.filter(a => a.status === 'idle').length;
    const completed = agents.filter(a => a.status === 'completed').length;
    const errors = agents.filter(a => a.status === 'error').length;
    
    return { working, idle, completed, errors, total: agents.length };
  };

  const stats = getStats();

  const selectItems = agents.map(agent => ({
    label: `${getAgentStatusIcon(agent.status)} ${agent.name}${agent.currentTask ? ` - ${agent.currentTask.slice(0, 30)}...` : ''}`,
    value: agent,
  }));

  return (
    <Box 
      borderStyle="round" 
      borderColor={borderColor} 
      padding={1} 
      flexDirection="column"
      height="100%"
    >
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={borderColor} bold>{title}</Text>
          <Text color="gray" dimColor>
            {stats.total} agents
          </Text>
        </Box>
        
        {/* Stats Overview */}
        {stats.total > 0 && (
          <Box>
            <Text color="blue">🔄{stats.working} </Text>
            <Text color="gray">⏸️{stats.idle} </Text>
            <Text color="green">✅{stats.completed} </Text>
            {stats.errors > 0 && <Text color="red">❌{stats.errors}</Text>}
          </Box>
        )}
      </Box>

      {/* Current Agent Highlight */}
      {currentAgent && (
        <Box marginBottom={1} borderStyle="single" borderColor="cyan" padding={1}>
          <Box flexDirection="column">
            <Text color="cyan" bold>🎯 Current Agent:</Text>
            <Text>{currentAgent}</Text>
          </Box>
        </Box>
      )}

      {/* Agents List */}
      <Box flexDirection="column" flex={1}>
        {agents.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flex={1}>
            <Text color="gray" dimColor>
              🤖 No active agents
            </Text>
          </Box>
        ) : interactive && agents.length > 1 ? (
          <SelectInput
            items={selectItems}
            onSelect={(item) => {
              setSelectedAgent(item.value);
              onAgentSelect?.(item.value);
            }}
          />
        ) : (
          agents.map((agent, index) => (
            <Box key={agent.id} flexDirection="column" marginBottom={1}>
              {/* Agent Header */}
              <Box justifyContent="space-between">
                <Box>
                  <Text>{getAgentStatusIcon(agent.status)} </Text>
                  <Text color={getAgentStatusColor(agent.status)} bold>
                    {agent.name}
                  </Text>
                  {agent.id === currentAgent && (
                    <Text color="cyan"> (active)</Text>
                  )}
                </Box>
                <Text color="gray" dimColor>
                  {formatDuration(agent.startTime)}
                </Text>
              </Box>

              {/* Current Task */}
              {agent.currentTask && (
                <Box marginLeft={2}>
                  <Text color="white" dimColor>
                    Task: {agent.currentTask}
                  </Text>
                </Box>
              )}

              {/* Progress Bar */}
              {agent.status === 'working' && agent.progress !== undefined && (
                <Box marginLeft={2}>
                  <Text color="blue">
                    [{createProgressBar(agent.progress)}] {agent.progress}%
                  </Text>
                </Box>
              )}

              {/* Status Indicator */}
              {agent.status === 'working' && (
                <Box marginLeft={2}>
                  <Spinner type="dots" />
                  <Text color="blue"> Working...</Text>
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>

      {/* Selected Agent Details */}
      {selectedAgent && (
        <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
          <Box flexDirection="column">
            <Text color="cyan" bold>🤖 Agent Details:</Text>
            <Text>Name: {selectedAgent.name}</Text>
            <Text>Status: {selectedAgent.status}</Text>
            <Text>ID: {selectedAgent.id.slice(0, 8)}...</Text>
            {selectedAgent.currentTask && (
              <Text wrap="wrap">Task: {selectedAgent.currentTask}</Text>
            )}
            {selectedAgent.startTime && (
              <Text>Runtime: {formatDuration(selectedAgent.startTime)}</Text>
            )}
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {stats.working > 0 ? `${stats.working} agents working` : 'All agents idle'}
        </Text>
      </Box>
    </Box>
  );
};

export default AgentsPanel;