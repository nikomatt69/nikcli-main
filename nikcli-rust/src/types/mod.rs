/*!
 * Core Type Definitions
 * Complete type system matching the original TypeScript types
 */

// New modular type system - IDENTICAL to TypeScript
pub mod types;
pub mod services;
pub mod cache;

// Re-export commonly used types
pub use types::*;
pub use services::*;
pub use cache::*;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

// ============================================================================
// Agent Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Idle,
    Ready,
    Busy,
    Waiting,
    Error,
    Terminated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub specialization: String,
    pub description: String,
    pub capabilities: Vec<String>,
    pub status: AgentStatus,
    pub current_tasks: usize,
    pub max_concurrent_tasks: usize,
    pub created_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub specialization: String,
    pub capabilities: Vec<String>,
    pub max_concurrent_tasks: usize,
    pub timeout_ms: u64,
    pub retry_attempts: u32,
    pub autonomy_level: AutonomyLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AutonomyLevel {
    Manual,
    Supervised,
    SemiAutonomous,
    FullyAutonomous,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub tasks_completed: usize,
    pub tasks_failed: usize,
    pub success_rate: f64,
    pub average_execution_time: f64,
    pub total_tokens_used: usize,
}

// ============================================================================
// Task Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub description: String,
    pub agent_id: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub required_capabilities: Vec<String>,
    pub dependencies: Vec<String>,
    pub context: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskResult {
    pub task_id: String,
    pub agent_id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub tokens_used: usize,
    pub completed_at: DateTime<Utc>,
}

// ============================================================================
// Planning Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub id: String,
    pub title: String,
    pub description: String,
    pub steps: Vec<PlanStep>,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub estimated_duration_ms: Option<u64>,
    pub actual_duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub agent_id: Option<String>,
    pub dependencies: Vec<String>,
    pub estimated_duration_ms: Option<u64>,
    pub progress: u8,
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
    pub reasoning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub category: ToolCategory,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub output: String,
    pub error: Option<String>,
    pub execution_time_ms: u64,
}

// ============================================================================
// Context Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContext {
    pub working_directory: String,
    pub project_path: String,
    pub guidance: String,
    pub configuration: Configuration,
    pub execution_policy: ExecutionPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Configuration {
    pub autonomy_level: AutonomyLevel,
    pub max_concurrent_tasks: usize,
    pub default_timeout_ms: u64,
    pub retry_policy: RetryPolicy,
    pub enabled_tools: Vec<String>,
    pub guidance_files: Vec<String>,
    pub log_level: LogLevel,
    pub permissions: AgentPermissions,
    pub sandbox_restrictions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff_ms: u64,
    pub backoff_multiplier: f64,
    pub retryable_errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPermissions {
    pub can_read_files: bool,
    pub can_write_files: bool,
    pub can_delete_files: bool,
    pub allowed_paths: Vec<String>,
    pub forbidden_paths: Vec<String>,
    pub can_execute_commands: bool,
    pub allowed_commands: Vec<String>,
    pub forbidden_commands: Vec<String>,
    pub can_access_network: bool,
    pub allowed_domains: Vec<String>,
    pub can_install_packages: bool,
    pub can_modify_config: bool,
    pub can_access_secrets: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPolicy {
    pub approval: ApprovalMode,
    pub sandbox: SandboxMode,
    pub timeout_ms: u64,
    pub max_retries: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalMode {
    Never,
    Untrusted,
    OnFailure,
    Always,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxMode {
    ReadOnly,
    WorkspaceWrite,
    SystemWrite,
    DangerFullAccess,
}

// ============================================================================
// Event Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum AgentEventType {
    AgentInitialized,
    AgentReady,
    AgentBusy,
    AgentIdle,
    AgentError,
    AgentTerminated,
    TaskQueued,
    TaskStarted,
    TaskProgress,
    TaskCompleted,
    TaskFailed,
    TaskCancelled,
    ToolCalled,
    ToolCompleted,
    ToolFailed,
    PlanGenerated,
    PlanExecuting,
    PlanCompleted,
    PlanFailed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub id: String,
    pub event_type: AgentEventType,
    pub agent_id: String,
    pub timestamp: DateTime<Utc>,
    pub data: HashMap<String, serde_json::Value>,
    pub session_id: Option<String>,
}

// ============================================================================
// Model and AI Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub provider: ModelProvider,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub enable_reasoning: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelProvider {
    OpenAI,
    Anthropic,
    Google,
    Ollama,
    OpenRouter,
    Vercel,
    Gateway,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
    pub timestamp: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

// ============================================================================
// Tool Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolMetadata {
    pub name: String,
    pub description: String,
    pub category: ToolCategory,
    pub risk_level: RiskLevel,
    pub reversible: bool,
    pub estimated_duration_ms: u64,
    pub required_permissions: Vec<String>,
    pub supported_file_types: Vec<String>,
    pub version: String,
    pub author: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolCategory {
    File,
    Command,
    Analysis,
    Git,
    Package,
    System,
    Browser,
    AI,
    General,
    Search,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub metadata: ToolExecutionMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionMetadata {
    pub execution_time_ms: u64,
    pub tool_name: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

// ============================================================================
// Utility Functions
// ============================================================================

impl Agent {
    pub fn new(name: String, specialization: String, capabilities: Vec<String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            specialization,
            description: String::new(),
            capabilities,
            status: AgentStatus::Idle,
            current_tasks: 0,
            max_concurrent_tasks: 3,
            created_at: Utc::now(),
            last_activity: Utc::now(),
        }
    }
}

impl AgentTask {
    pub fn new(description: String, priority: TaskPriority) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            description,
            agent_id: None,
            status: TaskStatus::Pending,
            priority,
            required_capabilities: Vec::new(),
            dependencies: Vec::new(),
            context: HashMap::new(),
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            timeout_ms: None,
        }
    }
}

impl ExecutionPlan {
    pub fn new(title: String, description: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            description,
            steps: Vec::new(),
            status: TaskStatus::Pending,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            estimated_duration_ms: None,
            actual_duration_ms: None,
        }
    }
}
