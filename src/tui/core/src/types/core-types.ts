/**
 * Core TypeScript types for TUI-Kit-AI
 * Fully type-safe component system inspired by shadcn/ui
 */

import type { Widgets } from "blessed";

// ===== UTILITY TYPES =====

/**
 * Makes specific keys of T optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specific keys of T required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>;

/**
 * Deep partial - makes all properties and nested properties optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Extract function return type
 */
export type ExtractReturnType<T> = T extends (...args: any[]) => infer R
  ? R
  : never;

/**
 * Strictly typed event handler
 */
export type EventHandler<T = void> = T extends void
  ? () => void
  : (value: T) => void;

/**
 * Async event handler
 */
export type AsyncEventHandler<T = void> = T extends void
  ? () => Promise<void> | void
  : (value: T) => Promise<void> | void;

// ===== BLESSED WIDGET TYPES =====

/**
 * All available blessed widget types
 */
export type BlessedWidgetType =
  | "box"
  | "text"
  | "button"
  | "textbox"
  | "textarea"
  | "checkbox"
  | "radiobox"
  | "list"
  | "listbar"
  | "table"
  | "form"
  | "input"
  | "prompt"
  | "question"
  | "message"
  | "loading"
  | "log"
  | "filemanager"
  | "listtable"
  | "listbox"
  | "terminal"
  | "image"
  | "ansiimage"
  | "overlayimage"
  | "video"
  | "layout"
  | "line"
  | "scrollablebox"
  | "scrollabletext"
  | "bigtext"
  | "progressbar";

/**
 * Blessed widget element mapping
 */
export type BlessedElementMap = {
  box: Widgets.BoxElement;
  text: Widgets.TextElement;
  button: Widgets.ButtonElement;
  textbox: Widgets.TextboxElement;
  textarea: Widgets.TextareaElement;
  checkbox: Widgets.CheckboxElement;
  radiobox: Widgets.RadioButtonElement;
  list: Widgets.ListElement;
  listbar: Widgets.ListbarElement;
  table: Widgets.ListTableElement;
  form: Widgets.FormElement<any>;
  input: Widgets.TextboxElement;
  progressbar: Widgets.ProgressBarElement;
  scrollablebox: Widgets.ScrollableBoxElement;
  scrollabletext: Widgets.ScrollableTextElement;
};

/**
 * Get blessed element type from widget type
 */
export type GetBlessedElement<T extends BlessedWidgetType> =
  T extends keyof BlessedElementMap
    ? BlessedElementMap[T]
    : Widgets.BlessedElement;

// ===== POSITION AND LAYOUT TYPES =====

/**
 * Terminal measurement units
 */
export type TerminalUnit =
  | number
  | `${number}%`
  | "center"
  | "left"
  | "right"
  | "top"
  | "bottom";

/**
 * Position properties for terminal components
 */
export interface TerminalPosition {
  readonly top?: TerminalUnit;
  readonly left?: TerminalUnit;
  readonly right?: TerminalUnit;
  readonly bottom?: TerminalUnit;
  readonly width?: TerminalUnit;
  readonly height?: TerminalUnit;
}

/**
 * Padding configuration
 */
export type PaddingConfig =
  | number
  | readonly [number, number] // [vertical, horizontal]
  | readonly [number, number, number, number] // [top, right, bottom, left]
  | {
      readonly top?: number;
      readonly right?: number;
      readonly bottom?: number;
      readonly left?: number;
    };

/**
 * Margin configuration (similar to padding)
 */
export type MarginConfig = PaddingConfig;

// ===== COLOR AND STYLING TYPES =====

/**
 * Terminal color values
 */
export type TerminalColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "brightblack"
  | "brightred"
  | "brightgreen"
  | "brightyellow"
  | "brightblue"
  | "brightmagenta"
  | "brightcyan"
  | "brightwhite"
  | "grey"
  | "gray"
  | `#${string}` // hex colors
  | `rgb(${number},${number},${number})` // rgb colors
  | number; // 256-color palette

/**
 * Design token color reference
 */
export type TokenColorReference =
  | `${string}.${string}`
  | `${string}.${string}.${string}`;

/**
 * Combined color type
 */
export type ColorValue = TerminalColor | TokenColorReference | 'transparent';

