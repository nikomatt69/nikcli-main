//! Core Types for Enterprise AI Agent System
//! Unified interfaces for production-ready agent architecture

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

// Type aliases matching TypeScript
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Initializing,
    Ready,
    Busy,
    Error,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Critical,
}

/// Enterprise Agent Interface - Unifies all agent capabilities
#[async_trait::async_trait]
pub trait Agent: Send + Sync {
    // Identity and metadata
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn specialization(&self) -> &str;
    fn capabilities(&self) -> &[String];
    fn version(&self) -> &str;

    // Status and state
    fn status(&self) -> AgentStatus;
    fn current_tasks(&self) -> usize;
    fn max_concurrent_tasks(&self) -> usize;

    // Core lifecycle methods
    async fn initialize(&mut self, context: Option<AgentContext>) -> anyhow::Result<()>;
    async fn run(&mut self, task: AgentTask) -> anyhow::Result<AgentTaskResult>;
    async fn cleanup(&mut self) -> anyhow::Result<()>;

    // Task execution
    async fn execute_todo(&mut self, todo: AgentTodo) -> anyhow::Result<()>;
    async fn execute_task(&mut self, task: AgentTask) -> anyhow::Result<AgentTaskResult>;

    // State management
    fn get_status(&self) -> AgentStatus;
    fn get_metrics(&self) -> AgentMetrics;
    fn get_capabilities(&self) -> Vec<String>;
    fn can_handle(&self, task: &AgentTask) -> bool;

    // Configuration and guidance
    fn update_guidance(&mut self, guidance: String);
    fn update_configuration(&mut self, config: AgentConfig);
}

/// Agent Task - Represents work to be done by an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTask {
    pub id: String,
    #[serde(rename = "type")]
    pub task_type: TaskType,
    pub title: String,
    pub description: String,
    pub priority: TaskPriority,
    pub status: TaskStatus,

    // Task data and context
    pub data: HashMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<AgentContext>,

    // Timing and lifecycle
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,

    // Dependencies and requirements
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_capabilities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_duration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,

    // Progress tracking
    pub progress: u8, // 0-100
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steps: Option<Vec<TaskStep>>,

    // Error handling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    UserRequest,
    Internal,
    Scheduled,
    Recovery,
    #[serde(rename = "vm-todo")]
    VmTodo,
}

/// Agent Todo - Specific actionable item for agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTodo {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,

    // Timing
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_duration: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_duration: Option<u64>,

    // Context and metadata
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<TodoContext>,

    // Hierarchy and dependencies
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtasks: Option<Vec<AgentTodo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dependencies: Option<Vec<String>>,
    pub progress: u8, // 0-100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guidance: Option<String>,
}

/// Task execution step
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStep {
    pub id: String,
    pub title: String,
    pub status: TaskStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Agent execution context
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContext {
    // Environment
    pub working_directory: String,
    pub project_path: String,

    // Guidance and configuration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guidance: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub configuration: Option<AgentConfig>,

    // User preferences and session
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_preferences: Option<HashMap<String, serde_json::Value>>,

    // Project information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_analysis: Option<ProjectAnalysis>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub available_tools: Option<Vec<String>>,

    // Execution environment
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_policy: Option<ExecutionPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_mode: Option<SandboxMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_required: Option<bool>,
}

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    // Behavior settings
    pub autonomy_level: AutonomyLevel,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,

    // Execution settings
    pub max_concurrent_tasks: usize,
    pub default_timeout: u64,
    pub retry_policy: RetryPolicy,

    // Integration settings
    pub enabled_tools: Vec<String>,
    pub guidance_files: Vec<String>,
    pub log_level: LogLevel,

    // Security and permissions
    pub permissions: AgentPermissions,
    pub sandbox_restrictions: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AutonomyLevel {
    Supervised,
    SemiAutonomous,
    FullyAutonomous,
}

/// Agent task execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTaskResult {
    pub task_id: String,
    pub agent_id: String,
    pub status: TaskStatus,

    // Results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifacts: Option<Vec<TaskArtifact>>,

    // Execution details
    pub start_time: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u64>,

    // Error information
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_details: Option<serde_json::Value>,

    // Metadata
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_used: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools_used: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub files_modified: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commands_executed: Option<Vec<String>>,
}

