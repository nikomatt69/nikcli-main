/**
 * Streamdown-Compatible API
 * 
 * This module provides a streamdown-inspired API for streamtty,
 * offering familiar patterns for web developers transitioning to TTY.
 */

import { EventEmitter } from 'events';
import { Widgets } from 'blessed';
import { Streamtty, StreamttyOptions } from './index';
import { StreamEvent, StreamEventType } from './types/stream-events';
import { MarkdownStyles } from './types';

export interface StreamRendererOptions extends StreamttyOptions {
  screen?: Widgets.Screen
  parseIncompleteMarkdown?: boolean
  syntaxHighlight?: boolean
  autoScroll?: boolean
  styles?: Partial<MarkdownStyles>
  // AI SDK specific options
  formatToolCalls?: boolean
  showThinking?: boolean
  maxToolResultLength?: number
  renderTimestamps?: boolean
}

export interface StreamRenderer {
  // Core streaming methods
  append: (chunk: string) => void
  appendStructured: (event: StreamEvent) => Promise<void>
  complete: () => void
  error: (err: Error) => void
  destroy: () => void

  // Event system
  on: (event: string, handler: Function) => void
  off: (event: string, handler: Function) => void
  emit: (event: string, ...args: any[]) => void

  // State management
  isActive: () => boolean
  getContent: () => string
  clear: () => void

  // AI SDK specific methods
  streamEvents: (events: AsyncGenerator<StreamEvent>) => Promise<void>
  handleAISDKStream: (stream: AsyncGenerator<StreamEvent>) => AsyncGenerator<void>

  // Configuration
  updateOptions: (options: Partial<StreamRendererOptions>) => void
  getOptions: () => StreamRendererOptions
}

export interface HookOptions {
  screen?: Widgets.Screen
  autoDestroy?: boolean
}

export interface StreamHook {
  renderer: StreamRenderer | null
  isActive: boolean
  destroy: () => void
  append: (chunk: string) => void
  appendStructured: (event: StreamEvent) => Promise<void>
  complete: () => void
  error: (err: Error) => void
}

/**
 * Create a streamdown-compatible renderer
 */
export function createStreamRenderer(
  options: StreamRendererOptions = {}
): StreamRenderer {
  const streamtty = new Streamtty(options);
  const eventEmitter = new EventEmitter();
  let isDestroyed = false;

  const renderer: StreamRenderer = {
    // Core streaming methods
    append: (chunk: string) => {
      if (isDestroyed) return;

      try {
        streamtty.stream(chunk);
        eventEmitter.emit('chunk', chunk);
        eventEmitter.emit('append', chunk);
      } catch (error) {
        eventEmitter.emit('error', error);
      }
    },

    appendStructured: async (event: StreamEvent) => {
      if (isDestroyed) return;

      try {
        await streamtty.streamEvent(event);
        eventEmitter.emit('event', event);
        eventEmitter.emit('structured', event);
      } catch (error) {
        eventEmitter.emit('error', error);
      }
    },

    complete: () => {
      if (isDestroyed) return;

      eventEmitter.emit('complete');
      eventEmitter.emit('finish');
    },

    error: (err: Error) => {
      eventEmitter.emit('error', err);
    },

    destroy: () => {
      if (isDestroyed) return;

      isDestroyed = true;
      streamtty.destroy();
      eventEmitter.removeAllListeners();
      eventEmitter.emit('destroy');
    },

    // Event system
    on: (event: string, handler: Function) => {
      eventEmitter.on(event, handler as any);
    },

    off: (event: string, handler: Function) => {
      eventEmitter.off(event, handler as any);
    },

    emit: (event: string, ...args: any[]) => {
      eventEmitter.emit(event, ...args);
    },

    // State management
    isActive: () => !isDestroyed,

    getContent: () => {
      if (isDestroyed) return '';
      return streamtty.getContent();
    },

    clear: () => {
      if (isDestroyed) return;
      streamtty.clear();
      eventEmitter.emit('clear');
    },

    // AI SDK specific methods
    streamEvents: async (events: AsyncGenerator<StreamEvent>) => {
      if (isDestroyed) return;

      try {
        await streamtty.streamEvents(events);
        eventEmitter.emit('eventsComplete');
      } catch (error) {
        eventEmitter.emit('error', error);
      }
    },

    handleAISDKStream: async function* (stream: AsyncGenerator<StreamEvent>) {
      if (isDestroyed) return;

      try {
        for await (const _ of streamtty.handleAISDKStream(stream)) {
          yield;
        }
      } catch (error) {
        eventEmitter.emit('error', error);
      }
    },

    // Configuration
    updateOptions: (newOptions: Partial<StreamRendererOptions>) => {
      if (isDestroyed) return;

      // Update streamtty options
      streamtty.updateAIOptions(newOptions);
      eventEmitter.emit('optionsUpdated', newOptions);
    },

    getOptions: () => {
      return {
        ...streamtty.getAIOptions(),
        screen: streamtty.getScreen(),
        parseIncompleteMarkdown: streamtty.getAIOptions().parseIncompleteMarkdown,
        syntaxHighlight: streamtty.getAIOptions().syntaxHighlight,
        autoScroll: true, // streamtty default
        styles: {}, // Could be enhanced to expose streamtty styles
        formatToolCalls: streamtty.getAIOptions().formatToolCalls,
        showThinking: streamtty.getAIOptions().showThinking,
        maxToolResultLength: streamtty.getAIOptions().maxToolResultLength,
        renderTimestamps: streamtty.getAIOptions().renderTimestamps
      };
    }
  };

  return renderer;
}

