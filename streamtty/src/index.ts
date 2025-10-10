import blessed, { Widgets } from 'blessed';
import { StreamingMarkdownParser } from './parser/streaming-parser';
import { BlessedRenderer } from './renderer/blessed-renderer';
import { StreamttyOptions, RenderContext, StreamBuffer } from './types';

export class Streamtty {
  private parser: StreamingMarkdownParser;
  private renderer: BlessedRenderer;
  private context: RenderContext;
  private updateInterval: NodeJS.Timeout | null = null;
  private pendingUpdate: boolean = false;

  constructor(options: StreamttyOptions = {}) {
    const screen = options.screen || this.createDefaultScreen();
    const container = this.createContainer(screen);
    
    const defaultOptions: Required<StreamttyOptions> = {
      parseIncompleteMarkdown: options.parseIncompleteMarkdown ?? true,
      styles: options.styles || {},
      syntaxHighlight: options.syntaxHighlight ?? true,
      showLineNumbers: options.showLineNumbers ?? false,
      maxWidth: options.maxWidth ?? 120,
      gfm: options.gfm ?? true,
      screen,
      autoScroll: options.autoScroll ?? true,
    };

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

    this.setupKeyBindings();
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

    screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });

    return screen;
  }

  /**
   * Create scrollable container
   */
  private createContainer(screen: Widgets.Screen): Widgets.BoxElement {
    return blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '█',
        style: {
          fg: 'blue',
        },
      },
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
    });
  }

  /**
   * Setup key bindings
   */
  private setupKeyBindings(): void {
    const { screen, container } = this.context;

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
      container.scroll(-container.height as number);
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

    container.focus();
  }

  /**
   * Stream a chunk of markdown
   */
  public stream(chunk: string): void {
    this.context.buffer.content += chunk;
    this.context.buffer.lastUpdate = Date.now();
    
    // Parse the new content
    const tokens = this.parser.addChunk(chunk);
    this.context.buffer.tokens = tokens;
    
    // Debounced render
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
   * Schedule a render (debounced for performance)
   */
  private scheduleRender(): void {
    if (this.pendingUpdate) return;
    
    this.pendingUpdate = true;
    
    // Use setImmediate for next tick rendering
    setImmediate(() => {
      this.render();
      this.pendingUpdate = false;
    });
  }

  /**
   * Render current tokens
   */
  public render(): void {
    this.renderer.render(this.context.buffer.tokens);
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
   * Start auto-rendering at interval
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
   * Get the blessed screen instance
   */
  public getScreen(): Widgets.Screen {
    return this.context.screen;
  }

  /**
   * Get the container box
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
   * Destroy and cleanup
   */
  public destroy(): void {
    this.stopAutoRender();
    this.clear();
    this.context.screen.destroy();
  }
}

// Export everything
export * from './types';
export { StreamingMarkdownParser } from './parser/streaming-parser';
export { BlessedRenderer } from './renderer/blessed-renderer';