/// Agent performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMetrics {
    // Task statistics
    pub tasks_executed: u64,
    pub tasks_succeeded: u64,
    pub tasks_failed: u64,
    pub tasks_in_progress: u64,

    // Performance metrics
    pub average_execution_time: f64,
    pub total_execution_time: u64,
    pub success_rate: f64,

    // Resource usage
    pub tokens_consumed: u64,
    pub api_calls_total: u64,

    // Activity tracking
    pub last_active: DateTime<Utc>,
    pub uptime: u64,

    // Efficiency metrics
    pub productivity: f64, // tasks completed per hour
    pub accuracy: f64,      // percentage of successful tasks
}

/// Task artifact (files, outputs, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskArtifact {
    pub id: String,
    #[serde(rename = "type")]
    pub artifact_type: ArtifactType,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArtifactType {
    File,
    Output,
    Log,
    Screenshot,
    Data,
}

/// Project analysis information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAnalysis {
    // Basic project info
    pub project_type: String,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,

    // Structure
    pub file_count: u64,
    pub directory_count: u64,
    pub total_size: u64,

    // Dependencies and tools
    pub dependencies: HashMap<String, String>,
    pub dev_dependencies: HashMap<String, String>,
    pub scripts: HashMap<String, String>,

    // Analysis results
    pub complexity: ComplexityLevel,
    pub maintainability: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_coverage: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ComplexityLevel {
    Low,
    Medium,
    High,
}

/// Execution policy settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionPolicy {
    pub approval: ApprovalMode,
    pub sandbox: SandboxMode,
    pub timeout_ms: u64,
    pub max_retries: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalMode {
    Never,
    Untrusted,
    OnFailure,
    Always,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxMode {
    ReadOnly,
    WorkspaceWrite,
    SystemWrite,
    DangerFullAccess,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

/// Retry policy configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff_ms: u64,
    pub backoff_multiplier: f64,
    pub retryable_errors: Vec<String>,
}

/// Agent permissions system
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPermissions {
    // File system permissions
    pub can_read_files: bool,
    pub can_write_files: bool,
    pub can_delete_files: bool,
    pub allowed_paths: Vec<String>,
    pub forbidden_paths: Vec<String>,

    // Command execution
    pub can_execute_commands: bool,
    pub allowed_commands: Vec<String>,
    pub forbidden_commands: Vec<String>,

    // Network and API access
    pub can_access_network: bool,
    pub allowed_domains: Vec<String>,

    // System operations
    pub can_install_packages: bool,
    pub can_modify_config: bool,
    pub can_access_secrets: bool,
}

/// Agent work plan for complex tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWorkPlan {
    pub id: String,
    pub agent_id: String,
    pub goal: String,
    pub todos: Vec<AgentTodo>,

    // Planning information
    pub estimated_time_total: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_time_total: Option<u64>,
    pub complexity: ComplexityLevel,
    pub risk_level: RiskLevel,

    // Status tracking
    pub status: TaskStatus,
    pub progress: u8,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,

    // Dependencies and resources
    pub required_resources: Vec<String>,
    pub dependencies: Vec<String>,

    // Results
    #[serde(skip_serializing_if = "Option::is_none")]
    pub results: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifacts: Option<Vec<TaskArtifact>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// Agent event for real-time monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent<T = serde_json::Value> {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: AgentEventType,
    pub agent_id: String,
    pub timestamp: DateTime<Utc>,
    pub data: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentEventType {
    #[serde(rename = "agent.initialized")]
    AgentInitialized,
    #[serde(rename = "agent.status.changed")]
    AgentStatusChanged,
    #[serde(rename = "task.started")]
    TaskStarted,
    #[serde(rename = "task.progress")]
    TaskProgress,
    #[serde(rename = "task.completed")]
    TaskCompleted,
    #[serde(rename = "task.failed")]
    TaskFailed,
    #[serde(rename = "error.occurred")]
    ErrorOccurred,
    #[serde(rename = "guidance.updated")]
    GuidanceUpdated,
    #[serde(rename = "config.changed")]
    ConfigChanged,
}

/// Agent registry entry
pub struct AgentRegistryEntry {
    pub agent_factory: Box<dyn Fn() -> Box<dyn Agent> + Send + Sync>,
    pub metadata: AgentMetadata,
    pub is_enabled: bool,
}

/// Agent metadata for registry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub specialization: String,
    pub capabilities: Vec<String>,
    pub version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub requires_guidance: bool,
    pub default_config: HashMap<String, serde_json::Value>,
}

