// Utility functions for component variants and composition
import { ComponentVariant, ComponentSize, ComponentState, tokens } from '../theming/design-tokens';

// Type for variant props
export type VariantProps<T extends Record<string, any>> = {
    variant?: ComponentVariant;
    size?: ComponentSize;
    state?: ComponentState;
} & T;

// Type for component configuration
export type ComponentConfig = {
    base: string;
    variants: Record<string, Record<string, any>>;
    sizes: Record<string, Record<string, any>>;
    states: Record<string, Record<string, any>>;
    defaultVariants?: {
        variant?: ComponentVariant;
        size?: ComponentSize;
        state?: ComponentState;
    };
};

// Utility function to merge class names (similar to clsx/cva)
export function cn(...inputs: (string | undefined | null | false | Record<string, any>)[]): string {
    return inputs
        .filter(Boolean)
        .map(input => {
            if (typeof input === 'string') return input;
            if (typeof input === 'object') {
                return Object.entries(input as Record<string, any>)
                    .filter(([, value]) => Boolean(value))
                    .map(([key]) => key)
                    .join(' ');
            }
            return '';
        })
        .join(' ')
        .trim();
}

// Utility function to create variants (similar to cva)
export function createVariants<T extends ComponentConfig>(config: T) {
    return function getVariants(props: VariantProps<{}> = {}) {
        const {
            variant = config.defaultVariants?.variant || 'default',
            size = config.defaultVariants?.size || 'md',
            state = config.defaultVariants?.state || 'default',
            ...rest
        } = props;

        const variantClasses = config.variants[variant] || {};
        const sizeClasses = config.sizes[size] || {};
        const stateClasses = config.states[state] || {};

        return {
            classes: cn(config.base, variantClasses, sizeClasses, stateClasses),
            variant,
            size,
            state,
            ...rest,
        };
    };
}

// Utility function to get component tokens
export function getComponentTokens(componentName: string, variant?: ComponentVariant, size?: ComponentSize) {
    const componentConfig = tokens.componentTokens[componentName as keyof typeof tokens.componentTokens];
    if (!componentConfig) return {};

    const variantTokens = variant ? componentConfig.variants[variant as keyof typeof componentConfig.variants] : {};
    const sizeTokens = size ? componentConfig.sizes[size] : {};

    return {
        ...variantTokens,
        ...sizeTokens,
    };
}

// Utility function to merge component styles
export function mergeComponentStyles(
    baseStyles: Record<string, any>,
    variantStyles: Record<string, any>,
    sizeStyles: Record<string, any>,
    customStyles: Record<string, any> = {}
): Record<string, any> {
    return {
        ...baseStyles,
        ...variantStyles,
        ...sizeStyles,
        ...customStyles,
    };
}

// Utility function to create responsive variants
export function createResponsiveVariants<T extends ComponentConfig>(config: T) {
    return function getResponsiveVariants(
        props: VariantProps<{ responsive?: Record<string, any> }> = {}
    ) {
        const { responsive, ...variantProps } = props;
        const baseVariants = createVariants(config)(variantProps);

        if (!responsive) return baseVariants;

        // Apply responsive overrides
        const responsiveClasses = Object.entries(responsive)
            .map(([breakpoint, overrides]) => {
                // In TUI, we can use different styling for different screen sizes
                // This is a simplified version - in practice you'd want more sophisticated logic
                return `${breakpoint}:${JSON.stringify(overrides)}`;
            })
            .join(' ');

        return {
            ...baseVariants,
            classes: cn(baseVariants.classes, responsiveClasses),
            responsive,
        };
    };
}

// Utility function to create compound variants
export function createCompoundVariants<T extends ComponentConfig>(
    config: T,
    compoundVariants: Array<{
        variants: Partial<Record<keyof T['variants'], string>>;
        className: string;
    }>
) {
    return function getCompoundVariants(props: VariantProps<{}> = {}) {
        const baseVariants = createVariants(config)(props);

        // Check for compound variants
        const compoundClass = compoundVariants
            .find(cv =>
                Object.entries(cv.variants).every(([key, value]) =>
                    props[key as keyof VariantProps<{}>] === value
                )
            )?.className || '';

        return {
            ...baseVariants,
            classes: cn(baseVariants.classes, compoundClass),
        };
    };
}

// Utility function to create context-based variants
export function createContextVariants<T extends ComponentConfig>(
    config: T,
    contextKey: string
) {
    return function getContextVariants(
        props: VariantProps<{ [key: string]: any }> = {},
        context: Record<string, any> = {}
    ) {
        const baseVariants = createVariants(config)(props);
        const contextValue = context[contextKey];

        if (!contextValue) return baseVariants;

        // Apply context-based overrides
        const contextClasses = config.variants[contextValue] || {};

        return {
            ...baseVariants,
            classes: cn(baseVariants.classes, contextClasses),
            context: contextValue,
        };
    };
}

// Export all utilities
export const variants = {
    cn,
    createVariants,
    createResponsiveVariants,
    createCompoundVariants,
    createContextVariants,
    getComponentTokens,
    mergeComponentStyles,
};
