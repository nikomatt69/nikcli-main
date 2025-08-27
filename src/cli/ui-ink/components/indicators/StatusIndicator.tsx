import React from 'react';
import { Box, Text } from 'ink';

export type IndicatorStatus = 'pending' | 'running' | 'completed' | 'failed' | 'warning';

export const StatusIndicator: React.FC<{ title: string; status: IndicatorStatus; details?: string; progress?: number }>
  = ({ title, status, details, progress }) => {
  const icon = status === 'pending' ? '⏳' : status === 'running' ? '🔄' : status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⚠️';
  const color: any = status === 'pending' ? 'gray' : status === 'running' ? 'blue' : status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'yellow';
  const progressBar = typeof progress === 'number' ? ` [${'█'.repeat(Math.round(progress / 5)).padEnd(20, '░')}] ${Math.round(progress)}%` : '';
  return (
    <Box flexDirection="column">
      <Text color={color}>{icon} {title}{progressBar}</Text>
      {details ? <Text dimColor>  {details}</Text> : null}
    </Box>
  );
};

export default StatusIndicator;

