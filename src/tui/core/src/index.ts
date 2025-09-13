// ===== CORE TYPES AND INTERFACES =====

export * from './components/Avatar'
export * from './components/Badge'
export type { Size, Tone, Variant } from './components/BaseComponent'
// ===== BASE COMPONENT SYSTEM =====
export * from './components/BaseComponent'
export { COMPONENT_DEFAULTS } from './components/BaseComponent'
// ===== TUI COMPONENTS =====
// Layout Components
export * from './components/Box'
// Navigation Components
export * from './components/Breadcrumb'
// Interactive Components
export * from './components/Button'
export * from './components/Card'
export * from './components/Checkbox'
export * from './components/Collapsible'
export * from './components/Divider'
export * from './components/Flex'
export * from './components/Gauge'
export * from './components/Grid'
export * from './components/Heading'
export * from './components/HelpOverlay'
export * from './components/KeyHint'
export * from './components/LogViewer'
export * from './components/Menu'
export * from './components/Modal'
export * from './components/MultiSelect'
export * from './components/Notification'
export * from './components/Panel'
export * from './components/Paragraph'
export * from './components/ProgressBar'
export * from './components/ProgressDots'
export * from './components/ProgressList'
export * from './components/ProgressSpinner'
export * from './components/Prompt'
export * from './components/RadioGroup'
export * from './components/Scrollable'
export * from './components/SearchBox'
export * from './components/Select'
// Feedback Components
export * from './components/Spinner'
export * from './components/StatusBar'
export * from './components/StatusIndicator'
export * from './components/Stepper'
// Data Components
export * from './components/Table'
export * from './components/Tabs'
// Display Components
export * from './components/Text'
export * from './components/TextInput'
export * from './components/Toast'

// Utility Components
export * from './components/Tooltip'
export * from './components/Tree'
export type { TuiConfig, TuiTokens, TuiVariants } from './config/tui-config'
// ===== CONFIGURATION SYSTEM =====
export * from './config/tui-config'
// ===== UTILITIES =====
export { cn, resolveBlessedColor, resolveVariants } from './lib/utils'
// ===== TERMINAL INTEGRATION =====
export * from './terminal/useTerminal'
export { bindNav, debouncedResize, KEY, mountScreen, SelectionManager, safeRender } from './terminal/useTerminal'
export type { Tokens } from './theming/design-tokens'
// Unified token system (shadcn-style for terminal)
export {
  animations,
  borderRadius,
  CAP,
  colors,
  componentTokens,
  ensureContrast,
  log,
  mapTo256Color,
  shadows,
  spacing,
  themes,
  tokens,
  typography,
} from './theming/design-tokens'
export * from './theming/theme'
// ===== THEME SYSTEM =====
export * from './theming/theme-system'
// Public schema registry (single source of truth)
export { ComponentSchemas } from './types/component-schemas'
export * from './types/core-types'
// Selective re-exports of Zod schemas used by other packages
// Utility validator for ad-hoc checks (from primitive schemas file)
export {
  BasePropsSchema,
  ComponentSizeSchema,
  ComponentVariantSchema,
  validateComponentProps,
} from './types/schemas'
export type { VariantProps } from './utils/variants'
export {
  createCompoundVariants,
  createContextVariants,
  createResponsiveVariants,
  createVariants,
  getComponentTokens,
  mergeComponentStyles,
  variants,
} from './utils/variants'
// ===== VALIDATION SYSTEM =====
export {
  ComponentValidator,
  componentValidator,
  validateComponent,
  validateComponentStrict,
  validateWithSuggestions,
} from './validation/component-validator'
