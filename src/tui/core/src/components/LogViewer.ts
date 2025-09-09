import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type LogViewerProps = BaseProps & {
  maxLines?: number;
  autoScroll?: boolean;
  timestamp?: boolean;
};

export class LogViewer implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: LogViewerProps;
  private maxLines: number;
  private autoScroll: boolean;
  private timestamp: boolean;

  constructor(props: LogViewerProps) {
    this.props = props;
    this.maxLines = props.maxLines ?? 500;
    this.autoScroll = props.autoScroll ?? true;
    this.timestamp = props.timestamp ?? false;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      scrollable: true,
      label: props.label || ' Logs '
    }, 'log-viewer');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  push(line: string) {
    const content = (this.el.getContent() || '').split('\n');
    const timestamp = this.timestamp ? `[${new Date().toLocaleTimeString()}] ` : '';
    content.push(timestamp + line);
    const sliced = content.slice(-this.maxLines);
    this.el.setContent(sliced.join('\n'));

    if (this.autoScroll) {
      this.el.setScrollPerc(100);
    }

    this.el.screen.render();
  }

  // Method to set max lines
  setMaxLines(maxLines: number) {
    this.maxLines = maxLines;
    const content = (this.el.getContent() || '').split('\n');
    const sliced = content.slice(-this.maxLines);
    this.el.setContent(sliced.join('\n'));
    this.el.screen.render();
  }

  // Method to toggle auto scroll
  setAutoScroll(autoScroll: boolean) {
    this.autoScroll = autoScroll;
  }

  // Method to toggle timestamp
  setTimestamp(timestamp: boolean) {
    this.timestamp = timestamp;
  }

  // Method to clear logs
  clear() {
    this.el.setContent('');
    this.el.screen.render();
  }

  // Method to get current log count
  getLogCount(): number {
    const content = this.el.getContent() || '';
    return content.split('\n').filter(line => line.trim()).length;
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

  // Static method to create log viewer with specific configuration
  static create(props: LogViewerProps): LogViewer {
    return new LogViewer(props);
  }
}


