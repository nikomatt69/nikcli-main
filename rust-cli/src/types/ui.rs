use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// UI theme enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UITheme {
    Dark,
    Light,
    Auto,
    Custom(String),
}

impl std::fmt::Display for UITheme {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UITheme::Dark => write!(f, "dark"),
            UITheme::Light => write!(f, "light"),
            UITheme::Auto => write!(f, "auto"),
            UITheme::Custom(name) => write!(f, "custom:{}", name),
        }
    }
}

/// UI component type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UIComponentType {
    Button,
    Input,
    TextArea,
    Select,
    Checkbox,
    Radio,
    Switch,
    Slider,
    Progress,
    Spinner,
    Modal,
    Dialog,
    Tooltip,
    Dropdown,
    Menu,
    Tab,
    Accordion,
    Card,
    List,
    Table,
    Form,
    Panel,
    Sidebar,
    Header,
    Footer,
    Navigation,
    Breadcrumb,
    Pagination,
    Search,
    Filter,
    Sort,
    Calendar,
    DatePicker,
    TimePicker,
    ColorPicker,
    FileUpload,
    Image,
    Video,
    Audio,
    Chart,
    Graph,
    Map,
    CodeEditor,
    Terminal,
    LogViewer,
    DiffViewer,
    TreeView,
    Grid,
    Flex,
    Container,
    Spacer,
    Divider,
    Badge,
    Tag,
    Chip,
    Avatar,
    Icon,
    Text,
    Heading,
    Paragraph,
    Link,
    Quote,
    Code,
    Pre,
    Kbd,
    Mark,
    Del,
    Ins,
    Sub,
    Sup,
    Small,
    Strong,
    Em,
    B,
    I,
    U,
    S,
    Custom(String),
}

impl std::fmt::Display for UIComponentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UIComponentType::Button => write!(f, "button"),
            UIComponentType::Input => write!(f, "input"),
            UIComponentType::TextArea => write!(f, "textarea"),
            UIComponentType::Select => write!(f, "select"),
            UIComponentType::Checkbox => write!(f, "checkbox"),
            UIComponentType::Radio => write!(f, "radio"),
            UIComponentType::Switch => write!(f, "switch"),
            UIComponentType::Slider => write!(f, "slider"),
            UIComponentType::Progress => write!(f, "progress"),
            UIComponentType::Spinner => write!(f, "spinner"),
            UIComponentType::Modal => write!(f, "modal"),
            UIComponentType::Dialog => write!(f, "dialog"),
            UIComponentType::Tooltip => write!(f, "tooltip"),
            UIComponentType::Dropdown => write!(f, "dropdown"),
            UIComponentType::Menu => write!(f, "menu"),
            UIComponentType::Tab => write!(f, "tab"),
            UIComponentType::Accordion => write!(f, "accordion"),
            UIComponentType::Card => write!(f, "card"),
            UIComponentType::List => write!(f, "list"),
            UIComponentType::Table => write!(f, "table"),
            UIComponentType::Form => write!(f, "form"),
            UIComponentType::Panel => write!(f, "panel"),
            UIComponentType::Sidebar => write!(f, "sidebar"),
            UIComponentType::Header => write!(f, "header"),
            UIComponentType::Footer => write!(f, "footer"),
            UIComponentType::Navigation => write!(f, "navigation"),
            UIComponentType::Breadcrumb => write!(f, "breadcrumb"),
            UIComponentType::Pagination => write!(f, "pagination"),
            UIComponentType::Search => write!(f, "search"),
            UIComponentType::Filter => write!(f, "filter"),
            UIComponentType::Sort => write!(f, "sort"),
            UIComponentType::Calendar => write!(f, "calendar"),
            UIComponentType::DatePicker => write!(f, "datepicker"),
            UIComponentType::TimePicker => write!(f, "timepicker"),
            UIComponentType::ColorPicker => write!(f, "colorpicker"),
            UIComponentType::FileUpload => write!(f, "fileupload"),
            UIComponentType::Image => write!(f, "image"),
            UIComponentType::Video => write!(f, "video"),
            UIComponentType::Audio => write!(f, "audio"),
            UIComponentType::Chart => write!(f, "chart"),
            UIComponentType::Graph => write!(f, "graph"),
            UIComponentType::Map => write!(f, "map"),
            UIComponentType::CodeEditor => write!(f, "codeeditor"),
            UIComponentType::Terminal => write!(f, "terminal"),
            UIComponentType::LogViewer => write!(f, "logviewer"),
            UIComponentType::DiffViewer => write!(f, "diffviewer"),
            UIComponentType::TreeView => write!(f, "treeview"),
            UIComponentType::Grid => write!(f, "grid"),
            UIComponentType::Flex => write!(f, "flex"),
            UIComponentType::Container => write!(f, "container"),
            UIComponentType::Spacer => write!(f, "spacer"),
            UIComponentType::Divider => write!(f, "divider"),
            UIComponentType::Badge => write!(f, "badge"),
            UIComponentType::Tag => write!(f, "tag"),
            UIComponentType::Chip => write!(f, "chip"),
            UIComponentType::Avatar => write!(f, "avatar"),
            UIComponentType::Icon => write!(f, "icon"),
            UIComponentType::Text => write!(f, "text"),
            UIComponentType::Heading => write!(f, "heading"),
            UIComponentType::Paragraph => write!(f, "paragraph"),
            UIComponentType::Link => write!(f, "link"),
            UIComponentType::Quote => write!(f, "quote"),
            UIComponentType::Code => write!(f, "code"),
            UIComponentType::Pre => write!(f, "pre"),
            UIComponentType::Kbd => write!(f, "kbd"),
            UIComponentType::Mark => write!(f, "mark"),
            UIComponentType::Del => write!(f, "del"),
            UIComponentType::Ins => write!(f, "ins"),
            UIComponentType::Sub => write!(f, "sub"),
            UIComponentType::Sup => write!(f, "sup"),
            UIComponentType::Small => write!(f, "small"),
            UIComponentType::Strong => write!(f, "strong"),
            UIComponentType::Em => write!(f, "em"),
            UIComponentType::B => write!(f, "b"),
            UIComponentType::I => write!(f, "i"),
            UIComponentType::U => write!(f, "u"),
            UIComponentType::S => write!(f, "s"),
            UIComponentType::Custom(name) => write!(f, "custom:{}", name),
        }
    }
}

