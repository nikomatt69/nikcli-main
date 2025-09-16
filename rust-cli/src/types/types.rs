use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Agent status enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentStatus {
    Idle,
    Running,
    Completed,
    Error,
    Paused,
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentStatus::Idle => write!(f, "idle"),
            AgentStatus::Running => write!(f, "running"),
            AgentStatus::Completed => write!(f, "completed"),
            AgentStatus::Error => write!(f, "error"),
            AgentStatus::Paused => write!(f, "paused"),
        }
    }
}

/// Task status enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::InProgress => write!(f, "in_progress"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Failed => write!(f, "failed"),
            TaskStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Task priority enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Urgent,
}

impl std::fmt::Display for TaskPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskPriority::Low => write!(f, "low"),
            TaskPriority::Medium => write!(f, "medium"),
            TaskPriority::High => write!(f, "high"),
            TaskPriority::Urgent => write!(f, "urgent"),
        }
    }
}

/// Agent representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub capabilities: Vec<String>,
    pub status: AgentStatus,
    pub last_activity: Option<DateTime<Utc>>,
}

impl Agent {
    pub fn new(id: String, name: String, description: String) -> Self {
        Self {
            id,
            name,
            description,
            capabilities: Vec::new(),
            status: AgentStatus::Idle,
            last_activity: None,
        }
    }
}

/// Agent task representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub agent_id: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl AgentTask {
    pub fn new(id: String, agent_id: String, description: String) -> Self {
        let now = Utc::now();
        Self {
            id,
            agent_id,
            description,
            status: TaskStatus::Pending,
            priority: TaskPriority::Medium,
            created_at: now,
            updated_at: now,
            result: None,
            error: None,
        }
    }
}

/// Workspace information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceInfo {
    pub path: String,
    pub name: String,
    pub workspace_type: WorkspaceType,
    pub language: Option<String>,
    pub framework: Option<String>,
    pub package_manager: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkspaceType {
    Project,
    Workspace,
}

impl std::fmt::Display for WorkspaceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkspaceType::Project => write!(f, "project"),
            WorkspaceType::Workspace => write!(f, "workspace"),
        }
    }
}

/// Execution context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub workspace_path: String,
    pub current_agent: Option<String>,
    pub mode: ExecutionMode,
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionMode {
    Default,
    Auto,
    Plan,
}

impl std::fmt::Display for ExecutionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecutionMode::Default => write!(f, "default"),
            ExecutionMode::Auto => write!(f, "auto"),
            ExecutionMode::Plan => write!(f, "plan"),
        }
    }
}

/// Tool execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

impl ToolResult {
    pub fn success(output: serde_json::Value) -> Self {
        Self {
            success: true,
            output: Some(output),
            error: None,
            metadata: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            output: None,
            error: Some(error),
            metadata: None,
        }
    }
}