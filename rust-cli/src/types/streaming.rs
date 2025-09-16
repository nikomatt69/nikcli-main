use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Stream event type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StreamEventType {
    TextDelta,
    ToolCall,
    ToolResult,
    Error,
    Complete,
    Start,
    Thinking,
}

impl std::fmt::Display for StreamEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StreamEventType::TextDelta => write!(f, "text_delta"),
            StreamEventType::ToolCall => write!(f, "tool_call"),
            StreamEventType::ToolResult => write!(f, "tool_result"),
            StreamEventType::Error => write!(f, "error"),
            StreamEventType::Complete => write!(f, "complete"),
            StreamEventType::Start => write!(f, "start"),
            StreamEventType::Thinking => write!(f, "thinking"),
        }
    }
}

/// Background agent status enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BackgroundAgentStatus {
    Starting,
    Running,
    Completed,
    Failed,
}

impl std::fmt::Display for BackgroundAgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackgroundAgentStatus::Starting => write!(f, "starting"),
            BackgroundAgentStatus::Running => write!(f, "running"),
            BackgroundAgentStatus::Completed => write!(f, "completed"),
            BackgroundAgentStatus::Failed => write!(f, "failed"),
        }
    }
}

/// Background agent information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundAgentInfo {
    pub id: String,
    pub name: String,
    pub task: String,
    pub status: BackgroundAgentStatus,
}

impl BackgroundAgentInfo {
    pub fn new(id: String, name: String, task: String) -> Self {
        Self {
            id,
            name,
            task,
            status: BackgroundAgentStatus::Starting,
        }
    }
}

/// File change type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileChangeType {
    Created,
    Modified,
    Deleted,
}

impl std::fmt::Display for FileChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileChangeType::Created => write!(f, "created"),
            FileChangeType::Modified => write!(f, "modified"),
            FileChangeType::Deleted => write!(f, "deleted"),
        }
    }
}

/// File change representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub before: String,
    pub after: String,
    pub change_type: FileChangeType,
}

impl FileChange {
    pub fn new(path: String, before: String, after: String, change_type: FileChangeType) -> Self {
        Self {
            path,
            before,
            after,
            change_type,
        }
    }
}

/// Background result representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundResult {
    pub agent_name: String,
    pub summary: String,
    pub file_changes: Option<Vec<FileChange>>,
    pub execution_time: Option<u64>,
    pub success: bool,
}

impl BackgroundResult {
    pub fn new(agent_name: String, summary: String, success: bool) -> Self {
        Self {
            agent_name,
            summary,
            file_changes: None,
            execution_time: None,
            success,
        }
    }
}

/// Stream event metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEventMetadata {
    pub model: Option<String>,
    pub token_count: Option<u32>,
    pub execution_time: Option<u64>,
    pub tool_name: Option<String>,
    pub background_agents: Option<Vec<BackgroundAgentInfo>>,
    pub background_results: Option<Vec<BackgroundResult>>,
    pub file_path: Option<String>,
    pub file_content: Option<String>,
    pub additional: HashMap<String, serde_json::Value>,
}

impl StreamEventMetadata {
    pub fn new() -> Self {
        Self {
            model: None,
            token_count: None,
            execution_time: None,
            tool_name: None,
            background_agents: None,
            background_results: None,
            file_path: None,
            file_content: None,
            additional: HashMap::new(),
        }
    }
}

/// Stream event representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEvent {
    pub event_type: StreamEventType,
    pub content: Option<String>,
    pub metadata: Option<StreamEventMetadata>,
    pub timestamp: Option<DateTime<Utc>>,
}

impl StreamEvent {
    pub fn new(event_type: StreamEventType, content: Option<String>) -> Self {
        Self {
            event_type,
            content,
            metadata: None,
            timestamp: Some(Utc::now()),
        }
    }

    pub fn with_metadata(mut self, metadata: StreamEventMetadata) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Chat stream data representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStreamData {
    pub assistant_text: String,
    pub has_tool_calls: bool,
    pub total_tokens_used: u32,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub model: String,
}

impl ChatStreamData {
    pub fn new(assistant_text: String, model: String) -> Self {
        Self {
            assistant_text,
            has_tool_calls: false,
            total_tokens_used: 0,
            input_tokens: 0,
            output_tokens: 0,
            model,
        }
    }
}

/// Stream progress representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamProgress {
    pub step: String,
    pub progress: u8, // 0-100
    pub details: Option<String>,
    pub estimated_time_remaining: Option<u64>,
}

impl StreamProgress {
    pub fn new(step: String, progress: u8) -> Self {
        Self {
            step,
            progress: progress.min(100),
            details: None,
            estimated_time_remaining: None,
        }
    }
}

/// Token usage representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub total_tokens: Option<u32>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

impl TokenUsage {
    pub fn new() -> Self {
        Self {
            total_tokens: None,
            prompt_tokens: None,
            completion_tokens: None,
            input_tokens: None,
            output_tokens: None,
        }
    }
}

