import React from 'react';
import { Box } from 'ink';
import { LayoutConfig, UITheme } from '../types';
import { getPanelDimensions } from '../utils/layout';

interface PanelContainerProps {
  layout: LayoutConfig;
  panelIndex: number;
  theme: UITheme;
  children: React.ReactNode;
}

const PanelContainer: React.FC<PanelContainerProps> = ({
  layout,
  panelIndex,
  theme,
  children,
}) => {
  const dimensions = getPanelDimensions(layout, panelIndex);

  return (
    <Box
      width={dimensions.width}
      height={dimensions.height}
      flexShrink={0}
      marginRight={layout.mode === 'dual' || layout.mode === 'triple' ? 1 : 0}
      marginBottom={layout.mode === 'quad' && panelIndex < 2 ? 1 : 0}
    >
      {children}
    </Box>
  );
};

export default PanelContainer;