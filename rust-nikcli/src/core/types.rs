use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub specialization: String,
    pub capabilities: Vec<String>,
    pub max_concurrent_tasks: u32,
    pub timeout_seconds: u64,
    pub retry_attempts: u32,
    pub priority: AgentPriority,
    pub dependencies: Vec<String>,
    pub environment_variables: HashMap<String, String>,
    pub custom_settings: HashMap<String, serde_json::Value>,
}

/// Agent priority levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum AgentPriority {
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4,
}

impl std::fmt::Display for AgentPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentPriority::Low => write!(f, "low"),
            AgentPriority::Normal => write!(f, "normal"),
            AgentPriority::High => write!(f, "high"),
            AgentPriority::Critical => write!(f, "critical"),
        }
    }
}

/// Agent context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContext {
    pub agent_id: String,
    pub workspace_path: String,
    pub current_task: Option<String>,
    pub available_tools: Vec<String>,
    pub memory_limit: u64,
    pub execution_timeout: u64,
    pub environment: HashMap<String, String>,
    pub shared_state: HashMap<String, serde_json::Value>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Agent metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub category: String,
    pub tags: Vec<String>,
    pub capabilities: Vec<String>,
    pub dependencies: Vec<String>,
    pub configuration_schema: Option<serde_json::Value>,
    pub examples: Vec<String>,
    pub documentation_url: Option<String>,
}

/// Agent registry entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistryEntry {
    pub metadata: AgentMetadata,
    pub is_enabled: bool,
    pub last_used: Option<DateTime<Utc>>,
    pub usage_count: u64,
    pub success_rate: f64,
    pub average_execution_time: f64,
}

/// Agent task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub agent_id: String,
    pub task_type: TaskType,
    pub description: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub priority: AgentPriority,
    pub created_at: DateTime<Utc>,
    pub scheduled_for: Option<DateTime<Utc>>,
    pub timeout_seconds: Option<u64>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub dependencies: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Task types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskType {
    CodeGeneration,
    CodeAnalysis,
    CodeReview,
    Testing,
    Documentation,
    Deployment,
    Monitoring,
    Debugging,
    Optimization,
    Migration,
    Custom(String),
}

impl std::fmt::Display for TaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskType::CodeGeneration => write!(f, "code_generation"),
            TaskType::CodeAnalysis => write!(f, "code_analysis"),
            TaskType::CodeReview => write!(f, "code_review"),
            TaskType::Testing => write!(f, "testing"),
            TaskType::Documentation => write!(f, "documentation"),
            TaskType::Deployment => write!(f, "deployment"),
            TaskType::Monitoring => write!(f, "monitoring"),
            TaskType::Debugging => write!(f, "debugging"),
            TaskType::Optimization => write!(f, "optimization"),
            TaskType::Migration => write!(f, "migration"),
            TaskType::Custom(name) => write!(f, "custom:{}", name),
        }
    }
}

/// Task status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
    Timeout,
    Retrying,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::Running => write!(f, "running"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Failed => write!(f, "failed"),
            TaskStatus::Cancelled => write!(f, "cancelled"),
            TaskStatus::Timeout => write!(f, "timeout"),
            TaskStatus::Retrying => write!(f, "retrying"),
        }
    }
}

/// Agent task result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskResult {
    pub task_id: String,
    pub agent_id: String,
    pub status: TaskStatus,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub retry_count: u32,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Agent todo item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTodo {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub description: String,
    pub priority: AgentPriority,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub due_date: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Agent event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent {
    pub id: String,
    pub event_type: AgentEventType,
    pub agent_id: Option<String>,
    pub task_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub data: HashMap<String, serde_json::Value>,
}

/// Agent event types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentEventType {
    AgentRegistered,
    AgentUnregistered,
    AgentStarted,
    AgentStopped,
    TaskCreated,
    TaskStarted,
    TaskCompleted,
    TaskFailed,
    TaskCancelled,
    TaskRetrying,
    AgentError,
    AgentWarning,
    AgentInfo,
}

impl std::fmt::Display for AgentEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentEventType::AgentRegistered => write!(f, "agent_registered"),
            AgentEventType::AgentUnregistered => write!(f, "agent_unregistered"),
            AgentEventType::AgentStarted => write!(f, "agent_started"),
            AgentEventType::AgentStopped => write!(f, "agent_stopped"),
            AgentEventType::TaskCreated => write!(f, "task_created"),
            AgentEventType::TaskStarted => write!(f, "task_started"),
            AgentEventType::TaskCompleted => write!(f, "task_completed"),
            AgentEventType::TaskFailed => write!(f, "task_failed"),
            AgentEventType::TaskCancelled => write!(f, "task_cancelled"),
            AgentEventType::TaskRetrying => write!(f, "task_retrying"),
            AgentEventType::AgentError => write!(f, "agent_error"),
            AgentEventType::AgentWarning => write!(f, "agent_warning"),
            AgentEventType::AgentInfo => write!(f, "agent_info"),
        }
    }
}

