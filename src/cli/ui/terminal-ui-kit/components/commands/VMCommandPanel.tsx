import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { CommandPanelProps } from '../../types';

interface VMContainer {
  id: string;
  agentId: string;
  repositoryUrl: string;
  status: 'running' | 'stopped' | 'error' | 'creating';
  vscodePort?: number;
  createdAt: Date;
  uptime?: number;
}

interface VMOperation {
  type: 'list' | 'create' | 'stop' | 'remove' | 'connect' | 'status' | 'exec' | 'logs';
  containerId?: string;
  repositoryUrl?: string;
  command?: string;
}

const VMCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'cyan',
  args,
  context,
  onComplete,
}) => {
  const [containers, setContainers] = useState<VMContainer[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<VMContainer | null>(null);
  const [operation, setOperation] = useState<VMOperation>({ type: 'list' });
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'select' | 'input' | 'execute' | 'result'>('select');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Carica containers esistenti
  useEffect(() => {
    loadContainers();
  }, []);

  // Determina operazione dai args
  useEffect(() => {
    if (args.length > 0) {
      const command = args[0];
      switch (command) {
        case 'list':
          setOperation({ type: 'list' });
          setMode('execute');
          executeOperation({ type: 'list' });
          break;
        case 'create':
          if (args[1]) {
            setOperation({ type: 'create', repositoryUrl: args[1] });
            setMode('execute');
            executeOperation({ type: 'create', repositoryUrl: args[1] });
          } else {
            setOperation({ type: 'create' });
            setMode('input');
          }
          break;
        case 'status':
          setOperation({ type: 'status', containerId: args[1] });
          setMode('execute');
          executeOperation({ type: 'status', containerId: args[1] });
          break;
        case 'exec':
          if (args[1]) {
            setOperation({ type: 'exec', command: args.slice(1).join(' ') });
            setMode('execute');
            executeOperation({ type: 'exec', command: args.slice(1).join(' ') });
          } else {
            setOperation({ type: 'exec' });
            setMode('input');
          }
          break;
        default:
          setMode('select');
      }
    }
  }, [args]);

  const loadContainers = async () => {
    try {
      const vmOrchestrator = context.cliInstance?.vmOrchestrator;
      if (!vmOrchestrator) return;

      const activeContainers = vmOrchestrator.getActiveContainers?.() || [];
      const containerInfos: VMContainer[] = activeContainers.map((container: any) => ({
        id: container.id,
        agentId: container.agentId,
        repositoryUrl: container.repositoryUrl,
        status: container.status,
        vscodePort: container.vscodePort,
        createdAt: container.createdAt,
        uptime: Date.now() - container.createdAt.getTime(),
      }));

      setContainers(containerInfos);
    } catch (error) {
      console.error('Failed to load containers:', error);
    }
  };

  const executeOperation = async (op: VMOperation) => {
    setIsExecuting(true);
    setResult(null);

    try {
      const vmOrchestrator = context.cliInstance?.vmOrchestrator;
      if (!vmOrchestrator) throw new Error('VM Orchestrator not available');

      switch (op.type) {
        case 'list':
          await loadContainers();
          setResult({
            type: 'container_list',
            containers,
          });
          break;

        case 'create':
          if (!op.repositoryUrl) throw new Error('Repository URL required');
          
          const config = {
            agentId: `vm-agent-${Date.now()}`,
            repositoryUrl: op.repositoryUrl,
            sessionToken: `session-${Date.now()}`,
            proxyEndpoint: 'http://localhost:3000',
            capabilities: ['read', 'write', 'execute', 'network']
          };

          const containerId = await vmOrchestrator.createSecureContainer(config);
          await vmOrchestrator.setupRepository(containerId, op.repositoryUrl);
          await vmOrchestrator.setupDevelopmentEnvironment(containerId);
          await vmOrchestrator.setupVSCodeServer(containerId);

          const vscodePort = await vmOrchestrator.getVSCodePort(containerId);

          setResult({
            type: 'container_created',
            containerId,
            repositoryUrl: op.repositoryUrl,
            vscodePort,
          });
          await loadContainers();
          break;

        case 'status':
          const statusData = await vmOrchestrator.getContainerStatus?.(op.containerId);
          setResult({
            type: 'container_status',
            containerId: op.containerId,
            status: statusData,
          });
          break;

        case 'exec':
          if (!op.command) throw new Error('Command required');
          
          const selectedVM = context.cliInstance?.vmSelector?.getSelectedVM?.();
          if (!selectedVM) throw new Error('No VM selected. Use /vm-select first.');

          const execResult = await context.cliInstance?.vmSelector?.executeVMCommand?.(
            selectedVM.id, 
            op.command
          );
          
          setResult({
            type: 'command_executed',
            command: op.command,
            containerId: selectedVM.id,
            output: execResult,
          });
          break;

        case 'stop':
          if (!op.containerId) throw new Error('Container ID required');
          await vmOrchestrator.stopContainer(op.containerId);
          setResult({
            type: 'container_stopped',
            containerId: op.containerId,
          });
          await loadContainers();
          break;

        case 'remove':
          if (!op.containerId) throw new Error('Container ID required');
          await vmOrchestrator.removeContainer(op.containerId);
          setResult({
            type: 'container_removed',
            containerId: op.containerId,
          });
          await loadContainers();
          break;

        default:
          throw new Error(`Unknown VM operation: ${op.type}`);
      }

      setMode('result');
    } catch (error: any) {
      setResult({
        type: 'error',
        message: error.message,
      });
      setMode('result');
    } finally {
      setIsExecuting(false);
    }
  };

  const getContainerStatusIcon = (status: VMContainer['status']) => {
    switch (status) {
      case 'running': return '🟢';
      case 'stopped': return '🔴';
      case 'error': return '❌';
      case 'creating': return '🔄';
      default: return '⚪';
    }
  };

  const getContainerStatusColor = (status: VMContainer['status']) => {
    switch (status) {
      case 'running': return 'green';
      case 'stopped': return 'red';
      case 'error': return 'red';
      case 'creating': return 'yellow';
      default: return 'gray';
    }
  };

  const formatUptime = (uptime?: number) => {
    if (!uptime) return '';
    const minutes = Math.floor(uptime / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const vmOperationItems = [
    { label: '📋 List Containers', value: 'list' },
    { label: '🚀 Create Container', value: 'create' },
    { label: '📊 Container Status', value: 'status' },
    { label: '⚡ Execute Command', value: 'exec' },
    { label: '🛑 Stop Container', value: 'stop' },
    { label: '🗑️ Remove Container', value: 'remove' },
  ];

  const containerItems = containers.map(container => ({
    label: `${getContainerStatusIcon(container.status)} ${container.id.slice(0, 12)} - ${container.repositoryUrl.split('/').pop()}`,
    value: container,
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
          {containers.filter(c => c.status === 'running').length} running
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'select' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              🐳 VM Operations:
            </Text>
            <SelectInput
              items={vmOperationItems}
              onSelect={(item) => {
                setOperation({ type: item.value as any });
                if (item.value === 'list') {
                  setMode('execute');
                  executeOperation({ type: 'list' });
                } else {
                  setMode('input');
                }
              }}
            />
          </Box>
        )}

        {mode === 'input' && (
          <Box flexDirection="column" flex={1}>
            <Text color="yellow" bold marginBottom={1}>
              🔧 {operation.type.toUpperCase()} Configuration
            </Text>
            
            {operation.type === 'create' && (
              <>
                <Text color="cyan">Repository URL: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(url) => executeOperation({ ...operation, repositoryUrl: url })}
                  placeholder="https://github.com/user/repo.git"
                />
              </>
            )}

            {(operation.type === 'stop' || operation.type === 'remove' || operation.type === 'status') && (
              <>
                <Text color="cyan" marginBottom={1}>Select Container:</Text>
                {containers.length === 0 ? (
                  <Text color="gray" dimColor>No containers available</Text>
                ) : (
                  <SelectInput
                    items={containerItems}
                    onSelect={(item) => executeOperation({ 
                      ...operation, 
                      containerId: item.value.id 
                    })}
                  />
                )}
              </>
            )}

            {operation.type === 'exec' && (
              <>
                <Text color="cyan">Command to execute: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(command) => executeOperation({ ...operation, command })}
                  placeholder="Enter command to run in VM..."
                />
              </>
            )}
          </Box>
        )}

        {mode === 'execute' && (
          <Box flexDirection="column" flex={1} justifyContent="center" alignItems="center">
            <Spinner type="dots" />
            <Text color="blue" marginTop={1}>
              Executing VM {operation.type} operation...
            </Text>
          </Box>
        )}

        {mode === 'result' && result && (
          <Box flexDirection="column" flex={1}>
            {result.type === 'container_list' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  🐳 Active Containers ({containers.length}):
                </Text>
                {containers.length === 0 ? (
                  <Text color="gray" dimColor>No active containers</Text>
                ) : (
                  containers.map((container, index) => (
                    <Box key={index} flexDirection="column" marginBottom={1}>
                      <Box justifyContent="space-between">
                        <Text>
                          {getContainerStatusIcon(container.status)} {container.id.slice(0, 12)}
                        </Text>
                        <Text color="gray" dimColor>
                          {formatUptime(container.uptime)}
                        </Text>
                      </Box>
                      <Box paddingLeft={2}>
                        <Text color="gray" dimColor>
                          {container.repositoryUrl.split('/').pop()}
                        </Text>
                      </Box>
                      {container.vscodePort && (
                        <Box paddingLeft={2}>
                          <Text color="blue" dimColor>
                            VS Code: http://localhost:{container.vscodePort}
                          </Text>
                        </Box>
                      )}
                    </Box>
                  ))
                )}
              </Box>
            )}

            {result.type === 'container_created' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color="green" bold>✅ Container Created Successfully</Text>
                  <Text color="gray">ID: {result.containerId.slice(0, 12)}</Text>
                  <Text color="gray">Repository: {result.repositoryUrl}</Text>
                  {result.vscodePort && (
                    <Text color="blue">VS Code: http://localhost:{result.vscodePort}</Text>
                  )}
                </Box>
              </Box>
            )}

            {result.type === 'container_status' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  📊 Container Status: {result.containerId.slice(0, 12)}
                </Text>
                {result.status && (
                  <Box borderStyle="single" borderColor="gray" padding={1}>
                    <Box flexDirection="column">
                      <Text>Status: {result.status.status}</Text>
                      <Text>CPU: {result.status.cpu || 'N/A'}</Text>
                      <Text>Memory: {result.status.memory || 'N/A'}</Text>
                      <Text>Network: {result.status.network || 'N/A'}</Text>
                      <Text>Disk: {result.status.disk || 'N/A'}</Text>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {result.type === 'command_executed' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  ⚡ Command Executed: {result.command}
                </Text>
                <Box borderStyle="single" borderColor="gray" padding={1} flex={1}>
                  <Text wrap="wrap">
                    {result.output || 'Command completed with no output'}
                  </Text>
                </Box>
              </Box>
            )}

            {result.type === 'error' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color="red" bold>❌ Operation Failed</Text>
                  <Text color="gray" wrap="wrap">{result.message}</Text>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Container Stats */}
      {containers.length > 0 && (
        <Box marginTop={1}>
          <Box justifyContent="space-between">
            <Text color="green">
              🟢 {containers.filter(c => c.status === 'running').length} running
            </Text>
            <Text color="red">
              🔴 {containers.filter(c => c.status === 'stopped').length} stopped
            </Text>
            <Text color="yellow">
              🔄 {containers.filter(c => c.status === 'creating').length} creating
            </Text>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'select' 
            ? 'Select a VM operation'
            : mode === 'input'
            ? 'Enter required information • Esc to cancel'
            : mode === 'execute'
            ? 'VM operation in progress...'
            : 'Operation completed • Press any key to continue'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default VMCommandPanel;