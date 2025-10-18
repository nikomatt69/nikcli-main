import blessed, { Widgets } from 'blessed';
import { StreamingMarkdownParser } from './parser/streaming-parser';
import { BlessedRenderer } from './renderer/blessed-renderer';
import { StreamttyOptions, RenderContext, StreamBuffer } from './types';
import { AISDKStreamAdapter, AISDKStreamAdapterOptions } from './ai-sdk-adapter';
import { StreamEvent } from './types/stream-events';
import { PluginRegistry, createDefaultRegistry } from './plugins/plugin-system-inline';
import { sanitizeForTerminal, validateInput } from './security/ansi-sanitizer';
import { getTheme } from './themes';

export class Streamtty {
  private parser: StreamingMarkdownParser;
  private renderer: BlessedRenderer;
  private context: RenderContext;
  private updateInterval: NodeJS.Timeout | null = null;
  private pendingUpdate: boolean = false;
  private aiAdapter: AISDKStreamAdapter;
  private pluginRegistry: PluginRegistry | null = null;

  constructor(options: StreamttyOptions = {}) {
    const screen = options.screen || this.createDefaultScreen();
    const container = this.createContainer(screen);

    // Apply theme if specified
    const theme = options.theme ? getTheme(options.theme) : null;
    const styles = theme ? { ...theme.markdown, ...options.styles } : options.styles;

    const defaultOptions: Required<StreamttyOptions> = {
      parseIncompleteMarkdown: options.parseIncompleteMarkdown ?? true,
      styles: styles || {},
      syntaxHighlight: options.syntaxHighlight ?? true,
      showLineNumbers: options.showLineNumbers ?? false,
      maxWidth: options.maxWidth ?? 120,
      gfm: options.gfm ?? true,
      screen,
      autoScroll: options.autoScroll ?? false,
      remarkPlugins: options.remarkPlugins,
      rehypePlugins: options.rehypePlugins,
      theme: options.theme,
      shikiLanguages: options.shikiLanguages,
      controls: options.controls,
      mermaidConfig: options.mermaidConfig,
      mathConfig: options.mathConfig,
      security: options.security,
      enhancedFeatures: options.enhancedFeatures || {},
      isStreaming: options.isStreaming,
      components: options.components,
    } as Required<StreamttyOptions>;

    const buffer: StreamBuffer = {
      content: '',
      tokens: [],
      lastUpdate: Date.now(),
    };

    this.context = {
      screen,
      container,
      options: defaultOptions,
      buffer,
    };

    this.parser = new StreamingMarkdownParser(defaultOptions.parseIncompleteMarkdown);
    this.renderer = new BlessedRenderer(this.context);

    // Initialize AI SDK adapter
    this.aiAdapter = new AISDKStreamAdapter(this, {
      parseIncompleteMarkdown: defaultOptions.parseIncompleteMarkdown,
      syntaxHighlight: defaultOptions.syntaxHighlight,
      formatToolCalls: true,
      showThinking: true,
      maxToolResultLength: 200,
      renderTimestamps: false
    });

    // Initialize enhanced features with new plugin system
    this.initializeEnhancedFeatures();
  }

  /**
   * Initialize enhanced features with new plugin system
   */
  private async initializeEnhancedFeatures(): Promise<void> {
    const options = this.context.options;

    // Skip if no features enabled
    if (!options.enhancedFeatures || Object.values(options.enhancedFeatures).every(v => !v)) {
      return;
    }

    // Create plugin registry
    this.pluginRegistry = createDefaultRegistry();
    await this.pluginRegistry.init();
  }

  /**
   * Create default blessed screen
   */
  private createDefaultScreen(): Widgets.Screen {
    const screen = blessed.screen({
      smartCSR: true,
      title: 'Streamtty - AI Markdown Streaming',
      fullUnicode: true,
    });

    screen.key(['C-c', 'q', 'escape'], () => {
      return process.exit(0);
    });

    return screen;
  }

