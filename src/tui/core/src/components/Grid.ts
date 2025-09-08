import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type GridProps = BaseProps & {
    columns: number;
    rows: number;
    gap?: number;
    autoSize?: boolean;
};

export class Grid implements Component<Widgets.BoxElement> {
    el: Widgets.BoxElement;
    theme: any;
    destroy: () => void;
    private baseComponent: any;
    private props: GridProps;
    private columns: number;
    private rows: number;
    private gap: number;
    private autoSize: boolean;

    constructor(props: GridProps) {
        this.props = props;
        this.columns = props.columns;
        this.rows = props.rows;
        this.gap = props.gap ?? 0;
        this.autoSize = props.autoSize ?? false;

        const comp = createBoxBase<Widgets.BoxElement>({
            ...props,
            borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
        }, 'grid');

        this.el = comp.el;
        this.theme = comp.theme;
        this.destroy = comp.destroy;
        this.baseComponent = comp;

        this.layout();
    }

    // Implement required methods by delegating to base component
    setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
    setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
    setState = (state: ComponentState) => this.baseComponent.setState(state);
    getConfig = () => this.baseComponent.getConfig();
    update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

    private layout() {
        const children = this.el.children as Widgets.BlessedElement[];
        const cw = Math.floor((this.el.width as number) / this.columns) - this.gap;
        const ch = Math.floor((this.el.height as number) / this.rows) - this.gap;

        children.forEach((chEl, i) => {
            const r = Math.floor(i / this.columns);
            const c = i % this.columns;
            chEl.left = c * (cw + this.gap);
            chEl.top = r * (ch + this.gap);
            chEl.width = cw;
            chEl.height = ch;
        });

        this.el.screen.render();
    }

    // Method to set grid dimensions
    setDimensions(columns: number, rows: number) {
        this.columns = columns;
        this.rows = rows;
        this.layout();
    }

    // Method to set gap
    setGap(gap: number) {
        this.gap = gap;
        this.layout();
    }

    // Method to add child at specific position
    addChildAt(child: Widgets.BlessedElement, column: number, row: number) {
        if (column >= 0 && column < this.columns && row >= 0 && row < this.rows) {
            child.parent = this.el;
            const index = row * this.columns + column;

            // Insert at specific position
            const children = this.el.children as Widgets.BlessedElement[];
            children.splice(index, 0, child);

            this.layout();
        }
    }

    // Method to remove child
    removeChild(child: Widgets.BlessedElement) {
        child.detach();
        this.layout();
    }

    // Method to get child at position
    getChildAt(column: number, row: number): Widgets.BlessedElement | undefined {
        if (column >= 0 && column < this.columns && row >= 0 && row < this.rows) {
            const index = row * this.columns + column;
            const children = this.el.children as Widgets.BlessedElement[];
            return children[index];
        }
        return undefined;
    }

    // Method to reflow layout
    reflow() {
        this.layout();
    }

    // Static method to create grid with specific configuration
    static create(props: GridProps): Grid {
        return new Grid(props);
    }
}

