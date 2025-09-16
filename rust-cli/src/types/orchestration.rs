use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Orchestration level enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrchestrationLevel {
    Minimal,
    Basic,
    Intermediate,
    Advanced,
    Expert,
    Maximum,
}

impl std::fmt::Display for OrchestrationLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrchestrationLevel::Minimal => write!(f, "minimal"),
            OrchestrationLevel::Basic => write!(f, "basic"),
            OrchestrationLevel::Intermediate => write!(f, "intermediate"),
            OrchestrationLevel::Advanced => write!(f, "advanced"),
            OrchestrationLevel::Expert => write!(f, "expert"),
            OrchestrationLevel::Maximum => write!(f, "maximum"),
        }
    }
}

/// Orchestration mode enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrchestrationMode {
    Manual,
    SemiAutomatic,
    Automatic,
    Cognitive,
}

impl std::fmt::Display for OrchestrationMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrchestrationMode::Manual => write!(f, "manual"),
            OrchestrationMode::SemiAutomatic => write!(f, "semi-automatic"),
            OrchestrationMode::Automatic => write!(f, "automatic"),
            OrchestrationMode::Cognitive => write!(f, "cognitive"),
        }
    }
}

/// Cognitive load trend enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CognitiveLoadTrend {
    Increasing,
    Decreasing,
    Stable,
}

impl std::fmt::Display for CognitiveLoadTrend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CognitiveLoadTrend::Increasing => write!(f, "increasing"),
            CognitiveLoadTrend::Decreasing => write!(f, "decreasing"),
            CognitiveLoadTrend::Stable => write!(f, "stable"),
        }
    }
}

/// Cognitive load representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveLoad {
    pub current: u8, // 0-100
    pub peak: u8,    // 0-100
    pub average: u8, // 0-100
    pub trend: CognitiveLoadTrend,
}

impl CognitiveLoad {
    pub fn new(current: u8, peak: u8, average: u8, trend: CognitiveLoadTrend) -> Self {
        Self {
            current: current.min(100),
            peak: peak.min(100),
            average: average.min(100),
            trend,
        }
    }
}

/// Cognitive metrics representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveMetrics {
    pub attention: f32,      // 0.0-1.0
    pub comprehension: f32,  // 0.0-1.0
    pub reasoning: f32,      // 0.0-1.0
    pub learning: f32,       // 0.0-1.0
    pub adaptation: f32,     // 0.0-1.0
}

impl CognitiveMetrics {
    pub fn new(attention: f32, comprehension: f32, reasoning: f32, learning: f32, adaptation: f32) -> Self {
        Self {
            attention: attention.clamp(0.0, 1.0),
            comprehension: comprehension.clamp(0.0, 1.0),
            reasoning: reasoning.clamp(0.0, 1.0),
            learning: learning.clamp(0.0, 1.0),
            adaptation: adaptation.clamp(0.0, 1.0),
        }
    }
}

/// Cognitive state representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveState {
    pub level: OrchestrationLevel,
    pub mode: OrchestrationMode,
    pub load: CognitiveLoad,
    pub metrics: CognitiveMetrics,
    pub active_processes: u32,
    pub memory_usage: u64,
    pub last_update: DateTime<Utc>,
    pub adaptation_enabled: bool,
}

impl CognitiveState {
    pub fn new(level: OrchestrationLevel, mode: OrchestrationMode) -> Self {
        let now = Utc::now();
        Self {
            level,
            mode,
            load: CognitiveLoad::new(0, 0, 0, CognitiveLoadTrend::Stable),
            metrics: CognitiveMetrics::new(0.5, 0.5, 0.5, 0.5, 0.5),
            active_processes: 0,
            memory_usage: 0,
            last_update: now,
            adaptation_enabled: true,
        }
    }
}

/// Event priority enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EventPriority {
    Low,
    Medium,
    High,
    Critical,
}

impl std::fmt::Display for EventPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventPriority::Low => write!(f, "low"),
            EventPriority::Medium => write!(f, "medium"),
            EventPriority::High => write!(f, "high"),
            EventPriority::Critical => write!(f, "critical"),
        }
    }
}

