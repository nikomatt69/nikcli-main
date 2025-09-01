import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { CommandPanelProps } from '../../types';

interface ProcessInfo {
  pid: number;
  command: string;
  args: string[];
  status: string;
  startTime: Date;
  cwd: string;
}

interface TerminalOperation {
  type: 'run' | 'install' | 'npm' | 'yarn' | 'git' | 'docker' | 'ps' | 'kill';
  command?: string;
  args?: string[];
  packages?: string[];
  options?: any;
}

const TerminalCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'green',
  args,
  context,
  onComplete,
}) => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [operation, setOperation] = useState<TerminalOperation>({ type: 'run' });
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'select' | 'input' | 'execute' | 'result'>('select');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  useEffect(() => {
    loadProcesses();
    loadCommandHistory();
  }, []);

  // Determina operazione dai args
  useEffect(() => {
    if (args.length > 0) {
      const command = args[0];
      switch (command) {
        case 'run':
        case 'sh':
        case 'bash':
          if (args.length > 1) {
            setOperation({ type: 'run', command: args[1], args: args.slice(2) });
            setMode('execute');
            executeOperation({ type: 'run', command: args[1], args: args.slice(2) });
          } else {
            setOperation({ type: 'run' });
            setMode('input');
          }
          break;
        case 'install':
          if (args.length > 1) {
            setOperation({ type: 'install', packages: args.slice(1) });
            setMode('execute');
            executeOperation({ type: 'install', packages: args.slice(1) });
          } else {
            setOperation({ type: 'install' });
            setMode('input');
          }
          break;
        case 'ps':
          setOperation({ type: 'ps' });
          setMode('execute');
          executeOperation({ type: 'ps' });
          break;
        case 'kill':
          if (args[1]) {
            setOperation({ type: 'kill', args: [args[1]] });
            setMode('execute');
            executeOperation({ type: 'kill', args: [args[1]] });
          } else {
            setOperation({ type: 'kill' });
            setMode('input');
          }
          break;
        default:
          setOperation({ type: command as any, args: args.slice(1) });
          if (args.length > 1) {
            setMode('execute');
            executeOperation({ type: command as any, args: args.slice(1) });
          } else {
            setMode('input');
          }
      }
    }
  }, [args]);

  const loadProcesses = async () => {
    try {
      const toolsManager = context.cliInstance?.toolsManager;
      if (!toolsManager) return;

      const runningProcesses = toolsManager.getRunningProcesses?.() || [];
      const processInfos: ProcessInfo[] = runningProcesses.map((proc: any) => ({
        pid: proc.pid,
        command: proc.command,
        args: proc.args || [],
        status: proc.status,
        startTime: proc.startTime,
        cwd: proc.cwd,
      }));

      setProcesses(processInfos);
    } catch (error) {
      console.error('Failed to load processes:', error);
    }
  };

  const loadCommandHistory = () => {
    // Carica cronologia comandi da localStorage o altra fonte
    const history = JSON.parse(localStorage.getItem('nikcli_command_history') || '[]');
    setCommandHistory(history.slice(-20)); // Ultimi 20 comandi
  };

  const addToHistory = (command: string) => {
    const newHistory = [...commandHistory, command].slice(-50);
    setCommandHistory(newHistory);
    localStorage.setItem('nikcli_command_history', JSON.stringify(newHistory));
  };

  const executeOperation = async (op: TerminalOperation) => {
    setIsExecuting(true);
    setResult(null);

    try {
      const toolsManager = context.cliInstance?.toolsManager;
      if (!toolsManager) throw new Error('Tools manager not available');

      switch (op.type) {
        case 'run':
          if (!op.command) throw new Error('Command required');
          
          const fullCommand = `${op.command} ${(op.args || []).join(' ')}`;
          addToHistory(fullCommand);
          
          const runResult = await toolsManager.runCommand(op.command, op.args || [], { stream: true });
          
          setResult({
            type: 'command_executed',
            command: fullCommand,
            exitCode: runResult.code,
            output: runResult.stdout,
            error: runResult.stderr,
          });
          break;

        case 'install':
          if (!op.packages || op.packages.length === 0) throw new Error('Packages required');
          
          const installCommand = `npm install ${op.packages.join(' ')}`;
          addToHistory(installCommand);
          
          for (const pkg of op.packages) {
            await toolsManager.installPackage?.(pkg, op.options || {});
          }
          
          setResult({
            type: 'packages_installed',
            packages: op.packages,
            manager: 'npm',
          });
          break;

        case 'ps':
          await loadProcesses();
          setResult({
            type: 'process_list',
            processes,
          });
          break;

        case 'kill':
          if (!op.args || !op.args[0]) throw new Error('Process ID required');
          
          const pid = parseInt(op.args[0]);
          if (isNaN(pid)) throw new Error('Invalid process ID');
          
          const killSuccess = await toolsManager.killProcess?.(pid);
          
          setResult({
            type: 'process_killed',
            pid,
            success: killSuccess,
          });
          await loadProcesses();
          break;

        case 'npm':
        case 'yarn':
        case 'git':
        case 'docker':
          const cmdResult = await toolsManager.runCommand(op.type, op.args || [], { stream: true });
          const fullCmd = `${op.type} ${(op.args || []).join(' ')}`;
          addToHistory(fullCmd);
          
          setResult({
            type: 'command_executed',
            command: fullCmd,
            exitCode: cmdResult.code,
            output: cmdResult.stdout,
            error: cmdResult.stderr,
          });
          break;

        default:
          throw new Error(`Unknown terminal operation: ${op.type}`);
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

  const formatDuration = (startTime: Date) => {
    const duration = Date.now() - startTime.getTime();
    const seconds = Math.round(duration / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const terminalOperationItems = [
    { label: '⚡ Run Command', value: 'run' },
    { label: '📦 Install Packages', value: 'install' },
    { label: '🟢 NPM Command', value: 'npm' },
    { label: '🧶 Yarn Command', value: 'yarn' },
    { label: '🔀 Git Command', value: 'git' },
    { label: '🐳 Docker Command', value: 'docker' },
    { label: '📋 List Processes', value: 'ps' },
    { label: '🛑 Kill Process', value: 'kill' },
  ];

  const historyItems = commandHistory.map(cmd => ({
    label: `📜 ${cmd}`,
    value: cmd,
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
          {processes.length} processes
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'select' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              ⚡ Terminal Operations:
            </Text>
            <SelectInput
              items={terminalOperationItems}
              onSelect={(item) => {
                setOperation({ type: item.value as any });
                setMode('input');
              }}
            />
          </Box>
        )}

        {mode === 'input' && (
          <Box flexDirection="column" flex={1}>
            <Text color="yellow" bold marginBottom={1}>
              🔧 {operation.type.toUpperCase()} Configuration
            </Text>
            
            {operation.type === 'run' && (
              <>
                <Text color="cyan">Command to execute: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(command) => {
                    const parts = command.trim().split(' ');
                    executeOperation({ 
                      ...operation, 
                      command: parts[0], 
                      args: parts.slice(1) 
                    });
                  }}
                  placeholder="Enter command with arguments..."
                />
                
                {commandHistory.length > 0 && (
                  <Box marginTop={1}>
                    <Text color="cyan" bold>📜 Recent Commands:</Text>
                    <SelectInput
                      items={historyItems.slice(-5)}
                      onSelect={(item) => {
                        const parts = item.value.trim().split(' ');
                        executeOperation({ 
                          ...operation, 
                          command: parts[0], 
                          args: parts.slice(1) 
                        });
                      }}
                    />
                  </Box>
                )}
              </>
            )}

            {operation.type === 'install' && (
              <>
                <Text color="cyan">Packages to install (space-separated): </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(packages) => executeOperation({ 
                    ...operation, 
                    packages: packages.trim().split(' ').filter(Boolean)
                  })}
                  placeholder="package1 package2 package3..."
                />
              </>
            )}

            {operation.type === 'kill' && (
              <>
                <Text color="cyan" marginBottom={1}>Select Process to Kill:</Text>
                {processes.length === 0 ? (
                  <Text color="gray" dimColor>No running processes</Text>
                ) : (
                  <SelectInput
                    items={processes.map(proc => ({
                      label: `🔄 PID ${proc.pid}: ${proc.command} ${proc.args.join(' ')} (${formatDuration(proc.startTime)})`,
                      value: proc.pid.toString(),
                    }))}
                    onSelect={(item) => executeOperation({ 
                      ...operation, 
                      args: [item.value] 
                    })}
                  />
                )}
              </>
            )}

            {['npm', 'yarn', 'git', 'docker'].includes(operation.type) && (
              <>
                <Text color="cyan">{operation.type.toUpperCase()} arguments: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(cmdArgs) => executeOperation({ 
                    ...operation, 
                    args: cmdArgs.trim().split(' ').filter(Boolean)
                  })}
                  placeholder={`Enter ${operation.type} command arguments...`}
                />
              </>
            )}
          </Box>
        )}

        {mode === 'execute' && (
          <Box flexDirection="column" flex={1} justifyContent="center" alignItems="center">
            <Spinner type="dots" />
            <Text color="blue" marginTop={1}>
              Executing {operation.type} operation...
            </Text>
            {operation.command && (
              <Text color="gray" dimColor marginTop={1}>
                {operation.command} {(operation.args || []).join(' ')}
              </Text>
            )}
          </Box>
        )}

        {mode === 'result' && result && (
          <Box flexDirection="column" flex={1}>
            {result.type === 'command_executed' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  ⚡ Command: {result.command}
                </Text>
                
                <Box borderStyle="single" borderColor="gray" padding={1} marginBottom={1}>
                  <Box flexDirection="column">
                    <Text color={result.exitCode === 0 ? 'green' : 'red'}>
                      Exit Code: {result.exitCode}
                    </Text>
                    <Text color="gray">
                      Status: {result.exitCode === 0 ? '✅ Success' : '❌ Failed'}
                    </Text>
                  </Box>
                </Box>

                {result.output && (
                  <Box borderStyle="single" borderColor="green" padding={1} flex={1}>
                    <Box flexDirection="column">
                      <Text color="green" bold>📤 Output:</Text>
                      <Text wrap="wrap">
                        {result.output.slice(0, 500)}{result.output.length > 500 ? '...' : ''}
                      </Text>
                    </Box>
                  </Box>
                )}

                {result.error && (
                  <Box borderStyle="single" borderColor="red" padding={1} marginTop={1}>
                    <Box flexDirection="column">
                      <Text color="red" bold>❌ Error:</Text>
                      <Text wrap="wrap" color="red">
                        {result.error.slice(0, 300)}{result.error.length > 300 ? '...' : ''}
                      </Text>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {result.type === 'packages_installed' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color="green" bold>📦 Packages Installed Successfully</Text>
                  <Text color="gray">Manager: {result.manager}</Text>
                  <Text color="gray">Packages: {result.packages.join(', ')}</Text>
                </Box>
              </Box>
            )}

            {result.type === 'process_list' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  🔄 Running Processes ({processes.length}):
                </Text>
                {processes.length === 0 ? (
                  <Text color="gray" dimColor>No processes currently running</Text>
                ) : (
                  processes.map((proc, index) => (
                    <Box key={index} flexDirection="column" marginBottom={1}>
                      <Box justifyContent="space-between">
                        <Text>
                          🔄 PID {proc.pid}: {proc.command}
                        </Text>
                        <Text color="gray" dimColor>
                          {formatDuration(proc.startTime)}
                        </Text>
                      </Box>
                      <Box paddingLeft={2}>
                        <Text color="gray" dimColor>
                          Args: {proc.args.join(' ')}
                        </Text>
                      </Box>
                      <Box paddingLeft={2}>
                        <Text color="gray" dimColor>
                          CWD: {proc.cwd}
                        </Text>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            )}

            {result.type === 'process_killed' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color={result.success ? 'green' : 'red'} bold>
                    {result.success ? '✅ Process Terminated' : '❌ Failed to Kill Process'}
                  </Text>
                  <Text color="gray">PID: {result.pid}</Text>
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

      {/* Process Stats */}
      {processes.length > 0 && (
        <Box marginTop={1}>
          <Text color="green">
            🔄 {processes.length} active processes
          </Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'select' 
            ? 'Select a terminal operation'
            : mode === 'input'
            ? 'Enter command or parameters • Esc to cancel'
            : mode === 'execute'
            ? 'Executing command...'
            : 'Command completed • Press any key to continue'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default TerminalCommandPanel;