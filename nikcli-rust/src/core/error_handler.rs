/*!
 * Error Handler - Production Ready
 */

use thiserror::Error;

#[derive(Error, Debug)]
pub enum NikCLIError {
    #[error("Configuration error: {0}")]
    Configuration(String),
    
    #[error("Agent error: {0}")]
    Agent(String),
    
    #[error("Tool error: {0}")]
    Tool(String),
    
    #[error("Planning error: {0}")]
    Planning(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("AI provider error: {0}")]
    AIProvider(String),
    
    #[error("Unknown error: {0}")]
    Unknown(String),
}

pub struct ErrorHandler;

impl ErrorHandler {
    pub fn new() -> Self {
        Self
    }
    
    pub fn handle_error(&self, error: NikCLIError) -> String {
        match error {
            NikCLIError::Configuration(msg) => format!("⚙️  Configuration Error: {}", msg),
            NikCLIError::Agent(msg) => format!("🤖 Agent Error: {}", msg),
            NikCLIError::Tool(msg) => format!("🔧 Tool Error: {}", msg),
            NikCLIError::Planning(msg) => format!("📋 Planning Error: {}", msg),
            NikCLIError::Io(e) => format!("💾 IO Error: {}", e),
            NikCLIError::Serialization(e) => format!("📦 Serialization Error: {}", e),
            NikCLIError::AIProvider(msg) => format!("🤖 AI Provider Error: {}", msg),
            NikCLIError::Unknown(msg) => format!("❓ Unknown Error: {}", msg),
        }
    }
}

impl Default for ErrorHandler {
    fn default() -> Self {
        Self::new()
    }
}

