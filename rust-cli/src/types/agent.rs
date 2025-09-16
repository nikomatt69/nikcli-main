use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Agent status for enterprise system
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EnterpriseAgentStatus {
    Initializing,
    Ready,
    Busy,
    Error,
    Offline,
}

impl std::fmt::Display for EnterpriseAgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EnterpriseAgentStatus::Initializing => write!(f, "initializing"),
            EnterpriseAgentStatus::Ready => write!(f, "ready"),
            EnterpriseAgentStatus::Busy => write!(f, "busy"),
            EnterpriseAgentStatus::Error => write!(f, "error"),
            EnterpriseAgentStatus::Offline => write!(f, "offline"),
        }
    }
}

/// Task status for enterprise system
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EnterpriseTaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for EnterpriseTaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EnterpriseTaskStatus::Pending => write!(f, "pending"),
            EnterpriseTaskStatus::InProgress => write!(f, "in_progress"),
            EnterpriseTaskStatus::Completed => write!(f, "completed"),
            EnterpriseTaskStatus::Failed => write!(f, "failed"),
            EnterpriseTaskStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Task priority for enterprise system
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EnterpriseTaskPriority {
    Low,
    Medium,
    High,
    Critical,
}

impl std::fmt::Display for EnterpriseTaskPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EnterpriseTaskPriority::Low => write!(f, "low"),
            EnterpriseTaskPriority::Medium => write!(f, "medium"),
            EnterpriseTaskPriority::High => write!(f, "high"),
            EnterpriseTaskPriority::Critical => write!(f, "critical"),
        }
    }
}

/// Enterprise Agent Interface - Unifies all agent capabilities
pub trait EnterpriseAgent {
    // Identity and metadata
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn specialization(&self) -> &str;
    fn capabilities(&self) -> &[String];
    fn version(&self) -> &str;

    // Status and state
    fn status(&self) -> EnterpriseAgentStatus;
    fn current_tasks(&self) -> usize;
    fn max_concurrent_tasks(&self) -> usize;

    // Core lifecycle methods
    async fn initialize(&mut self, context: Option<AgentContext>) -> Result<(), Box<dyn std::error::Error>>;
    async fn run(&mut self, task: AgentTask) -> Result<AgentTaskResult, Box<dyn std::error::Error>>;
    async fn cleanup(&mut self) -> Result<(), Box<dyn std::error::Error>>;

    // Task execution
    async fn execute_todo(&mut self, todo: AgentTodo) -> Result<(), Box<dyn std::error::Error>>;
    async fn execute_task(&mut self, task: AgentTask) -> Result<AgentTaskResult, Box<dyn std::error::Error>>;

    // State management
    fn get_status(&self) -> EnterpriseAgentStatus;
    fn get_metrics(&self) -> AgentMetrics;
    fn get_capabilities(&self) -> &[String];
    fn can_handle(&self, task: &AgentTask) -> bool;

    // Configuration and guidance
    fn update_guidance(&mut self, guidance: String);
    fn update_configuration(&mut self, config: AgentConfig);
}

/// Agent Task - Represents work to be done by an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub task_type: TaskType,
    pub title: String,
    pub description: String,
    pub priority: EnterpriseTaskPriority,
    pub status: EnterpriseTaskStatus,

    // Task data and context
    pub data: HashMap<String, serde_json::Value>,
    pub context: Option<AgentContext>,

    // Timing and lifecycle
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,

    // Dependencies and requirements
    pub dependencies: Option<Vec<String>>,
    pub required_capabilities: Option<Vec<String>>,
    pub estimated_duration: Option<u64>, // in seconds
    pub timeout: Option<u64>, // in seconds

    // Progress tracking
    pub progress: u8, // 0-100
    pub steps: Option<Vec<TaskStep>>,

    // Error handling
    pub retry_count: Option<u32>,
    pub max_retries: Option<u32>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskType {
    UserRequest,
    Internal,
    Scheduled,
    Recovery,
    VmTodo,
}

impl std::fmt::Display for TaskType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskType::UserRequest => write!(f, "user_request"),
            TaskType::Internal => write!(f, "internal"),
            TaskType::Scheduled => write!(f, "scheduled"),
            TaskType::Recovery => write!(f, "recovery"),
            TaskType::VmTodo => write!(f, "vm-todo"),
        }
    }
}

