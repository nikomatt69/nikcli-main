use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Base CLI Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CLIError {
    pub message: String,
    pub code: String,
    pub context: Option<std::collections::HashMap<String, serde_json::Value>>,
    pub timestamp: DateTime<Utc>,
}

impl CLIError {
    pub fn new(message: String, code: String) -> Self {
        Self {
            message,
            code,
            context: None,
            timestamp: Utc::now(),
        }
    }

    pub fn with_context(mut self, context: std::collections::HashMap<String, serde_json::Value>) -> Self {
        self.context = Some(context);
        self
    }
}

impl std::fmt::Display for CLIError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "CLIError [{}]: {}", self.code, self.message)
    }
}

impl std::error::Error for CLIError {}

/// Validation Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub cli_error: CLIError,
    pub field: Option<String>,
    pub value: Option<serde_json::Value>,
}

impl ValidationError {
    pub fn new(message: String, field: Option<String>, value: Option<serde_json::Value>) -> Self {
        let mut context = std::collections::HashMap::new();
        if let Some(field) = &field {
            context.insert("field".to_string(), serde_json::Value::String(field.clone()));
        }
        if let Some(value) = &value {
            context.insert("value".to_string(), value.clone());
        }

        Self {
            cli_error: CLIError::new(message, "VALIDATION_ERROR".to_string()).with_context(context),
            field,
            value,
        }
    }
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ValidationError: {}", self.cli_error.message)
    }
}

impl std::error::Error for ValidationError {}

/// Execution Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionError {
    pub cli_error: CLIError,
    pub exit_code: Option<i32>,
    pub command: Option<String>,
}

impl ExecutionError {
    pub fn new(message: String, command: Option<String>, exit_code: Option<i32>) -> Self {
        let mut context = std::collections::HashMap::new();
        if let Some(command) = &command {
            context.insert("command".to_string(), serde_json::Value::String(command.clone()));
        }
        if let Some(exit_code) = exit_code {
            context.insert("exit_code".to_string(), serde_json::Value::Number(exit_code.into()));
        }

        Self {
            cli_error: CLIError::new(message, "EXECUTION_ERROR".to_string()).with_context(context),
            exit_code,
            command,
        }
    }
}

impl std::fmt::Display for ExecutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ExecutionError: {}", self.cli_error.message)
    }
}

impl std::error::Error for ExecutionError {}

/// Configuration Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigurationError {
    pub cli_error: CLIError,
    pub config_key: Option<String>,
    pub value: Option<serde_json::Value>,
}

impl ConfigurationError {
    pub fn new(message: String, config_key: Option<String>, value: Option<serde_json::Value>) -> Self {
        let mut context = std::collections::HashMap::new();
        if let Some(config_key) = &config_key {
            context.insert("configKey".to_string(), serde_json::Value::String(config_key.clone()));
        }
        if let Some(value) = &value {
            context.insert("value".to_string(), value.clone());
        }

        Self {
            cli_error: CLIError::new(message, "CONFIGURATION_ERROR".to_string()).with_context(context),
            config_key,
            value,
        }
    }
}

impl std::fmt::Display for ConfigurationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ConfigurationError: {}", self.cli_error.message)
    }
}

impl std::error::Error for ConfigurationError {}

/// Network Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkError {
    pub cli_error: CLIError,
    pub status_code: Option<u16>,
    pub url: Option<String>,
}

impl NetworkError {
    pub fn new(message: String, status_code: Option<u16>, url: Option<String>) -> Self {
        let mut context = std::collections::HashMap::new();
        if let Some(status_code) = status_code {
            context.insert("statusCode".to_string(), serde_json::Value::Number(status_code.into()));
        }
        if let Some(url) = &url {
            context.insert("url".to_string(), serde_json::Value::String(url.clone()));
        }

        Self {
            cli_error: CLIError::new(message, "NETWORK_ERROR".to_string()).with_context(context),
            status_code,
            url,
        }
    }
}

impl std::fmt::Display for NetworkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "NetworkError: {}", self.cli_error.message)
    }
}

impl std::error::Error for NetworkError {}

/// Streaming Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingError {
    pub cli_error: CLIError,
    pub stream_id: Option<String>,
    pub model: Option<String>,
}

impl StreamingError {
    pub fn new(message: String, stream_id: Option<String>, model: Option<String>) -> Self {
        let mut context = std::collections::HashMap::new();
        if let Some(stream_id) = &stream_id {
            context.insert("streamId".to_string(), serde_json::Value::String(stream_id.clone()));
        }
        if let Some(model) = &model {
            context.insert("model".to_string(), serde_json::Value::String(model.clone()));
        }

        Self {
            cli_error: CLIError::new(message, "STREAMING_ERROR".to_string()).with_context(context),
            stream_id,
            model,
        }
    }
}

impl std::fmt::Display for StreamingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "StreamingError: {}", self.cli_error.message)
    }
}

impl std::error::Error for StreamingError {}

