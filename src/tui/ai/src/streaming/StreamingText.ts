import blessed, { Widgets } from "blessed";
import { BaseProps } from "@tui-kit-ai/core";

export type StreamingTextProps = BaseProps & { prefix?: string; text?: string; };

export class StreamingText {
  el: Widgets.BoxElement;
  private buffer = "";
  private prefix = "";
  constructor(props: StreamingTextProps) {
    this.el = blessed.box({
      parent: props.parent,
      top: props.top,
      left: props.left,
      right: props.right,
      bottom: props.bottom,
      width: props.width,
      height: props.height,
      keys: props.keys ?? true,
      mouse: props.mouse ?? true,
      scrollable: props.scrollable ?? true,
      focusable: props.focusable ?? true,
      tags: false,
      alwaysScroll: true,
      style: {
        bg: props.bg,
        fg: props.fg,
      },
      border: (props.borderStyle && props.borderStyle !== "none") ? "line" : undefined,
      padding: props.padding as any,
    });
    this.prefix = props.prefix || "";
  }
  append(chunk: string) {
    this.buffer += chunk;
    this.el.setContent(`${this.prefix}${this.buffer}`);
    this.el.setScrollPerc(100);
    this.el.screen.render();
  }
  reset() {
    this.buffer = "";
    this.el.setContent("");
    this.el.screen.render();
  }
}
