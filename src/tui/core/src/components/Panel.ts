import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type PanelProps = BaseProps & {
  title?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  headerHeight?: number;
};

export class Panel implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: PanelProps;
  private headerBox?: Widgets.BoxElement;
  private contentBox?: Widgets.BoxElement;
  private collapsed: boolean;

  constructor(props: PanelProps) {
    this.props = props;
    this.collapsed = props.collapsed ?? false;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: props.borderStyle || 'line',
      label: props.title || props.label,
    }, 'panel');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.setupPanelStructure();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private setupPanelStructure() {
    const { title, collapsible, headerHeight = 3 } = this.props;

    if (title || collapsible) {
      // Create header
      this.headerBox = blessed.box({
        parent: this.el,
        top: 0,
        left: 0,
        right: 0,
        height: headerHeight,
        border: { type: 'line' },
        style: {
          bg: this.theme.background,
          fg: this.theme.foreground,
        },
      });

      if (title) {
        blessed.text({
          parent: this.headerBox,
          content: title,
          top: 1,
          left: 2,
          style: { fg: this.theme.foreground, bold: true },
        });
      }

      // Create content area below header
      this.contentBox = blessed.box({
        parent: this.el,
        top: headerHeight,
        left: 0,
        right: 0,
        bottom: 0,
        style: {
          bg: this.theme.background,
          fg: this.theme.foreground,
        },
      });

      // Setup collapse functionality
      if (collapsible) {
        this.el.key(['space', 'enter'], () => this.toggleCollapse());
        this.updateCollapsedState();
      }
    }
  }

  private updateCollapsedState() {
    if (this.contentBox) {
      this.contentBox.hidden = this.collapsed;

      if (this.collapsed) {
        this.el.height = (this.props.headerHeight || 3) + 2; // Header + border
      } else {
        this.el.height = this.props.height || 10;
      }

      this.el.screen.render();
    }
  }

  // Method to set panel title
  setTitle(title: string) {
    this.props.title = title;
    this.el.setLabel(title);

    if (this.headerBox && this.headerBox.children?.[0]) {
      const titleText = this.headerBox.children[0] as Widgets.TextElement;
      titleText.setContent(title);
      this.el.screen.render();
    }
  }

  // Method to toggle collapse
  toggleCollapse() {
    if (this.props.collapsible) {
      this.collapsed = !this.collapsed;
      this.updateCollapsedState();
    }
  }

  // Method to set collapsed state
  setCollapsed(collapsed: boolean) {
    if (this.props.collapsible) {
      this.collapsed = collapsed;
      this.updateCollapsedState();
    }
  }

  // Method to check if collapsed
  isCollapsed(): boolean {
    return this.collapsed;
  }

  // Method to get content area
  getContentArea(): Widgets.BoxElement | undefined {
    return this.contentBox;
  }

  // Method to get header area
  getHeaderArea(): Widgets.BoxElement | undefined {
    return this.headerBox;
  }

  // Method to set header height
  setHeaderHeight(height: number) {
    this.props.headerHeight = height;

    if (this.headerBox) {
      this.headerBox.height = height;

      if (this.contentBox) {
        this.contentBox.top = height;
      }

      this.updateCollapsedState();
    }
  }

  // Method to make panel collapsible
  setCollapsible(collapsible: boolean) {
    this.props.collapsible = collapsible;

    if (collapsible && !this.headerBox) {
      this.setupPanelStructure();
    }
  }

  // Static method to create panel with specific configuration
  static create(props: PanelProps): Panel {
    return new Panel(props);
  }
}


