import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type FlexProps = BaseProps & {
    direction?: 'row' | 'column';
    gap?: number;
    justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
    align?: 'start' | 'center' | 'end' | 'stretch';
};

export class Flex implements Component<Widgets.BoxElement> {
    el: Widgets.BoxElement;
    theme: any;
    destroy: () => void;
    private baseComponent: any;
    private props: FlexProps;
    private direction: 'row' | 'column';
    private gap: number;
    private justify: string;
    private align: string;

    constructor(props: FlexProps) {
        this.props = props;
        this.direction = props.direction || 'row';
        this.gap = props.gap ?? 0;
        this.justify = props.justify || 'start';
        this.align = props.align || 'start';

        const comp = createBoxBase<Widgets.BoxElement>({
            ...props,
            borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
        }, 'flex');

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
        let offset = 0;

        children.forEach((ch) => {
            if (this.direction === 'row') {
                ch.left = offset;
                ch.top = 0;
                offset += (typeof ch.width === 'number' ? ch.width : 10) + this.gap;
            } else {
                ch.top = offset;
                ch.left = 0;
                offset += (typeof ch.height === 'number' ? ch.height : 1) + this.gap;
            }
        });

        this.el.screen.render();
    }

    // Method to set direction
    setDirection(direction: 'row' | 'column') {
        this.direction = direction;
        this.layout();
    }

    // Method to set gap
    setGap(gap: number) {
        this.gap = gap;
        this.layout();
    }

    // Method to set justify
    setJustify(justify: 'start' | 'center' | 'end' | 'space-between' | 'space-around') {
        this.justify = justify;
        this.layout();
    }

    // Method to set align
    setAlign(align: 'start' | 'center' | 'end' | 'stretch') {
        this.align = align;
        this.layout();
    }

    // Method to add child
    addChild(child: Widgets.BlessedElement) {
        child.parent = this.el;
        this.layout();
    }

    // Method to remove child
    removeChild(child: Widgets.BlessedElement) {
        child.detach();
        this.layout();
    }

    // Method to reflow layout
    reflow() {
        this.layout();
    }

    // Static method to create flex container with specific configuration
    static create(props: FlexProps): Flex {
        return new Flex(props);
    }
}

