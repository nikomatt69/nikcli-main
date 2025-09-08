import blessed, { Widgets } from "blessed";
import { resolveTheme } from "../theming/theme";
import { BaseProps, Component, computeBlessedStyle } from "./BaseComponent";
import { KEY, safeRender } from "../terminal/useTerminal";
import { tokens } from "../theming/design-tokens";

export type TextInputProps = BaseProps & {
  value?: string;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  onChange?: (value: string) => void;
  // Public API: password; internally mapped to blessed's `secret`
  password?: boolean;
  // Back-compat: accept `secret` but prefer `password`
  secret?: boolean;
  // Control Blessed's focus input behavior to avoid double key processing
  inputOnFocus?: boolean;
};

export class TextInput implements Component<Widgets.TextboxElement> {
  el: Widgets.TextboxElement;
  theme: any;
  destroy: () => void;

  constructor(props: TextInputProps) {
    // Interactive component guards
    if (process.env.TUI_STRICT === '1' && typeof props.onChange !== 'function') {
      console.warn('[TextInput] onChange missing: component is read-only.');
    }

    const theme = resolveTheme(props.theme);
    const style = computeBlessedStyle(theme, props);

    // Apply unified focus styling
    if (props.focus) {
      style.border = { fg: tokens.color.focus, type: 'line' };
    }

    // Apply disabled styling
    if (props.disabled) {
      style.fg = tokens.color.muted;
      style.dim = true;
    }

    const el = blessed.textbox({
      parent: props.parent,
      inputOnFocus: props.inputOnFocus ?? false,
      value: props.value || "",
      focusable: props.focusable ?? true,
      secret: props.secret ?? props.password ?? false,
      style,
      border: props.borderStyle && props.borderStyle !== "none" ? "line" : undefined,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      padding: props.padding as any,
    });

    // Enhanced placeholder handling with unified styling
    if (props.placeholder && !props.value) {
      el.setValue(props.placeholder);
      el.style.fg = tokens.color.muted;
      el.on("focus", () => {
        if (el.getValue() === props.placeholder) {
          el.setValue("");
          el.style.fg = tokens.color.fg;
          safeRender(el.screen);
        }
      });
      el.on("blur", () => {
        if (!el.getValue()) {
          el.setValue(props.placeholder!);
          el.style.fg = tokens.color.muted;
        }
      });
    }

    // Standardized key handling
    el.key([KEY.enter], () => {
      if (props.onSubmit) {
        props.onSubmit(el.getValue() || "");
      }
    });

    el.key([KEY.esc], () => {
      el.focus();
    });

    if (props.onChange) {
      el.on("keypress", () => {
        props.onChange!(el.getValue() || "");
        safeRender(el.screen);
      });
    }

    this.el = el;
    this.theme = theme;
    this.destroy = () => el.destroy();
  }

  // Required Component interface methods
  setVariant(variant: any): void {
    // TextInput uses direct blessed, variant styling applied via computeBlessedStyle
    const newStyle = computeBlessedStyle(this.theme, { variant });
    Object.assign(this.el.style, newStyle);
    safeRender(this.el.screen);
  }

  setSize(_size: any): void {
    // TextInput uses direct blessed, size affects dimensions indirectly
    // Size tokens could be applied here if needed for consistent sizing
  }

  setState(state: any): void {
    // Apply state-specific styling (focus, disabled, etc.)
    if (state === 'disabled') {
      this.el.style.fg = tokens.color.muted;
      this.el.style.dim = true;
    } else if (state === 'focus') {
      this.el.style.border = { fg: tokens.color.focus, type: 'line' };
    }
    safeRender(this.el.screen);
  }

  getConfig(): any {
    return {
      theme: this.theme,
    };
  }

  update(newProps: Partial<BaseProps>): void {
    // Update component properties
    if (newProps.width !== undefined) this.el.width = newProps.width;
    if (newProps.height !== undefined) this.el.height = newProps.height;
    if (newProps.top !== undefined) this.el.top = newProps.top;
    if (newProps.left !== undefined) this.el.left = newProps.left;
    if (newProps.right !== undefined) this.el.right = newProps.right;
    if (newProps.bottom !== undefined) this.el.bottom = newProps.bottom;
    if (newProps.label !== undefined) this.el.setLabel(newProps.label);

    safeRender(this.el.screen);
  }

  // Utility methods
  getValue(): string {
    return this.el.getValue();
  }

  setValue(value: string): void {
    this.el.setValue(value);
    safeRender(this.el.screen);
  }

  focus(): void {
    this.el.focus();
  }
}