/// Agent Error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentError {
    pub cli_error: CLIError,
    pub agent_id: Option<String>,
    pub task_id: Option<String>,
}

impl AgentError {
    pub fn new(message: String, agent_id: Option<String>, task_id: Option<String>) -> Self {
        let mut context = std::collections::HashMap::new();
        if let Some(agent_id) = &agent_id {
            context.insert("agentId".to_string(), serde_json::Value::String(agent_id.clone()));
        }
        if let Some(task_id) = &task_id {
            context.insert("taskId".to_string(), serde_json::Value::String(task_id.clone()));
        }

        Self {
            cli_error: CLIError::new(message, "AGENT_ERROR".to_string()).with_context(context),
            agent_id,
            task_id,
        }
    }
}

impl std::fmt::Display for AgentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "AgentError: {}", self.cli_error.message)
    }
}

impl std::error::Error for AgentError {}

/// Error handler trait
pub trait ErrorHandler<T = ()> {
    fn can_handle(&self, error: &dyn std::error::Error) -> bool;
    fn handle(&self, error: &dyn std::error::Error, context: Option<T>) -> Result<(), Box<dyn std::error::Error>>;
    fn priority(&self) -> u32;
}

/// Error context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorContext {
    pub operation: String,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub metadata: Option<std::collections::HashMap<String, serde_json::Value>>,
}

impl ErrorContext {
    pub fn new(operation: String) -> Self {
        Self {
            operation,
            timestamp: Utc::now(),
            user_id: None,
            session_id: None,
            metadata: None,
        }
    }

    pub fn with_user_id(mut self, user_id: String) -> Self {
        self.user_id = Some(user_id);
        self
    }

    pub fn with_session_id(mut self, session_id: String) -> Self {
        self.session_id = Some(session_id);
        self
    }

    pub fn with_metadata(mut self, metadata: std::collections::HashMap<String, serde_json::Value>) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

/// Error recovery strategy trait
pub trait ErrorRecoveryStrategy {
    fn name(&self) -> &str;
    fn can_recover(&self, error: &CLIError) -> bool;
    fn recover(&self, error: &CLIError, context: &ErrorContext) -> Result<bool, Box<dyn std::error::Error>>;
}

/// System information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub platform: String,
    pub node_version: String,
    pub cli_version: String,
    pub working_directory: String,
    pub memory_usage: MemoryUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryUsage {
    pub rss: u64,
    pub heap_total: u64,
    pub heap_used: u64,
    pub external: u64,
    pub array_buffers: u64,
}

/// Error report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorReport {
    pub id: String,
    pub error: CLIError,
    pub context: ErrorContext,
    pub stack_trace: String,
    pub user_agent: Option<String>,
    pub system_info: Option<SystemInfo>,
    pub timestamp: DateTime<Utc>,
}

impl ErrorReport {
    pub fn new(error: CLIError, context: ErrorContext, stack_trace: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            error,
            context,
            stack_trace,
            user_agent: None,
            system_info: None,
            timestamp: Utc::now(),
        }
    }
}

/// Union type for all possible errors
#[derive(Debug)]
pub enum AnyError {
    CLI(CLIError),
    Validation(ValidationError),
    Execution(ExecutionError),
    Configuration(ConfigurationError),
    Network(NetworkError),
    Streaming(StreamingError),
    Agent(AgentError),
    Generic(Box<dyn std::error::Error + Send + Sync>),
}

impl std::fmt::Display for AnyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AnyError::CLI(err) => write!(f, "{}", err),
            AnyError::Validation(err) => write!(f, "{}", err),
            AnyError::Execution(err) => write!(f, "{}", err),
            AnyError::Configuration(err) => write!(f, "{}", err),
            AnyError::Network(err) => write!(f, "{}", err),
            AnyError::Streaming(err) => write!(f, "{}", err),
            AnyError::Agent(err) => write!(f, "{}", err),
            AnyError::Generic(err) => write!(f, "{}", err),
        }
    }
}

impl std::error::Error for AnyError {}

impl From<CLIError> for AnyError {
    fn from(err: CLIError) -> Self {
        AnyError::CLI(err)
    }
}

impl From<ValidationError> for AnyError {
    fn from(err: ValidationError) -> Self {
        AnyError::Validation(err)
    }
}

impl From<ExecutionError> for AnyError {
    fn from(err: ExecutionError) -> Self {
        AnyError::Execution(err)
    }
}

impl From<ConfigurationError> for AnyError {
    fn from(err: ConfigurationError) -> Self {
        AnyError::Configuration(err)
    }
}

impl From<NetworkError> for AnyError {
    fn from(err: NetworkError) -> Self {
        AnyError::Network(err)
    }
}

impl From<StreamingError> for AnyError {
    fn from(err: StreamingError) -> Self {
        AnyError::Streaming(err)
    }
}

impl From<AgentError> for AnyError {
    fn from(err: AgentError) -> Self {
        AnyError::Agent(err)
    }
}