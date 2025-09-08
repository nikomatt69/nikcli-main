// TODO: Consider refactoring for reduced complexity
import type { Message } from 'ai';
import { EventEmitter } from 'events';

export interface UseChatTUIOptions {
  api?: string;
  id?: string;
  initialMessages?: Message[];
  onResponse?: (response: Response) => void;
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
  onUpdate?: () => void; // Called when state changes (for re-rendering)

  // TUI-specific options
  maxRetries?: number;
  retryDelay?: number;
  tokenLimit?: number;
}

/**
 * TUI Chat Manager for blessed.js applications
 * Provides chat functionality similar to Vercel AI SDK but optimized for terminal interfaces
 */
export class ChatTUI extends EventEmitter {
  private options: UseChatTUIOptions;
  private _messages: Message[] = [];
  private _input: string = '';
  private _isLoading: boolean = false;
  private _error?: Error;

  // TUI-specific state
  private _streaming: boolean = false;
  private _currentStreamingMessage: string = '';
  private _tokenCount: number = 0;
  private _messageHistory: Message[] = [];
  private _queue: Message[] = [];
  private _connectionStatus: 'connected' | 'disconnected' | 'connecting' =
    'disconnected';
  private _retryCount: number = 0;

  private abortController?: AbortController;
  private lastUserMessage: string = '';

  constructor(options: UseChatTUIOptions = {}) {
    super();
    this.options = {
      api: '/api/chat',
      maxRetries: 3,
      retryDelay: 1000,
      tokenLimit: 4000,
      ...options,
    };

    if (options.initialMessages) {
      this._messages = [...options.initialMessages];
      this._messageHistory = [...options.initialMessages];
      this.updateTokenCount();
    }
  }

  // Getters for state
  get messages(): Message[] {
    return [...this._messages];
  }

  get input(): string {
    return this._input;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  get error(): Error | undefined {
    return this._error;
  }

  get streaming(): boolean {
    return this._streaming;
  }

  get currentStreamingMessage(): string {
    return this._currentStreamingMessage;
  }

  get tokenCount(): number {
    return this._tokenCount;
  }

  get messageHistory(): Message[] {
    return [...this._messageHistory];
  }

  get queue(): Message[] {
    return [...this._queue];
  }

  get queueLength(): number {
    return this._queue.length;
  }

  get connectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    return this._connectionStatus;
  }

  get transcript(): string {
    return this._messages
      .map((m) => {
        const timestamp = m.createdAt
          ? new Date(m.createdAt as any).toISOString()
          : '';
        return `[${timestamp}] ${m.role.toUpperCase()}: ${m.content}`;
      })
      .join('\n');
  }

  // Set input
  setInput(value: string): void {
    this._input = value;
    this.notifyUpdate();
  }

  // Submit message
  async submit(message?: string): Promise<void> {
    const messageToSend = message || this._input.trim();
    if (!messageToSend || this._isLoading) return;

    this._isLoading = true;
    this._streaming = true;
    this._connectionStatus = 'connecting';
    this._error = undefined;
    this._retryCount = 0;
    this.lastUserMessage = messageToSend;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageToSend,
      createdAt: Date.now() as any,
    };

    this._messages.push(userMessage);
    this._messageHistory.push(userMessage);
    this._input = '';
    this.updateTokenCount();
    this.notifyUpdate();

    // Create abort controller locally and assign to instance
    const controller = new AbortController();
    this.abortController = controller;

