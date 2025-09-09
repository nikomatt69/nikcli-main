import { z } from "zod";

// ===== PRIMITIVE SCHEMAS =====

/**
 * Terminal measurement units
 */
export const TerminalUnitSchema = z.union([
  z.number(),
  z.string().regex(/^\d+%$/, "Percentage must be in format '50%'"),
  z.enum(['center', 'left', 'right', 'top', 'bottom'])
]);

/**
 * Position schema for terminal components
 */
export const PositionSchema = z.object({
  top: TerminalUnitSchema.optional(),
  left: TerminalUnitSchema.optional(),
  right: TerminalUnitSchema.optional(),
  bottom: TerminalUnitSchema.optional(),
  width: TerminalUnitSchema.optional(),
  height: TerminalUnitSchema.optional(),
}).strict();

/**
 * Padding configuration schema
 */
export const PaddingSchema = z.union([
  z.number().min(0, "Padding must be non-negative"),
  z.tuple([z.number().min(0), z.number().min(0)]).describe("Tuple: [vertical, horizontal]"),
  z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)])
    .describe("Tuple: [top, right, bottom, left]"),
  z.object({
    top: z.number().min(0).optional(),
    right: z.number().min(0).optional(), 
    bottom: z.number().min(0).optional(),
    left: z.number().min(0).optional(),
  }).strict()
]).optional();

/**
 * Terminal color schema with full type safety
 */
export const TerminalColorSchema = z.union([
  // Standard terminal colors
  z.enum([
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightblack', 'brightred', 'brightgreen', 'brightyellow', 
    'brightblue', 'brightmagenta', 'brightcyan', 'brightwhite',
    'grey', 'gray'
  ]),
  // Hex colors
  z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Hex color must be in format '#RRGGBB'"),
  z.string().regex(/^#[0-9A-Fa-f]{3}$/, "Short hex color must be in format '#RGB'"),
  // RGB colors  
  z.string().regex(/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/, "RGB must be in format 'rgb(r,g,b)'"),
  // 256-color palette
  z.number().min(0).max(255).describe("256-color palette index")
]);

/**
 * Design token color reference schema
 */
export const TokenColorReferenceSchema = z.union([
  z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$/, "Token reference: 'namespace.token'"),
  z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z0-9]+$/, "Token reference: 'namespace.token.variant'")
]);

/**
 * Combined color schema
 */
export const ColorSchema = z.union([
  TerminalColorSchema,
  TokenColorReferenceSchema
]);

/**
 * Border style schema with enhanced type safety
 */
export const BorderStyleSchema = z.union([
  z.enum(['line', 'bg', 'none']),
  z.object({
    type: z.enum(['line', 'bg']),
    fg: ColorSchema.optional()
  }).strict()
]).optional();

/**
 * Text style schema
 */
export const TextStyleSchema = z.object({
  bold: z.boolean().optional(),
  underline: z.boolean().optional(),
  blink: z.boolean().optional(),
  inverse: z.boolean().optional(),
  invisible: z.boolean().optional()
}).strict().optional();

/**
 * Animation type schema
 */
export const AnimationTypeSchema = z.enum([
  'none', 'fade', 'slide', 'bounce', 'pulse', 'spin'
]).optional();

/**
 * Style properties schema
 */
export const StylePropsSchema = z.object({
  bg: ColorSchema.optional(),
  fg: ColorSchema.optional(),
  border: BorderStyleSchema,
  borderColor: ColorSchema.optional(),
  // allow borderStyle helper prop used across components (mapped internally)
  borderStyle: z.enum(['line','double','round','bold','classic','none']).optional(),
  style: TextStyleSchema,
  animation: AnimationTypeSchema,
}).strict();

// ===== COMPONENT VARIANT SCHEMAS =====

/**
 * Component variant schema with comprehensive variants
 */
export const ComponentVariantSchema = z.enum([
  "default",
  "primary", 
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link", 
  "success",
  "warning",
  "error", 
  "info"
]);

/**
 * Component size schema
 */
export const ComponentSizeSchema = z.enum(["xs", "sm", "md", "lg", "xl"]);

/**
 * Component state schema
 */
export const ComponentStateSchema = z.enum([
  "default",
  "hover", 
  "focus",
  "active",
  "disabled",
  "loading",
  "selected"
]);

// ===== EVENT HANDLER SCHEMAS =====

/**
 * Event handler schema for functions with no parameters
 */
export const VoidEventHandlerSchema = z.function().args().returns(z.void()).optional();

/**
 * Keyboard event schema
 */
export const KeyboardEventSchema = z.object({
  key: z.string(),
  sequence: z.string(),
  ctrl: z.boolean().optional(),
  shift: z.boolean().optional(),
  alt: z.boolean().optional()
}).strict();

