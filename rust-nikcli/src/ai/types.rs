use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// AI Provider types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AiProvider {
    OpenAi,
    Anthropic,
    Google,
    Ollama,
    Vercel,
    Gateway,
    OpenRouter,
}

impl std::fmt::Display for AiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiProvider::OpenAi => write!(f, "openai"),
            AiProvider::Anthropic => write!(f, "anthropic"),
            AiProvider::Google => write!(f, "google"),
            AiProvider::Ollama => write!(f, "ollama"),
            AiProvider::Vercel => write!(f, "vercel"),
            AiProvider::Gateway => write!(f, "gateway"),
            AiProvider::OpenRouter => write!(f, "openrouter"),
        }
    }
}

/// Chat message role
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

impl std::fmt::Display for ChatRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatRole::System => write!(f, "system"),
            ChatRole::User => write!(f, "user"),
            ChatRole::Assistant => write!(f, "assistant"),
        }
    }
}

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    pub timestamp: Option<DateTime<Utc>>,
}

/// Model scope for routing
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ModelScope {
    ChatDefault,
    Planning,
    CodeGen,
    ToolLight,
    ToolHeavy,
    Vision,
}

impl std::fmt::Display for ModelScope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelScope::ChatDefault => write!(f, "chat_default"),
            ModelScope::Planning => write!(f, "planning"),
            ModelScope::CodeGen => write!(f, "code_gen"),
            ModelScope::ToolLight => write!(f, "tool_light"),
            ModelScope::ToolHeavy => write!(f, "tool_heavy"),
            ModelScope::Vision => write!(f, "vision"),
        }
    }
}

/// Generate options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateOptions {
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
    pub scope: Option<ModelScope>,
    pub needs_vision: Option<bool>,
    pub size_hints: Option<SizeHints>,
}

/// Size hints for model selection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizeHints {
    pub file_count: Option<u32>,
    pub total_bytes: Option<u64>,
}

/// Model response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelResponse {
    pub text: String,
    pub usage: Option<TokenUsage>,
    pub finish_reason: Option<FinishReason>,
    pub warnings: Option<Vec<String>>,
}

/// Token usage information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Finish reason
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FinishReason {
    Stop,
    Length,
    ContentFilter,
    ToolCalls,
}

impl std::fmt::Display for FinishReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FinishReason::Stop => write!(f, "stop"),
            FinishReason::Length => write!(f, "length"),
            FinishReason::ContentFilter => write!(f, "content-filter"),
            FinishReason::ToolCalls => write!(f, "tool-calls"),
        }
    }
}

/// Stream event types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StreamEventType {
    Start,
    Thinking,
    ToolCall,
    ToolResult,
    TextDelta,
    Complete,
    Error,
}

impl std::fmt::Display for StreamEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StreamEventType::Start => write!(f, "start"),
            StreamEventType::Thinking => write!(f, "thinking"),
            StreamEventType::ToolCall => write!(f, "tool_call"),
            StreamEventType::ToolResult => write!(f, "tool_result"),
            StreamEventType::TextDelta => write!(f, "text_delta"),
            StreamEventType::Complete => write!(f, "complete"),
            StreamEventType::Error => write!(f, "error"),
        }
    }
}

/// Stream event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEvent {
    pub event_type: StreamEventType,
    pub content: Option<String>,
    pub tool_name: Option<String>,
    pub tool_args: Option<serde_json::Value>,
    pub tool_result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Command types for AI execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CommandType {
    Npm,
    Bash,
    Git,
    Docker,
    Node,
    Build,
    Test,
    Lint,
}

impl std::fmt::Display for CommandType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandType::Npm => write!(f, "npm"),
            CommandType::Bash => write!(f, "bash"),
            CommandType::Git => write!(f, "git"),
            CommandType::Docker => write!(f, "docker"),
            CommandType::Node => write!(f, "node"),
            CommandType::Build => write!(f, "build"),
            CommandType::Test => write!(f, "test"),
            CommandType::Lint => write!(f, "lint"),
        }
    }
}

/// Safety levels for commands
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SafetyLevel {
    Safe,
    Moderate,
    Risky,
}

impl std::fmt::Display for SafetyLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SafetyLevel::Safe => write!(f, "safe"),
            SafetyLevel::Moderate => write!(f, "moderate"),
            SafetyLevel::Risky => write!(f, "risky"),
        }
    }
}

/// Command schema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    pub command_type: CommandType,
    pub command: String,
    pub args: Option<Vec<String>>,
    pub working_dir: Option<String>,
    pub description: String,
    pub safety: SafetyLevel,
    pub requires_approval: bool,
    pub estimated_duration: Option<u32>,
    pub dependencies: Option<Vec<String>>,
    pub expected_output_pattern: Option<String>,
}

/// Package search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageSearchResult {
    pub name: String,
    pub version: String,
    pub description: String,
    pub downloads: Option<u64>,
    pub verified: bool,
    pub last_updated: Option<String>,
    pub repository: Option<String>,
    pub confidence: f32,
}

/// Workspace state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub files_created: Option<Vec<String>>,
    pub files_modified: Option<Vec<String>>,
    pub packages_installed: Option<Vec<String>>,
}

/// Command execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub duration: u64,
    pub command: Command,
    pub timestamp: DateTime<Utc>,
    pub workspace_state: Option<WorkspaceState>,
}

/// AI tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTool {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub required: Vec<String>,
}

/// Tool call
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

/// Tool result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub content: String,
    pub is_error: bool,
}

/// Model configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub provider: AiProvider,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub timeout: Option<u64>,
}

/// Model routing configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRoutingConfig {
    pub enabled: bool,
    pub verbose: bool,
    pub mode: RoutingMode,
    pub fallback_model: Option<String>,
    pub scope_mappings: HashMap<ModelScope, String>,
}

/// Routing modes
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RoutingMode {
    Conservative,
    Balanced,
    Aggressive,
}

impl std::fmt::Display for RoutingMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RoutingMode::Conservative => write!(f, "conservative"),
            RoutingMode::Balanced => write!(f, "balanced"),
            RoutingMode::Aggressive => write!(f, "aggressive"),
        }
    }
}

/// AI call statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCallStats {
    pub total_calls: u64,
    pub successful_calls: u64,
    pub failed_calls: u64,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub average_response_time: f64,
    pub last_call: Option<DateTime<Utc>>,
}

/// AI provider interface
#[async_trait::async_trait]
pub trait AiProvider {
    /// Get provider name
    fn name(&self) -> &str;
    
    /// Check if provider is available
    async fn is_available(&self) -> bool;
    
    /// Generate text response
    async fn generate_text(&self, options: GenerateOptions) -> crate::error::NikCliResult<ModelResponse>;
    
    /// Stream text response
    async fn stream_text(&self, options: GenerateOptions) -> crate::error::NikCliResult<Box<dyn tokio_stream::Stream<Item = StreamEvent> + Send + Unpin>>;
    
    /// Generate structured response
    async fn generate_structured<T>(&self, options: GenerateOptions, schema: &T) -> crate::error::NikCliResult<T>
    where
        T: serde::de::DeserializeOwned + Send + Sync;
    
    /// Get model information
    fn get_model_info(&self) -> ModelConfig;
    
    /// Get usage statistics
    fn get_stats(&self) -> AiCallStats;
}