import blessed, { Widgets } from 'blessed';

export type MessageBubbleProps = { parent: Widgets.Node; role: 'user' | 'assistant'; content: string };

export class MessageBubble {
  el: Widgets.BoxElement;
  constructor(props: MessageBubbleProps) {
    const label = props.role === 'user' ? 'You' : 'AI';
    this.el = blessed.box({ parent: props.parent, border: 'line', label: ` ${label} `, tags: true, content: props.content });
  }
}


