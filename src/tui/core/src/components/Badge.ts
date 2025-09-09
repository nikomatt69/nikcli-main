import { Widgets } from "blessed";
import { z } from 'zod';
import { BaseProps, Component, createBoxBase } from "./BaseComponent";
import { BadgeSchema } from "../types/component-schemas";
import { validateComponent } from "../validation/component-validator";

export type BadgeProps = z.infer<typeof BadgeSchema>;

export class Badge implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: BadgeProps;

  constructor(props: BadgeProps) {
    const validation = validateComponent('badge', props);
    if (!validation.success) {
      console.error('Invalid badge props:', validation.errors?.issues);
      throw new Error(`Invalid badge props: ${validation.errors?.issues.map(i => i.message).join(', ')}`);
    }
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        height: 1,
        width: "shrink",
        borderStyle: "none",
      },
      "badge"
    );

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    // Set content after creation
    this.el.setContent(` ${props.text} `);
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant);
  setSize = (size: any) => this.baseComponent.setSize(size);
  setState = (state: any) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  // Method to set badge text
  setText(text: string) {
    this.props.text = text;
    this.el.setContent(` ${text} `);
    this.el.screen.render();
  }

  // Method to set badge variant
  setBadgeVariant(variant: BadgeProps['variant'] extends string ? BadgeProps['variant'] : any) {
    this.props.variant = variant;
    this.setVariant(variant as any);
  }

  // Static method to create badge with specific configuration
  static create(props: BadgeProps): Badge {
    return new Badge(props);
  }
}