/// Event type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EventType {
    System,
    Agent,
    Task,
    Ui,
    Error,
    Performance,
    Security,
}

impl std::fmt::Display for EventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventType::System => write!(f, "system"),
            EventType::Agent => write!(f, "agent"),
            EventType::Task => write!(f, "task"),
            EventType::Ui => write!(f, "ui"),
            EventType::Error => write!(f, "error"),
            EventType::Performance => write!(f, "performance"),
            EventType::Security => write!(f, "security"),
        }
    }
}

/// Orchestration event representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationEvent<T = serde_json::Value> {
    pub id: String,
    pub event_type: EventType,
    pub priority: EventPriority,
    pub source: String,
    pub target: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub data: T,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    pub correlation_id: Option<String>,
}

impl<T> OrchestrationEvent<T> {
    pub fn new(event_type: EventType, priority: EventPriority, source: String, data: T) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            event_type,
            priority,
            source,
            target: None,
            timestamp: Utc::now(),
            data,
            metadata: None,
            correlation_id: None,
        }
    }

    pub fn with_target(mut self, target: String) -> Self {
        self.target = Some(target);
        self
    }

    pub fn with_metadata(mut self, metadata: HashMap<String, serde_json::Value>) -> Self {
        self.metadata = Some(metadata);
        self
    }

    pub fn with_correlation_id(mut self, correlation_id: String) -> Self {
        self.correlation_id = Some(correlation_id);
        self
    }
}

/// State transition representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateTransition {
    pub from: String,
    pub to: String,
    pub trigger: String,
    pub conditions: Option<Vec<String>>,
    pub actions: Option<Vec<String>>,
}

impl StateTransition {
    pub fn new(from: String, to: String, trigger: String) -> Self {
        Self {
            from,
            to,
            trigger,
            conditions: None,
            actions: None,
        }
    }
}

/// System state representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemState {
    pub name: String,
    pub description: Option<String>,
    pub transitions: Vec<StateTransition>,
    pub is_active: bool,
    pub entered_at: Option<DateTime<Utc>>,
    pub exited_at: Option<DateTime<Utc>>,
}

impl SystemState {
    pub fn new(name: String, description: Option<String>) -> Self {
        Self {
            name,
            description,
            transitions: Vec::new(),
            is_active: false,
            entered_at: None,
            exited_at: None,
        }
    }
}

/// Orchestration state representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationState {
    pub current: SystemState,
    pub history: Vec<SystemState>,
    pub cognitive_state: CognitiveState,
    pub active_tasks: u32,
    pub pending_events: u32,
    pub last_transition: Option<DateTime<Utc>>,
}

impl OrchestrationState {
    pub fn new(current: SystemState, cognitive_state: CognitiveState) -> Self {
        Self {
            current,
            history: Vec::new(),
            cognitive_state,
            active_tasks: 0,
            pending_events: 0,
            last_transition: None,
        }
    }
}

/// Coordination rule representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoordinationRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub conditions: Vec<String>,
    pub actions: Vec<String>,
    pub priority: u32,
    pub enabled: bool,
}

impl CoordinationRule {
    pub fn new(id: String, name: String, description: String) -> Self {
        Self {
            id,
            name,
            description,
            conditions: Vec::new(),
            actions: Vec::new(),
            priority: 0,
            enabled: true,
        }
    }
}

/// Coordination context representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoordinationContext {
    pub rules: Vec<CoordinationRule>,
    pub active_rules: Vec<String>,
    pub last_evaluation: Option<DateTime<Utc>>,
    pub performance_metrics: Option<HashMap<String, f64>>,
}

impl CoordinationContext {
    pub fn new() -> Self {
        Self {
            rules: Vec::new(),
            active_rules: Vec::new(),
            last_evaluation: None,
            performance_metrics: None,
        }
    }
}

/// Performance metric representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetric {
    pub name: String,
    pub value: f64,
    pub unit: String,
    pub timestamp: DateTime<Utc>,
    pub tags: Option<HashMap<String, String>>,
}

