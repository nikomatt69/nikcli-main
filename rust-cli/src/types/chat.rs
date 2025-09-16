use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Chat message role enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChatRole {
    User,
    Assistant,
    System,
}

impl std::fmt::Display for ChatRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatRole::User => write!(f, "user"),
            ChatRole::Assistant => write!(f, "assistant"),
            ChatRole::System => write!(f, "system"),
        }
    }
}

/// Chat message metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessageMetadata {
    pub tokens: Option<u32>,
    pub model: Option<String>,
    pub execution_time: Option<u64>,
    pub tools: Option<Vec<String>>,
}

/// Chat message representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: ChatRole,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub agent: Option<String>,
    pub streaming: Option<bool>,
    pub metadata: Option<ChatMessageMetadata>,
}

impl ChatMessage {
    pub fn new(role: ChatRole, content: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            role,
            content,
            timestamp: Utc::now(),
            agent: None,
            streaming: None,
            metadata: None,
        }
    }

    pub fn with_agent(mut self, agent: String) -> Self {
        self.agent = Some(agent);
        self
    }

    pub fn with_metadata(mut self, metadata: ChatMessageMetadata) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Agent status for chat system
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChatAgentStatus {
    Idle,
    Thinking,
    Working,
    Error,
}

impl std::fmt::Display for ChatAgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatAgentStatus::Idle => write!(f, "idle"),
            ChatAgentStatus::Thinking => write!(f, "thinking"),
            ChatAgentStatus::Working => write!(f, "working"),
            ChatAgentStatus::Error => write!(f, "error"),
        }
    }
}

/// Agent information for chat
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub capabilities: Vec<String>,
    pub status: ChatAgentStatus,
    pub current_task: Option<String>,
}

impl AgentInfo {
    pub fn new(id: String, name: String, description: String) -> Self {
        Self {
            id,
            name,
            description,
            capabilities: Vec::new(),
            status: ChatAgentStatus::Idle,
            current_task: None,
        }
    }
}

/// Code block representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeBlock {
    pub language: String,
    pub code: String,
    pub file_name: Option<String>,
    pub start_line: Option<u32>,
    pub end_line: Option<u32>,
}

impl CodeBlock {
    pub fn new(language: String, code: String) -> Self {
        Self {
            language,
            code,
            file_name: None,
            start_line: None,
            end_line: None,
        }
    }

    pub fn with_file_info(mut self, file_name: String, start_line: u32, end_line: u32) -> Self {
        self.file_name = Some(file_name);
        self.start_line = Some(start_line);
        self.end_line = Some(end_line);
        self
    }
}

/// Diff change type
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiffChangeType {
    Added,
    Removed,
    Unchanged,
}

impl std::fmt::Display for DiffChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DiffChangeType::Added => write!(f, "added"),
            DiffChangeType::Removed => write!(f, "removed"),
            DiffChangeType::Unchanged => write!(f, "unchanged"),
        }
    }
}

/// Diff change representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffChange {
    pub change_type: DiffChangeType,
    pub line_number: u32,
    pub content: String,
}

/// Diff result representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub original: String,
    pub modified: String,
    pub file_name: String,
    pub changes: Vec<DiffChange>,
}

impl DiffResult {
    pub fn new(original: String, modified: String, file_name: String) -> Self {
        Self {
            original,
            modified,
            file_name,
            changes: Vec::new(),
        }
    }

    pub fn add_change(&mut self, change: DiffChange) {
        self.changes.push(change);
    }
}

/// Chat session representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub messages: Vec<ChatMessage>,
    pub created_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
    pub working_directory: String,
    pub selected_files: Vec<String>,
}

impl ChatSession {
    pub fn new(title: String, working_directory: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            messages: Vec::new(),
            created_at: now,
            last_activity: now,
            working_directory,
            selected_files: Vec::new(),
        }
    }

    pub fn add_message(&mut self, message: ChatMessage) {
        self.messages.push(message);
        self.last_activity = Utc::now();
    }

    pub fn add_selected_file(&mut self, file_path: String) {
        if !self.selected_files.contains(&file_path) {
            self.selected_files.push(file_path);
        }
    }

    pub fn remove_selected_file(&mut self, file_path: &str) {
        self.selected_files.retain(|f| f != file_path);
    }
}

/// Command suggestion category
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CommandCategory {
    File,
    Chat,
    Ai,
    System,
}

impl std::fmt::Display for CommandCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandCategory::File => write!(f, "file"),
            CommandCategory::Chat => write!(f, "chat"),
            CommandCategory::Ai => write!(f, "ai"),
            CommandCategory::System => write!(f, "system"),
        }
    }
}

/// Command suggestion representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandSuggestion {
    pub command: String,
    pub description: String,
    pub args: Option<Vec<String>>,
    pub category: CommandCategory,
}

impl CommandSuggestion {
    pub fn new(command: String, description: String, category: CommandCategory) -> Self {
        Self {
            command,
            description,
            args: None,
            category,
        }
    }

    pub fn with_args(mut self, args: Vec<String>) -> Self {
        self.args = Some(args);
        self
    }
}