    try {
      // Make API request
      const response = await fetch(this.options.api!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: this._messages,
          id: this.options.id,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this._connectionStatus = 'connected';
      this.options.onResponse?.(response);
      this.emit('response', response);

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        const r = reader; // narrow type for TS
        try {
          while (true) {
            const { done, value } = await r.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') break;

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    assistantMessage += parsed.choices[0].delta.content;
                    this._currentStreamingMessage = assistantMessage;
                    this.emit('stream', assistantMessage);
                    this.notifyUpdate();
                  }
                } catch (e) {
                  // Ignore parsing errors for malformed chunks
                }
              }
            }
          }
        } finally {
          r.releaseLock();
        }
      }

      // Add final assistant message
      const finalAssistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantMessage,
        createdAt: Date.now() as any,
      };

      this._messages.push(finalAssistantMessage);
      this._messageHistory.push(finalAssistantMessage);
      this.updateTokenCount();

      this.options.onFinish?.(finalAssistantMessage);
      this.emit('finish', finalAssistantMessage);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        this._error = err;
        this._connectionStatus = 'disconnected';
        this.options.onError?.(err);
        this.emit('error', err);

        // Auto-retry logic
        if (this._retryCount < this.options.maxRetries!) {
          setTimeout(
            () => {
              this._retryCount++;
              this.submit(messageToSend);
            },
            this.options.retryDelay! * Math.pow(2, this._retryCount),
          );
        }
      }
    } finally {
      this._isLoading = false;
      this._streaming = false;
      this._currentStreamingMessage = '';
      this.notifyUpdate();
    }
  }

  // Retry last message
  async retry(): Promise<void> {
    if (this.lastUserMessage) {
      await this.submit(this.lastUserMessage);
    }
  }

  // Abort current request
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this._isLoading = false;
    this._streaming = false;
    this._currentStreamingMessage = '';
    this._connectionStatus = 'disconnected';
    this.emit('abort');
    this.notifyUpdate();
  }

  // Add message to conversation
  append(message: Omit<Message, 'id' | 'createdAt'>): void {
    const newMessage = {
      ...message,
      id: Date.now().toString(),
      createdAt: Date.now() as any,
    } as Message;

    this._messages.push(newMessage);
    this._messageHistory.push(newMessage);
    this.updateTokenCount();
    this.emit('append', newMessage);
    this.notifyUpdate();
  }

  // Reload conversation (regenerate last assistant message)
  reload(): void {
    if (this._messages.length > 0) {
      const lastAssistantIndex = this._messages
        .map((m) => m.role)
        .lastIndexOf('assistant');
      if (lastAssistantIndex > -1) {
        this._messages = this._messages.slice(0, lastAssistantIndex);
        this.updateTokenCount();

        // Find the user message that prompted the assistant response
        const userMessage = this._messages[this._messages.length - 1];
        if (userMessage?.role === 'user') {
          this.submit(userMessage.content);
        }
      }
    }
    this.emit('reload');
    this.notifyUpdate();
  }

  // Stop current generation
  stop(): void {
    this.abort();
  }

  // Clear conversation
  clear(): void {
    this._messages = [];
    this._messageHistory = [];
    this._input = '';
    this._error = undefined;
    this._currentStreamingMessage = '';
    this._queue = [];
    this._tokenCount = 0;
    this.emit('clear');
    this.notifyUpdate();
  }

  // Private methods
  private updateTokenCount(): void {
    const totalText = this._messages.map((m) => m.content).join(' ');
    this._tokenCount = this.calculateTokenCount(totalText);
  }

  private calculateTokenCount(text: string): number {
    // Simple token estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  private notifyUpdate(): void {
    this.options.onUpdate?.();
    this.emit('update');
  }

  // Save conversation to file (JSONL format)
  saveTranscript(filePath: string): void {
    const fs = require('fs');
    const jsonl = this._messages.map((m) => JSON.stringify(m)).join('\n');
    fs.writeFileSync(filePath, jsonl, 'utf8');
    this.emit('save', filePath);
  }

  // Load conversation from file
  loadTranscript(filePath: string): void {
    const fs = require('fs');
    try {
      const jsonl = fs.readFileSync(filePath, 'utf8');
      const messages = jsonl
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string) => JSON.parse(line));

      this._messages = messages;
      this._messageHistory = [...messages];
      this.updateTokenCount();
      this.emit('load', filePath);
      this.notifyUpdate();
    } catch (error) {
      this._error = error as Error;
      this.emit('error', error);
    }
  }
}

/**
 * Hook-like function for blessed.js applications
 * Returns a ChatTUI instance with the specified options
 */
export function useChatTUI(options: UseChatTUIOptions = {}): ChatTUI {
  return new ChatTUI(options);
}

export default ChatTUI;
