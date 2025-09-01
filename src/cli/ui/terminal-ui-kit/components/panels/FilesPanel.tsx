import React, { useState } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { FileInfo } from '../../types';

interface FilesPanelProps {
  title: string;
  borderColor?: string;
  currentFile?: FileInfo;
  fileList: FileInfo[];
  onFileSelect?: (file: FileInfo) => void;
  showContent?: boolean;
}

const FilesPanel: React.FC<FilesPanelProps> = ({
  title,
  borderColor = 'blue',
  currentFile,
  fileList,
  onFileSelect,
  showContent = true,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const getFileIcon = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, string> = {
      'ts': '📘', 'tsx': '⚛️', 'js': '📄', 'jsx': '⚛️',
      'py': '🐍', 'java': '☕', 'go': '🐹', 'rs': '🦀',
      'html': '🌐', 'css': '🎨', 'scss': '🎨',
      'json': '📋', 'yaml': '⚙️', 'yml': '⚙️',
      'md': '📝', 'txt': '📄',
      'docker': '🐳', 'dockerfile': '🐳',
      'sql': '🗃️', 'db': '🗃️',
    };
    return iconMap[ext || ''] || '📄';
  };

  const formatFileSize = (size?: number) => {
    if (!size) return '';
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
    return `${Math.round(size / (1024 * 1024))}MB`;
  };

  const formatFileContent = (content: string, maxLines: number = 15) => {
    const lines = content.split('\n');
    if (lines.length <= maxLines) return content;
    
    return [
      ...lines.slice(0, maxLines - 2),
      '...',
      `(${lines.length - maxLines + 2} more lines)`
    ].join('\n');
  };

  const selectItems = fileList.map(file => ({
    label: `${getFileIcon(file.path)} ${file.path}${file.size ? ` (${formatFileSize(file.size)})` : ''}`,
    value: file,
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
          {fileList.length} files
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {fileList.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flex={1}>
            <Text color="gray" dimColor>
              📁 No files selected
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column" flex={1}>
            {/* File List */}
            {!currentFile && fileList.length > 1 && (
              <Box flexDirection="column" flex={1}>
                <Text color="cyan" bold>📁 File List:</Text>
                <SelectInput
                  items={selectItems}
                  onSelect={(item) => onFileSelect?.(item.value)}
                />
              </Box>
            )}

            {/* Current File Content */}
            {currentFile && showContent && (
              <Box flexDirection="column" flex={1}>
                <Box marginBottom={1}>
                  <Text color="cyan" bold>
                    {getFileIcon(currentFile.path)} {currentFile.path}
                  </Text>
                  {currentFile.size && (
                    <Text color="gray" dimColor>
                      {' '}({formatFileSize(currentFile.size)})
                    </Text>
                  )}
                </Box>
                
                {currentFile.content ? (
                  <Box 
                    borderStyle="single" 
                    borderColor="gray" 
                    padding={1}
                    flexDirection="column"
                    flex={1}
                  >
                    <Text wrap="wrap">
                      {formatFileContent(currentFile.content)}
                    </Text>
                  </Box>
                ) : (
                  <Box justifyContent="center" alignItems="center" flex={1}>
                    <Text color="gray" dimColor>
                      📄 File content not loaded
                    </Text>
                  </Box>
                )}
              </Box>
            )}

            {/* File List Summary */}
            {!currentFile && fileList.length > 0 && (
              <Box flexDirection="column">
                {fileList.slice(0, 10).map((file, index) => (
                  <Box key={index} justifyContent="space-between">
                    <Text>
                      {getFileIcon(file.path)} {file.path}
                    </Text>
                    {file.size && (
                      <Text color="gray" dimColor>
                        {formatFileSize(file.size)}
                      </Text>
                    )}
                  </Box>
                ))}
                {fileList.length > 10 && (
                  <Text color="gray" dimColor>
                    ... and {fileList.length - 10} more files
                  </Text>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {currentFile ? `Language: ${currentFile.language || 'unknown'}` : 'Select a file to view content'}
        </Text>
      </Box>
    </Box>
  );
};

export default FilesPanel;