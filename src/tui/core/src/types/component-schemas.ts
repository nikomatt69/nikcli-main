import { z } from "zod";
import {
  BasePropsSchema,
  ComponentSizeSchema,
  ComponentVariantSchema,
} from "./schemas";

// ===== LAYOUT COMPONENTS =====

// Box Component Schema
export const BoxSchema = BasePropsSchema.extend({
  content: z.string().optional(),
  label: z.string().optional(),
  scrollable: z.boolean().optional(),
  alwaysScroll: z.boolean().optional(),
  scrollableOptions: z
    .object({
      scrollbar: z
        .object({
          ch: z.string().optional(),
          style: z.record(z.string(), z.any()).optional(),
        })
        .optional(),
    })
    .optional(),
});

// Flex Component Schema
export const FlexSchema = BasePropsSchema.extend({
  direction: z
    .enum(["row", "column", "row-reverse", "column-reverse"])
    .optional(),
  wrap: z.boolean().optional(),
  justify: z
    .enum(["start", "end", "center", "between", "around", "evenly"])
    .optional(),
  align: z.enum(["start", "end", "center", "baseline", "stretch"]).optional(),
  gap: z.number().optional(),
  children: z.array(z.any()).optional(), // Component instances
});

// Grid Component Schema
export const GridSchema = BasePropsSchema.extend({
  columns: z.number().optional(),
  rows: z.number().optional(),
  gap: z.number().optional(),
  children: z.array(z.any()).optional(),
  autoFit: z.boolean().optional(),
  autoFill: z.boolean().optional(),
});

// Stack Component Schema
export const StackSchema = BasePropsSchema.extend({
  direction: z.enum(["vertical", "horizontal"]).optional(),
  spacing: z.number().optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  justify: z.enum(["start", "center", "end", "between", "around"]).optional(),
  children: z.array(z.any()).optional(),
});

// ===== DISPLAY COMPONENTS =====

// Text Component Schema
export const TextSchema = BasePropsSchema.extend({
  content: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  wrap: z.boolean().optional(),
  shrink: z.boolean().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  blink: z.boolean().optional(),
});

