/**
 * Inline Plugin System for StreamTTY
 * Minimal but powerful plugin architecture
 */

import { ParsedToken } from '../types';


/**
 * Plugin context - passed to all hooks
 */
export interface PluginContext {
  isStreaming: boolean;
  totalChunksProcessed: number;
  lastChunkSize: number;
}

/**
 * Plugin definition
 */
export interface StreamPlugin {
  name: string;
  version?: string;
  description?: string;

  // Lifecycle hooks
  onInit?(): Promise<void>;
  onDestroy?(): Promise<void>;

  // Processing hooks
  onChunk?(chunk: string, ctx: PluginContext): Promise<string>;
  onTokens?(tokens: ParsedToken[], ctx: PluginContext): Promise<ParsedToken[]>;
  onRender?(content: string, ctx: PluginContext): Promise<string>;

  // Event hooks
  onError?(error: Error, ctx: PluginContext): Promise<void>;
  onComplete?(stats: StreamStats, ctx: PluginContext): Promise<void>;
}

/**
 * Plugin registry and executor
 */
export class PluginRegistry {
  private plugins: Map<string, StreamPlugin> = new Map();
  private context: PluginContext;
  private initialized = false;

  constructor() {
    this.context = {
      isStreaming: false,
      totalChunksProcessed: 0,
      lastChunkSize: 0,
    };
  }

  /**
   * Register a plugin
   */
  register(plugin: StreamPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" already registered, replacing`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Unregister a plugin
   */
  unregister(name: string): void {
    this.plugins.delete(name);
  }

  /**
   * Initialize all plugins
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    for (const [, plugin] of this.plugins) {
      try {
        if (plugin.onInit) {
          await plugin.onInit();
        }
      } catch (error) {
        console.error(`Error initializing plugin "${plugin.name}":`, error);
      }
    }

    this.initialized = true;
  }

  /**
   * Destroy all plugins
   */
  async destroy(): Promise<void> {
    for (const [, plugin] of this.plugins) {
      try {
        if (plugin.onDestroy) {
          await plugin.onDestroy();
        }
      } catch (error) {
        console.error(`Error destroying plugin "${plugin.name}":`, error);
      }
    }

    this.initialized = false;
  }

  /**
   * Execute onChunk hooks
   */
  async executeChunk(chunk: string): Promise<string> {
    let result = chunk;
    this.context.lastChunkSize = chunk.length;
    this.context.isStreaming = true;

    for (const [, plugin] of this.plugins) {
      try {
        if (plugin.onChunk) {
          result = await plugin.onChunk(result, this.context);
        }
      } catch (error) {
        console.error(`Error in plugin "${plugin.name}" onChunk:`, error);
      }
    }

    this.context.totalChunksProcessed++;
    return result;
  }

  /**
   * Execute onTokens hooks
   */
  async executeTokens(tokens: ParsedToken[]): Promise<ParsedToken[]> {
    let result = tokens;

    for (const [, plugin] of this.plugins) {
      try {
        if (plugin.onTokens) {
          result = await plugin.onTokens(result, this.context);
        }
      } catch (error) {
        console.error(`Error in plugin "${plugin.name}" onTokens:`, error);
      }
    }

    return result;
  }

  /**
   * Execute onRender hooks
   */
  async executeRender(content: string): Promise<string> {
    let result = content;

    for (const [, plugin] of this.plugins) {
      try {
        if (plugin.onRender) {
          result = await plugin.onRender(result, this.context);
        }
      } catch (error) {
        console.error(`Error in plugin "${plugin.name}" onRender:`, error);
      }
    }

    return result;
  }

  /**
   * Execute onError hooks
   */
  async executeError(error: Error): Promise<void> {
    for (const [, plugin] of this.plugins) {
      try {
        if (plugin.onError) {
          await plugin.onError(error, this.context);
        }
      } catch (e) {
        console.error(`Error in plugin "${plugin.name}" onError:`, e);
      }
    }
  }

  /**
   * Execute onComplete hooks
   */
  async executeComplete(stats: StreamStats): Promise<void> {
    this.context.isStreaming = false;

    for (const [, plugin] of this.plugins) {
      try {
        if (plugin.onComplete) {
          await plugin.onComplete(stats, this.context);
        }
      } catch (error) {
        console.error(`Error in plugin "${plugin.name}" onComplete:`, error);
      }
    }
  }

  /**
   * Get plugin by name
   */
  get(name: string): StreamPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * List all plugins
   */
  list(): StreamPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Check if plugin exists
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }
}

