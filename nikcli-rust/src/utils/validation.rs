/*!
 * Validation Schemas and Helpers
 * Port of Zod validation from TypeScript to Rust using validator crate
 */

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use validator::Validate;

/// File path validation
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct FilePathSchema {
    #[validate(length(min = 1))]
    #[validate(custom(function = "validate_file_path"))]
    pub path: String,
}

fn validate_file_path(path: &str) -> Result<(), validator::ValidationError> {
    if path.contains("..") && !path.starts_with("./") {
        return Err(validator::ValidationError::new(
            "Invalid file path - must be relative to workspace",
        ));
    }
    if path.starts_with('/') && !path.starts_with("./") {
        return Err(validator::ValidationError::new(
            "Invalid file path - must be relative to workspace",
        ));
    }
    Ok(())
}

/// Agent creation command schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateAgentCommand {
    #[validate(length(min = 3, max = 90))]
    pub name: String,
    
    #[validate(length(min = 5, max = 200))]
    pub specialization: String,
    
    pub autonomy: Option<AgentAutonomy>,
    pub agent_type: Option<AgentType>,
}

lazy_static::lazy_static! {
    static ref AGENT_NAME_REGEX: regex::Regex = 
        regex::Regex::new(r"^[a-zA-Z0-9-]+$").unwrap();
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentAutonomy {
    Supervised,
    SemiAutonomous,
    FullyAutonomous,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Standard,
    Vm,
    Container,
}

/// Model selection schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ModelCommand {
    pub provider: Option<ModelProvider>,
    
    #[validate(length(min = 1))]
    pub model: String,
    
    #[validate(range(min = 0.0, max = 2.0))]
    pub temperature: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelProvider {
    Anthropic,
    OpenAI,
    Google,
    Ollama,
}

/// File operations schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct FileCommand {
    #[validate(nested)]
    pub path: FilePathSchema,
    
    pub content: Option<String>,
    
    #[serde(default = "default_true")]
    pub backup: bool,
    
    #[serde(default = "default_utf8")]
    pub encoding: String,
}

fn default_true() -> bool { true }
fn default_utf8() -> String { "utf8".to_string() }

/// Command execution schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ExecCommand {
    #[validate(length(min = 1))]
    pub command: String,
    
    #[validate(range(min = 1000, max = 300000))]
    #[serde(default = "default_timeout")]
    pub timeout: u64,
    
    pub cwd: Option<String>,
    
    #[serde(default)]
    pub approve: bool,
}

fn default_timeout() -> u64 { 30000 }

/// Session management schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct SessionCommand {
    pub action: SessionAction,
    pub session_id: Option<String>,
    
    #[validate(length(min = 1, max = 100))]
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionAction {
    New,
    List,
    Switch,
    Export,
    Delete,
}

/// Configuration schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct ConfigCommand {
    #[validate(length(min = 1))]
    pub key: String,
    
    pub value: Option<ConfigValue>,
    pub value_type: Option<ConfigType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ConfigValue {
    String(String),
    Number(f64),
    Boolean(bool),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigType {
    String,
    Number,
    Boolean,
}

/// Figma export schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct FigmaExportCommand {
    #[validate(length(min = 1))]
    pub file_id: String,
    
    #[serde(default = "default_png")]
    pub format: FigmaExportFormat,
    
    pub output_path: Option<String>,
    
    #[validate(range(min = 0.25, max = 4.0))]
    #[serde(default = "default_scale")]
    pub scale: f64,
}

fn default_png() -> FigmaExportFormat { FigmaExportFormat::Png }
fn default_scale() -> f64 { 1.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FigmaExportFormat {
    Png,
    Jpg,
    Svg,
    Pdf,
}

/// Figma code generation schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct FigmaCodeGenCommand {
    #[validate(length(min = 1))]
    pub file_id: String,
    
    #[serde(default = "default_react")]
    pub framework: FigmaFramework,
    
    #[serde(default = "default_shadcn")]
    pub library: FigmaLibrary,
    
    #[serde(default = "default_true")]
    pub typescript: bool,
}

