import React from 'react';
import InkSpinner from 'ink-spinner';
import { Text } from 'ink';

export const Spinner: React.FC<{ text?: string; type?: any }> = ({ text, type }) => {
  return (
    <Text>
      <InkSpinner type={(type as any) || 'dots'} /> {text || 'Loading...'}
    </Text>
  );
};

export default Spinner;

