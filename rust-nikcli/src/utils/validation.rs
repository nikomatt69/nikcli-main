use crate::error::{NikCliError, NikCliResult};
use regex::Regex;
use std::path::Path;

/// Validation utilities for various input types
pub struct Validator;

impl Validator {
    /// Validate API key format
    pub fn validate_api_key(provider: &str, key: &str) -> NikCliResult<()> {
        if key.is_empty() {
            return Err(NikCliError::Validation("API key cannot be empty".to_string()));
        }
        
        match provider {
            "anthropic" => {
                if !key.starts_with("sk-ant-") {
                    return Err(NikCliError::Validation(
                        "Anthropic API key should start with 'sk-ant-'".to_string()
                    ));
                }
            }
            "openai" => {
                if !key.starts_with("sk-") {
                    return Err(NikCliError::Validation(
                        "OpenAI API key should start with 'sk-'".to_string()
                    ));
                }
            }
            "google" => {
                // Google API keys are typically longer and contain various characters
                if key.len() < 20 {
                    return Err(NikCliError::Validation(
                        "Google API key appears to be too short".to_string()
                    ));
                }
            }
            _ => {
                // Generic validation for other providers
                if key.len() < 10 {
                    return Err(NikCliError::Validation(
                        "API key appears to be too short".to_string()
                    ));
                }
            }
        }
        
        Ok(())
    }
    
