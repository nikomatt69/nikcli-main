import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type CardProps = BaseProps & {
  title?: string;
  subtitle?: string;
  content?: string;
  footer?: string;
  header?: boolean;
  showFooter?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  onHover?: () => void;
  onFocus?: () => void;
  // Card-specific styling
  headerStyle?: Record<string, any>;
  contentStyle?: Record<string, any>;
  footerStyle?: Record<string, any>;
  // Interactive features
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
};

export class Card implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: CardProps;
  private currentVariant: ComponentVariant;
  private currentSize: ComponentSize;
  private currentState: ComponentState;
  private headerBox?: Widgets.BoxElement;
  private contentBox?: Widgets.BoxElement;
  private footerBox?: Widgets.BoxElement;

  constructor(props: CardProps) {
    this.props = props;
    this.currentVariant = (props.variant as ComponentVariant) || 'default';
    this.currentSize = (props.size as ComponentSize) || 'md';
    this.currentState = (props.state as ComponentState) || 'default';

    // Create main card container
    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      width: props.width || 40,
      height: props.height || 16,
    }, 'card');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.setupCardStructure();
    this.setupEventHandlers();
    this.applyCardStyling();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private setupCardStructure() {
    const { title, subtitle, content, footer, header: showHeader, showFooter } = this.props;

    // Create header if title or subtitle is provided
    if (showHeader && (title || subtitle)) {
      this.headerBox = blessed.box({
        parent: this.el,
        top: 0,
        left: 0,
        right: 0,
        height: title && subtitle ? 3 : 2,
        padding: { top: 1, bottom: 1, left: 2, right: 2 },
        border: { type: 'line' },
        style: this.props.headerStyle || {
          bg: this.theme.background,
          fg: this.theme.foreground,
        },
      });

      if (title) {
        blessed.text({
          parent: this.headerBox,
          content: title,
          top: 0,
          left: 1,
          style: { fg: this.theme.foreground, bold: true },
        });
      }

      if (subtitle) {
        blessed.text({
          parent: this.headerBox,
          content: subtitle,
          top: title ? 1 : 0,
          left: 1,
          style: { fg: this.theme.muted, italic: true },
        });
      }
    }

    // Create content area
    this.contentBox = blessed.box({
      parent: this.el,
      top: this.headerBox ? (this.headerBox.height as number) : 0,
      left: 0,
      right: 0,
      bottom: showFooter ? 3 : 0,
      padding: { top: 2, bottom: 2, left: 2, right: 2 },
      scrollable: true,
      style: this.props.contentStyle || {
        bg: this.theme.background,
        fg: this.theme.foreground,
      },
    });

    if (content) {
      blessed.text({
        parent: this.contentBox,
        content: content,
        top: 0,
        left: 0,
        style: { fg: this.theme.foreground },
      });
    }

    // Create footer if specified
    if (showFooter && footer) {
      this.footerBox = blessed.box({
        parent: this.el,
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        padding: { top: 1, bottom: 1, left: 2, right: 2 },
        border: { type: 'line' },
        style: this.props.footerStyle || {
          bg: this.theme.muted,
          fg: this.theme.foreground,
        },
      });

      blessed.text({
        parent: this.footerBox,
        content: footer,
        top: 1,
        left: 1,
        style: { fg: this.theme.foreground },
      });
    }
  }

  private setupEventHandlers() {
    const { clickable, onClick, onHover, onFocus, selectable, onSelect } = this.props;

    if (clickable && onClick) {
      this.el.on('click', onClick);
    }

    if (onHover) {
      this.el.on('mouseover', onHover);
    }

    if (onFocus) {
      this.el.on('focus', onFocus);
    }

    if (selectable) {
      this.el.on('click', () => {
        if (onSelect) {
          const newSelected = !this.props.selected;
          this.props.selected = newSelected;
          this.setSelected(newSelected);
          onSelect(newSelected);
        }
      });
    }
  }

  private applyCardStyling() {
    // Apply variant-specific styling
    switch (this.currentVariant) {
      case 'default':
        this.el.style.border = { type: 'line', fg: this.theme.border };
        this.el.style.bg = this.theme.background;
        break;
      case 'secondary':
        this.el.style.border = { type: 'line', fg: this.theme.border };
        this.el.style.bg = this.theme.muted;
        break;
      case 'destructive':
        this.el.style.border = { type: 'line', fg: 'red' };
        this.el.style.bg = this.theme.background;
        break;
      default:
        this.el.style.border = { type: 'line', fg: this.theme.border };
        this.el.style.bg = this.theme.background;
    }

    this.el.screen.render();
  }

  private applyCustomCardStyling(style: 'elevated' | 'outlined' | 'filled' | 'ghost') {
    switch (style) {
      case 'elevated':
        this.el.style.border = { type: 'line', fg: this.theme.border };
        this.el.style.shadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        break;
      case 'outlined':
        this.el.style.border = { type: 'line', fg: this.theme.border };
        this.el.style.bg = 'transparent';
        break;
      case 'filled':
        this.el.style.bg = this.theme.muted;
        this.el.style.border = { type: 'line', fg: this.theme.border };
        break;
      case 'ghost':
        this.el.style.border = { type: 'none' };
        this.el.style.bg = 'transparent';
        break;
    }
    this.el.screen.render();
  }

  // Method to update card variant
  setCardVariant(variant: ComponentVariant) {
    this.currentVariant = variant;
    this.applyCardStyling();
  }

  // Method to set custom card style
  setCardStyle(style: 'elevated' | 'outlined' | 'filled' | 'ghost') {
    this.applyCustomCardStyling(style);
  }

  // Method to update card size
  setCardSize(size: ComponentSize) {
    this.currentSize = size;

    // Update dimensions based on size
    const sizeMap = {
      xs: { width: 20, height: 8 },
      sm: { width: 30, height: 12 },
      md: { width: 40, height: 16 },
      lg: { width: 50, height: 20 },
      xl: { width: 60, height: 24 },
    };

    const sizeConfig = sizeMap[size];
    if (sizeConfig) {
      this.el.width = sizeConfig.width;
      this.el.height = sizeConfig.height;
    }

    this.el.screen.render();
  }

  // Method to update card state
  setCardState(state: ComponentState) {
    this.currentState = state;

    switch (state) {
      case 'hover':
        this.el.style.bg = this.theme.accent;
        break;
      case 'focus':
        this.el.style.border = { type: 'line', fg: this.theme.accent };
        break;
      case 'active':
        this.el.style.bg = this.theme.accent;
        break;
      case 'disabled':
        this.el.style.bg = this.theme.muted;
        this.el.style.fg = this.theme.foreground;
        break;
      default:
        this.applyCardStyling();
    }

    this.el.screen.render();
  }

  // Method to set selected state
  setSelected(selected: boolean) {
    this.props.selected = selected;

    if (selected) {
      this.el.style.border = { type: 'line', fg: this.theme.accent, style: 'double' };
    } else {
      this.applyCardStyling();
    }

    this.el.screen.render();
  }

  // Method to update card content
  setContent(content: string) {
    this.props.content = content;

    if (this.contentBox) {
      this.contentBox.setContent(content);
      this.el.screen.render();
    }
  }

  // Method to update card title
  setTitle(title: string) {
    this.props.title = title;

    if (this.headerBox) {
      const titleText = this.headerBox.children?.[0] as Widgets.TextElement;
      if (titleText) {
        titleText.setContent(title);
        this.el.screen.render();
      }
    }
  }

  // Method to update card subtitle
  setSubtitle(subtitle: string) {
    this.props.subtitle = subtitle;

    if (this.headerBox) {
      const subtitleText = this.headerBox.children?.[1] as Widgets.TextElement;
      if (subtitleText) {
        subtitleText.setContent(subtitle);
        this.el.screen.render();
      }
    }
  }

  // Method to update card footer
  setFooter(footer: string) {
    this.props.footer = footer;

    if (this.footerBox) {
      const footerText = this.footerBox.children?.[0] as Widgets.TextElement;
      if (footerText) {
        footerText.setContent(footer);
        this.el.screen.render();
      }
    }
  }

  // Method to get current card configuration
  getCardConfig() {
    return {
      variant: this.currentVariant,
      size: this.currentSize,
      state: this.currentState,
      selected: this.props.selected,
      clickable: this.props.clickable,
      selectable: this.props.selectable,
    };
  }

  // Static method to create card with specific configuration
  static create(props: CardProps): Card {
    return new Card(props);
  }

  // Static method to create card grid
  static createGrid(cards: CardProps[], options?: {
    columns?: number;
    spacing?: number;
    alignment?: 'start' | 'center' | 'end';
  }): Card[] {
    const { columns = 3, spacing = 2, alignment = 'start' } = options || {};
    const cardInstances: Card[] = [];

    cards.forEach((cardProps, index) => {
      const card = new Card(cardProps);
      const row = Math.floor(index / columns);
      const col = index % columns;

      card.el.top = row * ((card.el.height as number) + spacing);
      card.el.left = col * ((card.el.width as number) + spacing);

      cardInstances.push(card);
    });

    return cardInstances;
  }

  // Static method to create card carousel
  static createCarousel(cards: CardProps[], options?: {
    spacing?: number;
    autoScroll?: boolean;
    scrollInterval?: number;
  }): Card[] {
    const { spacing = 2, autoScroll = false, scrollInterval = 3000 } = options || {};
    const cardInstances: Card[] = [];

    cards.forEach((cardProps, index) => {
      const card = new Card(cardProps);
      card.el.top = 0;
      card.el.left = index * ((card.el.width as number) + spacing);

      cardInstances.push(card);
    });

    if (autoScroll) {
      let currentIndex = 0;
      setInterval(() => {
        cardInstances.forEach((card, index) => {
          const newLeft = ((index - currentIndex + cardInstances.length) % cardInstances.length) *
            ((card.el.width as number) + spacing);
          card.el.left = newLeft;
        });
        currentIndex = (currentIndex + 1) % cardInstances.length;
        cardInstances[0].el.screen.render();
      }, scrollInterval);
    }

    return cardInstances;
  }
}
