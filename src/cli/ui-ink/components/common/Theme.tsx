import React, { createContext, useContext } from 'react';

export type Theme = {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  muted: string;
};

const defaultTheme: Theme = {
  primary: 'blue',
  secondary: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'gray',
  muted: 'dim'
};

const ThemeContext = createContext<Theme>(defaultTheme);

export const ThemeProvider: React.FC<{ theme?: Partial<Theme>; children: React.ReactNode }> = ({ theme, children }) => {
  const merged: Theme = { ...defaultTheme, ...(theme || {}) } as Theme;
  return <ThemeContext.Provider value={merged}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

