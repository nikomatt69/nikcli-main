import { Widgets } from "blessed";
import { z } from "zod";
import { BoxSchema } from "../types/component-schemas";
import { Component, createBoxBase } from "./BaseComponent";
import { safeRender } from "../terminal/useTerminal";

// Stable width tracking for consistent layouts during streaming
let maxContentWidth = 0;

export type BoxProps = z.infer<typeof BoxSchema>;

export class Box implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;

  constructor(props: BoxProps) {
    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
      },
      "box"
    );

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    if (props.content) this.el.setContent(props.content);
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant);
  setSize = (size: any) => this.baseComponent.setSize(size);
  setState = (state: any) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: any) => this.baseComponent.update(props);

  // Method to set content with stable width
  setContent(content: string) {
    // Track maximum content width for stable layouts
    const contentWidth = content.length;
    if (contentWidth > maxContentWidth) {
      maxContentWidth = contentWidth;
    }
    
    // Set minimum width to prevent layout shifts during streaming
    if (!this.el.width || this.el.width === 'auto') {
      this.el.width = Math.max(maxContentWidth + 4, 20); // +4 for padding/borders
    }
    
    this.el.setContent(content);
    safeRender(this.el.screen);
  }

  // Static method to create box with specific configuration
  static create(props: BoxProps): Box {
    return new Box(props);
  }
}
