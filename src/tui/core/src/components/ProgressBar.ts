import blessed from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { resolveTheme } from '../theming/theme';
import { safeRender } from '../terminal/useTerminal';

export type ProgressBarProps = BaseProps & {
    value?: number; // 0..100
    orientation?: 'horizontal' | 'vertical';
};

export class ProgressBar implements Component<any> {
    el: any;
    theme: any;
    destroy: () => void;
    private baseComponent: any;
    // Per-instance throttle timer to avoid cross-instance interference
    private progressUpdateTimer: NodeJS.Timeout | null = null;

    constructor(props: ProgressBarProps) {
        const theme = resolveTheme(props.theme);
        const el = blessed.progressbar({
            parent: props.parent,
            orientation: props.orientation || 'horizontal',
            style: { bg: theme.background, fg: theme.foreground },
            border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
            top: props.top,
            left: props.left,
            right: props.right,
            bottom: props.bottom,
            width: props.width,
            height: props.height,
            keys: props.keys ?? true,
            mouse: props.mouse ?? true,
            label: props.label,
        });

        if (props.value !== undefined) el.setProgress(Math.max(0, Math.min(100, props.value)));

        this.el = el;
        this.theme = theme;
        this.destroy = () => {
            if (this.progressUpdateTimer) {
                clearTimeout(this.progressUpdateTimer);
                this.progressUpdateTimer = null;
            }
            el.destroy();
        };

        // Create base component for variants support
        this.baseComponent = createBoxBase<any>({
            ...props,
        }, 'progress-bar');
    }

    // Implement required methods by delegating to base component
    setVariant = (variant: any) => this.baseComponent.setVariant(variant);
    setSize = (size: any) => this.baseComponent.setSize(size);
    setState = (state: any) => this.baseComponent.setState(state);
    getConfig = () => this.baseComponent.getConfig();
    update = (props: any) => this.baseComponent.update(props);

    setValue(value: number) {
        const v = Math.max(0, Math.min(100, value));
        this.el.setProgress(v);
        
        // Throttled render updates (50-100ms)
        if (this.progressUpdateTimer) {
            clearTimeout(this.progressUpdateTimer);
        }
        this.progressUpdateTimer = setTimeout(() => {
            safeRender(this.el.screen);
            this.progressUpdateTimer = null;
        }, 100); // 100ms for smooth updates (80-120ms range)
    }

    // Static method to create progress bar with specific configuration
    static create(props: ProgressBarProps): ProgressBar {
        return new ProgressBar(props);
    }
}
