import { resolveBlessedColor, BaseProps } from "@tui-kit-ai/core";
import blessed from "blessed";

export interface PromptEditorProps extends BaseProps {
  // Content
  value?: string;
  placeholder?: string;

  // Behavior
  multiline?: boolean;
  maxLength?: number;
  submitOnEnter?: boolean; // If false, use Shift+Enter

  // Features
  enableVariables?: boolean; // Support for {{variable}} syntax
  enableSnippets?: boolean; // Quick snippets insertion
  showCharCount?: boolean;
  showLineNumbers?: boolean;

  // Events
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onVariableDetected?: (variables: string[]) => void;
}

export interface Snippet {
  name: string;
  description: string;
  content: string;
  trigger?: string; // Optional trigger key combination
}

export class PromptEditor {
  public el!: blessed.Widgets.TextareaElement;
  private statusBar?: blessed.Widgets.BoxElement;
  private snippetMenu?: blessed.Widgets.ListElement;
  private cursorPosition = { x: 0, y: 0 };

  private options: PromptEditorProps;
  private snippets: Snippet[] = [];
  private variables: Set<string> = new Set();

  // Default snippets
  private defaultSnippets: Snippet[] = [
    {
      name: "system-prompt",
      description: "System role prompt",
      content:
        "You are a helpful AI assistant. Please provide accurate and helpful responses.",
      trigger: "sys",
    },
    {
      name: "code-review",
      description: "Code review request",
      content:
        "Please review this code and provide feedback on:\\n- Code quality\\n- Potential bugs\\n- Performance improvements\\n- Best practices\\n\\nCode:\\n```\\n{{code}}\\n```",
      trigger: "review",
    },
    {
      name: "explain-code",
      description: "Code explanation request",
      content:
        "Please explain what this code does step by step:\\n\\n```\\n{{code}}\\n```",
      trigger: "explain",
    },
    {
      name: "summarize",
      description: "Summarization prompt",
      content:
        "Please provide a concise summary of the following text:\\n\\n{{text}}",
      trigger: "sum",
    },
  ];

  constructor(props: PromptEditorProps) {
    this.options = {
      multiline: true,
      maxLength: 10000,
      submitOnEnter: false,
      enableVariables: true,
      enableSnippets: true,
      showCharCount: true,
      showLineNumbers: false,
      placeholder: "Type your message... (Shift+Enter to submit)",
      ...props,
    };

    this.snippets = [...this.defaultSnippets];

    this.createEditor();
    this.createStatusBar();
    this.setupEventHandlers();

    if (props.value) {
      this.setValue(props.value);
    }
  }

  private createEditor(): void {
    this.el = blessed.textarea({
      parent: this.options.parent,
      top: this.options.top,
      left: this.options.left,
      right: this.options.right,
      bottom: this.options.bottom,
      width: this.options.width,
      height: this.options.height,

      style: {
        bg: this.options.bg ? resolveBlessedColor(this.options.bg as string, {}) : "#1a1a1a",
        fg: this.options.fg ? resolveBlessedColor(this.options.fg as string, {}) : "#ffffff",
      },

      border: (this.options.borderStyle && this.options.borderStyle !== "none")
        ? {
            type: "line",
            fg: this.options.borderColor ? Number(resolveBlessedColor(this.options.borderColor as string, {})) : 14,
          }
        : undefined,

      // Input behavior
      inputOnFocus: true,
      mouse: this.options.mouse ?? true,
      keys: this.options.keys ?? true,
      scrollable: this.options.scrollable ?? true,
      focusable: this.options.focusable ?? true,

      // Padding for better text display
      padding: this.options.padding as any || {
        left: this.options.showLineNumbers ? 4 : 1,
        right: 1,
        top: 0,
        bottom: this.options.showCharCount ? 1 : 0,
      },
    });

    // Set placeholder if empty
    if (this.options.placeholder && !this.el.getValue()) {
      this.showPlaceholder();
    }
  }

