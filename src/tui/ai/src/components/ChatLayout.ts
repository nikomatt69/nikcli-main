import { resolveBlessedColor, BaseProps } from "@tui-kit-ai/core";
import type { Message } from "ai";
import blessed from "blessed";
import { ChatTUI } from "../hooks/useChatTUI";
import { MessageList } from "./MessageList";
import { PromptEditor } from "./PromptEditor";

export interface ChatLayoutProps extends BaseProps {
  // Chat integration
  chat?: ChatTUI;

  // Initial state
  messages?: Message[];

  // Layout configuration
  showSidebar?: boolean;
  sidebarWidth?: number;
  showStatusBar?: boolean;
  statusBarHeight?: number;

  // Styling
  uiTheme?: "dark" | "light"; // Renamed to avoid conflict with BaseProps.theme
  accentColor?: string;

  // Features
  enableConversationHistory?: boolean;
  enableModelPicker?: boolean;
  enableTokenCounter?: boolean;

  // Events
  onMessageSubmit?: (message: string) => void;
  onConversationSelect?: (conversationId: string) => void;
  onModelChange?: (model: string) => void;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export class ChatLayout {
  public el!: blessed.Widgets.BoxElement;

  // Components
  private messageList!: MessageList;
  private promptEditor!: PromptEditor;
  private sidebar?: blessed.Widgets.BoxElement;
  private statusBar?: blessed.Widgets.BoxElement;
  private conversationList?: blessed.Widgets.ListElement;
  private modelPicker?: blessed.Widgets.ListElement;

  // State
  private chat?: ChatTUI;
  private conversations: Conversation[] = [];
  private currentConversation?: Conversation;
  private options: ChatLayoutProps;

  // Available models
  private models = [
    {
      name: "gpt-4o-mini",
      provider: "OpenAI",
      description: "Fast and capable",
    },
    { name: "gpt-4o", provider: "OpenAI", description: "Most capable" },
    {
      name: "claude-3-haiku-20240307",
      provider: "Anthropic",
      description: "Fast and affordable",
    },
    {
      name: "claude-3-sonnet-20240229",
      provider: "Anthropic",
      description: "Balanced performance",
    },
    {
      name: "claude-3-opus-20240229",
      provider: "Anthropic",
      description: "Most intelligent",
    },
  ];

  constructor(props: ChatLayoutProps) {
    this.options = {
      showSidebar: true,
      sidebarWidth: 25,
      showStatusBar: true,
      statusBarHeight: 3,
      uiTheme: "dark",
      accentColor: "#14b8a6",
      enableConversationHistory: true,
      enableModelPicker: true,
      enableTokenCounter: true,
      ...props,
    };

    this.chat = props.chat;

    this.createLayout();
    this.createComponents();
    this.setupEventHandlers();
    this.setupChatIntegration();

    // Initialize with messages if provided
    if (props.messages) {
      this.messageList.setMessages(props.messages);
    }

    // Create default conversation
    this.createNewConversation();
  }

  private createLayout(): void {
    const { parent, width = "100%", height = "100%" } = this.options;

    // Main container
    this.el = blessed.box({
      parent,
      width,
      height,
      top: this.options.top,
      left: this.options.left,
      right: this.options.right,
      bottom: this.options.bottom,
      keys: this.options.keys ?? true,
      mouse: this.options.mouse ?? true,
      scrollable: this.options.scrollable ?? false,
      focusable: this.options.focusable ?? true,

      style: {
        bg: this.options.bg || (this.options.uiTheme === "dark" ? "#0f172a" : "#ffffff"),
        fg: this.options.fg || (this.options.uiTheme === "dark" ? "#f8fafc" : "#0f172a"),
      },
    });

    // Create sidebar if enabled
    if (this.options.showSidebar) {
      this.createSidebar();
    }

    // Create status bar if enabled
    if (this.options.showStatusBar) {
      this.createStatusBar();
    }
  }

  private createSidebar(): void {
    this.sidebar = blessed.box({
      parent: this.el,
      top: 0,
      left: 0,
      width: this.options.sidebarWidth,
      height: this.options.showStatusBar
        ? `100%-${this.options.statusBarHeight}`
        : "100%",

      border: {
        type: "line",
        fg: this.options.accentColor
          ? resolveBlessedColor(this.options.accentColor, {})
          : ("#14b8a6" as any),
      },

      style: {
        bg: this.options.uiTheme === "dark" ? "#1e293b" : "#f1f5f9",
      },
    });

    // Sidebar header
    const sidebarHeader = blessed.box({
      parent: this.sidebar,
      top: 0,
      left: 0,
      right: 0,
      height: 3,

      content: "{center}{bold}Conversations{/bold}{/center}",

      border: {
        type: "line",
        fg: this.options.accentColor
          ? resolveBlessedColor(this.options.accentColor, {})
          : ("#14b8a6" as any),
      },

      style: {
        bg: this.options.accentColor,
        fg: this.options.uiTheme === "dark" ? "#000000" : "#ffffff",
      },
    });

    // Conversation list
    if (this.options.enableConversationHistory) {
      this.createConversationList();
    }

    // Model picker
    if (this.options.enableModelPicker) {
      this.createModelPicker();
    }
  }

  private createConversationList(): void {
    this.conversationList = blessed.list({
      parent: this.sidebar,
      top: 3,
      left: 0,
      right: 0,
      height: this.options.enableModelPicker ? "50%-3" : "100%-3",

      keys: true,
      mouse: true,

      style: {
        selected: {
          bg: this.options.accentColor,
          fg: this.options.uiTheme === "dark" ? "#000000" : "#ffffff",
        },
      },

      items: [],
    });

    // Handle conversation selection
    this.conversationList.on("select", (item: any, index: number) => {
      const conversation = this.conversations[index];
      if (conversation) {
        this.selectConversation(conversation);
      }
    });

    // Context menu for conversations
    this.conversationList.on("keypress", (ch: string, key: any) => {
      if (key.name === "d" && key.ctrl) {
        // Ctrl+D to delete conversation
        const index = this.conversationList!.index;
        this.deleteConversation(index);
      } else if (key.name === "n" && key.ctrl) {
        // Ctrl+N for new conversation
        this.createNewConversation();
      }
    });
  }

  private createModelPicker(): void {
    const modelPickerTop = this.options.enableConversationHistory ? "50%" : 3;

    // Model picker header
    blessed.box({
      parent: this.sidebar,
      top: modelPickerTop,
      left: 0,
      right: 0,
      height: 1,
      content: "{bold}Model{/bold}",
      style: {
        fg: this.options.accentColor,
      },
    });

    this.modelPicker = blessed.list({
      parent: this.sidebar,
      top:
        typeof modelPickerTop === "string"
          ? `${modelPickerTop}+1`
          : modelPickerTop + 1,
      left: 0,
      right: 0,
      bottom: 0,

      keys: true,
      mouse: true,

      style: {
        selected: {
          bg: this.options.accentColor,
          fg: this.options.uiTheme === "dark" ? "#000000" : "#ffffff",
        },
      },

      items: this.models.map((m) => `${m.name} (${m.provider})`),
    });

    // Handle model selection
    this.modelPicker.on("select", (item: any, index: number) => {
      const model = this.models[index];
      if (model) {
        this.options.onModelChange?.(model.name);
        this.updateStatusBar();
      }
    });
  }

  private createStatusBar(): void {
    this.statusBar = blessed.box({
      parent: this.el,
      bottom: 0,
      left: 0,
      right: 0,
      height: this.options.statusBarHeight,

      border: {
        type: "line",
        fg: this.options.accentColor
          ? resolveBlessedColor(this.options.accentColor, {})
          : ("#14b8a6" as any),
      },

      style: {
        bg: this.options.uiTheme === "dark" ? "#1e293b" : "#f1f5f9",
      },

      content: this.getStatusContent(),
    });
  }

  private createComponents(): void {
    // Calculate dimensions for main chat area
    const chatLeft = this.options.showSidebar ? this.options.sidebarWidth : 0;
    const chatHeight = this.options.showStatusBar
      ? `100%-${this.options.statusBarHeight}`
      : "100%";

    // Message list (takes most of the space)
    this.messageList = new MessageList({
      parent: this.el,
      top: 0,
      left: chatLeft,
      right: 0,
      height: "70%",

      bg: this.options.uiTheme === "dark" ? "#0f172a" : "#ffffff",
      fg: this.options.uiTheme === "dark" ? "#f8fafc" : "#0f172a",
      borderColor: this.options.accentColor,

      avatars: {
        user: "👤",
        assistant: "🤖",
        system: "ℹ️",
      },
    });

    // Prompt editor (bottom part)
    this.promptEditor = new PromptEditor({
      parent: this.el,
      top: "70%",
      left: chatLeft,

      bg: this.options.uiTheme === "dark" ? "#1a1a1a" : "#f8fafc",
      fg: this.options.uiTheme === "dark" ? "#ffffff" : "#0f172a",
      borderColor: this.options.accentColor,

      placeholder: "Type your message... (Shift+Enter to submit)",
      enableSnippets: true,
      enableVariables: true,
      showCharCount: true,

      onSubmit: (message) => {
        this.handleMessageSubmit(message);
      },
    });
  }

  private setupEventHandlers(): void {
    // Global key handlers
    this.el.screen?.key(["C-q"], () => {
      process.exit(0);
    });

    this.el.screen?.key(["C-n"], () => {
      this.createNewConversation();
    });

    this.el.screen?.key(["C-c"], () => {
      if (this.chat?.isLoading) {
        this.chat.abort();
        this.updateStatusBar();
      }
    });

    this.el.screen?.key(["C-r"], () => {
      if (this.chat) {
        this.chat.retry();
      }
    });

    // Tab navigation between components
    this.el.screen?.key(["tab"], () => {
      this.el.screen?.focusNext();
    });

    this.el.screen?.key(["S-tab"], () => {
      this.el.screen?.focusPrevious();
    });
  }

  private setupChatIntegration(): void {
    if (!this.chat) return;

    // Listen to chat events
    this.chat.on("update", () => {
      this.messageList.setMessages(this.chat!.messages);
      this.updateStatusBar();
      this.updateCurrentConversation();
    });

    this.chat.on("stream", (content: string) => {
      this.messageList.updateStreamingMessage(content);
    });

    this.chat.on("error", (error: Error) => {
      this.showError(error.message);
    });

    this.chat.on("finish", () => {
      this.updateStatusBar();
      this.saveCurrentConversation();
    });
  }

  private handleMessageSubmit(message: string): void {
    if (!message.trim()) return;

    this.options.onMessageSubmit?.(message);

    if (this.chat) {
      this.chat.submit(message);
    }

    // Clear the input
    this.promptEditor.clear();

    // Focus back to input
    this.promptEditor.focus();
  }

  private createNewConversation(): void {
    const conversation: Conversation = {
      id: Date.now().toString(),
      title: `Chat ${this.conversations.length + 1}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.conversations.unshift(conversation);
    this.selectConversation(conversation);
    this.updateConversationList();
  }

  private selectConversation(conversation: Conversation): void {
    this.currentConversation = conversation;

    // Load messages into chat
    if (this.chat) {
      this.chat.clear();
      conversation.messages.forEach((msg) => {
        this.chat!.append(msg);
      });
    }

    this.messageList.setMessages(conversation.messages);
    this.options.onConversationSelect?.(conversation.id);

    // Update UI
    this.updateConversationList();
    this.promptEditor.focus();
  }

  private deleteConversation(index: number): void {
    if (index >= 0 && index < this.conversations.length) {
      const deleted = this.conversations.splice(index, 1)[0];

      if (this.currentConversation?.id === deleted.id) {
        // Select another conversation or create new
        if (this.conversations.length > 0) {
          this.selectConversation(this.conversations[0]);
        } else {
          this.createNewConversation();
        }
      }

      this.updateConversationList();
    }
  }

  private updateCurrentConversation(): void {
    if (this.currentConversation && this.chat) {
      this.currentConversation.messages = this.chat.messages;
      this.currentConversation.updatedAt = new Date();

      // Update title based on first message
      if (this.currentConversation.messages.length > 0) {
        const firstMessage = this.currentConversation.messages.find(
          (m) => m.role === "user"
        );
        if (firstMessage) {
          this.currentConversation.title =
            firstMessage.content.substring(0, 30) + "...";
        }
      }

      this.updateConversationList();
    }
  }

  private saveCurrentConversation(): void {
    // In a real app, this would save to disk or database
    this.updateCurrentConversation();
  }

  private updateConversationList(): void {
    if (!this.conversationList) return;

    const items = this.conversations.map((conv) => {
      const isActive = conv.id === this.currentConversation?.id;
      const prefix = isActive ? "● " : "  ";
      return prefix + conv.title;
    });

    this.conversationList.setItems(items);

    if (this.currentConversation) {
      const index = this.conversations.findIndex(
        (c) => c.id === this.currentConversation!.id
      );
      if (index >= 0) {
        this.conversationList.select(index);
      }
    }

    this.el.screen?.render();
  }

  private getStatusContent(): string {
    const parts: string[] = [];

    // Connection status
    const status = this.chat?.connectionStatus || "disconnected";
    const statusIcon = {
      connected: "🟢",
      connecting: "🟡",
      disconnected: "🔴",
    }[status];
    parts.push(`${statusIcon} ${status}`);

    // Token count
    if (this.options.enableTokenCounter && this.chat) {
      parts.push(`Tokens: ${this.chat.tokenCount}`);
    }

    // Current model
    if (this.modelPicker) {
      const selectedIndex = this.modelPicker.index;
      const model = this.models[selectedIndex];
      if (model) {
        parts.push(`Model: ${model.name}`);
      }
    }

    // Message count
    const msgCount = this.messageList.getMessageCount() || 0;
    parts.push(`Messages: ${msgCount}`);

    // Loading indicator
    if (this.chat?.isLoading) {
      parts.push("⏳ Processing...");
    }

    return "  " + parts.join(" | ");
  }

  private updateStatusBar(): void {
    if (this.statusBar) {
      this.statusBar.setContent(this.getStatusContent());
      this.el.screen?.render();
    }
  }

  private showError(message: string): void {
    // Simple error display in status bar
    if (this.statusBar) {
      this.statusBar.style.bg = "#ef4444";
      this.statusBar.setContent(`  ❌ Error: ${message}`);

      // Reset after 5 seconds
      setTimeout(() => {
        this.statusBar!.style.bg =
          this.options.uiTheme === "dark" ? "#1e293b" : "#f1f5f9";
        this.updateStatusBar();
      }, 5000);

      this.el.screen?.render();
    }
  }

  // Public methods
  setChat(chat: ChatTUI): void {
    this.chat = chat;
    this.setupChatIntegration();
  }

  focusInput(): void {
    this.promptEditor.focus();
  }

  clearChat(): void {
    this.chat?.clear();
    this.messageList.clear();
  }

  getConversations(): Conversation[] {
    return [...this.conversations];
  }

  exportConversation(conversationId?: string): Conversation | undefined {
    const id = conversationId || this.currentConversation?.id;
    return this.conversations.find((c) => c.id === id);
  }
}

export default ChatLayout;