impl PerformanceMetric {
    pub fn new(name: String, value: f64, unit: String) -> Self {
        Self {
            name,
            value,
            unit,
            timestamp: Utc::now(),
            tags: None,
        }
    }
}

/// Performance threshold operator enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThresholdOperator {
    GreaterThan,
    GreaterThanOrEqual,
    LessThan,
    LessThanOrEqual,
    Equal,
}

impl std::fmt::Display for ThresholdOperator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ThresholdOperator::GreaterThan => write!(f, "gt"),
            ThresholdOperator::GreaterThanOrEqual => write!(f, "gte"),
            ThresholdOperator::LessThan => write!(f, "lt"),
            ThresholdOperator::LessThanOrEqual => write!(f, "lte"),
            ThresholdOperator::Equal => write!(f, "eq"),
        }
    }
}

/// Performance threshold representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceThreshold {
    pub metric: String,
    pub warning: f64,
    pub critical: f64,
    pub operator: ThresholdOperator,
}

impl PerformanceThreshold {
    pub fn new(metric: String, warning: f64, critical: f64, operator: ThresholdOperator) -> Self {
        Self {
            metric,
            warning,
            critical,
            operator,
        }
    }
}

/// Performance alert severity enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AlertSeverity {
    Info,
    Warning,
    Critical,
}

impl std::fmt::Display for AlertSeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlertSeverity::Info => write!(f, "info"),
            AlertSeverity::Warning => write!(f, "warning"),
            AlertSeverity::Critical => write!(f, "critical"),
        }
    }
}

/// Performance alert representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceAlert {
    pub id: String,
    pub metric: String,
    pub value: f64,
    pub threshold: PerformanceThreshold,
    pub severity: AlertSeverity,
    pub message: String,
    pub timestamp: DateTime<Utc>,
    pub resolved: bool,
}

impl PerformanceAlert {
    pub fn new(
        metric: String,
        value: f64,
        threshold: PerformanceThreshold,
        severity: AlertSeverity,
        message: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            metric,
            value,
            threshold,
            severity,
            message,
            timestamp: Utc::now(),
            resolved: false,
        }
    }
}

/// Workflow step type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkflowStepType {
    Task,
    Decision,
    Parallel,
    Join,
    End,
}

impl std::fmt::Display for WorkflowStepType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowStepType::Task => write!(f, "task"),
            WorkflowStepType::Decision => write!(f, "decision"),
            WorkflowStepType::Parallel => write!(f, "parallel"),
            WorkflowStepType::Join => write!(f, "join"),
            WorkflowStepType::End => write!(f, "end"),
        }
    }
}

/// Workflow step representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    pub description: String,
    pub step_type: WorkflowStepType,
    pub dependencies: Option<Vec<String>>,
    pub config: Option<HashMap<String, serde_json::Value>>,
    pub timeout: Option<u64>,
    pub retry_count: Option<u32>,
}

impl WorkflowStep {
    pub fn new(id: String, name: String, description: String, step_type: WorkflowStepType) -> Self {
        Self {
            id,
            name,
            description,
            step_type,
            dependencies: None,
            config: None,
            timeout: None,
            retry_count: None,
        }
    }
}

/// Workflow status enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkflowStatus {
    Draft,
    Active,
    Paused,
    Completed,
    Failed,
}

impl std::fmt::Display for WorkflowStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowStatus::Draft => write!(f, "draft"),
            WorkflowStatus::Active => write!(f, "active"),
            WorkflowStatus::Paused => write!(f, "paused"),
            WorkflowStatus::Completed => write!(f, "completed"),
            WorkflowStatus::Failed => write!(f, "failed"),
        }
    }
}

/// Workflow representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub steps: Vec<WorkflowStep>,
    pub status: WorkflowStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub execution_count: Option<u32>,
}

impl Workflow {
    pub fn new(id: String, name: String, description: String) -> Self {
        let now = Utc::now();
        Self {
            id,
            name,
            description,
            steps: Vec::new(),
            status: WorkflowStatus::Draft,
            created_at: now,
            updated_at: now,
            execution_count: None,
        }
    }
}