/**
 * Mouse event schema
 */
export const MouseEventSchema = z.object({
  button: z.string(),
  action: z.string(),
  x: z.number(),
  y: z.number()
}).strict();

/**
 * Event properties schema
 */
export const EventPropsSchema = z.object({
  onClick: VoidEventHandlerSchema,
  onFocus: VoidEventHandlerSchema,
  onBlur: VoidEventHandlerSchema,
  onKeypress: z.function().args(KeyboardEventSchema).returns(z.void()).optional(),
  onMouse: z.function().args(MouseEventSchema).returns(z.void()).optional()
}).strict().optional();

// ===== ACCESSIBILITY SCHEMAS =====

/**
 * ARIA role schema for terminal components
 */
export const AriaRoleSchema = z.enum([
  'button', 'textbox', 'checkbox', 'radio', 'listbox', 'option',
  'menu', 'menuitem', 'dialog', 'alert', 'status', 'progressbar', 'slider'
]).optional();

/**
 * Accessibility properties schema
 */
export const AccessibilityPropsSchema = z.object({
  role: AriaRoleSchema,
  label: z.string().optional(),
  description: z.string().optional(),
  keyboardShortcut: z.string().optional()
}).strict().optional();

// ===== BASE COMPONENT SCHEMA =====

/**
 * Base component props schema - foundation for all components
 */
export const BasePropsSchema = StylePropsSchema.extend({
  // Core blessed.js properties
  parent: z.any().optional(), // blessed.Widgets.Node - can't be more specific due to circular deps
  
  // Identification
  className: z.string().optional(),
  id: z.string().optional(),
  
  // Layout and positioning  
  padding: PaddingSchema,
  margin: PaddingSchema, // reuse padding schema structure
  
  // Component system properties
  variant: ComponentVariantSchema.optional(),
  size: ComponentSizeSchema.optional(),
  
  // Behavior
  disabled: z.boolean().optional(),
  hidden: z.boolean().optional(),
  focusable: z.boolean().default(true),
  scrollable: z.boolean().default(false),
  
  // Advanced properties
  theme: z.any().optional(), // Partial<ThemeConfig> - will be refined later
  responsive: z.record(z.string(), z.any()).optional(),
  
  // Legacy blessed.js integration
  keys: z.boolean().optional(),
  mouse: z.boolean().optional(),
  blessedProps: z.object({
    style: z.record(z.string(), z.any()).optional()
  }).strict().optional()
}).merge(PositionSchema).strict();

// ===== COMPONENT-SPECIFIC SCHEMAS =====

/**
 * Button component props schema
 */