  private createStatusBar(): void {
    if (!this.options.showCharCount) return;

    this.statusBar = blessed.box({
      parent: this.el,
      bottom: 0,
      left: 0,
      right: 0,
      height: 1,

      style: {
        bg: "#2a2a2a",
        fg: "#888888",
      },

      content: this.getStatusText(),
    });
  }

  private setupEventHandlers(): void {
    // Content change detection
    this.el.on("keypress", (ch: string, key: any) => {
      // Update cursor position
      const content = this.getValue();
      this.cursorPosition.x = Math.min(
        content.length,
        this.cursorPosition.x + 1
      );

      // Handle special key combinations
      if (key.name === "enter") {
        if (key.shift) {
          // Shift+Enter = submit (if enabled)
          if (!this.options.submitOnEnter) {
            this.handleSubmit();
            return;
          }
        } else {
          // Enter = submit (if enabled) or new line
          if (this.options.submitOnEnter) {
            this.handleSubmit();
            return;
          }
        }
      }

      // Handle snippet triggers
      if (this.options.enableSnippets && key.name === "tab") {
        if (this.handleSnippetTrigger()) {
          return; // Prevent default tab behavior
        }
      }

      // Handle variable suggestions
      if (this.options.enableVariables && ch === "{") {
        // Start variable suggestion mode
        this.showVariableSuggestions();
      }

      // Update on next tick to get latest value
      setTimeout(() => {
        this.handleChange();
      }, 0);
    });

    // Focus/blur events
    this.el.on("focus", () => {
      this.hidePlaceholder();
      this.options.onFocus?.();
    });

    this.el.on("blur", () => {
      const value = this.getValue();
      if (!value && this.options.placeholder) {
        this.showPlaceholder();
      }
      this.options.onBlur?.();
    });

    // Handle mouse clicks for cursor positioning
    this.el.on("click", () => {
      // Hide any open menus
      this.hideSnippetMenu();
    });
  }

  private handleChange(): void {
    const value = this.getValue();

    // Update character count
    this.updateStatusBar();

    // Detect variables if enabled
    if (this.options.enableVariables) {
      this.detectVariables(value);
    }

    // Enforce max length
    if (this.options.maxLength && value.length > this.options.maxLength) {
      const truncated = value.substring(0, this.options.maxLength);
      this.setValue(truncated);
      return;
    }

    this.options.onChange?.(value);
  }

  private handleSubmit(): void {
    const value = this.getValue().trim();
    if (value && value !== this.options.placeholder) {
      this.options.onSubmit?.(value);
    }
  }

  private detectVariables(text: string): void {
    // Find {{variable}} patterns
    const variableRegex = /{{\\s*([^}]+)\\s*}}/g;
    const matches = Array.from(text.matchAll(variableRegex));
    const foundVariables = matches.map((match) => match[1].trim());

    // Update variables set
    const newVariables = new Set(foundVariables);
    const hasChanged =
      newVariables.size !== this.variables.size ||
      [...newVariables].some((v) => !this.variables.has(v));