/// UI component size enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UIComponentSize {
    Xs,
    Sm,
    Md,
    Lg,
    Xl,
    Custom(String),
}

impl std::fmt::Display for UIComponentSize {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UIComponentSize::Xs => write!(f, "xs"),
            UIComponentSize::Sm => write!(f, "sm"),
            UIComponentSize::Md => write!(f, "md"),
            UIComponentSize::Lg => write!(f, "lg"),
            UIComponentSize::Xl => write!(f, "xl"),
            UIComponentSize::Custom(size) => write!(f, "custom:{}", size),
        }
    }
}

/// UI component variant enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UIComponentVariant {
    Primary,
    Secondary,
    Success,
    Warning,
    Error,
    Info,
    Light,
    Dark,
    Outline,
    Ghost,
    Link,
    Custom(String),
}

impl std::fmt::Display for UIComponentVariant {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UIComponentVariant::Primary => write!(f, "primary"),
            UIComponentVariant::Secondary => write!(f, "secondary"),
            UIComponentVariant::Success => write!(f, "success"),
            UIComponentVariant::Warning => write!(f, "warning"),
            UIComponentVariant::Error => write!(f, "error"),
            UIComponentVariant::Info => write!(f, "info"),
            UIComponentVariant::Light => write!(f, "light"),
            UIComponentVariant::Dark => write!(f, "dark"),
            UIComponentVariant::Outline => write!(f, "outline"),
            UIComponentVariant::Ghost => write!(f, "ghost"),
            UIComponentVariant::Link => write!(f, "link"),
            UIComponentVariant::Custom(variant) => write!(f, "custom:{}", variant),
        }
    }
}

/// UI component representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIComponent {
    pub id: String,
    pub component_type: UIComponentType,
    pub size: Option<UIComponentSize>,
    pub variant: Option<UIComponentVariant>,
    pub label: Option<String>,
    pub placeholder: Option<String>,
    pub value: Option<serde_json::Value>,
    pub disabled: bool,
    pub readonly: bool,
    pub required: bool,
    pub visible: bool,
    pub children: Vec<UIComponent>,
    pub props: HashMap<String, serde_json::Value>,
    pub styles: HashMap<String, String>,
    pub classes: Vec<String>,
    pub events: HashMap<String, String>,
}

