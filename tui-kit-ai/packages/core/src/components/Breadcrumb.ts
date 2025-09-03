import { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';

export type BreadcrumbProps = BaseProps & { segments: string[] };

export class Breadcrumb implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;

  constructor(props: BreadcrumbProps) {
    const comp = createBoxBase<Widgets.BoxElement>({ ...props, borderStyle: 'none', height: 1 });
    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.setSegments(props.segments);
  }

  setSegments(segments: string[]) {
    this.el.setContent(segments.join(' › '));
    this.el.screen.render();
  }
}
