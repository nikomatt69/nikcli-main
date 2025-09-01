import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { StatusIndicator, StreamData } from '../../types';

interface StatusPanelProps {
  title: string;
  borderColor?: string;
  indicators: StatusIndicator[];
  liveUpdates: StreamData[];
  maxUpdates?: number;
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  title,
  borderColor = 'green',
  indicators,
  liveUpdates,
  maxUpdates = 10,
}) => {
  const recentUpdates = liveUpdates.slice(-maxUpdates);

  const getStatusIcon = (status: StatusIndicator['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'warning': return '⚠️';
      default: return '📋';
    }
  };

  const getStatusColor = (status: StatusIndicator['status']) => {
    switch (status) {
      case 'pending': return 'gray';
      case 'running': return 'blue';
      case 'completed': return 'green';
      case 'failed': return 'red';
      case 'warning': return 'yellow';
      default: return 'gray';
    }
  };

  const formatDuration = (indicator: StatusIndicator) => {
    if (!indicator.startTime) return '';
    const endTime = indicator.endTime || new Date();
    const duration = endTime.getTime() - indicator.startTime.getTime();
    const seconds = Math.round(duration / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  const createProgressBar = (progress: number, width: number = 20) => {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
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
      <Box marginBottom={1} justifyContent="space-between">
        <Text color={borderColor} bold>{title}</Text>
        <Text color="gray" dimColor>
          Active: {indicators.filter(i => i.status === 'running').length}
        </Text>
      </Box>

      {/* Active Indicators */}
      <Box flexDirection="column" flex={1}>
        {indicators.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flex={1}>
            <Text color="gray" dimColor>
              📊 No active tasks
            </Text>
          </Box>
        ) : (
          indicators.map((indicator, index) => (
            <Box key={indicator.id} flexDirection="column" marginBottom={1}>
              {/* Main Status Line */}
              <Box justifyContent="space-between">
                <Box>
                  <Text>{getStatusIcon(indicator.status)} </Text>
                  <Text color={getStatusColor(indicator.status)} bold>
                    {indicator.title}
                  </Text>
                </Box>
                <Text color="gray" dimColor>
                  {formatDuration(indicator)}
                </Text>
              </Box>

              {/* Progress Bar */}
              {indicator.progress !== undefined && (
                <Box marginLeft={2}>
                  <Text color="cyan">
                    [{createProgressBar(indicator.progress)}] {indicator.progress}%
                  </Text>
                </Box>
              )}

              {/* Details */}
              {indicator.details && (
                <Box marginLeft={2}>
                  <Text color="gray" dimColor>
                    {indicator.details}
                  </Text>
                </Box>
              )}

              {/* Sub Items */}
              {indicator.subItems && indicator.subItems.length > 0 && (
                <Box marginLeft={4} flexDirection="column">
                  {indicator.subItems.map((subItem, subIndex) => (
                    <Box key={subIndex}>
                      <Text>{getStatusIcon(subItem.status)} </Text>
                      <Text color={getStatusColor(subItem.status)}>
                        {subItem.title}
                      </Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>

      {/* Recent Updates */}
      <Box flexDirection="column" marginTop={1}>
        <Text color="gray" bold>📝 Recent Updates:</Text>
        {recentUpdates.slice(-3).map((update, index) => (
          <Box key={index}>
            <Text color="gray" dimColor>
              {update.timestamp.toLocaleTimeString()} 
            </Text>
            <Text color="white"> {update.content}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default StatusPanel;