impl UIComponent {
    pub fn new(id: String, component_type: UIComponentType) -> Self {
        Self {
            id,
            component_type,
            size: None,
            variant: None,
            label: None,
            placeholder: None,
            value: None,
            disabled: false,
            readonly: false,
            required: false,
            visible: true,
            children: Vec::new(),
            props: HashMap::new(),
            styles: HashMap::new(),
            classes: Vec::new(),
            events: HashMap::new(),
        }
    }
}

/// UI layout type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UILayoutType {
    Flex,
    Grid,
    Stack,
    Sidebar,
    Header,
    Footer,
    Main,
    Section,
    Article,
    Aside,
    Nav,
    Custom(String),
}

impl std::fmt::Display for UILayoutType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UILayoutType::Flex => write!(f, "flex"),
            UILayoutType::Grid => write!(f, "grid"),
            UILayoutType::Stack => write!(f, "stack"),
            UILayoutType::Sidebar => write!(f, "sidebar"),
            UILayoutType::Header => write!(f, "header"),
            UILayoutType::Footer => write!(f, "footer"),
            UILayoutType::Main => write!(f, "main"),
            UILayoutType::Section => write!(f, "section"),
            UILayoutType::Article => write!(f, "article"),
            UILayoutType::Aside => write!(f, "aside"),
            UILayoutType::Nav => write!(f, "nav"),
            UILayoutType::Custom(name) => write!(f, "custom:{}", name),
        }
    }
}

/// UI layout representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UILayout {
    pub id: String,
    pub layout_type: UILayoutType,
    pub direction: Option<LayoutDirection>,
    pub alignment: Option<LayoutAlignment>,
    pub justify: Option<LayoutJustify>,
    pub wrap: Option<bool>,
    pub gap: Option<u32>,
    pub columns: Option<u32>,
    pub rows: Option<u32>,
    pub areas: Option<Vec<String>>,
    pub children: Vec<UIComponent>,
    pub styles: HashMap<String, String>,
    pub classes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayoutDirection {
    Row,
    Column,
    RowReverse,
    ColumnReverse,
}

impl std::fmt::Display for LayoutDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LayoutDirection::Row => write!(f, "row"),
            LayoutDirection::Column => write!(f, "column"),
            LayoutDirection::RowReverse => write!(f, "row-reverse"),
            LayoutDirection::ColumnReverse => write!(f, "column-reverse"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayoutAlignment {
    Start,
    End,
    Center,
    Stretch,
    Baseline,
}

impl std::fmt::Display for LayoutAlignment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LayoutAlignment::Start => write!(f, "start"),
            LayoutAlignment::End => write!(f, "end"),
            LayoutAlignment::Center => write!(f, "center"),
            LayoutAlignment::Stretch => write!(f, "stretch"),
            LayoutAlignment::Baseline => write!(f, "baseline"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayoutJustify {
    Start,
    End,
    Center,
    Between,
    Around,
    Evenly,
}

impl std::fmt::Display for LayoutJustify {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LayoutJustify::Start => write!(f, "start"),
            LayoutJustify::End => write!(f, "end"),
            LayoutJustify::Center => write!(f, "center"),
            LayoutJustify::Between => write!(f, "between"),
            LayoutJustify::Around => write!(f, "around"),
            LayoutJustify::Evenly => write!(f, "evenly"),
        }
    }
}

impl UILayout {
    pub fn new(id: String, layout_type: UILayoutType) -> Self {
        Self {
            id,
            layout_type,
            direction: None,
            alignment: None,
            justify: None,
            wrap: None,
            gap: None,
            columns: None,
            rows: None,
            areas: None,
            children: Vec::new(),
            styles: HashMap::new(),
            classes: Vec::new(),
        }
    }
}

/// UI page representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIPage {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub path: String,
    pub layout: UILayout,
    pub components: Vec<UIComponent>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl UIPage {
    pub fn new(id: String, title: String, path: String) -> Self {
        let now = Utc::now();
        Self {
            id,
            title,
            description: None,
            path,
            layout: UILayout::new("main".to_string(), UILayoutType::Main),
            components: Vec::new(),
            metadata: HashMap::new(),
            created_at: now,
            updated_at: now,
        }
    }
}

