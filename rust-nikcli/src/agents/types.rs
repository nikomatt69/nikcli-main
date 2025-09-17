use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Agent specialization types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentSpecialization {
    Universal,
    React,
    Backend,
    Frontend,
    DevOps,
    CodeReview,
    AutonomousCoder,
    SystemAdmin,
    Optimization,
    Custom(String),
}

impl std::fmt::Display for AgentSpecialization {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentSpecialization::Universal => write!(f, "universal"),
            AgentSpecialization::React => write!(f, "react"),
            AgentSpecialization::Backend => write!(f, "backend"),
            AgentSpecialization::Frontend => write!(f, "frontend"),
            AgentSpecialization::DevOps => write!(f, "devops"),
            AgentSpecialization::CodeReview => write!(f, "code-review"),
            AgentSpecialization::AutonomousCoder => write!(f, "autonomous-coder"),
            AgentSpecialization::SystemAdmin => write!(f, "system-admin"),
            AgentSpecialization::Optimization => write!(f, "optimization"),
            AgentSpecialization::Custom(name) => write!(f, "{}", name),
        }
    }
}

/// Agent status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Idle,
    Running,
    Paused,
    Error,
    Completed,
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentStatus::Idle => write!(f, "idle"),
            AgentStatus::Running => write!(f, "running"),
            AgentStatus::Paused => write!(f, "paused"),
            AgentStatus::Error => write!(f, "error"),
            AgentStatus::Completed => write!(f, "completed"),
        }
    }
}

/// Agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub specialization: AgentSpecialization,
    pub version: String,
    pub capabilities: Vec<String>,
    pub category: String,
    pub tags: Vec<String>,
    pub requires_guidance: bool,
    pub default_config: AgentDefaultConfig,
}

/// Default agent configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDefaultConfig {
    pub autonomy_level: AutonomyLevel,
    pub max_concurrent_tasks: u32,
    pub default_timeout: u64,
    pub retry_policy: RetryPolicy,
    pub enabled_tools: Vec<String>,
    pub guidance_files: Vec<String>,
    pub log_level: String,
    pub permissions: AgentPermissions,
    pub sandbox_restrictions: Vec<String>,
}

/// Autonomy levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

/// Retry policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub backoff_ms: u64,
    pub backoff_multiplier: f64,
    pub retryable_errors: Vec<String>,
}

/// Agent permissions
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

/// Agent context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentContext {
    pub working_directory: String,
    pub project_type: Option<String>,
    pub language: Option<String>,
    pub framework: Option<String>,
    pub dependencies: Vec<String>,
    pub environment_variables: HashMap<String, String>,
    pub user_preferences: HashMap<String, serde_json::Value>,
}

/// Agent task
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub description: String,
    pub priority: TaskPriority,
    pub estimated_duration: Option<u64>,
    pub dependencies: Vec<String>,
    pub context: AgentContext,
    pub created_at: DateTime<Utc>,
    pub deadline: Option<DateTime<Utc>>,
}

/// Task priority
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskPriority {
    Low,
    Normal,
    High,
    Critical,
}

impl std::fmt::Display for TaskPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPriority::Low => write!(f, "low"),
            TaskPriority::Normal => write!(f, "normal"),
            TaskPriority::High => write!(f, "high"),
            TaskPriority::Critical => write!(f, "critical"),
        }
    }
}

/// Agent task result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskResult {
    pub task_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub duration_ms: u64,
    pub files_modified: Vec<String>,
    pub commands_executed: Vec<String>,
    pub metrics: AgentMetrics,
    pub completed_at: DateTime<Utc>,
}

/// Agent metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub tasks_completed: u32,
    pub success_rate: f64,
    pub average_duration_ms: f64,
    pub total_tokens_used: u64,
    pub total_cost: f64,
    pub last_active: DateTime<Utc>,
}

/// Agent instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInstance {
    pub id: String,
    pub config: AgentConfig,
    pub status: AgentStatus,
    pub current_task: Option<AgentTask>,
    pub metrics: AgentMetrics,
    pub created_at: DateTime<Utc>,
    pub last_heartbeat: DateTime<Utc>,
}

/// Task cognition for advanced orchestration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCognition {
    pub id: String,
    pub original_task: String,
    pub normalized_task: String,
    pub intent: TaskIntent,
    pub entities: Vec<TaskEntity>,
    pub dependencies: Vec<String>,
    pub contexts: Vec<String>,
    pub estimated_complexity: u32,
    pub required_capabilities: Vec<String>,
    pub suggested_agents: Vec<String>,
    pub risk_level: RiskLevel,
    pub orchestration_plan: Option<OrchestrationPlan>,
}

/// Task intent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskIntent {
    pub primary: PrimaryIntent,
    pub secondary: Vec<String>,
    pub confidence: f64,
    pub complexity: ComplexityLevel,
    pub urgency: UrgencyLevel,
}

/// Primary intent types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PrimaryIntent {
    Create,
    Read,
    Update,
    Delete,
    Analyze,
    Optimize,
    Deploy,
    Test,
    Debug,
    Refactor,
}

/// Complexity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ComplexityLevel {
    Low,
    Medium,
    High,
    Extreme,
}

/// Urgency levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UrgencyLevel {
    Low,
    Normal,
    High,
    Critical,
}

/// Risk levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// Task entity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskEntity {
    pub entity_type: EntityType,
    pub name: String,
    pub confidence: f64,
    pub location: Option<String>,
}

/// Entity types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum EntityType {
    File,
    Directory,
    Function,
    Class,
    Component,
    Api,
    Database,
}

/// Orchestration plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationPlan {
    pub id: String,
    pub strategy: OrchestrationStrategy,
    pub phases: Vec<OrchestrationPhase>,
    pub estimated_duration: u64,
    pub resource_requirements: ResourceRequirements,
    pub fallback_strategies: Vec<String>,
    pub monitoring_points: Vec<String>,
}

/// Orchestration strategies
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrchestrationStrategy {
    Sequential,
    Parallel,
    Hybrid,
    Adaptive,
}

/// Orchestration phase
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationPhase {
    pub id: String,
    pub name: String,
    pub phase_type: PhaseType,
    pub agents: Vec<String>,
    pub tools: Vec<String>,
    pub dependencies: Vec<String>,
    pub estimated_duration: u64,
    pub success_criteria: Vec<String>,
    pub fallback_actions: Vec<String>,
}

/// Phase types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PhaseType {
    Preparation,
    Analysis,
    Execution,
    Validation,
    Cleanup,
}

/// Resource requirements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceRequirements {
    pub agents: u32,
    pub tools: Vec<String>,
    pub memory: u64,
    pub complexity: u32,
}

/// Agent performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPerformanceMetrics {
    pub agent_id: String,
    pub task_count: u32,
    pub success_rate: f64,
    pub average_duration: f64,
    pub complexity_handled: u32,
    pub resource_efficiency: f64,
    pub user_satisfaction: f64,
    pub last_active: DateTime<Utc>,
    pub specializations: Vec<String>,
    pub strengths: Vec<String>,
    pub weaknesses: Vec<String>,
}