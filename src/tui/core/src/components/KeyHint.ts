import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type KeyHintProps = BaseProps & {
  hints: { key: string; label: string }[];
  separator?: string;
  showBrackets?: boolean;
};

export class KeyHint implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: KeyHintProps;

  constructor(props: KeyHintProps) {
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: 'none',
      height: 1
    }, 'key-hint');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.renderHints();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private renderHints() {
    const separator = this.props.separator || '   ';
    const showBrackets = this.props.showBrackets !== false;

    const content = this.props.hints.map(h => {
      const key = showBrackets ? `[${h.key}]` : h.key;
      return `${key} ${h.label}`;
    }).join(separator);

    this.el.setContent(content);
  }

  // Method to set hints
  setHints(hints: { key: string; label: string }[]) {
    this.props.hints = hints;
    this.renderHints();
    this.el.screen.render();
  }

  // Method to add hint
  addHint(hint: { key: string; label: string }) {
    this.props.hints.push(hint);
    this.renderHints();
    this.el.screen.render();
  }

  // Method to remove hint by key
  removeHint(key: string) {
    this.props.hints = this.props.hints.filter(h => h.key !== key);
    this.renderHints();
    this.el.screen.render();
  }

  // Method to clear all hints
  clearHints() {
    this.props.hints = [];
    this.renderHints();
    this.el.screen.render();
  }

  // Method to set separator
  setSeparator(separator: string) {
    this.props.separator = separator;
    this.renderHints();
    this.el.screen.render();
  }

  // Method to toggle brackets
  setShowBrackets(show: boolean) {
    this.props.showBrackets = show;
    this.renderHints();
    this.el.screen.render();
  }

  // Static method to create key hint with specific configuration
  static create(props: KeyHintProps): KeyHint {
    return new KeyHint(props);
  }
}