/// UI application representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIApplication {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub theme: UITheme,
    pub pages: Vec<UIPage>,
    pub global_styles: HashMap<String, String>,
    pub global_scripts: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl UIApplication {
    pub fn new(id: String, name: String, version: String) -> Self {
        let now = Utc::now();
        Self {
            id,
            name,
            version,
            description: None,
            theme: UITheme::Auto,
            pages: Vec::new(),
            global_styles: HashMap::new(),
            global_scripts: Vec::new(),
            metadata: HashMap::new(),
            created_at: now,
            updated_at: now,
        }
    }
}

/// UI event type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UIEventType {
    Click,
    DoubleClick,
    RightClick,
    Hover,
    Focus,
    Blur,
    Change,
    Input,
    Submit,
    Reset,
    Load,
    Unload,
    Resize,
    Scroll,
    KeyDown,
    KeyUp,
    KeyPress,
    MouseDown,
    MouseUp,
    MouseMove,
    MouseEnter,
    MouseLeave,
    TouchStart,
    TouchEnd,
    TouchMove,
    Custom(String),
}

impl std::fmt::Display for UIEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UIEventType::Click => write!(f, "click"),
            UIEventType::DoubleClick => write!(f, "dblclick"),
            UIEventType::RightClick => write!(f, "contextmenu"),
            UIEventType::Hover => write!(f, "mouseover"),
            UIEventType::Focus => write!(f, "focus"),
            UIEventType::Blur => write!(f, "blur"),
            UIEventType::Change => write!(f, "change"),
            UIEventType::Input => write!(f, "input"),
            UIEventType::Submit => write!(f, "submit"),
            UIEventType::Reset => write!(f, "reset"),
            UIEventType::Load => write!(f, "load"),
            UIEventType::Unload => write!(f, "unload"),
            UIEventType::Resize => write!(f, "resize"),
            UIEventType::Scroll => write!(f, "scroll"),
            UIEventType::KeyDown => write!(f, "keydown"),
            UIEventType::KeyUp => write!(f, "keyup"),
            UIEventType::KeyPress => write!(f, "keypress"),
            UIEventType::MouseDown => write!(f, "mousedown"),
            UIEventType::MouseUp => write!(f, "mouseup"),
            UIEventType::MouseMove => write!(f, "mousemove"),
            UIEventType::MouseEnter => write!(f, "mouseenter"),
            UIEventType::MouseLeave => write!(f, "mouseleave"),
            UIEventType::TouchStart => write!(f, "touchstart"),
            UIEventType::TouchEnd => write!(f, "touchend"),
            UIEventType::TouchMove => write!(f, "touchmove"),
            UIEventType::Custom(name) => write!(f, "{}", name),
        }
    }
}

/// UI event representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIEvent {
    pub id: String,
    pub event_type: UIEventType,
    pub component_id: String,
    pub data: HashMap<String, serde_json::Value>,
    pub timestamp: DateTime<Utc>,
    pub prevent_default: bool,
    pub stop_propagation: bool,
}

impl UIEvent {
    pub fn new(event_type: UIEventType, component_id: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            event_type,
            component_id,
            data: HashMap::new(),
            timestamp: Utc::now(),
            prevent_default: false,
            stop_propagation: false,
        }
    }
}

/// UI state representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIState {
    pub id: String,
    pub component_id: String,
    pub state_type: UIStateType,
    pub value: serde_json::Value,
    pub previous_value: Option<serde_json::Value>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UIStateType {
    Data,
    Loading,
    Error,
    Success,
    Warning,
    Info,
    Custom(String),
}

impl std::fmt::Display for UIStateType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UIStateType::Data => write!(f, "data"),
            UIStateType::Loading => write!(f, "loading"),
            UIStateType::Error => write!(f, "error"),
            UIStateType::Success => write!(f, "success"),
            UIStateType::Warning => write!(f, "warning"),
            UIStateType::Info => write!(f, "info"),
            UIStateType::Custom(name) => write!(f, "{}", name),
        }
    }
}

impl UIState {
    pub fn new(component_id: String, state_type: UIStateType, value: serde_json::Value) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            component_id,
            state_type,
            value,
            previous_value: None,
            updated_at: Utc::now(),
        }
    }
}