/// Workflow execution status enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkflowExecutionStatus {
    Running,
    Completed,
    Failed,
    Paused,
}

impl std::fmt::Display for WorkflowExecutionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkflowExecutionStatus::Running => write!(f, "running"),
            WorkflowExecutionStatus::Completed => write!(f, "completed"),
            WorkflowExecutionStatus::Failed => write!(f, "failed"),
            WorkflowExecutionStatus::Paused => write!(f, "paused"),
        }
    }
}

/// Workflow execution representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecution {
    pub workflow_id: String,
    pub execution_id: String,
    pub status: WorkflowExecutionStatus,
    pub current_step: String,
    pub results: HashMap<String, serde_json::Value>,
    pub errors: Vec<String>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration: u64,
}

impl WorkflowExecution {
    pub fn new(workflow_id: String, execution_id: String, current_step: String) -> Self {
        let now = Utc::now();
        Self {
            workflow_id,
            execution_id,
            status: WorkflowExecutionStatus::Running,
            current_step,
            results: HashMap::new(),
            errors: Vec::new(),
            started_at: now,
            completed_at: None,
            duration: 0,
        }
    }
}

/// Orchestration configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationConfig {
    pub level: OrchestrationLevel,
    pub mode: OrchestrationMode,
    pub enable_cognitive: bool,
    pub enable_learning: bool,
    pub performance_monitoring: bool,
    pub alert_thresholds: Vec<PerformanceThreshold>,
    pub max_concurrent_tasks: u32,
    pub timeout: u64,
    pub retry_attempts: u32,
}

impl OrchestrationConfig {
    pub fn new(level: OrchestrationLevel, mode: OrchestrationMode) -> Self {
        Self {
            level,
            mode,
            enable_cognitive: true,
            enable_learning: true,
            performance_monitoring: true,
            alert_thresholds: Vec::new(),
            max_concurrent_tasks: 10,
            timeout: 300, // 5 minutes
            retry_attempts: 3,
        }
    }
}

/// Orchestrator trait
pub trait Orchestrator<TState, TEvent> {
    fn get_state(&self) -> &TState;
    fn transition(&mut self, event: TEvent) -> Result<bool, Box<dyn std::error::Error>>;
    fn can_transition(&self, event: &TEvent) -> bool;
    fn get_available_transitions(&self) -> Vec<String>;
    fn add_listener(&mut self, listener: Box<dyn OrchestrationListener<TState, TEvent>>);
    fn remove_listener(&mut self, listener_id: String);
}

/// Orchestration listener trait
pub trait OrchestrationListener<TState, TEvent> {
    fn on_state_change(&self, from: &TState, to: &TState, event: &TEvent);
    fn on_error(&self, error: &dyn std::error::Error, state: &TState);
    fn on_event(&self, event: &TEvent, state: &TState);
    fn get_id(&self) -> String;
}

/// Cognitive orchestrator trait
pub trait CognitiveOrchestrator: Orchestrator<CognitiveState, OrchestrationEvent> {
    fn adapt_to_load(&mut self, load: &CognitiveLoad) -> Result<(), Box<dyn std::error::Error>>;
    fn optimize_performance(&mut self) -> Result<Vec<PerformanceMetric>, Box<dyn std::error::Error>>;
    fn predict_optimal_state(&self) -> Result<CognitiveState, Box<dyn std::error::Error>>;
    fn learn_from_execution(&mut self, execution: &WorkflowExecution) -> Result<(), Box<dyn std::error::Error>>;
}

/// Event handler type alias
pub type EventHandler<T> = Box<dyn Fn(OrchestrationEvent<T>) -> Result<(), Box<dyn std::error::Error>>>;

/// State predicate type alias
pub type StatePredicate<T> = Box<dyn Fn(&T) -> bool>;

/// Transition guard type alias
pub type TransitionGuard<TState, TEvent> = Box<dyn Fn(&TState, &TState, &TEvent) -> Result<bool, Box<dyn std::error::Error>>>;