export const ButtonPropsSchema = BasePropsSchema.extend({
  // Content
  text: z.string().min(1, "Button text cannot be empty"),
  children: z.string().optional(),
  
  // Button type
  type: z.enum(['button', 'submit', 'reset']).default('button'),
  
  // Loading state
  loading: z.boolean().default(false),
  loadingText: z.string().optional(),
  
  // Icons
  leftIcon: z.string().optional(),
  rightIcon: z.string().optional(),
  
  // Events
  onClick: VoidEventHandlerSchema,
  onPress: VoidEventHandlerSchema
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Box component props schema - foundational container
 */
export const BoxPropsSchema = BasePropsSchema.extend({
  content: z.string().optional(),
  children: z.array(z.any()).optional(), // Child components
  label: z.string().optional()
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Text component props schema
 */
export const TextPropsSchema = BasePropsSchema.extend({
  content: z.string().min(1, "Text content cannot be empty"),
  align: z.enum(['left', 'center', 'right']).default('left'),
  wrap: z.boolean().default(false),
  selectable: z.boolean().default(false),
  tags: z.boolean().default(false) // blessed tags support
}).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Validation result schema
 */
export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string())
}).strict();

/**
 * Input component props schema
 */
export const InputPropsSchema = BasePropsSchema.extend({
  // Value management
  value: z.string().optional(),
  defaultValue: z.string().optional(),
  placeholder: z.string().optional(),
  
  // Input behavior
  password: z.boolean().default(false),
  multiline: z.boolean().default(false),
  rows: z.number().min(1).optional(),
  maxLength: z.number().min(1).optional(),
  readonly: z.boolean().default(false),
  
  // Events
  onChange: z.function().args(z.string()).returns(z.void()).optional(),
  onSubmit: z.function().args(z.string()).returns(z.void()).optional(),
  
  // Validation
  validate: z.function().args(z.string()).returns(ValidationResultSchema).optional()
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Heading component props schema
 */
export const HeadingPropsSchema = BasePropsSchema.extend({
  text: z.string().min(1, "Heading text cannot be empty"),
  level: z.enum(['1', '2', '3', '4', '5', '6']).default('1'),
  align: z.enum(['left', 'center', 'right']).default('left')
}).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Progress bar component props schema
 */
export const ProgressBarPropsSchema = BasePropsSchema.extend({
  value: z.number().min(0).max(100),
  max: z.number().min(1).default(100),
  label: z.string().optional(),
  showPercentage: z.boolean().default(false),
  animated: z.boolean().default(false),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal')
}).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Badge component props schema
 */
export const BadgePropsSchema = BasePropsSchema.extend({
  text: z.string().min(1, "Badge text cannot be empty"),
  dot: z.boolean().default(false), // Show as dot badge
  count: z.number().min(0).optional() // Show count instead of text
}).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Spinner component props schema
 */
export const SpinnerPropsSchema = BasePropsSchema.extend({
  type: z.enum(['dots', 'bars', 'spinner', 'pulse', 'bounce']).default('spinner'),
  speed: z.number().min(0.1).max(10).default(1),
  text: z.string().optional(),
  color: ColorSchema.optional()
}).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Table column definition schema
 */
export const TableColumnSchema = z.object({
  key: z.string(),
  title: z.string(),
  width: TerminalUnitSchema.optional(),
  align: z.enum(['left', 'center', 'right']).default('left'),
  sortable: z.boolean().default(false)
}).strict();

/**
 * Table component props schema
 */
export const TablePropsSchema = BasePropsSchema.extend({
  columns: z.array(TableColumnSchema).min(1, "Table must have at least one column"),
  data: z.array(z.record(z.string(), z.any())).default([]),
  sortable: z.boolean().default(false),
  selectable: z.boolean().default(false),
  multiSelect: z.boolean().default(false),
  selectedRows: z.array(z.number()).default([]),
  onRowSelect: z.function().args(z.object({ row: z.any(), index: z.number() })).returns(z.void()).optional(),
  onSort: z.function().args(z.object({ column: z.string(), direction: z.enum(['asc', 'desc']) })).returns(z.void()).optional()
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Modal component props schema
 */
export const ModalPropsSchema = BasePropsSchema.extend({
  title: z.string().min(1, "Modal title cannot be empty"),
  content: z.string().optional(),
  show: z.boolean().default(false),
  closable: z.boolean().default(true),
  maskClosable: z.boolean().default(true),
  keyboard: z.boolean().default(true), // Close on Escape
  centered: z.boolean().default(true),
  onClose: VoidEventHandlerSchema,
  onConfirm: VoidEventHandlerSchema,
  onCancel: VoidEventHandlerSchema
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Form field schema
 */
export const FormFieldSchema = z.object({
  name: z.string().min(1, "Field name cannot be empty"),
  label: z.string().optional(),
  type: z.enum(['text', 'number', 'email', 'password', 'textarea', 'select', 'checkbox', 'radio']),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  defaultValue: z.any().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.any()
  }).strict()).optional(), // for select/radio
  validate: z.function().args(z.any()).returns(ValidationResultSchema).optional()
}).strict();

/**
 * Form component props schema
 */
export const FormPropsSchema = BasePropsSchema.extend({
  fields: z.array(FormFieldSchema).min(1, "Form must have at least one field"),
  layout: z.enum(['vertical', 'horizontal', 'inline']).default('vertical'),
  submitText: z.string().default('Submit'),
  cancelText: z.string().default('Cancel'),
  showCancel: z.boolean().default(true),
  onSubmit: z.function().args(z.record(z.string(), z.any())).returns(z.void()).optional(),
  onCancel: VoidEventHandlerSchema,
  onFieldChange: z.function().args(z.object({ name: z.string(), value: z.any() })).returns(z.void()).optional()
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * List component props schema
 */
export const ListPropsSchema = BasePropsSchema.extend({
  items: z.array(z.any()).default([]),
  selectedIndex: z.number().min(0).optional(),
  multiSelect: z.boolean().default(false),
  selectedIndices: z.array(z.number().min(0)).default([]),
  search: z.boolean().default(false),
  searchPlaceholder: z.string().default('Search...'),
  emptyText: z.string().default('No items'),
  renderItem: z.function().args(z.any(), z.number(), z.boolean()).returns(z.string()).optional(),
  onSelect: z.function().args(z.object({ item: z.any(), index: z.number() })).returns(z.void()).optional(),
  onSelectionChange: z.function().args(z.object({ items: z.array(z.any()), indices: z.array(z.number()) })).returns(z.void()).optional()
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

/**
 * Stepper step schema
 */
export const StepSchema = z.object({
  label: z.string().min(1, "Step label cannot be empty"),
  description: z.string().optional(),
  icon: z.string().optional(),
  completed: z.boolean().default(false)
}).strict();

/**
 * Stepper component props schema
 */
export const StepperPropsSchema = BasePropsSchema.extend({
  steps: z.array(StepSchema).min(1, "Stepper must have at least one step"),
  activeIndex: z.number().min(0).default(0),
  orientation: z.enum(['horizontal', 'vertical']).default('vertical'),
  showDescriptions: z.boolean().default(false),
  clickable: z.boolean().default(false),
  onStepClick: z.function().args(z.number()).returns(z.void()).optional()
}).merge(EventPropsSchema.unwrap()).merge(AccessibilityPropsSchema.unwrap()).strict();

// ===== SCHEMA REGISTRY =====

/**
 * Complete registry of all component schemas
 */
// NOTE: This registry has been renamed to avoid conflicts with the public
// registry used by the validator (see types/component-schemas.ts).
// Keep this as an internal/primitive registry if needed by utilities.
export const BaseSchemas = {
  base: BasePropsSchema,
  button: ButtonPropsSchema,
  box: BoxPropsSchema,
  text: TextPropsSchema,
  input: InputPropsSchema,
  heading: HeadingPropsSchema,
  progressBar: ProgressBarPropsSchema,
  badge: BadgePropsSchema,
  spinner: SpinnerPropsSchema,
  table: TablePropsSchema,
  modal: ModalPropsSchema,
  form: FormPropsSchema,
  list: ListPropsSchema,
  stepper: StepperPropsSchema
} as const;

// ===== TYPE EXPORTS =====

/**
 * Component prop types derived from Zod schemas
 */
export type ZodBaseProps = z.infer<typeof BasePropsSchema>;
export type ZodButtonProps = z.infer<typeof ButtonPropsSchema>;
export type ZodBoxProps = z.infer<typeof BoxPropsSchema>;
export type ZodTextProps = z.infer<typeof TextPropsSchema>;
export type ZodInputProps = z.infer<typeof InputPropsSchema>;
export type ZodHeadingProps = z.infer<typeof HeadingPropsSchema>;
export type ZodProgressBarProps = z.infer<typeof ProgressBarPropsSchema>;
export type ZodBadgeProps = z.infer<typeof BadgePropsSchema>;
export type ZodSpinnerProps = z.infer<typeof SpinnerPropsSchema>;
export type ZodTableProps = z.infer<typeof TablePropsSchema>;
export type ZodModalProps = z.infer<typeof ModalPropsSchema>;
export type ZodFormProps = z.infer<typeof FormPropsSchema>;
export type ZodListProps = z.infer<typeof ListPropsSchema>;
export type ZodStepperProps = z.infer<typeof StepperPropsSchema>;

/**
 * Component-specific helper types
 */
export type TableColumn = z.infer<typeof TableColumnSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type Step = z.infer<typeof StepSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type KeyboardEvent = z.infer<typeof KeyboardEventSchema>;
export type MouseEvent = z.infer<typeof MouseEventSchema>;

/**
 * Fundamental system types
 */
export type ComponentVariant = z.infer<typeof ComponentVariantSchema>;
export type ComponentSize = z.infer<typeof ComponentSizeSchema>;
export type ComponentState = z.infer<typeof ComponentStateSchema>;
export type TerminalPosition = z.infer<typeof PositionSchema>;
export type PaddingConfig = z.infer<typeof PaddingSchema>;
export type ColorValue = z.infer<typeof ColorSchema>;
export type BorderStyle = z.infer<typeof BorderStyleSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;
export type AnimationType = z.infer<typeof AnimationTypeSchema>;
export type AriaRole = z.infer<typeof AriaRoleSchema>;

/**
 * Schema validation utility type
 */
export type SchemaValidationResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  errors: z.ZodError;
};

/**
 * Component schema lookup type
 */
export type ComponentSchemaName = keyof typeof BaseSchemas;

/**
 * Get component props type from schema name
 */
export type GetComponentProps<T extends ComponentSchemaName> = z.infer<typeof BaseSchemas[T]>;

/**
 * Utility function for schema validation with proper typing
 */
export function validateComponentProps<T extends ComponentSchemaName>(
  schemaName: T,
  props: unknown
): SchemaValidationResult<GetComponentProps<T>> {
  const schema = BaseSchemas[schemaName];
  const result = schema.safeParse(props);
  
  if (result.success) {
    return { success: true, data: result.data as GetComponentProps<T> };
  } else {
    return { success: false, errors: result.error };
  }
}