// Heading Component Schema
export const HeadingSchema = BasePropsSchema.extend({
  text: z.string().optional(),
  level: z.enum(["1", "2", "3", "4", "5", "6"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  color: z.string().optional(),
  bold: z.boolean().optional(),
});

// Paragraph Component Schema
export const ParagraphSchema = BasePropsSchema.extend({
  text: z.string().optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().optional(),
  indent: z.number().optional(),
  wrap: z.boolean().optional(),
});

// Avatar Component Schema
export const AvatarSchema = BasePropsSchema.extend({
  initials: z.string(),
  size: z.enum(["sm", "md", "lg"]).optional(),
});

// ===== INTERACTIVE COMPONENTS =====

// Button Component Schema
export const ButtonSchema = BasePropsSchema.extend({
  text: z.string().optional(),
  onClick: z.function().args().returns(z.void()).optional(),
  disabled: z.boolean().optional(),
  loading: z.boolean().optional(),
  loadingText: z.string().optional(),
  icon: z.string().optional(),
  iconPosition: z.enum(["left", "right"]).optional(),
  fullWidth: z.boolean().optional(),
  pressed: z.boolean().optional(),
  hover: z.boolean().optional(),
});

// TextInput Component Schema
export const TextInputSchema = BasePropsSchema.extend({
  value: z.string().optional(),
  placeholder: z.string().optional(),
  password: z.boolean().optional(),
  multiline: z.boolean().optional(),
  maxLength: z.number().optional(),
  minLength: z.number().optional(),
  required: z.boolean().optional(),
  pattern: z.string().optional(),
  onChange: z.function().args(z.string()).returns(z.void()).optional(),
  onSubmit: z.function().args(z.string()).returns(z.void()).optional(),
  onFocus: z.function().args().returns(z.void()).optional(),
  onBlur: z.function().args().returns(z.void()).optional(),
  onKeyPress: z
    .function()
    .args(z.string(), z.any())
    .returns(z.void())
    .optional(),
});

// Textarea Component Schema
export const TextareaSchema = BasePropsSchema.extend({
  value: z.string().optional(),
  placeholder: z.string().optional(),
  rows: z.number().optional(),
  cols: z.number().optional(),
  maxLength: z.number().optional(),
  minLength: z.number().optional(),
  readonly: z.boolean().optional(),
  resize: z.enum(["none", "both", "horizontal", "vertical"]).optional(),
  onChange: z.function().args(z.string()).returns(z.void()).optional(),
  onFocus: z.function().args().returns(z.void()).optional(),
  onBlur: z.function().args().returns(z.void()).optional(),
});

// Select Component Schema
export const SelectSchema = BasePropsSchema.extend({
  options: z.union([
    z.array(z.string()),
    z.array(
      z.object({
        value: z.string(),
        label: z.string(),
        disabled: z.boolean().optional(),
      })
    ),
  ]),
  value: z.string().optional(),
  placeholder: z.string().optional(),
  multiple: z.boolean().optional(),
  searchable: z.boolean().optional(),
  clearable: z.boolean().optional(),
  onChange: z.function().args(z.string()).returns(z.void()).optional(),
  onFocus: z.function().args().returns(z.void()).optional(),
  onBlur: z.function().args().returns(z.void()).optional(),
});

// Checkbox Component Schema
export const CheckboxSchema = BasePropsSchema.extend({
  checked: z.boolean().optional(),
  label: z.string().optional(),
  disabled: z.boolean().optional(),
  indeterminate: z.boolean().optional(),
  onChange: z.function().args(z.boolean()).returns(z.void()).optional(),
});

// RadioGroup Component Schema
export const RadioGroupSchema = BasePropsSchema.extend({
  options: z.array(
    z.object({
      value: z.string(),
      label: z.string(),
      disabled: z.boolean().optional(),
    })
  ),
  value: z.string().optional(),
  name: z.string().optional(),
  onChange: z.function().args(z.string()).returns(z.void()).optional(),
});

// ===== FEEDBACK COMPONENTS =====

// ProgressBar Component Schema
export const ProgressBarSchema = BasePropsSchema.extend({
  value: z.number().min(0).max(100),
  max: z.number().optional(),
  min: z.number().optional(),
  label: z.string().optional(),
  showPercentage: z.boolean().optional(),
  animated: z.boolean().optional(),
  striped: z.boolean().optional(),
  color: z.string().optional(),
  size: z.enum(["xs", "sm", "md", "lg", "xl"]).optional(),
});

// Spinner Component Schema
export const SpinnerSchema = BasePropsSchema.extend({
  type: z.enum(["dots", "bars", "spinner", "pulse", "ring"]).optional(),
  speed: z.number().optional(),
  text: z.string().optional(),
  size: z.enum(["xs", "sm", "md", "lg", "xl"]).optional(),
  color: z.string().optional(),
});

// Badge Component Schema
export const BadgeSchema = BasePropsSchema.extend({
  text: z.string(),
  variant: ComponentVariantSchema.optional(),
  size: ComponentSizeSchema.optional(),
  color: z.string().optional(),
  rounded: z.boolean().optional(),
  dot: z.boolean().optional(),
});

// StatusIndicator Component Schema
export const StatusIndicatorSchema = BasePropsSchema.extend({
  status: z.enum(["idle", "running", "success", "warning", "error"]),
  text: z.string().optional(),
  animated: z.boolean().optional(),
  size: z.enum(["xs", "sm", "md", "lg", "xl"]).optional(),
});

// ===== DATA DISPLAY COMPONENTS =====

// Table Component Schema
export const TableSchema = BasePropsSchema.extend({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
  sortable: z.boolean().optional(),
  selectable: z.boolean().optional(),
  pagination: z.boolean().optional(),
  pageSize: z.number().optional(),
  currentPage: z.number().optional(),
  onRowSelect: z.function().args(z.number()).returns(z.void()).optional(),
  onSort: z
    .function()
    .args(z.string(), z.enum(["asc", "desc"]))
    .returns(z.void())
    .optional(),
  onPageChange: z.function().args(z.number()).returns(z.void()).optional(),
});

// Tree Component Schema
export const TreeSchema = BasePropsSchema.extend({
  data: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      children: z.array(z.any()).optional(),
      expanded: z.boolean().optional(),
      selected: z.boolean().optional(),
      disabled: z.boolean().optional(),
    })
  ),
  selectable: z.boolean().optional(),
  multiSelect: z.boolean().optional(),
  expandable: z.boolean().optional(),
  onNodeSelect: z.function().args(z.string()).returns(z.void()).optional(),
  onNodeExpand: z
    .function()
    .args(z.string(), z.boolean())
    .returns(z.void())
    .optional(),
});

