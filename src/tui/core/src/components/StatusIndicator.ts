import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type StatusIndicatorProps = BaseProps & {
  status: 'idle' | 'running' | 'success' | 'warning' | 'error';
  text?: string;
};

function symbolFor(status: StatusIndicatorProps['status']) {
  switch (status) {
    case 'running': return '●';
    case 'success': return '✔';
    case 'warning': return '▲';
    case 'error': return '✖';
    case 'idle':
    default: return '○';
  }
}

export class StatusIndicator implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private status: StatusIndicatorProps['status'];
  private baseComponent: any;

  constructor(props: StatusIndicatorProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ 
      ...props, 
      borderStyle: 'none' 
    }, 'status-indicator');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;
    this.status = props.status;
    
    this.render(props.text);
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant);
  setSize = (size: any) => this.baseComponent.setSize(size);
  setState = (state: any) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: any) => this.baseComponent.update(props);

  setStatus(status: StatusIndicatorProps['status'], text?: string) {
    this.status = status;
    this.render(text);
  }

  private render(text?: string) {
    this.el.setContent(`${symbolFor(this.status)} ${text || this.status}`);
    this.el.screen.render();
  }

  // Static method to create status indicator with specific configuration
  static create(props: StatusIndicatorProps): StatusIndicator {
    return new StatusIndicator(props);
  }
}


