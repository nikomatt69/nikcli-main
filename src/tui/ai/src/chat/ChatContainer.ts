// TODO: Consider refactoring for reduced complexity
import blessed, { Widgets } from 'blessed';
import { AIService, Message, STOP_SEQUENCES } from '../streaming/AIService';
import { KEY, safeRender } from '@tui-kit-ai/core';

export type ChatContainerProps = {
  parent: Widgets.Node;
  messages: Message[];
  ai?: AIService;
  systemPrompt?: string;
  onMessageSubmit?: (content: string) => Promise<void> | void;
  onError?: (error: Error) => void;
};

export class ChatContainer {
  root: Widgets.BoxElement;
  history: Widgets.BoxElement;
  input: Widgets.TextboxElement;
  statusBar: Widgets.BoxElement;
  errorToast: Widgets.BoxElement;
  private currentStream: { abort: () => void } | null = null;
  private messages: Message[] = [];
  private _errorToastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ChatContainerProps) {
    this.messages = [...props.messages];

    this.root = blessed.box({
      parent: props.parent,
      keys: true,
      mouse: true,
      border: { type: 'line' },
      label: ' Chat ',
    });

    this.history = blessed.box({
      parent: this.root,
      top: 0,
      left: 0,
      right: 0,
      bottom: 4,
      scrollable: true,
      alwaysScroll: true,
      tags: true,
    });

    this.statusBar = blessed.box({
      parent: this.root,
      bottom: 3,
      left: 0,
      right: 0,
      height: 1,
      content: '⌨︎ Enter: send • Esc: clear • Ctrl+C: abort',
      style: { fg: 'gray' },
    });

    // Error toast (hidden by default)
    this.errorToast = blessed.box({
      parent: this.root,
      top: 1,
      left: 1,
      right: 1,
      height: 3,
      content: '',
      style: { fg: 'white', bg: 'red', border: { fg: 'red' } },
      hidden: true,
    });

    this.input = blessed.textbox({
      parent: this.root,
      top: 0,
      left: 0,
      right: 1,
      height: 3,
      inputOnFocus: true,
      border: { type: 'line' },
      label: ' Message ',
      borderStyle: 'line',
      borderColor: 'cyan',
      focus: true,
    });

    this.renderMessages();

    // Enhanced key handling with abort support
    this.root.key([KEY.enter], async () => {
      const content =
        typeof this.input.getValue === 'function' ? this.input.getValue() : '';
      if (!content) return;

      // Prefer setValue('') which is more compatible than clearValue()
      if (typeof this.input.setValue === 'function') {
        try {
          this.input.setValue('');
        } catch {
          // fallback to other method
          if (typeof (this.input as any).clearValue === 'function') {
            (this.input as any).clearValue();
          }
        }
      } else if (typeof (this.input as any).clearValue === 'function') {
        (this.input as any).clearValue();
      }

      this.addMessage({ role: 'user', content });

      if (props.onMessageSubmit) {
        await props.onMessageSubmit(content);
      } else if (props.ai) {
        await this.handleAIResponse(
          props.ai,
          props.systemPrompt,
          props.onError,
        );
      }
    });

    // Abort current stream with Ctrl+C
    this.root.key([KEY.ctrlC], () => {
      if (this.currentStream) {
        try {
          this.currentStream.abort();
        } catch {}
        this.currentStream = null;
        try {
          this.statusBar.setContent('⏹️  aborted');
        } catch {}
        try {
          safeRender(this.root.screen);
        } catch {}
      }
    });

    // Ctrl+R to retry last message
    this.root.key(['C-r'], () => {
      if (this.messages.length > 0 && props.ai) {
        const lastUserMessage = [...this.messages]
          .reverse()
          .find((m) => m.role === 'user');
        if (lastUserMessage) {
          this.handleAIResponse(props.ai, props.systemPrompt, props.onError);
        }
      }
    });
  }

  private addMessage(message: Message) {
    this.messages.push(message);
    this.renderMessages();
  }

  private async handleAIResponse(
    ai: AIService,
    systemPrompt?: string,
    onError?: (error: Error) => void,
  ) {
    try {
      try {
        this.statusBar.setContent('🤖 Streaming...');
      } catch {}
      try {
        safeRender(this.root.screen);
      } catch {}

      const messages: Message[] = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...this.messages]
        : this.messages;

      const result = await ai.streamCompletion(messages);
      this.currentStream = result;

      let assistantContent = '';
      let chunkBuffer = '';
      this.addMessage({ role: 'assistant', content: '' });

      for await (const chunk of result.textStream) {
        if (!chunk) continue;

        // Filter unwanted ANSI sequences from AI output
        const cleanChunk = chunk.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
        chunkBuffer += cleanChunk;

        // Check for stop sequences
        const shouldStop = STOP_SEQUENCES.some((seq: string) =>
          chunkBuffer.includes(seq),
        );

        if (shouldStop) {
          // Trim content at stop sequence
          const stopIndex = Math.min(
            ...STOP_SEQUENCES.map((seq: string) => {
              const idx = chunkBuffer.indexOf(seq);
              return idx === -1 ? Infinity : idx;
            }),
          );
          chunkBuffer = chunkBuffer.substring(0, stopIndex);
          assistantContent += chunkBuffer;
          this.messages[this.messages.length - 1].content = assistantContent;
          this.renderMessages();
          break; // Stop streaming
        }

        // Coalesce chunks until semantically complete (sentence end or 40-80 chars)
        const isSentenceEnd = /[.!?…)]\s$/.test(chunkBuffer);
        const isLongEnough = chunkBuffer.length >= 40;
        const isWordBoundary = chunk.includes(' ') || chunk.includes('\n');

        if (
          isSentenceEnd ||
          isLongEnough ||
          (chunkBuffer.length >= 10 && isWordBoundary)
        ) {
          assistantContent += chunkBuffer;
          this.messages[this.messages.length - 1].content = assistantContent;
          this.renderMessages();
          chunkBuffer = '';
        }
      }

      // Flush remaining buffer
      if (chunkBuffer) {
        assistantContent += chunkBuffer;
        this.messages[this.messages.length - 1].content = assistantContent;
        this.renderMessages();
      }

      this.currentStream = null;
      try {
        this.statusBar.setContent('✅ Complete');
      } catch {}
      try {
        safeRender(this.root.screen);
      } catch {}
    } catch (error) {
      this.currentStream = null;
      try {
        this.statusBar.setContent('❌ Error');
      } catch {}
      try {
        safeRender(this.root.screen);
      } catch {}

      if (onError) {
        onError(error as Error);
      } else {
        console.error('Chat error:', error);
      }
    }
  }

  renderMessages() {
    const formatted = this.messages
      .map((m) =>
        m.role === 'user'
          ? `{bold}You:{/bold} ` + m.content
          : `{green-fg}AI:{/green-fg} ` + m.content,
      )
      .join('\n');
    try {
      this.history.setContent(formatted);
      this.history.setScrollPerc(100);
    } catch {}
    try {
      safeRender(this.root.screen);
    } catch {}
  }

  private showError(message: string, backoffMs?: number) {
    const backoffText = backoffMs
      ? ` Riprova tra ${Math.ceil(backoffMs / 1000)}s (Ctrl+R).`
      : '';
    try {
      this.errorToast.setContent(`⚠️ ${message}${backoffText}`);
      this.errorToast.show();
      safeRender(this.root.screen);
    } catch {}

    // Auto-hide after 5 seconds - store the timer so we can clear it on destroy
    if (this._errorToastTimer) {
      clearTimeout(this._errorToastTimer as any);
    }
    this._errorToastTimer = setTimeout(() => {
      try {
        this.errorToast.hide();
      } catch {}
      try {
        safeRender(this.root.screen);
      } catch {}
      this._errorToastTimer = null;
    }, 5000);
  }

  // Public methods
  addUserMessage(content: string) {
    this.addMessage({ role: 'user', content });
  }

  addAssistantMessage(content: string) {
    this.addMessage({ role: 'assistant', content });
  }

  clearMessages() {
    this.messages = [];
    this.renderMessages();
  }

  destroy() {
    if (this.currentStream) {
      try {
        this.currentStream.abort();
      } catch {}
      this.currentStream = null;
    }
    if (this._errorToastTimer) {
      clearTimeout(this._errorToastTimer as any);
      this._errorToastTimer = null;
    }
    try {
      this.root.destroy();
    } catch {}
  }
}
