use crate::ai::types::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub messages: Vec<ChatMessage>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<u32>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Chat session statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionStats {
    pub total_messages: u32,
    pub user_messages: u32,
    pub assistant_messages: u32,
    pub system_messages: u32,
    pub total_tokens: u64,
    pub average_response_time: f64,
    pub session_duration: u64, // in seconds
    pub last_activity: DateTime<Utc>,
}

/// Chat session export format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionExport {
    pub session: ChatSession,
    pub stats: ChatSessionStats,
    pub export_metadata: ExportMetadata,
}

/// Export metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportMetadata {
    pub exported_at: DateTime<Utc>,
    pub export_version: String,
    pub nikcli_version: String,
    pub format: ExportFormat,
}

/// Export formats
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ExportFormat {
    Json,
    Markdown,
    Text,
    Html,
}

impl std::fmt::Display for ExportFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExportFormat::Json => write!(f, "json"),
            ExportFormat::Markdown => write!(f, "markdown"),
            ExportFormat::Text => write!(f, "text"),
            ExportFormat::Html => write!(f, "html"),
        }
    }
}

/// Chat message with additional metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedChatMessage {
    pub message: ChatMessage,
    pub metadata: MessageMetadata,
}

/// Message metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMetadata {
    pub tokens_used: Option<u32>,
    pub model_used: Option<String>,
    pub response_time_ms: Option<u64>,
    pub cost: Option<f64>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_results: Option<Vec<ToolResult>>,
    pub context_files: Option<Vec<String>>,
    pub context_tokens: Option<u32>,
}

/// Chat configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatConfig {
    pub max_context_tokens: u32,
    pub max_history_length: u32,
    pub enable_streaming: bool,
    pub enable_tool_calls: bool,
    pub enable_context_awareness: bool,
    pub auto_save_interval: u64, // in seconds
    pub default_model: String,
    pub default_temperature: f32,
    pub system_prompt: Option<String>,
}

impl Default for ChatConfig {
    fn default() -> Self {
        Self {
            max_context_tokens: 8000,
            max_history_length: 100,
            enable_streaming: true,
            enable_tool_calls: true,
            enable_context_awareness: true,
            auto_save_interval: 300, // 5 minutes
            default_model: "default-openai".to_string(),
            default_temperature: 0.7,
            system_prompt: None,
        }
    }
}

/// Chat event types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ChatEventType {
    SessionCreated,
    SessionUpdated,
    MessageAdded,
    MessageStreaming,
    MessageCompleted,
    ToolCallStarted,
    ToolCallCompleted,
    ContextUpdated,
    Error,
    SessionExported,
    SessionImported,
}

impl std::fmt::Display for ChatEventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatEventType::SessionCreated => write!(f, "session_created"),
            ChatEventType::SessionUpdated => write!(f, "session_updated"),
            ChatEventType::MessageAdded => write!(f, "message_added"),
            ChatEventType::MessageStreaming => write!(f, "message_streaming"),
            ChatEventType::MessageCompleted => write!(f, "message_completed"),
            ChatEventType::ToolCallStarted => write!(f, "tool_call_started"),
            ChatEventType::ToolCallCompleted => write!(f, "tool_call_completed"),
            ChatEventType::ContextUpdated => write!(f, "context_updated"),
            ChatEventType::Error => write!(f, "error"),
            ChatEventType::SessionExported => write!(f, "session_exported"),
            ChatEventType::SessionImported => write!(f, "session_imported"),
        }
    }
}

/// Chat event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatEvent {
    pub event_type: ChatEventType,
    pub session_id: Option<String>,
    pub message_id: Option<String>,
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

/// Chat context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatContext {
    pub session_id: String,
    pub workspace_path: Option<String>,
    pub current_files: Vec<String>,
    pub recent_commands: Vec<String>,
    pub project_type: Option<String>,
    pub language: Option<String>,
    pub framework: Option<String>,
    pub dependencies: Vec<String>,
    pub environment_variables: HashMap<String, String>,
    pub git_info: Option<GitInfo>,
    pub ide_info: Option<IdeInfo>,
}

