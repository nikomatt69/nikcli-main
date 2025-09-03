import blessed, { Widgets } from 'blessed';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type MessageHistoryProps = { parent: Widgets.Node; messages?: ChatMessage[] };

export class MessageHistory {
  el: Widgets.BoxElement;
  private list: Widgets.BoxElement;
  constructor(props: MessageHistoryProps) {
    this.el = blessed.box({ parent: props.parent, label: ' History ', border: 'line', scrollable: true, alwaysScroll: true });
    this.list = blessed.box({ parent: this.el, top: 0, left: 0, right: 0, bottom: 0, tags: true });
    this.render(props.messages || []);
  }
  render(messages: ChatMessage[]) {
    const formatted = messages.map(m => (m.role === 'user' ? `{bold}You:{/bold}` : `{green-fg}AI:{/green-fg}`) + ' ' + m.content).join('\n');
    this.list.setContent(formatted);
    this.list.setScrollPerc(100);
    this.el.screen.render();
  }
}
