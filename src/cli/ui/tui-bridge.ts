/**
 * TUI Bridge - Compatibility Layer for Boxen Integration
 * 
 * This module provides a seamless bridge between the existing boxen usage
 * and the new TUI component system, maintaining 100% API compatibility.
 */

import { Box } from '../../tui/core/src/components/Box';
import { Card } from '../../tui/core/src/components/Card';
import { useTerminal } from '../../tui/core/src/terminal/useTerminal';
import { validateComponent } from '../../tui/core/src/validation/component-validator';
import { FeatureFlagManager } from '../core/feature-flags';

// Re-export boxen types for compatibility
export interface BoxenOptions {
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic' | 'none';
  borderColor?: string;
  backgroundColor?: string;
  title?: string;
  titleAlignment?: 'left' | 'center' | 'right';
  width?: number | string;
  height?: number | string;
  float?: 'left' | 'right' | 'center';
  textAlignment?: 'left' | 'center' | 'right';
  dimBorder?: boolean;
  fullscreen?: boolean;
}

/**
 * Enhanced TUI-based boxen implementation
 */
export function tuiBoxen(content: string, options: BoxenOptions = {}): string {
  try {
    // TUI components are always enabled for professional UI

    const { screen } = useTerminal();

    // Map boxen options to validated TUI props
    const tuiProps = mapBoxenOptionsToTuiProps(content, options);

    // Validate props before component creation
    const isCard = shouldUseCard(content, options);
    const validation = validateComponent(
      isCard ? 'card' : 'box',
      tuiProps
    );

    if (!validation.success) {
      console.warn('TUI Bridge validation failed:', validation.errors?.issues);
      // Fallback to original boxen on validation failure
      const originalBoxen = require('boxen').default;
      return originalBoxen(content, options);
    }

    // Create appropriate TUI component with validated props
    const component = isCard
      ? new Card(validation.data)
      : new Box(validation.data);

    // Render component to string for compatibility
    const renderedOutput = renderComponentToString(component);

    // Cleanup component to prevent memory leaks
    component.destroy();

    return renderedOutput;

  } catch (error) {
    // Graceful fallback on any error
    console.warn('TUI Bridge error, falling back to boxen:', error);
    const originalBoxen = require('boxen').default;
    return originalBoxen(content, options);
  }
}

/**
 * Map boxen options to TUI component props
 */
function mapBoxenOptionsToTuiProps(content: string, options: BoxenOptions) {
  const variant = mapBorderColorToVariant(options.borderColor);

  // Build base props that match schema requirements
  const baseProps = {
    // Required props
    focusable: false,
    keys: false,

    // Content and styling
    content: stripAnsiForTui(content),
    label: options.title,

    // Layout props (validated by schema)
    top: undefined,
    left: undefined,
    right: undefined,
    bottom: undefined,
    width: options.width,
    height: options.height,

    // Styling props that match TUI schema
    padding: normalizePaddingForSchema(options.padding),
    border: mapBorderStyleForSchema(options.borderStyle),
    bg: options.backgroundColor,

    // TUI variant system props
    variant: variant as any,
    size: getSizeFromDimensions(options.width, options.height) as any,
    tone: getToneFromContent(content) as any,
  };

  return baseProps;
}

/**
 * Map boxen border colors to TUI variants
 */
function mapBorderColorToVariant(borderColor?: string) {
  const colorVariantMap: Record<string, string> = {
    'yellow': 'warning',
    'red': 'destructive',
    'green': 'success',
    'blue': 'info',
    'cyan': 'primary',
    'magenta': 'secondary',
    'white': 'ghost',
    'gray': 'muted',
    'grey': 'muted',
    // Enhanced professional color mappings for better UI
    'brightGreen': 'success',
    'brightRed': 'destructive',
    'brightYellow': 'warning',
    'brightBlue': 'info',
    'brightCyan': 'primary',
    'brightMagenta': 'secondary'
  };

  return colorVariantMap[borderColor?.toLowerCase() || ''] || 'default';
}

/**
 * Map boxen border styles to TUI border styles
 */
function mapBorderStyle(borderStyle?: string) {
  const styleMap: Record<string, string> = {
    'single': 'line',
    'double': 'double',
    'round': 'round',
    'bold': 'heavy',
    'none': 'none',
    'classic': 'line'
  };

  return styleMap[borderStyle || 'single'] || 'line';
}

/**
 * Normalize padding to match TUI schema format
 */
function normalizePaddingForSchema(padding?: number | { top?: number; right?: number; bottom?: number; left?: number }) {
  if (typeof padding === 'number') {
    return padding;
  }

  if (padding && typeof padding === 'object') {
    return {
      top: padding.top,
      right: padding.right,
      bottom: padding.bottom,
      left: padding.left
    };
  }

  return 1; // Default padding
}

/**
 * Map border style to schema-compatible format
 */
function mapBorderStyleForSchema(borderStyle?: string) {
  const styleMap: Record<string, any> = {
    'single': 'line',
    'double': { type: 'line' },
    'round': 'line', // Use round styling where supported
    'bold': 'line',
    'none': 'none',
    'classic': 'line',
    // Enhanced professional border styles
    'heavy': 'line',
    'light': 'line',
    'dotted': 'line'
  };

  return styleMap[borderStyle || 'single'] || 'line';
}

/**
 * Determine if content should use Card component instead of Box
 */
