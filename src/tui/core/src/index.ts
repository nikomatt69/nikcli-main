// ===== CORE TYPES AND INTERFACES =====
export * from "./types/core-types";

// ===== THEME SYSTEM =====
export * from "./theming/theme-system";
export * from "./theming/theme";
// Unified token system (shadcn-style for terminal)
export {
  tokens,
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
  animations,
  componentTokens,
  ensureContrast,
  themes,
  CAP,
  mapTo256Color,
  log,
} from "./theming/design-tokens";
export type { Tokens } from "./theming/design-tokens";

// ===== BASE COMPONENT SYSTEM =====
export * from "./components/BaseComponent";
export type { Variant, Size, Tone } from "./components/BaseComponent";
export { COMPONENT_DEFAULTS } from "./components/BaseComponent";

// ===== TUI COMPONENTS =====
// Layout Components
export * from "./components/Box";
export * from "./components/Card";
export * from "./components/Divider";
export * from "./components/Grid";
export * from "./components/Panel";
export * from "./components/Flex";

// Interactive Components  
export * from "./components/Button";
export * from "./components/TextInput";
export * from "./components/Select";
export * from "./components/MultiSelect";
export * from "./components/Checkbox";
export * from "./components/RadioGroup";
export * from "./components/Tabs";
export * from "./components/Menu";
export * from "./components/Prompt";

// Display Components
export * from "./components/Text";
export * from "./components/Heading";
export * from "./components/Badge";
export * from "./components/StatusIndicator";
export * from "./components/Avatar";
export * from "./components/Paragraph";

// Feedback Components
export * from "./components/Spinner";
export * from "./components/ProgressBar";
export * from "./components/ProgressSpinner";
export * from "./components/ProgressDots";
export * from "./components/ProgressList";
export * from "./components/Notification";
export * from "./components/Toast";
export * from "./components/Modal";
export * from "./components/StatusBar";

// Navigation Components
export * from "./components/Breadcrumb";
export * from "./components/Stepper";

// Data Components
export * from "./components/Table";
export * from "./components/Tree";
export * from "./components/LogViewer";

// Utility Components
export * from "./components/Tooltip";
export * from "./components/HelpOverlay";
export * from "./components/Scrollable";
export * from "./components/SearchBox";
export * from "./components/KeyHint";
export * from "./components/Collapsible";
export * from "./components/Gauge";

// ===== CONFIGURATION SYSTEM =====
export * from "./config/tui-config";
export type { TuiConfig, TuiTokens, TuiVariants } from "./config/tui-config";

// ===== VALIDATION SYSTEM =====
export {
  ComponentValidator,
  componentValidator,
  validateComponent,
  validateComponentStrict,
  validateWithSuggestions,
} from "./validation/component-validator";
// Selective re-exports of Zod schemas used by other packages
export {
  BasePropsSchema,
  ComponentVariantSchema,
  ComponentSizeSchema,
} from "./types/schemas";
// Public schema registry (single source of truth)
export { ComponentSchemas } from "./types/component-schemas";
// Utility validator for ad-hoc checks (from primitive schemas file)
export { validateComponentProps } from "./types/schemas";

// ===== UTILITIES =====
export { cn, resolveBlessedColor, resolveVariants } from "./lib/utils";
export {
  createCompoundVariants,
  createContextVariants,
  createResponsiveVariants,
  createVariants,
  getComponentTokens,
  mergeComponentStyles,
  variants,
} from "./utils/variants";
export type { VariantProps } from "./utils/variants";

// ===== TERMINAL INTEGRATION =====
export * from "./terminal/useTerminal";
export { KEY, safeRender, mountScreen, SelectionManager, debouncedResize, bindNav } from "./terminal/useTerminal";
