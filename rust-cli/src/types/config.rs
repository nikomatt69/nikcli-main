use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Model provider enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelProvider {
    Anthropic,
    Openai,
    Google,
    Ollama,
    Gateway,
    V0,
}

impl std::fmt::Display for ModelProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelProvider::Anthropic => write!(f, "anthropic"),
            ModelProvider::Openai => write!(f, "openai"),
            ModelProvider::Google => write!(f, "google"),
            ModelProvider::Ollama => write!(f, "ollama"),
            ModelProvider::Gateway => write!(f, "gateway"),
            ModelProvider::V0 => write!(f, "v0"),
        }
    }
}

/// Model configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub name: String,
    pub provider: ModelProvider,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub enabled: bool,
}

impl ModelConfig {
    pub fn new(name: String, provider: ModelProvider, model: String) -> Self {
        Self {
            name,
            provider,
            model,
            api_key: None,
            base_url: None,
            max_tokens: None,
            temperature: None,
            top_p: None,
            enabled: true,
        }
    }
}

/// Pricing unit enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PricingUnit {
    Token,
    OneKTokens,
    OneMTokens,
}

impl std::fmt::Display for PricingUnit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PricingUnit::Token => write!(f, "token"),
            PricingUnit::OneKTokens => write!(f, "1K_tokens"),
            PricingUnit::OneMTokens => write!(f, "1M_tokens"),
        }
    }
}

/// Model pricing information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub input: f64, // Cost per token for input
    pub output: f64, // Cost per token for output
    pub currency: String, // Always "USD"
    pub unit: PricingUnit,
}

impl ModelPricing {
    pub fn new(input: f64, output: f64, unit: PricingUnit) -> Self {
        Self {
            input,
            output,
            currency: "USD".to_string(),
            unit,
        }
    }
}

/// API provider configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIProviderConfig {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub timeout: Option<u64>,
    pub retries: Option<u32>,
    pub rate_limit_per_minute: Option<u32>,
}

impl APIProviderConfig {
    pub fn new() -> Self {
        Self {
            api_key: None,
            base_url: None,
            timeout: None,
            retries: None,
            rate_limit_per_minute: None,
        }
    }
}

/// Ollama configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaConfig {
    pub host: String,
    pub port: u16,
    pub timeout: Option<u64>,
    pub available_models: Vec<String>,
    pub default_model: Option<String>,
}

impl OllamaConfig {
    pub fn new(host: String, port: u16) -> Self {
        Self {
            host,
            port,
            timeout: None,
            available_models: Vec::new(),
            default_model: None,
        }
    }
}

/// API configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIConfig {
    pub anthropic: Option<APIProviderConfig>,
    pub openai: Option<APIProviderConfig>,
    pub google: Option<APIProviderConfig>,
    pub gateway: Option<APIProviderConfig>,
    pub v0: Option<APIProviderConfig>,
    pub ollama: Option<OllamaConfig>,
}

impl APIConfig {
    pub fn new() -> Self {
        Self {
            anthropic: None,
            openai: None,
            google: None,
            gateway: None,
            v0: None,
            ollama: None,
        }
    }
}

/// Output format enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OutputFormat {
    Json,
    Markdown,
    Plain,
}

impl std::fmt::Display for OutputFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputFormat::Json => write!(f, "json"),
            OutputFormat::Markdown => write!(f, "markdown"),
            OutputFormat::Plain => write!(f, "plain"),
        }
    }
}

/// Theme enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Theme {
    Dark,
    Light,
    Auto,
}

impl std::fmt::Display for Theme {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Theme::Dark => write!(f, "dark"),
            Theme::Light => write!(f, "light"),
            Theme::Auto => write!(f, "auto"),
        }
    }
}

/// Notification settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationSettings {
    pub enabled: bool,
    pub show_progress: bool,
    pub show_errors: bool,
    pub show_completions: bool,
    pub sound_enabled: bool,
}

impl NotificationSettings {
    pub fn new() -> Self {
        Self {
            enabled: true,
            show_progress: true,
            show_errors: true,
            show_completions: true,
            sound_enabled: false,
        }
    }
}

/// User preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    pub auto_save: bool,
    pub show_token_usage: bool,
    pub confirm_destructive_actions: bool,
    pub preferred_output_format: OutputFormat,
    pub theme: Theme,
    pub notifications: NotificationSettings,
}

