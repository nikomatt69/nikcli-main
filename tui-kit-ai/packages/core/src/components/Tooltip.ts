import blessed, { Widgets } from 'blessed';
import { BaseProps, Component } from './BaseComponent';

export type TooltipProps = BaseProps & { text: string; target: Widgets.BlessedElement };

export class Tooltip implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: TooltipProps) {
    const el = blessed.box({ parent: props.parent, width: 'shrink', height: 'shrink', border: { type: 'line' }, content: ` ${props.text} ` });
    const target = props.target;
    target.on('mouseover', () => { el.top = (target.top as number) - 1; el.left = (target.left as number) + 1; el.show(); el.screen.render(); });
    target.on('mouseout', () => { el.hide(); el.screen.render(); });
    el.hide();
    this.el = el;
    this.theme = {};
    this.destroy = () => el.destroy();
  }
}
