import React from 'react';
import { Box } from 'ink';

export const MainLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <Box flexDirection="column" paddingX={0} paddingY={0}>
      {children}
    </Box>
  );
};

export default MainLayout;