/**
 * Border styles for terminal components
 */
export type BorderStyle =
  | "line"
  | "bg"
  | "none"
  | { type: "line" | "bg"; fg?: ColorValue };

/**
 * Text alignment options
 */
export type TextAlign = "left" | "center" | "right";

/**
 * Text decoration options
 */
export interface TextStyle {
  readonly bold?: boolean;
  readonly underline?: boolean;
  readonly blink?: boolean;
  readonly inverse?: boolean;
  readonly invisible?: boolean;
}

// ===== COMPONENT VARIANT TYPES =====

/**
 * Standard component variants
 */
export type ComponentVariant =
  | "default"
  | "primary"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link"
  | "success"
  | "warning"
  | "error"
  | "info";

/**
 * Component sizes
 */
export type ComponentSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Component states
 */
export type ComponentState =
  | "default"
  | "hover"
  | "focus"
  | "active"
  | "disabled"
  | "loading"
  | "selected";

/**
 * Animation types for components
 */
export type AnimationType =
  | "none"
  | "fade"
  | "slide"
  | "bounce"
  | "pulse"
  | "spin";

// ===== THEME SYSTEM TYPES =====

/**
 * Theme mode
 */
export type ThemeMode = "light" | "dark" | "auto";

/**
 * Color scheme definition
 */
export interface ColorScheme {
  readonly background: ColorValue;
  readonly foreground: ColorValue;
  readonly muted: ColorValue;
  readonly mutedForeground: ColorValue;
  readonly popover: ColorValue;
  readonly popoverForeground: ColorValue;
  readonly border: ColorValue;
  readonly input: ColorValue;
  readonly primary: ColorValue;
  readonly primaryForeground: ColorValue;
  readonly secondary: ColorValue;
  readonly secondaryForeground: ColorValue;
  readonly accent: ColorValue;
  readonly accentForeground: ColorValue;
  readonly destructive: ColorValue;
  readonly destructiveForeground: ColorValue;
  readonly ring: ColorValue;
}

/**
 * Complete theme configuration
 */
export interface ThemeConfig {
  readonly mode: ThemeMode;
  readonly colors: ColorScheme;
  readonly borderRadius: Record<string, string>;
  readonly spacing: Record<string, number>;
  readonly typography: {
    readonly fontFamily?: string;
    readonly fontSize: Record<ComponentSize, number>;
    readonly lineHeight: Record<ComponentSize, number>;
  };
  readonly animation: {
    readonly duration: Record<string, number>;
    readonly easing: Record<string, string>;
  };
}

// ===== COMPONENT SYSTEM TYPES =====

/**
 * Base component props that all components inherit
 */
export interface BaseComponentProps extends TerminalPosition {
  readonly className?: string;
  readonly id?: string;
  readonly parent?: Widgets.Node;
  readonly variant?: ComponentVariant;
  readonly size?: ComponentSize;
  readonly disabled?: boolean;
  readonly hidden?: boolean;
  readonly focusable?: boolean;
  readonly scrollable?: boolean;
  readonly padding?: PaddingConfig;
  readonly margin?: MarginConfig;
  readonly bg?: ColorValue;
  readonly fg?: ColorValue;
  readonly border?: BorderStyle;
  readonly borderColor?: ColorValue;
  readonly style?: TextStyle;
  readonly animation?: AnimationType;
  readonly theme?: Partial<ThemeConfig>;
}

/**
 * Event props for interactive components
 */
export interface EventProps {
  readonly onClick?: EventHandler;
  readonly onFocus?: EventHandler;
  readonly onBlur?: EventHandler;
  readonly onKeypress?: EventHandler<{ key: string; sequence: string }>;
  readonly onMouse?: EventHandler<{
    button: string;
    action: string;
    x: number;
    y: number;
  }>;
}

/**
 * Component instance interface
 */
export interface ComponentInstance<
  TElement extends Widgets.BlessedElement = Widgets.BlessedElement
> {
  readonly el: TElement;
  readonly destroy: () => void;
  readonly focus: () => void;
  readonly blur: () => void;
  readonly show: () => void;
  readonly hide: () => void;
  readonly render: () => void;
}

/**
 * Component constructor type
 */
