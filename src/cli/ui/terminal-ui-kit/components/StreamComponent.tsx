import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { StreamData } from '../types';

interface StreamComponentProps {
  streams: StreamData[];
  isVisible: boolean;
  maxLines?: number;
}

const StreamComponent: React.FC<StreamComponentProps> = ({ 
  streams, 
  isVisible, 
  maxLines = 5 
}) => {
  const [currentStreams, setCurrentStreams] = useState<StreamData[]>([]);

  useEffect(() => {
    // Mantieni solo gli stream più recenti
    setCurrentStreams(streams.slice(-maxLines));
  }, [streams, maxLines]);

  if (!isVisible || currentStreams.length === 0) {
    return null;
  }

  const getStreamColor = (type: StreamData['type']) => {
    switch (type) {
      case 'error': return 'red';
      case 'warning': return 'yellow';
      case 'info': return 'blue';
      case 'success': return 'green';
      case 'chat': return 'cyan';
      case 'status': return 'gray';
      default: return 'white';
    }
  };

  const getStreamIcon = (type: StreamData['type']) => {
    switch (type) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      case 'success': return '✅';
      case 'chat': return '💬';
      case 'status': return '📊';
      case 'progress': return '🔄';
      default: return '📝';
    }
  };

  return (
    <Box 
      borderStyle="round" 
      borderColor="cyan" 
      padding={1} 
      marginY={1}
      flexDirection="column"
    >
      <Box marginBottom={1}>
        <Spinner type="dots" />
        <Text color="cyan" bold> Live Stream</Text>
      </Box>
      
      {currentStreams.map((stream, index) => (
        <Box key={index} marginBottom={index < currentStreams.length - 1 ? 1 : 0}>
          <Box marginRight={1}>
            <Text>{getStreamIcon(stream.type)}</Text>
          </Box>
          <Box flexDirection="column" flex={1}>
            <Box>
              <Text color={getStreamColor(stream.type)}>
                {stream.content}
              </Text>
              {stream.source && (
                <Text color="gray" dimColor>
                  {' '}[{stream.source}]
                </Text>
              )}
            </Box>
            <Text color="gray" dimColor>
              {stream.timestamp.toLocaleTimeString()}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default StreamComponent;