    if (hasChanged) {
      this.variables = newVariables;
      this.options.onVariableDetected?.(foundVariables);
    }
  }

  private handleSnippetTrigger(): boolean {
    const content = this.getValue();
    const cursorPos = this.cursorPosition;

    // Get word before cursor
    const beforeCursor = content.substring(0, cursorPos.x);
    const words = beforeCursor.split(/\\s+/);
    const lastWord = words[words.length - 1];

    // Find matching snippet
    const snippet = this.snippets.find((s) => s.trigger === lastWord);
    if (snippet) {
      this.insertSnippet(snippet);
      return true;
    }

    // Show snippet menu if no direct match
    this.showSnippetMenu();
    return true;
  }

  private insertSnippet(snippet: Snippet): void {
    const content = this.getValue();
    const cursorPos = this.cursorPosition;

    // Replace trigger word with snippet content
    const beforeCursor = content.substring(0, cursorPos.x);
    const afterCursor = content.substring(cursorPos.x);
    const words = beforeCursor.split(/\\s+/);
    words.pop(); // Remove trigger word

    const newContent =
      words.join(" ") +
      (words.length > 0 ? " " : "") +
      snippet.content +
      afterCursor;

    this.setValue(newContent);
    this.hideSnippetMenu();

    // Focus cursor at first variable if any
    const firstVariable = newContent.match(/{{\\s*([^}]+)\\s*}}/);
    if (firstVariable) {
      // Move cursor to first variable (simplified)
      this.el.focus();
    }
  }

  private showSnippetMenu(): void {
    if (!this.options.enableSnippets) return;

    // Create snippet menu if not exists
    if (!this.snippetMenu) {
      this.snippetMenu = blessed.list({
        parent: this.el.screen,
        top: (this.el.atop as number) + (this.el.height as number),
        left: this.el.aleft,
        width: 40,
        height: Math.min(8, this.snippets.length + 2),

        border: {
          type: "line",
          fg: 14,
        },

        style: {
          bg: "#1a1a1a",
          fg: "#ffffff",
          selected: {
            bg: "#14b8a6",
            fg: "#000000",
          },
        },

        keys: true,
        mouse: true,

        items: this.snippets.map((s) => `${s.name} - ${s.description}`),
      });

      // Handle snippet selection
      this.snippetMenu.on("select", (item: any, index: number) => {
        const snippet = this.snippets[index];
        if (snippet) {
          this.insertSnippet(snippet);
        }
      });

      // Hide on escape
      this.snippetMenu.on("keypress", (ch: string, key: any) => {
        if (key.name === "escape") {
          this.hideSnippetMenu();
          this.el.focus();
        }
      });
    }

    this.snippetMenu.show();
    this.snippetMenu.focus();
    this.el.screen?.render();
  }

  private hideSnippetMenu(): void {
    if (this.snippetMenu) {
      this.snippetMenu.hide();
      this.el.screen?.render();
    }
  }

  private showVariableSuggestions(): void {
    // TODO: Implement variable suggestion popup
    // This would show available variables when typing {{
  }

  private showPlaceholder(): void {
    if (this.options.placeholder) {
      this.el.style.fg = "#666666";
      this.el.setValue(this.options.placeholder);
    }
  }

  private hidePlaceholder(): void {
    const current = this.el.getValue();
    if (current === this.options.placeholder) {
      this.el.style.fg = this.options.fg
        ? resolveBlessedColor(this.options.fg as string, {})
        : "#ffffff";
      this.el.setValue("");
    }
  }

  private getStatusText(): string {
    const value = this.getValue();
    const length = value === this.options.placeholder ? 0 : value.length;
    const maxLength = this.options.maxLength;

    let status = `Chars: ${length}`;
    if (maxLength) {
      status += `/${maxLength}`;
    }

    if (this.variables.size > 0) {
      status += ` | Variables: ${[...this.variables].join(", ")}`;
    }

    return status;
  }

  private updateStatusBar(): void {
    if (this.statusBar) {
      this.statusBar.setContent(this.getStatusText());
      this.el.screen?.render();
    }
  }

  // Public methods
  getValue(): string {
    return this.el.getValue();
  }

  setValue(value: string): void {
    this.el.setValue(value);
    this.updateStatusBar();
    this.handleChange();
  }

  focus(): void {
    this.el.focus();
  }

  clear(): void {
    this.setValue("");
  }

  insertText(text: string): void {
    const current = this.getValue();
    const cursorPos = this.cursorPosition;

    const before = current.substring(0, cursorPos.x);
    const after = current.substring(cursorPos.x);

    this.setValue(before + text + after);
  }

  addSnippet(snippet: Snippet): void {
    this.snippets.push(snippet);
  }

  getVariables(): string[] {
    return [...this.variables];
  }

  replaceVariables(replacements: Record<string, string>): void {
    let content = this.getValue();

    Object.entries(replacements).forEach(([variable, replacement]) => {
      const regex = new RegExp(`{{\\s*${variable}\\s*}}`, "g");
      content = content.replace(regex, replacement);
    });

    this.setValue(content);
  }
}

export default PromptEditor;