// List Component Schema
export const ListSchema = BasePropsSchema.extend({
  items: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.any().optional(),
      disabled: z.boolean().optional(),
      selected: z.boolean().optional(),
    })
  ),
  selectable: z.boolean().optional(),
  multiSelect: z.boolean().optional(),
  searchable: z.boolean().optional(),
  onItemSelect: z.function().args(z.string()).returns(z.void()).optional(),
  onItemClick: z.function().args(z.string()).returns(z.void()).optional(),
});

// ===== OVERLAY COMPONENTS =====

// Modal Component Schema
export const ModalSchema = BasePropsSchema.extend({
  title: z.string(),
  content: z.string().optional(),
  show: z.boolean().optional(),
  closable: z.boolean().optional(),
  backdrop: z.boolean().optional(),
  size: z.enum(["sm", "md", "lg", "xl", "full"]).optional(),
  onClose: z.function().args().returns(z.void()).optional(),
  onConfirm: z.function().args().returns(z.void()).optional(),
  onCancel: z.function().args().returns(z.void()).optional(),
});

// Tooltip Component Schema
export const TooltipSchema = BasePropsSchema.extend({
  content: z.string(),
  position: z.enum(["top", "bottom", "left", "right"]).optional(),
  show: z.boolean().optional(),
  delay: z.number().optional(),
  duration: z.number().optional(),
  arrow: z.boolean().optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

// Toast Component Schema
export const ToastSchema = BasePropsSchema.extend({
  message: z.string(),
  type: z.enum(["success", "error", "warning", "info"]).optional(),
  duration: z.number().optional(),
  closable: z.boolean().optional(),
  position: z
    .enum([
      "top",
      "bottom",
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ])
    .optional(),
  onClose: z.function().args().returns(z.void()).optional(),
});

// ===== NAVIGATION COMPONENTS =====

// Tabs Component Schema
export const TabsSchema = BasePropsSchema.extend({
  tabs: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      content: z.any().optional(),
      disabled: z.boolean().optional(),
    })
  ),
  activeTab: z.string().optional(),
  orientation: z.enum(["horizontal", "vertical"]).optional(),
  onTabChange: z.function().args(z.string()).returns(z.void()).optional(),
});

// Breadcrumb Component Schema
export const BreadcrumbSchema = BasePropsSchema.extend({
  items: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      href: z.string().optional(),
      disabled: z.boolean().optional(),
    })
  ),
  separator: z.string().optional(),
  onItemClick: z.function().args(z.string()).returns(z.void()).optional(),
});

// Menu Component Schema
export const MenuSchema = BasePropsSchema.extend({
  items: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      icon: z.string().optional(),
      disabled: z.boolean().optional(),
      children: z.array(z.any()).optional(),
      action: z.function().args().returns(z.void()).optional(),
    })
  ),
  orientation: z.enum(["horizontal", "vertical"]).optional(),
  onItemClick: z.function().args(z.string()).returns(z.void()).optional(),
});

// ===== UTILITY COMPONENTS =====

// Divider Component Schema
export const DividerSchema = BasePropsSchema.extend({
  orientation: z.enum(["horizontal", "vertical"]).optional(),
  text: z.string().optional(),
  color: z.string().optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
});