impl AgentTask {
    pub fn new(title: String, description: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            task_type: TaskType::UserRequest,
            title,
            description,
            priority: EnterpriseTaskPriority::Medium,
            status: EnterpriseTaskStatus::Pending,
            data: HashMap::new(),
            context: None,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
            dependencies: None,
            required_capabilities: None,
            estimated_duration: None,
            timeout: None,
            progress: 0,
            steps: None,
            retry_count: None,
            max_retries: None,
            last_error: None,
        }
    }
}

/// Agent Todo - Specific actionable item for agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTodo {
    pub id: String,
    pub agent_id: String,
    pub title: String,
    pub description: String,
    pub status: EnterpriseTaskStatus,
    pub priority: EnterpriseTaskPriority,

    // Timing
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub estimated_duration: Option<u64>,
    pub actual_duration: Option<u64>,

    // Context and metadata
    pub tags: Vec<String>,
    pub context: Option<TodoContext>,

    // Hierarchy and dependencies
    pub subtasks: Option<Vec<AgentTodo>>,
    pub dependencies: Option<Vec<String>>,
    pub progress: u8, // 0-100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoContext {
    pub files: Option<Vec<String>>,
    pub commands: Option<Vec<String>>,
    pub reasoning: Option<String>,
    pub guidance: Option<String>,
}

impl AgentTodo {
    pub fn new(agent_id: String, title: String, description: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            agent_id,
            title,
            description,
            status: EnterpriseTaskStatus::Pending,
            priority: EnterpriseTaskPriority::Medium,
            created_at: now,
            updated_at: now,
            estimated_duration: None,
            actual_duration: None,
            tags: Vec::new(),
            context: None,
            subtasks: None,
            dependencies: None,
            progress: 0,
        }
    }
}

/// Task execution step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStep {
    pub id: String,
    pub title: String,
    pub status: EnterpriseTaskStatus,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// Agent execution context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContext {
    // Environment
    pub working_directory: String,
    pub project_path: String,

    // Guidance and configuration
    pub guidance: Option<String>,
    pub configuration: Option<AgentConfig>,

    // User preferences and session
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub user_preferences: Option<HashMap<String, serde_json::Value>>,

    // Project information
    pub project_analysis: Option<ProjectAnalysis>,
    pub available_tools: Option<Vec<String>>,

    // Execution environment
    pub execution_policy: Option<ExecutionPolicy>,
    pub sandbox_mode: Option<SandboxMode>,
    pub approval_required: Option<bool>,
}

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    // Behavior settings
    pub autonomy_level: AutonomyLevel,
    pub temperature: Option<f32>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutonomyLevel {
    Supervised,
    SemiAutonomous,
    FullyAutonomous,
}

impl std::fmt::Display for AutonomyLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AutonomyLevel::Supervised => write!(f, "supervised"),
            AutonomyLevel::SemiAutonomous => write!(f, "semi-autonomous"),
            AutonomyLevel::FullyAutonomous => write!(f, "fully-autonomous"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

impl std::fmt::Display for LogLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogLevel::Error => write!(f, "error"),
            LogLevel::Warn => write!(f, "warn"),
            LogLevel::Info => write!(f, "info"),
            LogLevel::Debug => write!(f, "debug"),
            LogLevel::Trace => write!(f, "trace"),
        }
    }
}

/// Agent task execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskResult {
    pub task_id: String,
    pub agent_id: String,
    pub status: EnterpriseTaskStatus,

    // Results
    pub result: Option<serde_json::Value>,
    pub output: Option<String>,
    pub artifacts: Option<Vec<TaskArtifact>>,

    // Execution details
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub duration: Option<u64>,

    // Error information
    pub error: Option<String>,
    pub error_details: Option<serde_json::Value>,

    // Metadata
    pub tokens_used: Option<u32>,
    pub tools_used: Option<Vec<String>>,
    pub files_modified: Option<Vec<String>>,
    pub commands_executed: Option<Vec<String>>,
}

/// Agent performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    // Task statistics
    pub tasks_executed: u32,
    pub tasks_succeeded: u32,
    pub tasks_failed: u32,
    pub tasks_in_progress: u32,

    // Performance metrics
    pub average_execution_time: f64,
    pub total_execution_time: u64,
    pub success_rate: f64,

    // Resource usage
    pub tokens_consumed: u32,
    pub api_calls_total: u32,

    // Activity tracking
    pub last_active: DateTime<Utc>,
    pub uptime: u64,

    // Efficiency metrics
    pub productivity: f64, // tasks completed per hour
    pub accuracy: f64, // percentage of successful tasks
}