/**
 * Hook-style API for React-like patterns
 */
export function useStreamRenderer(options: HookOptions = {}): StreamHook {
  let renderer: StreamRenderer | null = null;
  let isActive = false;

  const createRenderer = () => {
    if (renderer) return;

    renderer = createStreamRenderer({
      screen: options.screen
    });

    renderer.on('destroy', () => {
      isActive = false;
      renderer = null;
    });

    isActive = true;
  };

  const destroy = () => {
    if (renderer) {
      renderer.destroy();
    }
    renderer = null;
    isActive = false;
  };

  const append = (chunk: string) => {
    if (!renderer) createRenderer();
    renderer?.append(chunk);
  };

  const appendStructured = async (event: StreamEvent) => {
    if (!renderer) createRenderer();
    await renderer?.appendStructured(event);
  };

  const complete = () => {
    if (!renderer) createRenderer();
    renderer?.complete();
  };

  const error = (err: Error) => {
    if (!renderer) createRenderer();
    renderer?.error(err);
  };

  // Auto-cleanup on process exit if enabled
  if (options.autoDestroy !== false) {
    process.on('exit', destroy);
    process.on('SIGINT', destroy);
    process.on('SIGTERM', destroy);
  }

  return {
    renderer,
    isActive,
    destroy,
    append,
    appendStructured,
    complete,
    error
  };
}

/**
 * Utility function to create a simple text streamer
 */
export function createTextStreamer(options: StreamRendererOptions = {}): StreamRenderer {
  const renderer = createStreamRenderer(options);

  // Enhanced append method for text streaming
  const originalAppend = renderer.append;
  renderer.append = (chunk: string) => {
    // Add some basic formatting for text streams
    const formattedChunk = chunk.replace(/\n/g, '\n\n');
    originalAppend(formattedChunk);
  };

  return renderer;
}

/**
 * Utility function to create an AI SDK streamer
 */
export function createAIStreamer(options: StreamRendererOptions = {}): StreamRenderer {
  const aiOptions: StreamRendererOptions = {
    formatToolCalls: true,
    showThinking: true,
    maxToolResultLength: 200,
    renderTimestamps: false,
    ...options
  };

  return createStreamRenderer(aiOptions);
}

/**
 * Utility function to create a debug streamer with timestamps
 */
export function createDebugStreamer(options: StreamRendererOptions = {}): StreamRenderer {
  const debugOptions: StreamRendererOptions = {
    renderTimestamps: true,
    formatToolCalls: true,
    showThinking: true,
    ...options
  };

  return createStreamRenderer(debugOptions);
}

// Export types and utilities
export type { StreamEvent, StreamEventType };
export { StreamProtocol } from './stream-protocol';
