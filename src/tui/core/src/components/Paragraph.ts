import { Widgets } from "blessed";
import {
  ComponentSize,
  ComponentState,
  ComponentVariant,
} from "../theming/design-tokens";
import { BaseProps, Component, createBoxBase } from "./BaseComponent";

export type ParagraphProps = BaseProps & {
  text?: string;
  wrap?: boolean;
  align?: "left" | "center" | "right";
  lineSpacing?: number;
};

export class Paragraph implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: ParagraphProps;

  constructor(props: ParagraphProps) {
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        borderStyle: "none",
      },
      "paragraph"
    );

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.el.setContent(props.text || "");
    this.applyTextStyling();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) =>
    this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private applyTextStyling() {
    const { wrap, align, lineSpacing } = this.props;

    if (wrap !== undefined) {
      // Note: Blessed BoxElement doesn't have a direct 'wrap' property
      // Wrapping is handled through content formatting
    }

    if (align) {
      // Note: Blessed doesn't have direct text alignment, but we can simulate it
      // by adjusting the content formatting
      this.formatTextAlignment();
    }

    if (lineSpacing) {
      this.applyLineSpacing();
    }
  }

  private formatTextAlignment() {
    const { align, text } = this.props;
    const width = typeof this.el.width === "number" ? this.el.width : 50;

    if (align === "center") {
      const lines = text?.split("\n") || [];
      const centeredLines = lines.map((line) => {
        const padding = Math.max(0, Math.floor((width - line.length) / 2));
        return " ".repeat(padding) + line;
      });
      this.el.setContent(centeredLines.join("\n"));
    } else if (align === "right") {
      const lines = text?.split("\n") || [];
      const rightAlignedLines = lines.map((line) => {
        const padding = Math.max(0, width - line.length);
        return " ".repeat(padding) + line;
      });
      this.el.setContent(rightAlignedLines.join("\n"));
    }
  }

  private applyLineSpacing() {
    const { lineSpacing, text } = this.props;
    if (lineSpacing && lineSpacing > 1) {
      const lines = text?.split("\n") || [];
      const spacedLines = lines.map(
        (line) => line + "\n".repeat(lineSpacing - 1)
      );
      this.el.setContent(spacedLines.join(""));
    }
  }

  // Method to set paragraph text
  setText(text: string) {
    this.props.text = text;
    this.el.setContent(text);
    this.applyTextStyling();
    this.el.screen.render();
  }

  // Method to set text alignment
  setAlignment(align: "left" | "center" | "right") {
    this.props.align = align;
    this.applyTextStyling();
    this.el.screen.render();
  }

  // Method to set line spacing
  setLineSpacing(spacing: number) {
    this.props.lineSpacing = spacing;
    this.applyTextStyling();
    this.el.screen.render();
  }

  // Method to set text wrapping
  setWrap(wrap: boolean) {
    this.props.wrap = wrap;
    // Note: Blessed BoxElement doesn't have a direct 'wrap' property
    // Wrapping is handled through content formatting
    this.el.screen.render();
  }

  // Method to append text
  appendText(text: string) {
    const currentText = this.el.getContent() || "";
    this.props.text = currentText + text;
    this.el.setContent(this.props.text);
    this.applyTextStyling();
    this.el.screen.render();
  }

  // Method to prepend text
  prependText(text: string) {
    const currentText = this.el.getContent() || "";
    this.props.text = text + currentText;
    this.el.setContent(this.props.text);
    this.applyTextStyling();
    this.el.screen.render();
  }

  // Method to get current text
  getText(): string {
    return this.props.text || "";
  }

  // Method to get text length
  getTextLength(): number {
    return this.props.text?.length || 0;
  }

  // Method to get line count
  getLineCount(): number {
    return this.props.text?.split("\n").length || 0;
  }

  // Static method to create paragraph with specific configuration
  static create(props: ParagraphProps): Paragraph {
    return new Paragraph(props);
  }
}
