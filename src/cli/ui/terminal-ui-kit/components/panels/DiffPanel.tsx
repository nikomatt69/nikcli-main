import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { DiffInfo } from '../../types';

interface DiffPanelProps {
  title: string;
  borderColor?: string;
  diffInfo?: DiffInfo;
  showLineNumbers?: boolean;
  contextLines?: number;
}

const DiffPanel: React.FC<DiffPanelProps> = ({
  title,
  borderColor = 'red',
  diffInfo,
  showLineNumbers = true,
  contextLines = 3,
}) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  if (!diffInfo) {
    return (
      <Box 
        borderStyle="round" 
        borderColor={borderColor} 
        padding={1} 
        flexDirection="column"
        height="100%"
      >
        <Text color={borderColor} bold>{title}</Text>
        <Box justifyContent="center" alignItems="center" flex={1}>
          <Text color="gray" dimColor>
            📝 No diff to display
          </Text>
        </Box>
      </Box>
    );
  }

  const generateUnifiedDiff = (oldContent: string, newContent: string) => {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    const diffLines: Array<{ type: 'add' | 'remove' | 'context'; content: string; lineNum?: number }> = [];

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine !== newLine) {
        if (oldLine !== undefined) {
          diffLines.push({ type: 'remove', content: oldLine, lineNum: i + 1 });
        }
        if (newLine !== undefined) {
          diffLines.push({ type: 'add', content: newLine, lineNum: i + 1 });
        }
      } else if (oldLine !== undefined) {
        diffLines.push({ type: 'context', content: oldLine, lineNum: i + 1 });
      }
    }

    return diffLines;
  };

  const getDiffStats = () => {
    const oldLines = diffInfo.oldContent.split('\n');
    const newLines = diffInfo.newContent.split('\n');
    
    let additions = 0;
    let deletions = 0;
    
    const maxLines = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine !== newLine) {
        if (oldLine !== undefined && newLine === undefined) deletions++;
        else if (oldLine === undefined && newLine !== undefined) additions++;
        else if (oldLine !== newLine) {
          deletions++;
          additions++;
        }
      }
    }
    
    return { additions, deletions };
  };

  const diffLines = generateUnifiedDiff(diffInfo.oldContent, diffInfo.newContent);
  const stats = getDiffStats();

  const getDiffLineColor = (type: string) => {
    switch (type) {
      case 'add': return 'green';
      case 'remove': return 'red';
      case 'context': return 'gray';
      default: return 'white';
    }
  };

  const getDiffLinePrefix = (type: string) => {
    switch (type) {
      case 'add': return '+';
      case 'remove': return '-';
      case 'context': return ' ';
      default: return ' ';
    }
  };

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
            {diffInfo.language || 'text'}
          </Text>
        </Box>
        <Text color="cyan" dimColor>
          📝 {diffInfo.filePath}
        </Text>
        <Box>
          <Text color="green">+{stats.additions} </Text>
          <Text color="red">-{stats.deletions}</Text>
        </Box>
      </Box>

      {/* Diff Content */}
      <Box 
        flexDirection="column" 
        flex={1}
        borderStyle="single"
        borderColor="gray"
        padding={1}
      >
        {diffLines.slice(0, 20).map((line, index) => (
          <Box key={index}>
            {showLineNumbers && line.lineNum && (
              <Text color="gray" dimColor>
                {line.lineNum.toString().padStart(4, ' ')}
              </Text>
            )}
            <Text color="gray" dimColor> {getDiffLinePrefix(line.type)} </Text>
            <Text 
              color={getDiffLineColor(line.type)}
              backgroundColor={line.type === 'add' ? 'green' : line.type === 'remove' ? 'red' : undefined}
              wrap="wrap"
            >
              {line.content}
            </Text>
          </Box>
        ))}
        
        {diffLines.length > 20 && (
          <Text color="gray" dimColor>
            ... and {diffLines.length - 20} more lines
          </Text>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray" dimColor>
          View: {viewMode}
        </Text>
        <Text color="gray" dimColor>
          Lines: {diffLines.length}
        </Text>
      </Box>
    </Box>
  );
};

export default DiffPanel;