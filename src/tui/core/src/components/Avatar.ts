import { Widgets } from "blessed";
import { z } from 'zod';
import { BaseProps, Component, createBoxBase } from "./BaseComponent";
import { AvatarSchema } from "../types/component-schemas";
import { validateComponent } from "../validation/component-validator";

export type AvatarProps = z.infer<typeof AvatarSchema>;

export class Avatar implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: AvatarProps;

  constructor(props: AvatarProps) {
    // Validate props using Zod schema
    const validation = validateComponent('avatar', props);
    if (!validation.success) {
      console.error('Invalid avatar props:', validation.errors?.issues);
      throw new Error(`Invalid avatar props: ${validation.errors?.issues.map(i => i.message).join(', ')}`);
    }

    this.props = props;

    const size = props.size || "md";
    const dimensions =
      size === "sm"
        ? { width: 3, height: 2 }
        : size === "lg"
        ? { width: 7, height: 4 }
        : { width: 5, height: 3 };

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        ...dimensions,
        borderStyle: "line",
      },
      "avatar"
    );

    // Set content after creation
    this.el = comp.el;
    this.el.setContent(` ${props.initials} `);

    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant);
  setSize = (size: any) => this.baseComponent.setSize(size);
  setState = (state: any) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  // Method to set avatar initials
  setInitials(initials: string) {
    this.props.initials = initials;
    this.el.setContent(` ${initials} `);
    this.el.screen.render();
  }

  // Method to set avatar size
  setAvatarSize(size: "sm" | "md" | "lg") {
    this.props.size = size;
    const dimensions =
      size === "sm"
        ? { width: 3, height: 2 }
        : size === "lg"
        ? { width: 7, height: 4 }
        : { width: 5, height: 3 };

    this.el.width = dimensions.width;
    this.el.height = dimensions.height;
    this.el.screen.render();
  }

  // Static method to create avatar with specific configuration
  static create(props: AvatarProps): Avatar {
    return new Avatar(props);
  }
}