  /**
   * Create scrollable container
   */
  private createContainer(screen: Widgets.Screen): Widgets.BoxElement {
    const container = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      scrollable: true,
      alwaysScroll: false,
      scrollbar: {
        ch: '█',
        style: {
          fg: 'blue',
        },
      },
      keys: true,
      vi: false,
      mouse: false,
      tags: true,
    });

    // Scroll controls
    container.key(['up', 'k'], () => {
      container.scroll(-1);
      screen.render();
    });

    container.key(['down', 'j'], () => {
      container.scroll(1);
      screen.render();
    });

    container.key(['pageup'], () => {
      container.scroll(-(container.height as number));
      screen.render();
    });

    container.key(['pagedown'], () => {
      container.scroll(container.height as number);
      screen.render();
    });

    container.key(['home', 'g'], () => {
      container.setScrollPerc(0);
      screen.render();
    });

    container.key(['end', 'G'], () => {
      container.setScrollPerc(100);
      screen.render();
    });

    container.key(['space'], () => {
      container.setScrollPerc(100);
      screen.render();
    });

    container.focus();
    return container;
  }

  /**
   * Stream a chunk of markdown
   */
  public async stream(chunk: string): Promise<void> {
    let processedChunk = chunk;

    // Apply security sanitization if enabled
    if (this.context.options.enhancedFeatures?.security) {
      const validation = validateInput(processedChunk);
      if (!validation.valid) {
        console.warn('Security validation failed:', validation.errors);
        return;
      }
      processedChunk = validation.sanitized;
    }

    // Apply plugins if registry exists
    if (this.pluginRegistry) {
      processedChunk = await this.pluginRegistry.executeChunk(processedChunk);
    }

    this.context.buffer.content += processedChunk;
    this.context.buffer.lastUpdate = Date.now();

    // Parse tokens
    let tokens = this.parser.addChunk(processedChunk);

    // Apply plugin token processing
    if (this.pluginRegistry) {
      tokens = await this.pluginRegistry.executeTokens(tokens);
    }

    this.context.buffer.tokens = tokens;

    // Schedule render
    this.scheduleRender();
  }

  /**
   * Set complete markdown content
   */
  public setContent(markdown: string): void {
    this.clear();
    this.stream(markdown);
    this.render();
  }

  /**
   * Schedule a render (debounced)
   */
  private scheduleRender(): void {
    if (this.pendingUpdate) return;

    this.pendingUpdate = true;

    setImmediate(async () => {
      await this.render();
      this.pendingUpdate = false;
    });
  }

  /**
   * Render current tokens
   */
  public async render(): Promise<void> {
    await this.renderer.render(this.context.buffer.tokens);
    this.context.screen.render();
  }

  /**
   * Clear all content
   */
  public clear(): void {
    this.parser.clear();
    this.context.buffer.content = '';
    this.context.buffer.tokens = [];
    this.context.container.children.forEach(child => child.destroy());
    this.context.screen.render();
  }

  /**
   * Start auto-rendering
   */
  public startAutoRender(intervalMs: number = 50): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      if (this.context.buffer.tokens.length > 0) {
        this.render();
      }
    }, intervalMs);
  }

  /**
   * Stop auto-rendering
   */
  public stopAutoRender(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Get blessed screen instance
   */
  public getScreen(): Widgets.Screen {
    return this.context.screen;
  }

  /**
   * Get container box
   */
  public getContainer(): Widgets.BoxElement {
    return this.context.container;
  }

  /**
   * Get current buffer content
   */
  public getContent(): string {
    return this.context.buffer.content;
  }

  /**
   * Get plugin registry for advanced usage
   */
  public getPluginRegistry(): PluginRegistry | null {
    return this.pluginRegistry;
  }

  /**
   * Stream a structured AI SDK event
   */
  public async streamEvent(event: StreamEvent): Promise<void> {
    await this.aiAdapter.processEvent(event);
  }

  /**
   * Stream multiple AI SDK events
   */
  public async streamEvents(events: AsyncGenerator<StreamEvent>): Promise<void> {
    for await (const event of events) {
      await this.streamEvent(event);
    }
  }

  /**
   * Handle AI SDK stream with adapter
   */
  public async *handleAISDKStream(stream: AsyncGenerator<StreamEvent>): AsyncGenerator<void> {
    for await (const _ of this.aiAdapter.handleAISDKStream(stream)) {
      yield;
    }
  }

  /**
   * Update AI SDK adapter options
   */
  public updateAIOptions(options: Partial<AISDKStreamAdapterOptions>): void {
    this.aiAdapter.updateOptions(options);
  }

  /**
   * Get AI SDK adapter options
   */
  public getAIOptions(): AISDKStreamAdapterOptions {
    return this.aiAdapter.getOptions();
  }

  /**
   * Destroy and cleanup
   */
  public async destroy(): Promise<void> {
    this.stopAutoRender();
    this.clear();

    if (this.pluginRegistry) {
      await this.pluginRegistry.destroy();
    }

    this.context.screen.destroy();
  }
}

// ============================================================================
// EXPORTS - CORE & NEW FEATURES ONLY
// ============================================================================

// Core types and classes
export * from './types';
export * from './types/stream-events';
export { StreamingMarkdownParser } from './parser/streaming-parser';
export { BlessedRenderer } from './renderer/blessed-renderer';
export { AISDKStreamAdapter } from './ai-sdk-adapter';
export { StreamProtocol } from './stream-protocol';
export * from './streamdown-compat';
export * from './errors';
export * from './events';
export * from './performance';
export * from './themes';

// NEW: Streamdown Parity Features
export * from './utils/shiki-ansi-renderer';
export * from './utils/math-unicode-renderer';
export * from './utils/mermaid-ascii-renderer';
export * from './utils/table-formatter-inline';
export * from './utils/syntax-highlighter';
export * from './streaming/stream-stats';
export * from './widgets/stream-indicator';
export * from './plugins/plugin-system-inline';
export * from './security/ansi-sanitizer';

// Type exports
export type {

  EnhancedFeaturesConfig,
  TTYControlsConfig,
  MermaidTTYConfig,
  MathRenderConfig,
  SecurityConfig,
  KeyBindings,
  ComponentOverrides
} from './types';