    /// Validate model name
    pub fn validate_model_name(name: &str) -> NikCliResult<()> {
        if name.is_empty() {
            return Err(NikCliError::Validation("Model name cannot be empty".to_string()));
        }
        
        // Check for valid characters (alphanumeric, hyphens, underscores, colons)
        let re = Regex::new(r"^[a-zA-Z0-9\-_:]+$")
            .map_err(|e| NikCliError::Validation(format!("Invalid regex: {}", e)))?;
        
        if !re.is_match(name) {
            return Err(NikCliError::Validation(
                "Model name contains invalid characters. Only alphanumeric, hyphens, underscores, and colons are allowed.".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate temperature value
    pub fn validate_temperature(temp: f32) -> NikCliResult<()> {
        if temp < 0.0 || temp > 2.0 {
            return Err(NikCliError::Validation(
                "Temperature must be between 0.0 and 2.0".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate max tokens value
    pub fn validate_max_tokens(tokens: u32) -> NikCliResult<()> {
        if tokens == 0 {
            return Err(NikCliError::Validation(
                "Max tokens must be greater than 0".to_string()
            ));
        }
        
        if tokens > 100000 {
            return Err(NikCliError::Validation(
                "Max tokens cannot exceed 100,000".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate file path
    pub fn validate_file_path(path: &str) -> NikCliResult<()> {
        if path.is_empty() {
            return Err(NikCliError::Validation("File path cannot be empty".to_string()));
        }
        
        let path = Path::new(path);
        
        // Check if path is absolute or relative
        if !path.is_absolute() && !path.is_relative() {
            return Err(NikCliError::Validation(
                "Invalid file path format".to_string()
            ));
        }
        
        // Check for invalid characters in path
        let path_str = path.to_string_lossy();
        if path_str.contains('\0') {
            return Err(NikCliError::Validation(
                "File path contains null characters".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate directory path
    pub fn validate_directory_path(path: &str) -> NikCliResult<()> {
        Self::validate_file_path(path)?;
        
        let path = Path::new(path);
        
        // Check if it's a directory (if it exists)
        if path.exists() && !path.is_dir() {
            return Err(NikCliError::Validation(
                "Path exists but is not a directory".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate URL format
    pub fn validate_url(url: &str) -> NikCliResult<()> {
        if url.is_empty() {
            return Err(NikCliError::Validation("URL cannot be empty".to_string()));
        }
        
        let re = Regex::new(r"^https?://[^\s/$.?#].[^\s]*$")
            .map_err(|e| NikCliError::Validation(format!("Invalid regex: {}", e)))?;
        
        if !re.is_match(url) {
            return Err(NikCliError::Validation(
                "Invalid URL format".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate email format
    pub fn validate_email(email: &str) -> NikCliResult<()> {
        if email.is_empty() {
            return Err(NikCliError::Validation("Email cannot be empty".to_string()));
        }
        
        let re = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
            .map_err(|e| NikCliError::Validation(format!("Invalid regex: {}", e)))?;
        
        if !re.is_match(email) {
            return Err(NikCliError::Validation(
                "Invalid email format".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate JSON string
    pub fn validate_json(json: &str) -> NikCliResult<()> {
        if json.is_empty() {
            return Err(NikCliError::Validation("JSON cannot be empty".to_string()));
        }
        
        serde_json::from_str::<serde_json::Value>(json)
            .map_err(|e| NikCliError::Validation(format!("Invalid JSON: {}", e)))?;
        
        Ok(())
    }
    
    /// Validate configuration key
    pub fn validate_config_key(key: &str) -> NikCliResult<()> {
        if key.is_empty() {
            return Err(NikCliError::Validation("Configuration key cannot be empty".to_string()));
        }
        
        // Check for valid characters (alphanumeric, underscores, dots)
        let re = Regex::new(r"^[a-zA-Z0-9_.]+$")
            .map_err(|e| NikCliError::Validation(format!("Invalid regex: {}", e)))?;
        
        if !re.is_match(key) {
            return Err(NikCliError::Validation(
                "Configuration key contains invalid characters. Only alphanumeric, underscores, and dots are allowed.".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate agent name
    pub fn validate_agent_name(name: &str) -> NikCliResult<()> {
        if name.is_empty() {
            return Err(NikCliError::Validation("Agent name cannot be empty".to_string()));
        }
        
        // Check for valid characters (alphanumeric, hyphens, underscores)
        let re = Regex::new(r"^[a-zA-Z0-9\-_]+$")
            .map_err(|e| NikCliError::Validation(format!("Invalid regex: {}", e)))?;
        
        if !re.is_match(name) {
            return Err(NikCliError::Validation(
                "Agent name contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed.".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Validate report depth
    pub fn validate_report_depth(depth: u8) -> NikCliResult<()> {
        if depth == 0 || depth > 5 {
            return Err(NikCliError::Validation(
                "Report depth must be between 1 and 5".to_string()
            ));
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_api_key() {
        // Valid API keys
        assert!(Validator::validate_api_key("anthropic", "sk-ant-123").is_ok());
        assert!(Validator::validate_api_key("openai", "sk-123").is_ok());
        assert!(Validator::validate_api_key("google", "a-very-long-api-key-string").is_ok());
        
        // Invalid API keys
        assert!(Validator::validate_api_key("anthropic", "").is_err());
        assert!(Validator::validate_api_key("anthropic", "invalid").is_err());
        assert!(Validator::validate_api_key("openai", "invalid").is_err());
        assert!(Validator::validate_api_key("google", "short").is_err());
    }
    
    #[test]
    fn test_validate_model_name() {
        // Valid model names
        assert!(Validator::validate_model_name("claude-3-sonnet").is_ok());
        assert!(Validator::validate_model_name("gpt-4").is_ok());
        assert!(Validator::validate_model_name("llama3.1:8b").is_ok());
        assert!(Validator::validate_model_name("model_with_underscores").is_ok());
        
        // Invalid model names
        assert!(Validator::validate_model_name("").is_err());
        assert!(Validator::validate_model_name("model with spaces").is_err());
        assert!(Validator::validate_model_name("model@with#special").is_err());
    }
    
    #[test]
    fn test_validate_temperature() {
        // Valid temperatures
        assert!(Validator::validate_temperature(0.0).is_ok());
        assert!(Validator::validate_temperature(0.7).is_ok());
        assert!(Validator::validate_temperature(2.0).is_ok());
        
        // Invalid temperatures
        assert!(Validator::validate_temperature(-0.1).is_err());
        assert!(Validator::validate_temperature(2.1).is_err());
    }
    
    #[test]
    fn test_validate_max_tokens() {
        // Valid token counts
        assert!(Validator::validate_max_tokens(1).is_ok());
        assert!(Validator::validate_max_tokens(8000).is_ok());
        assert!(Validator::validate_max_tokens(100000).is_ok());
        
        // Invalid token counts
        assert!(Validator::validate_max_tokens(0).is_err());
        assert!(Validator::validate_max_tokens(100001).is_err());
    }
    
    #[test]
    fn test_validate_url() {
        // Valid URLs
        assert!(Validator::validate_url("https://example.com").is_ok());
        assert!(Validator::validate_url("http://localhost:3000").is_ok());
        
        // Invalid URLs
        assert!(Validator::validate_url("").is_err());
        assert!(Validator::validate_url("not-a-url").is_err());
        assert!(Validator::validate_url("ftp://example.com").is_err());
    }
    
    #[test]
    fn test_validate_email() {
        // Valid emails
        assert!(Validator::validate_email("user@example.com").is_ok());
        assert!(Validator::validate_email("test.email+tag@domain.co.uk").is_ok());
        
        // Invalid emails
        assert!(Validator::validate_email("").is_err());
        assert!(Validator::validate_email("not-an-email").is_err());
        assert!(Validator::validate_email("@example.com").is_err());
        assert!(Validator::validate_email("user@").is_err());
    }
    
    #[test]
    fn test_validate_json() {
        // Valid JSON
        assert!(Validator::validate_json("{}").is_ok());
        assert!(Validator::validate_json(r#"{"key": "value"}"#).is_ok());
        assert!(Validator::validate_json("[]").is_ok());
        
        // Invalid JSON
        assert!(Validator::validate_json("").is_err());
        assert!(Validator::validate_json("{invalid}").is_err());
        assert!(Validator::validate_json("not json").is_err());
    }
    
    #[test]
    fn test_validate_report_depth() {
        // Valid depths
        assert!(Validator::validate_report_depth(1).is_ok());
        assert!(Validator::validate_report_depth(3).is_ok());
        assert!(Validator::validate_report_depth(5).is_ok());
        
        // Invalid depths
        assert!(Validator::validate_report_depth(0).is_err());
        assert!(Validator::validate_report_depth(6).is_err());
    }
}