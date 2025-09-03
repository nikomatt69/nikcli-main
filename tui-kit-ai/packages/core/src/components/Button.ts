import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, computeBlessedStyle } from './BaseComponent';
import { resolveTheme } from '../theming/theme';

export type ButtonProps = BaseProps & {
  text: string;
  onClick?: () => void;
};

export class Button implements Component<Widgets.ButtonElement> {
  el: Widgets.ButtonElement;
  theme: any;
  destroy: () => void;

  constructor(props: ButtonProps) {
    const theme = resolveTheme(props.theme);
    const el = blessed.button({
      parent: props.parent,
      content: ` ${props.text} `,
      mouse: props.mouse ?? true,
      keys: props.keys ?? true,
      shrink: true,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
      style: {
        ...computeBlessedStyle(theme, props),
        hover: { bg: theme.accent, fg: theme.background },
        focus: { bg: theme.accent, fg: theme.background },
      },
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      label: props.label,
    });
    if (props.onClick) el.on('press', props.onClick);
    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }
}
