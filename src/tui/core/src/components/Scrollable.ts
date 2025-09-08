import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type ScrollableProps = BaseProps & {
  content?: string;
  scrollable?: boolean;
  alwaysScroll?: boolean;
  scrollableOptions?: {
    scrollbar?: {
      ch?: string;
      style?: Record<string, any>;
    };
    track?: {
      bg?: string;
      ch?: string;
      style?: Record<string, any>;
    };
  };
};

export class Scrollable implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: ScrollableProps;

  constructor(props: ScrollableProps) {
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      scrollable: props.scrollable ?? true,
    }, 'scrollable');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    if (props.content) {
      this.el.setContent(props.content);
    }

    this.setupScrollbar();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private setupScrollbar() {
    const { scrollableOptions } = this.props;

    if (scrollableOptions?.scrollbar) {
      // Note: Blessed scrollbar styling is limited, but we can set basic properties
      if (scrollableOptions.scrollbar.ch) {
        // This would need to be implemented based on Blessed's scrollbar API
        // For now, we'll just store the configuration
      }
    }
  }

  // Method to set content
  setContent(content: string) {
    this.props.content = content;
    this.el.setContent(content);
    this.el.screen.render();
  }

  // Method to append content
  appendContent(content: string) {
    const currentContent = this.el.getContent() || '';
    this.props.content = currentContent + content;
    this.el.setContent(this.props.content);
    this.el.screen.render();
  }

  // Method to prepend content
  prependContent(content: string) {
    const currentContent = this.el.getContent() || '';
    this.props.content = content + currentContent;
    this.el.setContent(this.props.content);
    this.el.screen.render();
  }

  // Method to clear content
  clearContent() {
    this.props.content = '';
    this.el.setContent('');
    this.el.screen.render();
  }

  // Method to scroll to top
  scrollToTop() {
    this.el.setScrollPerc(0);
    this.el.screen.render();
  }

  // Method to scroll to bottom
  scrollToBottom() {
    this.el.setScrollPerc(100);
    this.el.screen.render();
  }

  // Method to scroll to specific percentage
  scrollTo(percentage: number) {
    const clampedPercentage = Math.max(0, Math.min(100, percentage));
    this.el.setScrollPerc(clampedPercentage);
    this.el.screen.render();
  }

  // Method to scroll up by lines
  scrollUp(lines: number = 1) {
    const currentScroll = this.el.getScrollPerc();
    const newScroll = Math.max(0, currentScroll - (lines * 5)); // Approximate
    this.scrollTo(newScroll);
  }

  // Method to scroll down by lines
  scrollDown(lines: number = 1) {
    const currentScroll = this.el.getScrollPerc();
    const newScroll = Math.min(100, currentScroll + (lines * 5)); // Approximate
    this.scrollTo(newScroll);
  }

  // Method to get current scroll position
  getScrollPosition(): number {
    return this.el.getScrollPerc();
  }

  // Method to get scroll height
  getScrollHeight(): number {
    const content = this.el.getContent() || '';
    return content.split('\n').length;
  }

  // Method to get visible height
  getVisibleHeight(): number {
    return this.el.height as number;
  }

  // Method to check if scrollable
  isScrollable(): boolean {
    return this.props.scrollable ?? true;
  }

  // Method to set scrollable
  setScrollable(scrollable: boolean) {
    this.props.scrollable = scrollable;
    // Note: Blessed BoxElement doesn't have a direct 'scrollable' property
    // Scrolling is handled through content management
    this.el.screen.render();
  }

  // Method to set always scroll
  setAlwaysScroll(alwaysScroll: boolean) {
    this.props.alwaysScroll = alwaysScroll;
    // Note: Blessed BoxElement doesn't have a direct 'alwaysScroll' property
    // Always scroll behavior is handled through content management
    this.el.screen.render();
  }

  // Method to get content
  getContent(): string {
    return this.props.content || '';
  }

  // Method to get content length
  getContentLength(): number {
    return this.getContent().length;
  }

  // Method to get line count
  getLineCount(): number {
    const content = this.getContent();
    return content.split('\n').length;
  }

  // Method to check if at top
  isAtTop(): boolean {
    return this.getScrollPosition() === 0;
  }

  // Method to check if at bottom
  isAtBottom(): boolean {
    return this.getScrollPosition() === 100;
  }

  // Method to scroll to specific line
  scrollToLine(lineNumber: number) {
    const totalLines = this.getLineCount();
    if (lineNumber >= 0 && lineNumber < totalLines) {
      const percentage = (lineNumber / totalLines) * 100;
      this.scrollTo(percentage);
    }
  }

  // Static method to create scrollable with specific configuration
  static create(props: ScrollableProps): Scrollable {
    return new Scrollable(props);
  }

  // Static method to create log viewer
  static logViewer(content?: string): Scrollable {
    return new Scrollable({
      content,
      scrollable: true,
      alwaysScroll: true,
      label: ' Logs ',
    });
  }

  // Static method to create text viewer
  static textViewer(content?: string): Scrollable {
    return new Scrollable({
      content,
      scrollable: true,
      alwaysScroll: false,
      label: ' Text ',
    });
  }
}