// Card Component Schema
export const CardSchema = BasePropsSchema.extend({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  content: z.string().optional(),
  footer: z.string().optional(),
  header: z.any().optional(),
  actions: z.array(z.any()).optional(),
  hoverable: z.boolean().optional(),
  selectable: z.boolean().optional(),
  selected: z.boolean().optional(),
  onSelect: z.function().args(z.boolean()).returns(z.void()).optional(),
});

// Panel Component Schema
export const PanelSchema = BasePropsSchema.extend({
  title: z.string().optional(),
  collapsible: z.boolean().optional(),
  collapsed: z.boolean().optional(),
  content: z.any().optional(),
  onToggle: z.function().args(z.boolean()).returns(z.void()).optional(),
});

// Export all component schemas
export const ComponentSchemas = {
  // Layout
  box: BoxSchema,
  flex: FlexSchema,
  grid: GridSchema,
  stack: StackSchema,

  // Display
  text: TextSchema,
  heading: HeadingSchema,
  paragraph: ParagraphSchema,
  avatar: AvatarSchema,

  // Interactive
  button: ButtonSchema,
  textInput: TextInputSchema,
  textarea: TextareaSchema,
  select: SelectSchema,
  checkbox: CheckboxSchema,
  radioGroup: RadioGroupSchema,

  // Feedback
  progressBar: ProgressBarSchema,
  spinner: SpinnerSchema,
  badge: BadgeSchema,
  statusIndicator: StatusIndicatorSchema,

  // Data Display
  table: TableSchema,
  tree: TreeSchema,
  list: ListSchema,

  // Overlay
  modal: ModalSchema,
  tooltip: TooltipSchema,
  toast: ToastSchema,

  // Navigation
  tabs: TabsSchema,
  breadcrumb: BreadcrumbSchema,
  menu: MenuSchema,

  // Utility
  divider: DividerSchema,
  card: CardSchema,
  panel: PanelSchema,
} as const;

// Export all types derived from schemas
export type ZodBoxProps = z.infer<typeof BoxSchema>;
export type ZodFlexProps = z.infer<typeof FlexSchema>;
export type ZodGridProps = z.infer<typeof GridSchema>;
export type ZodStackProps = z.infer<typeof StackSchema>;
export type ZodTextProps = z.infer<typeof TextSchema>;
export type ZodHeadingProps = z.infer<typeof HeadingSchema>;
export type ZodParagraphProps = z.infer<typeof ParagraphSchema>;
export type ZodAvatarProps = z.infer<typeof AvatarSchema>;
export type ZodButtonProps = z.infer<typeof ButtonSchema>;
export type ZodTextInputProps = z.infer<typeof TextInputSchema>;
export type ZodTextareaProps = z.infer<typeof TextareaSchema>;
export type ZodSelectProps = z.infer<typeof SelectSchema>;
export type ZodCheckboxProps = z.infer<typeof CheckboxSchema>;
export type ZodRadioGroupProps = z.infer<typeof RadioGroupSchema>;
export type ZodProgressBarProps = z.infer<typeof ProgressBarSchema>;
export type ZodSpinnerProps = z.infer<typeof SpinnerSchema>;
export type ZodBadgeProps = z.infer<typeof BadgeSchema>;
export type ZodStatusIndicatorProps = z.infer<typeof StatusIndicatorSchema>;
export type ZodTableProps = z.infer<typeof TableSchema>;
export type ZodTreeProps = z.infer<typeof TreeSchema>;
export type ZodListProps = z.infer<typeof ListSchema>;
export type ZodModalProps = z.infer<typeof ModalSchema>;
export type ZodTooltipProps = z.infer<typeof TooltipSchema>;
export type ZodToastProps = z.infer<typeof ToastSchema>;
export type ZodTabsProps = z.infer<typeof TabsSchema>;
export type ZodBreadcrumbProps = z.infer<typeof BreadcrumbSchema>;
export type ZodMenuProps = z.infer<typeof MenuSchema>;
export type ZodDividerProps = z.infer<typeof DividerSchema>;
export type ZodCardProps = z.infer<typeof CardSchema>;
export type ZodPanelProps = z.infer<typeof PanelSchema>;
