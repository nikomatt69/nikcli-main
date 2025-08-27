import React from 'react';
import { Text } from 'ink';

export const ProgressBar: React.FC<{ value: number; total?: number; label?: string }>
  = ({ value, total, label }) => {
  const pct = total ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : Math.max(0, Math.min(100, Math.round(value)));
  const filled = Math.round(pct / 5);
  return (
    <Text>
      {label ? `${label} ` : ''}[{'█'.repeat(filled)}{'░'.repeat(20 - filled)}] {pct}%
    </Text>
  );
};

export default ProgressBar;