/// Git information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitInfo {
    pub branch: String,
    pub commit_hash: String,
    pub commit_message: String,
    pub remote_url: Option<String>,
    pub status: String,
    pub modified_files: Vec<String>,
    pub untracked_files: Vec<String>,
}

/// IDE information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeInfo {
    pub name: String,
    pub version: String,
    pub open_files: Vec<String>,
    pub active_file: Option<String>,
    pub cursor_position: Option<CursorPosition>,
    pub selection: Option<String>,
}

/// Cursor position
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub line: u32,
    pub column: u32,
    pub offset: u32,
}

/// Chat search criteria
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSearchCriteria {
    pub query: String,
    pub session_ids: Option<Vec<String>>,
    pub date_from: Option<DateTime<Utc>>,
    pub date_to: Option<DateTime<Utc>>,
    pub role_filter: Option<ChatRole>,
    pub model_filter: Option<String>,
    pub min_tokens: Option<u32>,
    pub max_tokens: Option<u32>,
}

/// Chat search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSearchResult {
    pub session_id: String,
    pub message_id: String,
    pub message: ChatMessage,
    pub metadata: MessageMetadata,
    pub relevance_score: f64,
    pub matched_text: String,
}

/// Chat analytics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatAnalytics {
    pub total_sessions: u32,
    pub total_messages: u32,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub average_session_length: f64,
    pub average_response_time: f64,
    pub most_used_models: Vec<ModelUsage>,
    pub daily_usage: Vec<DailyUsage>,
    pub cost_by_model: HashMap<String, f64>,
    pub token_usage_by_model: HashMap<String, u64>,
}

/// Model usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelUsage {
    pub model: String,
    pub usage_count: u32,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub average_response_time: f64,
}

/// Daily usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyUsage {
    pub date: DateTime<Utc>,
    pub sessions: u32,
    pub messages: u32,
    pub tokens: u64,
    pub cost: f64,
}

/// Chat backup
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatBackup {
    pub sessions: Vec<ChatSession>,
    pub created_at: DateTime<Utc>,
    pub version: String,
    pub total_sessions: u32,
    pub total_messages: u32,
    pub backup_size: u64,
}

/// Chat import result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatImportResult {
    pub imported_sessions: u32,
    pub imported_messages: u32,
    pub skipped_sessions: u32,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Chat session filter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionFilter {
    pub title_contains: Option<String>,
    pub created_after: Option<DateTime<Utc>>,
    pub created_before: Option<DateTime<Utc>>,
    pub min_messages: Option<u32>,
    pub max_messages: Option<u32>,
    pub has_system_prompt: Option<bool>,
    pub model_used: Option<String>,
}

/// Chat session sort order
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ChatSessionSortOrder {
    CreatedAtAsc,
    CreatedAtDesc,
    UpdatedAtAsc,
    UpdatedAtDesc,
    TitleAsc,
    TitleDesc,
    MessageCountAsc,
    MessageCountDesc,
}

impl std::fmt::Display for ChatSessionSortOrder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatSessionSortOrder::CreatedAtAsc => write!(f, "created_at_asc"),
            ChatSessionSortOrder::CreatedAtDesc => write!(f, "created_at_desc"),
            ChatSessionSortOrder::UpdatedAtAsc => write!(f, "updated_at_asc"),
            ChatSessionSortOrder::UpdatedAtDesc => write!(f, "updated_at_desc"),
            ChatSessionSortOrder::TitleAsc => write!(f, "title_asc"),
            ChatSessionSortOrder::TitleDesc => write!(f, "title_desc"),
            ChatSessionSortOrder::MessageCountAsc => write!(f, "message_count_asc"),
            ChatSessionSortOrder::MessageCountDesc => write!(f, "message_count_desc"),
        }
    }
}