/// Agent metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub agent_id: String,
    pub total_tasks: u64,
    pub completed_tasks: u64,
    pub failed_tasks: u64,
    pub cancelled_tasks: u64,
    pub average_execution_time_ms: f64,
    pub success_rate: f64,
    pub uptime_seconds: u64,
    pub last_activity: Option<DateTime<Utc>>,
    pub memory_usage_bytes: u64,
    pub cpu_usage_percent: f64,
    pub custom_metrics: HashMap<String, f64>,
}

/// Tool configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfig {
    pub name: String,
    pub description: String,
    pub version: String,
    pub parameters: serde_json::Value,
    pub required_parameters: Vec<String>,
    pub optional_parameters: Vec<String>,
    pub return_type: String,
    pub timeout_seconds: u64,
    pub retry_attempts: u32,
    pub dependencies: Vec<String>,
    pub environment_variables: HashMap<String, String>,
    pub custom_settings: HashMap<String, serde_json::Value>,
}

/// Tool execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionResult {
    pub tool_name: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Performance optimization configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceOptimizationConfig {
    pub enable_caching: bool,
    pub cache_ttl_seconds: u64,
    pub max_cache_size: usize,
    pub enable_compression: bool,
    pub compression_level: u32,
    pub enable_batching: bool,
    pub batch_size: usize,
    pub batch_timeout_ms: u64,
    pub enable_parallel_processing: bool,
    pub max_parallel_tasks: u32,
    pub enable_memory_optimization: bool,
    pub memory_limit_bytes: u64,
}

/// Token optimization configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenOptimizationConfig {
    pub max_tokens: u32,
    pub token_budget: u32,
    pub compression_ratio: f32,
    pub enable_smart_truncation: bool,
    pub preserve_important_content: bool,
    pub enable_context_compression: bool,
    pub context_window_size: u32,
    pub overlap_size: u32,
}

/// Validation context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationContext {
    pub validation_id: String,
    pub validation_type: ValidationType,
    pub target: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub rules: Vec<ValidationRule>,
    pub created_at: DateTime<Utc>,
    pub timeout_seconds: u64,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Validation types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ValidationType {
    Schema,
    Format,
    Content,
    Security,
    Performance,
    Custom(String),
}

impl std::fmt::Display for ValidationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationType::Schema => write!(f, "schema"),
            ValidationType::Format => write!(f, "format"),
            ValidationType::Content => write!(f, "content"),
            ValidationType::Security => write!(f, "security"),
            ValidationType::Performance => write!(f, "performance"),
            ValidationType::Custom(name) => write!(f, "custom:{}", name),
        }
    }
}

/// Validation rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub name: String,
    pub description: String,
    pub rule_type: ValidationRuleType,
    pub parameters: HashMap<String, serde_json::Value>,
    pub severity: ValidationSeverity,
    pub enabled: bool,
}

/// Validation rule types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ValidationRuleType {
    Required,
    MinLength,
    MaxLength,
    Pattern,
    Range,
    Custom(String),
}

impl std::fmt::Display for ValidationRuleType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationRuleType::Required => write!(f, "required"),
            ValidationRuleType::MinLength => write!(f, "min_length"),
            ValidationRuleType::MaxLength => write!(f, "max_length"),
            ValidationRuleType::Pattern => write!(f, "pattern"),
            ValidationRuleType::Range => write!(f, "range"),
            ValidationRuleType::Custom(name) => write!(f, "custom:{}", name),
        }
    }
}

/// Validation severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum ValidationSeverity {
    Info = 1,
    Warning = 2,
    Error = 3,
    Critical = 4,
}

impl std::fmt::Display for ValidationSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationSeverity::Info => write!(f, "info"),
            ValidationSeverity::Warning => write!(f, "warning"),
            ValidationSeverity::Error => write!(f, "error"),
            ValidationSeverity::Critical => write!(f, "critical"),
        }
    }
}

/// Validation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub validation_id: String,
    pub success: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationWarning>,
    pub execution_time_ms: u64,
    pub validated_at: DateTime<Utc>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Validation error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub rule_name: String,
    pub message: String,
    pub severity: ValidationSeverity,
    pub field: Option<String>,
    pub value: Option<serde_json::Value>,
    pub suggestion: Option<String>,
}

/// Validation warning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationWarning {
    pub rule_name: String,
    pub message: String,
    pub field: Option<String>,
    pub value: Option<serde_json::Value>,
    pub suggestion: Option<String>,
}

/// Documentation entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentationEntry {
    pub id: String,
    pub title: String,
    pub content: String,
    pub category: String,
    pub tags: Vec<String>,
    pub language: String,
    pub version: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub author: String,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Prompt template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub template: String,
    pub variables: Vec<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub version: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub usage_count: u64,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Web search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub relevance_score: f64,
    pub source: String,
    pub published_date: Option<DateTime<Utc>>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Cache entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub access_count: u64,
    pub last_accessed: DateTime<Utc>,
    pub size_bytes: u64,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Cache statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatistics {
    pub total_entries: usize,
    pub total_size_bytes: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub hit_rate: f64,
    pub average_access_time_ms: f64,
    pub oldest_entry: Option<DateTime<Utc>>,
    pub newest_entry: Option<DateTime<Utc>>,
}