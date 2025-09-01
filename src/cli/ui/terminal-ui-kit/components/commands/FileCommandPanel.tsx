import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { CommandPanelProps, FileInfo } from '../../types';

interface FileOperation {
  type: 'read' | 'write' | 'edit' | 'list' | 'search';
  path?: string;
  content?: string;
  query?: string;
}

const FileCommandPanel: React.FC<CommandPanelProps> = ({
  title,
  borderColor = 'blue',
  args,
  context,
  onComplete,
}) => {
  const [operation, setOperation] = useState<FileOperation>({ type: 'list' });
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'select' | 'input' | 'execute' | 'result'>('select');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Determina operazione dai args
  useEffect(() => {
    if (args.length > 0) {
      const command = args[0];
      if (command === 'read' && args[1]) {
        setOperation({ type: 'read', path: args[1] });
        setMode('execute');
        executeOperation({ type: 'read', path: args[1] });
      } else if (command === 'write' && args[1]) {
        setOperation({ type: 'write', path: args[1], content: args.slice(2).join(' ') });
        if (args.length > 2) {
          setMode('execute');
          executeOperation({ type: 'write', path: args[1], content: args.slice(2).join(' ') });
        } else {
          setMode('input');
          setInputValue('');
        }
      } else if (command === 'search' && args[1]) {
        setOperation({ type: 'search', query: args[1] });
        setMode('execute');
        executeOperation({ type: 'search', query: args[1] });
      } else {
        setOperation({ type: 'list' });
        setMode('execute');
        executeOperation({ type: 'list' });
      }
    }
  }, [args]);

  const executeOperation = async (op: FileOperation) => {
    setIsExecuting(true);
    setResult(null);

    try {
      const toolsManager = context.cliInstance?.toolsManager;
      if (!toolsManager) throw new Error('Tools manager not available');

      switch (op.type) {
        case 'read':
          if (!op.path) throw new Error('File path required');
          const fileInfo = await toolsManager.readFile(op.path);
          setResult({
            type: 'file_content',
            path: op.path,
            content: fileInfo.content,
            size: fileInfo.size,
            language: fileInfo.language,
          });
          break;

        case 'write':
          if (!op.path || !op.content) throw new Error('File path and content required');
          await toolsManager.writeFile(op.path, op.content);
          setResult({
            type: 'file_written',
            path: op.path,
            size: op.content.length,
          });
          break;

        case 'list':
          const directory = op.path || '.';
          const fileList = await toolsManager.listFiles(directory);
          const fileInfos: FileInfo[] = fileList.map((path: string) => ({
            path,
            language: getLanguageFromPath(path),
          }));
          setFiles(fileInfos);
          setResult({
            type: 'file_list',
            files: fileInfos,
            directory,
          });
          break;

        case 'search':
          if (!op.query) throw new Error('Search query required');
          const searchResults = await toolsManager.searchInFiles(op.query, op.path || '.');
          setResult({
            type: 'search_results',
            query: op.query,
            results: searchResults,
          });
          break;

        default:
          throw new Error(`Unknown operation: ${op.type}`);
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

  const getLanguageFromPath = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript', 'tsx': 'typescript',
      'js': 'javascript', 'jsx': 'javascript',
      'py': 'python', 'java': 'java', 'go': 'go', 'rs': 'rust',
      'html': 'html', 'css': 'css', 'scss': 'scss',
      'json': 'json', 'yaml': 'yaml', 'yml': 'yaml',
      'md': 'markdown', 'sql': 'sql',
    };
    return languageMap[ext || ''] || 'text';
  };

  const getFileIcon = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      'ts': '📘', 'tsx': '⚛️', 'js': '📄', 'jsx': '⚛️',
      'py': '🐍', 'java': '☕', 'go': '🐹', 'rs': '🦀',
      'html': '🌐', 'css': '🎨', 'scss': '🎨',
      'json': '📋', 'yaml': '⚙️', 'yml': '⚙️',
      'md': '📝', 'sql': '🗃️',
    };
    return iconMap[ext || ''] || '📄';
  };

  const operationItems = [
    { label: '📖 Read File', value: 'read' },
    { label: '✏️ Write File', value: 'write' },
    { label: '📝 Edit File', value: 'edit' },
    { label: '📁 List Files', value: 'list' },
    { label: '🔍 Search Files', value: 'search' },
  ];

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
          {operation.type} operation
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {mode === 'select' && (
          <Box flexDirection="column" flex={1}>
            <Text color="cyan" bold marginBottom={1}>
              📁 File Operations:
            </Text>
            <SelectInput
              items={operationItems}
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
              🔧 {operation.type.toUpperCase()} Operation
            </Text>
            
            {operation.type === 'read' && (
              <>
                <Text color="cyan">File path to read: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(path) => executeOperation({ ...operation, path })}
                  placeholder="Enter file path..."
                />
              </>
            )}

            {operation.type === 'write' && (
              <>
                <Text color="cyan">File path to write: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(path) => {
                    setOperation(prev => ({ ...prev, path }));
                    setInputValue('');
                  }}
                  placeholder="Enter file path..."
                />
                {operation.path && (
                  <>
                    <Text color="cyan" marginTop={1}>Content: </Text>
                    <TextInput
                      value={inputValue}
                      onChange={setInputValue}
                      onSubmit={(content) => executeOperation({ ...operation, content })}
                      placeholder="Enter file content..."
                    />
                  </>
                )}
              </>
            )}

            {operation.type === 'search' && (
              <>
                <Text color="cyan">Search query: </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(query) => executeOperation({ ...operation, query })}
                  placeholder="Enter search term..."
                />
              </>
            )}

            {operation.type === 'list' && (
              <>
                <Text color="cyan">Directory to list (optional): </Text>
                <TextInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={(path) => executeOperation({ ...operation, path: path || '.' })}
                  placeholder="Enter directory path or press Enter for current..."
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
          </Box>
        )}

        {mode === 'result' && result && (
          <Box flexDirection="column" flex={1}>
            {result.type === 'file_content' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  📄 {result.path} ({result.size} bytes, {result.language})
                </Text>
                <Box 
                  borderStyle="single" 
                  borderColor="gray" 
                  padding={1}
                  flex={1}
                >
                  <Text wrap="wrap">
                    {result.content.slice(0, 1000)}{result.content.length > 1000 ? '...' : ''}
                  </Text>
                </Box>
              </Box>
            )}

            {result.type === 'file_written' && (
              <Box justifyContent="center" alignItems="center" flex={1}>
                <Box flexDirection="column" alignItems="center">
                  <Text color="green" bold>✅ File Written Successfully</Text>
                  <Text color="gray">Path: {result.path}</Text>
                  <Text color="gray">Size: {result.size} bytes</Text>
                </Box>
              </Box>
            )}

            {result.type === 'file_list' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  📁 Files in {result.directory}:
                </Text>
                {result.files.slice(0, 15).map((file: FileInfo, index: number) => (
                  <Box key={index}>
                    <Text>{getFileIcon(file.path)} {file.path}</Text>
                  </Box>
                ))}
                {result.files.length > 15 && (
                  <Text color="gray" dimColor>
                    ... and {result.files.length - 15} more files
                  </Text>
                )}
              </Box>
            )}

            {result.type === 'search_results' && (
              <Box flexDirection="column" flex={1}>
                <Text color="green" bold marginBottom={1}>
                  🔍 Search results for "{result.query}":
                </Text>
                {result.results.slice(0, 10).map((match: any, index: number) => (
                  <Box key={index} flexDirection="column" marginBottom={1}>
                    <Text color="blue">{match.file}:{match.line}</Text>
                    <Text color="gray" dimColor paddingLeft={2}>
                      {match.content}
                    </Text>
                  </Box>
                ))}
                {result.results.length > 10 && (
                  <Text color="gray" dimColor>
                    ... and {result.results.length - 10} more matches
                  </Text>
                )}
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

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {mode === 'select' 
            ? 'Select a file operation'
            : mode === 'input'
            ? 'Enter required information • Esc to cancel'
            : mode === 'execute'
            ? 'Operation in progress...'
            : 'Operation completed • Press any key to continue'
          }
        </Text>
      </Box>
    </Box>
  );
};

export default FileCommandPanel;