fn default_react() -> FigmaFramework { FigmaFramework::React }
fn default_shadcn() -> FigmaLibrary { FigmaLibrary::Shadcn }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FigmaFramework {
    React,
    Vue,
    Svelte,
    Html,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FigmaLibrary {
    Shadcn,
    Chakra,
    Mantine,
    Custom,
}

/// Figma tokens schema
#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct FigmaTokensCommand {
    #[validate(length(min = 1))]
    pub file_id: String,
    
    #[serde(default = "default_json")]
    pub format: TokenFormat,
    
    #[serde(default = "default_true")]
    pub include_colors: bool,
    
    #[serde(default = "default_true")]
    pub include_typography: bool,
    
    #[serde(default = "default_true")]
    pub include_spacing: bool,
}

fn default_json() -> TokenFormat { TokenFormat::Json }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenFormat {
    Json,
    Css,
    Scss,
    TokensStudio,
}

/// Helper function to validate and parse command arguments
pub fn validate_command_args<T>(data: serde_json::Value, command_name: &str) -> Result<T>
where
    T: for<'de> Deserialize<'de> + Validate,
{
    let parsed: T = serde_json::from_value(data)
        .map_err(|e| anyhow!("Invalid arguments for /{}: {}", command_name, e))?;
    
    parsed.validate()
        .map_err(|e| anyhow!("Validation failed for /{}: {:?}", command_name, e))?;
    
    Ok(parsed)
}

/// Helper to parse key-value arguments from command line
pub fn parse_key_value_args(args: &[String]) -> HashMap<String, String> {
    let mut result = HashMap::new();
    let mut i = 0;
    
    while i < args.len() {
        if let (Some(key), Some(value)) = (args.get(i), args.get(i + 1)) {
            result.insert(key.clone(), value.clone());
            i += 2;
        } else {
            i += 1;
        }
    }
    
    result
}

/// Extract quoted argument from args array
pub fn extract_quoted(parts: &[String]) -> (String, Vec<String>) {
    if parts.is_empty() {
        return (String::new(), vec![]);
    }
    
    let first = &parts[0];
    let quote = if first.starts_with('"') {
        Some('"')
    } else if first.starts_with('\'') {
        Some('\'')
    } else {
        None
    };
    
    match quote {
        None => (first.clone(), parts[1..].to_vec()),
        Some(q) => {
            let mut collected = vec![first.trim_start_matches(q).to_string()];
            
            for (i, token) in parts[1..].iter().enumerate() {
                if token.ends_with(q) {
                    collected.push(token.trim_end_matches(q).to_string());
                    return (
                        collected.join(" "),
                        parts[i + 2..].to_vec(),
                    );
                }
                collected.push(token.clone());
            }
            
            // No closing quote found, join everything
            (collected.join(" "), vec![])
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_key_value_args() {
        let args = vec![
            "key1".to_string(),
            "value1".to_string(),
            "key2".to_string(),
            "value2".to_string(),
        ];
        
        let result = parse_key_value_args(&args);
        assert_eq!(result.get("key1"), Some(&"value1".to_string()));
        assert_eq!(result.get("key2"), Some(&"value2".to_string()));
    }
    
    #[test]
    fn test_extract_quoted() {
        let args = vec![
            "\"hello".to_string(),
            "world\"".to_string(),
            "next".to_string(),
        ];
        
        let (value, rest) = extract_quoted(&args);
        assert_eq!(value, "hello world");
        assert_eq!(rest, vec!["next".to_string()]);
    }
    
    #[test]
    fn test_extract_quoted_no_quotes() {
        let args = vec!["simple".to_string(), "next".to_string()];
        let (value, rest) = extract_quoted(&args);
        assert_eq!(value, "simple");
        assert_eq!(rest, vec!["next".to_string()]);
    }
}