impl UserPreferences {
    pub fn new() -> Self {
        Self {
            auto_save: true,
            show_token_usage: true,
            confirm_destructive_actions: true,
            preferred_output_format: OutputFormat::Markdown,
            theme: Theme::Auto,
            notifications: NotificationSettings::new(),
        }
    }
}

/// Session configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub id: String,
    pub title: String,
    pub working_directory: String,
    pub current_model: String,
    pub temperature: f32,
    pub max_context_tokens: u32,
    pub enable_token_optimization: bool,
    pub enable_cognitive_functions: bool,
    pub system_prompt: Option<String>,
    pub user_preferences: UserPreferences,
}

impl SessionConfig {
    pub fn new(id: String, title: String, working_directory: String, current_model: String) -> Self {
        Self {
            id,
            title,
            working_directory,
            current_model,
            temperature: 0.7,
            max_context_tokens: 100000,
            enable_token_optimization: true,
            enable_cognitive_functions: true,
            system_prompt: None,
            user_preferences: UserPreferences::new(),
        }
    }
}

/// Configuration validation error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValidationError {
    pub field: String,
    pub message: String,
    pub value: Option<serde_json::Value>,
}

/// Configuration validation warning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValidationWarning {
    pub field: String,
    pub message: String,
    pub suggestion: Option<String>,
}

/// Configuration validation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValidationResult {
    pub valid: bool,
    pub errors: Vec<ConfigValidationError>,
    pub warnings: Vec<ConfigValidationWarning>,
}

impl ConfigValidationResult {
    pub fn new() -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    pub fn add_error(&mut self, field: String, message: String, value: Option<serde_json::Value>) {
        self.valid = false;
        self.errors.push(ConfigValidationError {
            field,
            message,
            value,
        });
    }

    pub fn add_warning(&mut self, field: String, message: String, suggestion: Option<String>) {
        self.warnings.push(ConfigValidationWarning {
            field,
            message,
            suggestion,
        });
    }
}

/// Approval level enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApprovalLevel {
    Never,
    Untrusted,
    OnFailure,
    Always,
}

impl std::fmt::Display for ApprovalLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApprovalLevel::Never => write!(f, "never"),
            ApprovalLevel::Untrusted => write!(f, "untrusted"),
            ApprovalLevel::OnFailure => write!(f, "on-failure"),
            ApprovalLevel::Always => write!(f, "always"),
        }
    }
}

/// Sandbox mode enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SandboxMode {
    ReadOnly,
    WorkspaceWrite,
    SystemWrite,
    DangerFullAccess,
}

impl std::fmt::Display for SandboxMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SandboxMode::ReadOnly => write!(f, "read-only"),
            SandboxMode::WorkspaceWrite => write!(f, "workspace-write"),
            SandboxMode::SystemWrite => write!(f, "system-write"),
            SandboxMode::DangerFullAccess => write!(f, "danger-full-access"),
        }
    }
}

/// Execution options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionOptions {
    pub timeout: Option<u64>,
    pub retries: Option<u32>,
    pub approval: Option<ApprovalLevel>,
    pub sandbox: Option<SandboxMode>,
    pub enable_logging: Option<bool>,
    pub enable_metrics: Option<bool>,
    pub context: Option<HashMap<String, serde_json::Value>>,
}

impl ExecutionOptions {
    pub fn new() -> Self {
        Self {
            timeout: None,
            retries: None,
            approval: None,
            sandbox: None,
            enable_logging: None,
            enable_metrics: None,
            context: None,
        }
    }
}

/// Configuration manager trait
pub trait ConfigManager<T: Clone + serde::Serialize + serde::de::DeserializeOwned> {
    fn get<K: AsRef<str>>(&self, key: K) -> Option<T>;
    fn set<K: AsRef<str>>(&mut self, key: K, value: T) -> Result<(), Box<dyn std::error::Error>>;
    fn has<K: AsRef<str>>(&self, key: K) -> bool;
    fn delete<K: AsRef<str>>(&mut self, key: K) -> bool;
    fn clear(&mut self);
    fn get_all(&self) -> HashMap<String, T>;
    fn save(&self) -> Result<(), Box<dyn std::error::Error>>;
    fn load(&mut self) -> Result<(), Box<dyn std::error::Error>>;
}