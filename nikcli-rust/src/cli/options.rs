/// Options for NikCLI initialization
#[derive(Debug, Clone, Default)]
pub struct NikCLIOptions {
    pub agent: Option<String>,
    pub model: Option<String>,
    pub auto: bool,
    pub plan: bool,
    pub structured_ui: bool,
}

/// Options for todo management
#[derive(Debug, Clone, Default)]
pub struct TodoOptions {
    pub list: Option<bool>,
    pub add: Option<String>,
    pub complete: Option<String>,
}

/// Options for plan generation
#[derive(Debug, Clone, Default)]
pub struct PlanOptions {
    pub execute: Option<bool>,
    pub save: Option<String>,
}

/// Options for agent execution
#[derive(Debug, Clone, Default)]
pub struct AgentOptions {
    pub auto: Option<bool>,
}

/// Options for auto execution
#[derive(Debug, Clone, Default)]
pub struct AutoOptions {
    pub plan_first: Option<bool>,
}

/// Options for configuration
#[derive(Debug, Clone, Default)]
pub struct ConfigOptions {
    pub show: bool,
    pub model: Option<String>,
    pub key: Option<String>,
}

/// Options for project initialization
#[derive(Debug, Clone, Default)]
pub struct InitOptions {
    pub force: bool,
}

/// Result of command execution
#[derive(Debug, Clone)]
pub struct CommandResult {
    pub should_exit: bool,
    pub should_update_prompt: bool,
}

impl Default for CommandResult {
    fn default() -> Self {
        Self {
            should_exit: false,
            should_update_prompt: false,
        }
    }
}