export type ComponentConstructor<
  TProps extends BaseComponentProps = BaseComponentProps,
  TElement extends Widgets.BlessedElement = Widgets.BlessedElement
> = {
  new (props: TProps): ComponentInstance<TElement>;
};

/**
 * Component factory function type
 */
export type ComponentFactory<
  TProps extends BaseComponentProps = BaseComponentProps,
  TElement extends Widgets.BlessedElement = Widgets.BlessedElement
> = (props: TProps) => ComponentInstance<TElement>;

// ===== FORM AND INPUT TYPES =====

/**
 * Input validation result
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

/**
 * Form field configuration
 */
export interface FormField<T = any> {
  readonly name: string;
  readonly label?: string;
  readonly type:
    | "text"
    | "number"
    | "email"
    | "password"
    | "textarea"
    | "select"
    | "checkbox"
    | "radio";
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly defaultValue?: T;
  readonly validate?: (
    value: T
  ) => ValidationResult | Promise<ValidationResult>;
  readonly options?: readonly { label: string; value: T }[]; // for select/radio
}

/**
 * Form data type
 */
export type FormData<
  T extends Record<string, FormField> = Record<string, FormField>
> = {
  [K in keyof T]: T[K] extends FormField<infer U> ? U : never;
};

// ===== LAYOUT TYPES =====

/**
 * Flex direction
 */
export type FlexDirection = "row" | "column";

/**
 * Flex alignment
 */
export type FlexAlign = "start" | "center" | "end" | "stretch";

/**
 * Flex justification
 */
export type FlexJustify =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

/**
 * Layout configuration
 */
export interface LayoutConfig {
  readonly direction?: FlexDirection;
  readonly align?: FlexAlign;
  readonly justify?: FlexJustify;
  readonly gap?: number;
  readonly wrap?: boolean;
}

// ===== ACCESSIBILITY TYPES =====

/**
 * ARIA roles for terminal components
 */
export type AriaRole =
  | "button"
  | "textbox"
  | "checkbox"
  | "radio"
  | "listbox"
  | "option"
  | "menu"
  | "menuitem"
  | "dialog"
  | "alert"
  | "status"
  | "progressbar"
  | "slider";

/**
 * Accessibility props
 */
export interface AccessibilityProps {
  readonly role?: AriaRole;
  readonly label?: string;
  readonly description?: string;
  readonly keyboardShortcut?: string;
}

// ===== COMPONENT SPECIFIC TYPES =====

/**
 * Button specific props
 */
export interface ButtonSpecificProps extends EventProps, AccessibilityProps {
  readonly type?: "button" | "submit" | "reset";
  readonly loading?: boolean;
  readonly loadingText?: string;
  readonly leftIcon?: string;
  readonly rightIcon?: string;
}

/**
 * Input specific props
 */
export interface InputSpecificProps extends EventProps, AccessibilityProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly readonly?: boolean;
  readonly password?: boolean;
  readonly multiline?: boolean;
  readonly rows?: number;
  readonly onChange?: EventHandler<string>;
  readonly onSubmit?: EventHandler<string>;
  readonly validate?: (
    value: string
  ) => ValidationResult | Promise<ValidationResult>;
}

/**
 * List specific props
 */
export interface ListSpecificProps<T = any>
  extends EventProps,
    AccessibilityProps {
  readonly items: readonly T[];
  readonly selectedIndex?: number;
  readonly multiSelect?: boolean;
  readonly selectedIndices?: readonly number[];
  readonly renderItem?: (item: T, index: number, selected: boolean) => string;
  readonly onSelect?: EventHandler<{ item: T; index: number }>;
  readonly onSelectionChange?: EventHandler<{ items: T[]; indices: number[] }>;
}

// ===== EXPORT HELPER TYPES =====

/**
 * Extract props type from component constructor
 */
export type ComponentProps<T> = T extends ComponentConstructor<infer P, any>
  ? P
  : never;

/**
 * Extract element type from component constructor
 */
export type ComponentElement<T> = T extends ComponentConstructor<any, infer E>
  ? E
  : never;

/**
 * Polymorphic component props
 */
export type PolymorphicProps<T extends BlessedWidgetType> =
  BaseComponentProps & {
    readonly as?: T;
  } & (T extends keyof BlessedElementMap ? {} : {});