/**
 * Built-in plugins
 */

import {
  renderMathToUnicode,
  replaceMathInText,
  extractMath,
} from '../utils/math-unicode-renderer';
import { renderMermaidToASCII, isMermaidCode } from '../utils/mermaid-ascii-renderer';
import { sanitizeForTerminal } from '../security/ansi-sanitizer';
import {
  highlightCodeWithShiki,
  formatCodeForTerminal,
} from '../utils/shiki-ansi-renderer';
import { StreamStats } from '../streaming/stream-stats';

/**
 * Math rendering plugin
 */
export const mathPlugin: StreamPlugin = {
  name: 'math',
  description: 'Renders LaTeX math expressions to Unicode',

  onTokens: async (tokens) => {
    return tokens.map(token => {
      if (token.type === 'paragraph' || token.type === 'text') {
        // Check if content has math
        if (token.content.includes('$')) {
          token.content = replaceMathInText(token.content);
        }
      } else if (token.type === 'codeblock' && token.lang === 'math') {
        token.content = renderMathToUnicode(token.content);
      }
      return token;
    });
  },
};

/**
 * Mermaid rendering plugin
 */
export const mermaidPlugin: StreamPlugin = {
  name: 'mermaid',
  description: 'Renders Mermaid diagrams to ASCII art',

  onTokens: async (tokens) => {
    return tokens.map(token => {
      if (token.type === 'mermaid' || (token.type === 'codeblock' && token.lang === 'mermaid')) {
        try {
          token.content = renderMermaidToASCII(token.content);
          token.type = 'mermaid';
        } catch (error) {
          console.warn('Mermaid rendering error:', error);
        }
      }
      return token;
    });
  },
};

/**
 * Security/sanitization plugin
 */
export const securityPlugin: StreamPlugin = {
  name: 'security',
  description: 'Sanitizes ANSI codes and prevents injection attacks',

  onChunk: async (chunk) => {
    return sanitizeForTerminal(chunk, {
      stripAnsi: false, // Allow safe ANSI codes
      maxLength: 1000000,
      allowUnicode: true,
    });
  },
};

/**
 * Syntax highlighting plugin
 */
export const syntaxHighlightPlugin: StreamPlugin = {
  name: 'syntax-highlight',
  description: 'Adds syntax highlighting using Shiki',

  onTokens: async (tokens) => {
    const processedTokens: ParsedToken[] = [];

    for (const token of tokens) {
      if (token.type === 'codeblock' && token.lang && token.lang !== 'mermaid') {
        try {
          const highlighted = await highlightCodeWithShiki(
            token.content,
            token.lang,
            'nord'
          );
          token.content = highlighted;
        } catch (error) {
          // Fallback to unhighlighted
          console.warn('Syntax highlighting error:', error);
        }
      }
      processedTokens.push(token);
    }

    return processedTokens;
  },
};

/**
 * Create default plugin registry with built-in plugins
 */
export function createDefaultRegistry(): PluginRegistry {
  const registry = new PluginRegistry();

  // Register built-in plugins
  registry.register(securityPlugin);
  registry.register(mathPlugin);
  registry.register(mermaidPlugin);
  registry.register(syntaxHighlightPlugin);

  return registry;
}

/**
 * Preset plugin configurations
 */
export const PLUGIN_PRESETS = {
  // Minimal: only security
  minimal: [securityPlugin],

  // Standard: security + formatting
  standard: [securityPlugin, mathPlugin, mermaidPlugin],

  // Full: everything
  full: [securityPlugin, mathPlugin, mermaidPlugin, syntaxHighlightPlugin],

  // AI-focused: security + math for formulas
  ai: [securityPlugin, mathPlugin],
};