/// Token tracking information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenTrackingInfo {
    pub session_token_usage: u32,
    pub context_tokens: u32,
    pub real_time_cost: f64,
    pub session_start_time: DateTime<Utc>,
    pub current_model: String,
}

impl TokenTrackingInfo {
    pub fn new(current_model: String) -> Self {
        Self {
            session_token_usage: 0,
            context_tokens: 0,
            real_time_cost: 0.0,
            session_start_time: Utc::now(),
            current_model,
        }
    }
}

/// Streaming configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingConfig {
    pub enable_real_time_updates: bool,
    pub token_tracking_enabled: bool,
    pub max_stream_duration: u64,
    pub buffer_size: usize,
    pub enable_background_agents: bool,
}

impl StreamingConfig {
    pub fn new() -> Self {
        Self {
            enable_real_time_updates: true,
            token_tracking_enabled: true,
            max_stream_duration: 300, // 5 minutes
            buffer_size: 1024,
            enable_background_agents: true,
        }
    }
}

/// Tool call representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: HashMap<String, serde_json::Value>,
    pub result: Option<serde_json::Value>,
    pub execution_time: Option<u64>,
    pub success: Option<bool>,
}

impl ToolCall {
    pub fn new(id: String, name: String, arguments: HashMap<String, serde_json::Value>) -> Self {
        Self {
            id,
            name,
            arguments,
            result: None,
            execution_time: None,
            success: None,
        }
    }
}

/// AI response finish reason enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum FinishReason {
    Stop,
    Length,
    ToolCalls,
    Error,
}

impl std::fmt::Display for FinishReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FinishReason::Stop => write!(f, "stop"),
            FinishReason::Length => write!(f, "length"),
            FinishReason::ToolCalls => write!(f, "tool_calls"),
            FinishReason::Error => write!(f, "error"),
        }
    }
}

/// AI stream response representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIStreamResponse {
    pub id: String,
    pub model: String,
    pub content: String,
    pub usage: Option<TokenUsage>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub finish_reason: Option<FinishReason>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

impl AIStreamResponse {
    pub fn new(id: String, model: String, content: String) -> Self {
        Self {
            id,
            model,
            content,
            usage: None,
            tool_calls: None,
            finish_reason: None,
            metadata: None,
        }
    }
}

/// Stream handler configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamHandlerConfig {
    pub enable_on_start: bool,
    pub enable_on_progress: bool,
    pub enable_on_data: bool,
    pub enable_on_error: bool,
    pub enable_on_complete: bool,
}

impl StreamHandlerConfig {
    pub fn new() -> Self {
        Self {
            enable_on_start: true,
            enable_on_progress: true,
            enable_on_data: true,
            enable_on_error: true,
            enable_on_complete: true,
        }
    }
}

/// Stream handler trait
pub trait StreamHandler<TData, TResult> {
    fn on_start(&self, data: &TData);
    fn on_progress(&self, progress: &StreamProgress);
    fn on_data(&self, chunk: &str, data: &TData);
    fn on_error(&self, error: &dyn std::error::Error, data: &TData);
    fn on_complete(&self, result: &TResult, data: &TData);
}

/// Stream message for orchestrator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamMessage {
    pub id: String,
    pub message_type: StreamMessageType,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub status: StreamMessageStatus,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    pub agent_id: Option<String>,
    pub progress: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StreamMessageType {
    User,
    System,
    Agent,
    Tool,
    Diff,
    Error,
}

impl std::fmt::Display for StreamMessageType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StreamMessageType::User => write!(f, "user"),
            StreamMessageType::System => write!(f, "system"),
            StreamMessageType::Agent => write!(f, "agent"),
            StreamMessageType::Tool => write!(f, "tool"),
            StreamMessageType::Diff => write!(f, "diff"),
            StreamMessageType::Error => write!(f, "error"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum StreamMessageStatus {
    Queued,
    Processing,
    Completed,
    Absorbed,
}

impl std::fmt::Display for StreamMessageStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StreamMessageStatus::Queued => write!(f, "queued"),
            StreamMessageStatus::Processing => write!(f, "processing"),
            StreamMessageStatus::Completed => write!(f, "completed"),
            StreamMessageStatus::Absorbed => write!(f, "absorbed"),
        }
    }
}

impl StreamMessage {
    pub fn new(message_type: StreamMessageType, content: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            message_type,
            content,
            timestamp: Utc::now(),
            status: StreamMessageStatus::Queued,
            metadata: None,
            agent_id: None,
            progress: None,
        }
    }
}

/// Stream context for orchestrator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamContext {
    pub working_directory: String,
    pub autonomous: bool,
    pub plan_mode: bool,
    pub auto_accept_edits: bool,
    pub context_left: u8,
    pub max_context: u8,
}

impl StreamContext {
    pub fn new(working_directory: String) -> Self {
        Self {
            working_directory,
            autonomous: true,
            plan_mode: false,
            auto_accept_edits: true,
            context_left: 20,
            max_context: 100,
        }
    }
}