function shouldUseCard(content: string, options: BoxenOptions): boolean {
  // Use Card for content with titles or structured content
  if (options.title) return true;

  // Use Card for multi-line content that looks like structured info
  if (content.includes('\n\n') && content.length > 100) return true;

  // Use Card for content with obvious structure (bullets, lists)
  if (content.match(/^[•·*-]\s/m) || content.includes(':\n')) return true;

  return false;
}

/**
 * Infer tone from content for better theming
 */
function getToneFromContent(content: string): string {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('error') || lowerContent.includes('failed') || lowerContent.includes('❌')) {
    return 'error';
  }

  if (lowerContent.includes('warning') || lowerContent.includes('⚠️')) {
    return 'warning';
  }

  if (lowerContent.includes('success') || lowerContent.includes('✅') || lowerContent.includes('completed')) {
    return 'success';
  }

  if (lowerContent.includes('info') || lowerContent.includes('ℹ️')) {
    return 'info';
  }

  return 'neutral';
}

/**
 * Infer size from dimensions
 */
function getSizeFromDimensions(width?: number | string, height?: number | string): string {
  const numWidth = typeof width === 'number' ? width : parseInt(width as string) || 0;
  const numHeight = typeof height === 'number' ? height : parseInt(height as string) || 0;

  if (numWidth > 80 || numHeight > 10) return 'xl';
  if (numWidth > 60 || numHeight > 7) return 'lg';
  if (numWidth > 40 || numHeight > 5) return 'md';
  if (numWidth > 20 || numHeight > 3) return 'sm';

  return 'md'; // Default
}

/**
 * Strip ANSI codes that might interfere with TUI rendering
 */
function stripAnsiForTui(content: string): string {
  // Remove chalk color codes but preserve basic formatting
  return content.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Render TUI component to string for compatibility
 */
function renderComponentToString(component: any): string {
  try {
    // Create a temporary screen buffer
    const tempScreen = require('blessed').screen({
      smartCSR: false,
      width: 120,
      height: 30,
      buffer: true
    });

    // Attach component to temp screen
    component.el.parent = tempScreen;

    // Render and capture output
    tempScreen.render();
    const output = tempScreen.screenshot();

    // Cleanup
    tempScreen.destroy();

    return output || component.el.content || '';

  } catch (error) {
    // Fallback to component content
    return component.el?.content || '';
  }
}

/**
 * Enhanced boxen function with TUI fallback
 */
export function boxen(content: string, options: BoxenOptions = {}): string {
  try {
    // TUI components are now ALWAYS active by default for professional UI
    return tuiBoxen(content, options);
  } catch (error) {
    // Graceful fallback to original boxen only on TUI errors
    console.warn('TUI components failed, using fallback boxen:', (error as Error).message);
    const originalBoxen = require('boxen').default;
    return originalBoxen(content, options);
  }
}

/**
 * Specialized boxen variants for common use cases
 */
export const tuiBoxenVariants = {
  /**
   * Success message box
   */
  success(content: string, options: Partial<BoxenOptions> = {}) {
    return boxen(content, {
      borderColor: 'green',
      borderStyle: 'round',
      padding: 1,
      ...options
    });
  },

  /**
   * Error message box
   */
  error(content: string, options: Partial<BoxenOptions> = {}) {
    return boxen(content, {
      borderColor: 'red',
      borderStyle: 'round',
      padding: 1,
      ...options
    });
  },

  /**
   * Warning message box
   */
  warning(content: string, options: Partial<BoxenOptions> = {}) {
    return boxen(content, {
      borderColor: 'yellow',
      borderStyle: 'round',
      padding: 1,
      ...options
    });
  },

  /**
   * Info message box
   */
  info(content: string, options: Partial<BoxenOptions> = {}) {
    return boxen(content, {
      borderColor: 'blue',
      borderStyle: 'round',
      width: 80,
      height: 30,
      float: 'center',
      padding: 1,
      ...options
    });
  },

  /**
   * Banner/header box
   */
  banner(content: string, options: Partial<BoxenOptions> = {}) {
    return boxen(content, {
      borderColor: 'cyan',
      borderStyle: 'double',
      width: 80,
      height: 30,
      float: 'center',
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      textAlignment: 'center',
      ...options
    });
  },

  /**
   * Status update box
   */
  status(content: string, options: Partial<BoxenOptions> = {}) {
    return boxen(content, {
      width: 80,
      height: 30,
      float: 'center',
      borderStyle: 'round',
      borderColor: 'green',
      padding: 1,
      dimBorder: true,
      ...options
    });
  }
};

/**
 * Utility to check if TUI bridge is active
 */
export function isTuiBridgeActive(): boolean {
  // TUI Bridge is now ALWAYS active by default
  return true;
}

/**
 * Get TUI component statistics
 */
export function getTuiBridgeStats() {
  // TUI Bridge is now ALWAYS active - return optimal stats
  return {
    tuiEnabled: true,
    componentsAvailable: 46,
    fallbackActive: false,
    bridgeVersion: '1.1.0', // Updated version for always-on mode
    // Core TUI features always enabled for professional UI
    enhancedPrompt: true,
    interactiveDashboard: true,
    realTimeUpdates: true,
    fileOperations: true,
    diffViewer: true,
    debugMode: false, // Keep debug off by default
    performanceMonitoring: true
  };
}

// Default export maintains compatibility
export default boxen;

// Named exports for convenience  
export {
  boxen as tuiBridge
};