use thiserror::Error;

/// Main error type for NikCLI
#[derive(Error, Debug)]
pub enum NikCliError {
    #[error("Configuration error: {0}")]
    Config(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
    
    #[error("TOML parsing error: {0}")]
    Toml(#[from] toml::de::Error),
    
    #[error("YAML parsing error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    
    #[error("HTTP request error: {0}")]
    Http(#[from] reqwest::Error),
    
    #[error("AI provider error: {0}")]
    AiProvider(String),
    
    #[error("Agent error: {0}")]
    Agent(String),
    
    #[error("Authentication error: {0}")]
    Auth(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("System requirement not met: {0}")]
    SystemRequirement(String),
    
    #[error("Operation cancelled by user")]
    Cancelled,
    
    #[error("Unknown error: {0}")]
    Unknown(String),
}

/// Result type alias for NikCLI operations
pub type NikCliResult<T> = Result<T, NikCliError>;

/// Extension trait for converting various error types to NikCliError
pub trait IntoNikCliError<T> {
    fn into_nikcli_error(self, context: &str) -> NikCliResult<T>;
}

impl<T, E> IntoNikCliError<T> for Result<T, E>
where
    E: std::fmt::Display,
{
    fn into_nikcli_error(self, context: &str) -> NikCliResult<T> {
        self.map_err(|e| NikCliError::Unknown(format!("{}: {}", context, e)))
    }
}

/// Helper macro for creating configuration errors
#[macro_export]
macro_rules! config_error {
    ($msg:expr) => {
        NikCliError::Config($msg.to_string())
    };
    ($fmt:expr, $($arg:tt)*) => {
        NikCliError::Config(format!($fmt, $($arg)*))
    };
}

/// Helper macro for creating AI provider errors
#[macro_export]
macro_rules! ai_error {
    ($msg:expr) => {
        NikCliError::AiProvider($msg.to_string())
    };
    ($fmt:expr, $($arg:tt)*) => {
        NikCliError::AiProvider(format!($fmt, $($arg)*))
    };
}

/// Helper macro for creating agent errors
#[macro_export]
macro_rules! agent_error {
    ($msg:expr) => {
        NikCliError::Agent($msg.to_string())
    };
    ($fmt:expr, $($arg:tt)*) => {
        NikCliError::Agent(format!($fmt, $($arg)*))
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_error_display() {
        let error = NikCliError::Config("Test config error".to_string());
        assert!(error.to_string().contains("Configuration error"));
        assert!(error.to_string().contains("Test config error"));
    }
    
    #[test]
    fn test_error_conversion() {
        let io_error = std::io::Error::new(std::io::ErrorKind::NotFound, "File not found");
        let nikcli_error: NikCliError = io_error.into();
        assert!(matches!(nikcli_error, NikCliError::Io(_)));
    }
    
    #[test]
    fn test_macro_helpers() {
        let config_err = config_error!("Test message");
        assert!(matches!(config_err, NikCliError::Config(_)));
        
        let ai_err = ai_error!("Provider error: {}", "test");
        assert!(matches!(ai_err, NikCliError::AiProvider(_)));
        
        let agent_err = agent_error!("Agent failed");
        assert!(matches!(agent_err, NikCliError::Agent(_)));
    }
}