import { Widgets } from "blessed";
import { z } from 'zod';
import { BaseProps, Component, createBoxBase } from "./BaseComponent";
import { BreadcrumbSchema } from "../types/component-schemas";
import { validateComponent } from "../validation/component-validator";

export type BreadcrumbItem = {
  id: string;
  label: string;
  href?: string;
  disabled?: boolean;
};

export type BreadcrumbProps = z.infer<typeof BreadcrumbSchema> & BaseProps;

export class Breadcrumb implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: BreadcrumbProps;

  constructor(props: BreadcrumbProps) {
    const validation = validateComponent('breadcrumb', props);
    if (!validation.success) {
      console.error('Invalid breadcrumb props:', validation.errors?.issues);
      throw new Error(`Invalid breadcrumb props: ${validation.errors?.issues.map(i => i.message).join(', ')}`);
    }
    this.props = props;

    const comp = createBoxBase<Widgets.BoxElement>(
      {
        ...props,
        borderStyle: "none",
        height: 1,
      },
      "breadcrumb"
    );

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.renderItems();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: any) => this.baseComponent.setVariant(variant);
  setSize = (size: any) => this.baseComponent.setSize(size);
  setState = (state: any) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private renderItems() {
    const separator = this.props.separator || " › ";
    const text = (this.props.items || []).map(i => i.label).join(separator);
    this.el.setContent(text);
    this.el.screen.render();
  }

  setItems(items: BreadcrumbItem[]) {
    this.props.items = items;
    this.renderItems();
  }

  addItem(item: BreadcrumbItem) {
    this.props.items.push(item);
    this.renderItems();
  }

  removeLastItem() {
    this.props.items.pop();
    this.renderItems();
  }

  clear() {
    this.props.items = [];
    this.renderItems();
  }

  // Static method to create breadcrumb with specific configuration
  static create(props: BreadcrumbProps): Breadcrumb {
    return new Breadcrumb(props);
  }
}