/// Task artifact (files, outputs, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskArtifact {
    pub id: String,
    pub artifact_type: ArtifactType,
    pub name: String,
    pub path: Option<String>,
    pub content: Option<String>,
    pub size: u64,
    pub mime_type: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ArtifactType {
    File,
    Output,
    Log,
    Screenshot,
    Data,
}

impl std::fmt::Display for ArtifactType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ArtifactType::File => write!(f, "file"),
            ArtifactType::Output => write!(f, "output"),
            ArtifactType::Log => write!(f, "log"),
            ArtifactType::Screenshot => write!(f, "screenshot"),
            ArtifactType::Data => write!(f, "data"),
        }
    }
}

/// Project analysis information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAnalysis {
    // Basic project info
    pub project_type: String,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,

    // Structure
    pub file_count: u32,
    pub directory_count: u32,
    pub total_size: u64,

    // Dependencies and tools
    pub dependencies: HashMap<String, String>,
    pub dev_dependencies: HashMap<String, String>,
    pub scripts: HashMap<String, String>,

    // Analysis results
    pub complexity: Complexity,
    pub maintainability: f64,
    pub test_coverage: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Complexity {
    Low,
    Medium,
    High,
}

impl std::fmt::Display for Complexity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Complexity::Low => write!(f, "low"),
            Complexity::Medium => write!(f, "medium"),
            Complexity::High => write!(f, "high"),
        }
    }
}

/// Execution policy settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPolicy {
    pub approval: ApprovalLevel,
    pub sandbox: SandboxMode,
    pub timeout_ms: u64,
    pub max_retries: u32,
}

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

/// Retry policy configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff_ms: u64,
    pub backoff_multiplier: f64,
    pub retryable_errors: Vec<String>,
}

/// Agent permissions system
#[derive(Debug, Clone, Serialize, Deserialize)]
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
pub struct AgentWorkPlan {
    pub id: String,
    pub agent_id: String,
    pub goal: String,
    pub todos: Vec<AgentTodo>,

    // Planning information
    pub estimated_time_total: u64,
    pub actual_time_total: Option<u64>,
    pub complexity: Complexity,
    pub risk_level: RiskLevel,

    // Status tracking
    pub status: EnterpriseTaskStatus,
    pub progress: u8,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,

    // Dependencies and resources
    pub required_resources: Vec<String>,
    pub dependencies: Vec<String>,

    // Results
    pub results: Option<HashMap<String, serde_json::Value>>,
    pub artifacts: Option<Vec<TaskArtifact>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

impl std::fmt::Display for RiskLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RiskLevel::Low => write!(f, "low"),
            RiskLevel::Medium => write!(f, "medium"),
            RiskLevel::High => write!(f, "high"),
        }
    }
}

/// Agent event for real-time monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEvent<T = serde_json::Value> {
    pub id: String,
    pub event_type: AgentEventType,
    pub agent_id: String,
    pub timestamp: DateTime<Utc>,
    pub data: T,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentEventType {
    AgentInitialized,
    AgentStatusChanged,
    TaskStarted,
    TaskProgress,
    TaskCompleted,
    TaskFailed,
    ErrorOccurred,
    GuidanceUpdated,
    ConfigChanged,
}

impl std::fmt::Display for AgentEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentEventType::AgentInitialized => write!(f, "agent.initialized"),
            AgentEventType::AgentStatusChanged => write!(f, "agent.status.changed"),
            AgentEventType::TaskStarted => write!(f, "task.started"),
            AgentEventType::TaskProgress => write!(f, "task.progress"),
            AgentEventType::TaskCompleted => write!(f, "task.completed"),
            AgentEventType::TaskFailed => write!(f, "task.failed"),
            AgentEventType::ErrorOccurred => write!(f, "error.occurred"),
            AgentEventType::GuidanceUpdated => write!(f, "guidance.updated"),
            AgentEventType::ConfigChanged => write!(f, "config.changed"),
        }
    }
}

/// Agent registry entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRegistryEntry {
    pub agent_class: String, // Class name as string since we can't store trait objects directly
    pub metadata: AgentMetadata,
    pub is_enabled: bool,
}

/// Agent metadata for registry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub specialization: String,
    pub capabilities: Vec<String>,
    pub version: String,
    pub author: Option<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub requires_guidance: bool,
    pub default_config: AgentConfig,
}