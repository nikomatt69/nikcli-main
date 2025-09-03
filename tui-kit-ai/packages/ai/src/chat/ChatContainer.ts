import blessed, { Widgets } from 'blessed';

export type ChatContainerProps = {
  parent: Widgets.Node;
  messages: { role: 'user' | 'assistant'; content: string }[];
  onMessageSubmit?: (content: string) => Promise<void> | void;
};

export class ChatContainer {
  root: Widgets.BoxElement;
  history: Widgets.BoxElement;
  input: Widgets.TextboxElement;

  constructor(props: ChatContainerProps) {
    this.root = blessed.box({ parent: props.parent, keys: true, mouse: true, border: { type: 'line' }, label: ' Chat ' });
    this.history = blessed.box({ parent: this.root, top: 0, left: 0, right: 0, bottom: 3, scrollable: true, alwaysScroll: true, tags: true });
    this.input = blessed.textbox({ parent: this.root, bottom: 0, left: 0, right: 0, height: 3, inputOnFocus: true, border: { type: 'line' }, label: ' Message ' });

    this.renderMessages(props.messages);

    this.root.key(['enter'], async () => {
      const content = this.input.getValue();
      if (!content) return;
      this.input.clearValue();
      if (props.onMessageSubmit) await props.onMessageSubmit(content);
    });
  }

  renderMessages(messages: { role: 'user' | 'assistant'; content: string }[]) {
    const formatted = messages
      .map((m) => (m.role === 'user' ? `{bold}You:{/bold} ${m.content}` : `{green-fg}AI:{/green-fg} ${m.content}`))
      .join('\n');
    this.history.setContent(formatted);
    this.history.setScrollPerc(100);
    this.root.screen.render();
  }
}
