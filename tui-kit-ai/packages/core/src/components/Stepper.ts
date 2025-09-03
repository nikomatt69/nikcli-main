import blessed, { Widgets } from 'blessed';
import { BaseProps, Component } from './BaseComponent';

export type Step = { label: string; completed?: boolean };
export type StepperProps = BaseProps & { steps: Step[]; activeIndex?: number };

export class Stepper implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private steps: Step[];
  private activeIndex: number;

  constructor(props: StepperProps) {
    const el = blessed.box({ parent: props.parent, border: { type: 'line' }, label: props.label || ' Steps ' });
    this.el = el;
    this.theme = {};
    this.destroy = () => el.destroy();
    this.steps = props.steps;
    this.activeIndex = props.activeIndex ?? 0;
    this.render();
  }

  setActive(index: number) {
    this.activeIndex = index;
    this.render();
  }

  private render() {
    const lines = this.steps.map((s, i) => `${i === this.activeIndex ? '>' : ' '} ${s.completed ? '✔' : i < this.activeIndex ? '•' : '○'} ${s.label}`);
    this.el.setContent(lines.join('\n'));
    this.el.screen.render();
  }
}
