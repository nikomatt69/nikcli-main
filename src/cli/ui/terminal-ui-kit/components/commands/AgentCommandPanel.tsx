import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { CommandPanelProps } from '../../types';

interface AgentInfo {
  name: string;
  description: string;
  type: 'standard' | 'vm' | 'container';
  status: 'available' | 'busy' | 'error';
  capabilities?: string[];
  specialization?: string;
  autonomyLevel?: string;
}

interface AgentTask {
  id: string;
  agentName: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  startTime?: Date;
  result?: any;
}

const AgentCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'magenta',
  args,
  context,
  onComplete,
}) => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [taskDescription, setTaskDescription] = useState('');
  const [mode, setMode] = useState<'list' | 'select' | 'configure' | 'execute'>('list');
  const [currentTask, setCurrentTask] = useState<AgentTask | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Carica agenti disponibili
  useEffect(() => {
    loadAvailableAgents();
  }, []);

  const loadAvailableAgents = async () => {
    try {
      const agentManager = context.cliInstance?.agentManager || context.agentManager;
      if (!agentManager) return;

      const agentList = agentManager.listAgents?.() || [];
      
      const agentInfos: AgentInfo[] = agentList.map((agent: any) => ({
        name: agent.name,
        description: agent.description || 'No description available',
        type: agent.type || 'standard',
        status: agent.status || 'available',
        capabilities: agent.capabilities || [],
        specialization: agent.specialization,
        autonomyLevel: agent.autonomyLevel,
      }));

      setAgents(agentInfos);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const handleAgentSelect = (agent: AgentInfo) => {
    setSelectedAgent(agent);
    setMode('configure');
    
    // Se c'è un task negli args, usalo
    if (args.length > 1) {
      setTaskDescription(args.slice(1).join(' '));
    }
  };

  const handleTaskSubmit = async (task: string) => {
    if (!selectedAgent || !task.trim()) return;

    setIsExecuting(true);
    setMode('execute');
    
    const taskId = `task-${Date.now()}`;
    const newTask: AgentTask = {
      id: taskId,
      agentName: selectedAgent.name,
      description: task,
      status: 'running',
      startTime: new Date(),
      progress: 0,
    };
    
    setCurrentTask(newTask);

    try {
      // Esegui l'agente
      const agentManager = context.cliInstance?.agentManager || context.agentManager;
      const agent = agentManager?.getAgent?.(selectedAgent.name);
      
      if (!agent) {
        throw new Error(`Agent ${selectedAgent.name} not found`);
      }

      await agent.initialize?.();
      const result = await agent.run?.({
        id: taskId,
        type: 'user_request',
        title: 'User Request',
        description: task,
        priority: 'medium',
        status: 'pending',
        data: { userInput: task },
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      });
      await agent.cleanup?.();

      setCurrentTask(prev => prev ? {
        ...prev,
        status: 'completed',
        progress: 100,
        result,
      } : null);

      console.log(`✅ Agent ${selectedAgent.name} completed successfully`);
      
      setTimeout(() => {
        onComplete?.({ shouldExit: false, shouldUpdatePrompt: false });
      }, 2000);

    } catch (error: any) {
      setCurrentTask(prev => prev ? {
        ...prev,
        status: 'failed',
        result: error.message,
      } : null);
      
      console.error(`❌ Agent execution failed: ${error.message}`);
      
      setTimeout(() => {
        onComplete?.({ shouldExit: false, shouldUpdatePrompt: false });
      }, 2000);
    } finally {
      setIsExecuting(false);
    }
  };

  const getAgentTypeIcon = (type: AgentInfo['type']) => {
    switch (type) {
      case 'vm': return '🐳';
      case 'container': return '📦';
      default: return '🤖';
    }
  };

  const getAgentStatusColor = (status: AgentInfo['status']) => {
    switch (status) {
      case 'available': return 'green';
      case 'busy': return 'yellow';
      case 'error': return 'red';
      default: return 'gray';
    }
  };

  const getTaskStatusIcon = (status: AgentTask['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '📋';
    }
  };

  const createProgressBar = (progress: number, width: number = 20) => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  };

  const agentItems = agents.map(agent => ({
    label: `${getAgentTypeIcon(agent.type)} ${agent.name} - ${agent.description.slice(0, 40)}...`,
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
      <Box marginBottom={1} justifyContent="space-between">
        <Text color={borderColor} bold>{title}</Text>
        <Text color="gray" dimColor>
          {agents.filter(a => a.status === 'available').length} available
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'list' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              🤖 Available Agents:
            </Text>
            
            {agents.length === 0 ? (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Text color="gray" dimColor>
                  No agents available
                </Text>
              </Box>
            ) : (
              <SelectInput
                items={agentItems}
                onSelect={(item) => handleAgentSelect(item.value)}
              />
            )}
          </Box>
        )}

        {mode === 'configure' && selectedAgent && (
          <Box flexDirection="column" flex={1}>
            <Text color="yellow" bold marginBottom={1}>
              🎯 Configure Task for {selectedAgent.name}
            </Text>
            
            <Box marginBottom={1} borderStyle="single" borderColor="gray" padding={1}>
              <Box flexDirection="column">
                <Text color="cyan">Agent Details:</Text>
                <Text>Name: {selectedAgent.name}</Text>
                <Text>Type: {getAgentTypeIcon(selectedAgent.type)} {selectedAgent.type}</Text>
                <Text wrap="wrap">Description: {selectedAgent.description}</Text>
                {selectedAgent.specialization && (
                  <Text wrap="wrap">Specialization: {selectedAgent.specialization}</Text>
                )}
                {selectedAgent.capabilities && selectedAgent.capabilities.length > 0 && (
                  <Text>Capabilities: {selectedAgent.capabilities.slice(0, 3).join(', ')}</Text>
                )}
              </Box>
            </Box>

            <Box marginBottom={1}>
              <Text color="cyan">Task Description: </Text>
            </Box>
            
            <TextInput
              value={taskDescription}
              onChange={setTaskDescription}
              onSubmit={handleTaskSubmit}
              placeholder="Describe what you want the agent to do..."
            />

            <Box marginTop={1}>
              <Text color="gray" dimColor>
                Press Enter to execute • Esc to cancel
              </Text>
            </Box>
          </Box>
        )}

        {mode === 'execute' && currentTask && (
          <Box flexDirection="column" flex={1}>
            <Text color="blue" bold marginBottom={1}>
              {getTaskStatusIcon(currentTask.status)} Executing Task
            </Text>
            
            <Box marginBottom={1} borderStyle="single" borderColor="blue" padding={1}>
              <Box flexDirection="column">
                <Text>Agent: {currentTask.agentName}</Text>
                <Text wrap="wrap">Task: {currentTask.description}</Text>
                <Text>Status: {currentTask.status}</Text>
                
                {currentTask.progress !== undefined && (
                  <Box marginTop={1}>
                    <Text color="blue">
                      Progress: [{createProgressBar(currentTask.progress)}] {currentTask.progress}%
                    </Text>
                  </Box>
                )}

                {currentTask.status === 'running' && (
                  <Box marginTop={1}>
                    <Spinner type="dots" />
                    <Text color="blue"> Agent is working...</Text>
                  </Box>
                )}

                {currentTask.startTime && (
                  <Text color="gray" dimColor>
                    Started: {currentTask.startTime.toLocaleTimeString()}
                  </Text>
                )}
              </Box>
            </Box>

            {/* Result */}
            {currentTask.result && (
              <Box borderStyle="single" borderColor="green" padding={1}>
                <Box flexDirection="column">
                  <Text color="green" bold>📄 Result:</Text>
                  <Text wrap="wrap">
                    {typeof currentTask.result === 'string' 
                      ? currentTask.result 
                      : JSON.stringify(currentTask.result, null, 2).slice(0, 200)
                    }
                  </Text>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Stats Footer */}
      <Box marginTop={1}>
        <Box justifyContent="space-between">
          <Text color="green">
            ✅ {agents.filter(a => a.status === 'available').length} ready
          </Text>
          <Text color="yellow">
            🔄 {agents.filter(a => a.status === 'busy').length} busy
          </Text>
          <Text color="red">
            ❌ {agents.filter(a => a.status === 'error').length} error
          </Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'list' 
            ? 'Select an agent to assign a task'
            : mode === 'configure'
            ? 'Describe the task for the selected agent'
            : mode === 'execute'
            ? 'Agent is executing the task...'
            : ''
          }
        </Text>
      </Box>
    </Box>
  );
};

export default AgentCommandPanel;