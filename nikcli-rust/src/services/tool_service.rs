/*!
 * Tool Service
 * Registry and execution management for tools
 */

use anyhow::{Context, Result};
use async_trait::async_trait;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::types::{Tool, ToolCall, ToolResult, ToolCategory};

/// Tool execution context
#[derive(Debug, Clone)]
pub struct ToolContext {
    pub working_directory: String,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub permissions: Vec<String>,
}

/// Tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub category: ToolCategory,
    pub parameters: Value,
    pub requires_confirmation: bool,
    pub dangerous: bool,
}

/// Tool Service for managing and executing tools
pub struct ToolService {
    tools: Arc<DashMap<String, ToolDefinition>>,
    working_directory: Arc<RwLock<String>>,
    initialized: Arc<RwLock<bool>>,
}

impl ToolService {
    /// Create a new ToolService
    pub fn new() -> Self {
        Self {
            tools: Arc::new(DashMap::new()),
            working_directory: Arc::new(RwLock::new(std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string())),
            initialized: Arc::new(RwLock::new(false)),
        }
    }
    
    /// Initialize the service
    pub async fn initialize(&self) -> Result<()> {
        let mut init = self.initialized.write().await;
        if *init {
            return Ok(());
        }
        
        // Register default tools
        self.register_default_tools().await?;
        
        *init = true;
        Ok(())
    }
    
    /// Register default tools
    async fn register_default_tools(&self) -> Result<()> {
        // File Tools
        self.register_tool(ToolDefinition {
            name: "read_file".to_string(),
            description: "Read contents of a file".to_string(),
            category: ToolCategory::File,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to read"
                    }
                },
                "required": ["path"]
            }),
            requires_confirmation: false,
            dangerous: false,
        }).await?;
        
        self.register_tool(ToolDefinition {
            name: "write_file".to_string(),
            description: "Write contents to a file".to_string(),
            category: ToolCategory::File,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to write"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }),
            requires_confirmation: true,
            dangerous: false,
        }).await?;
        
        // Command Tools
        self.register_tool(ToolDefinition {
            name: "run_command".to_string(),
            description: "Execute a shell command".to_string(),
            category: ToolCategory::System,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Command to execute"
                    },
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Command arguments"
                    }
                },
                "required": ["command"]
            }),
            requires_confirmation: true,
            dangerous: true,
        }).await?;
        
        // Git Tools
        self.register_tool(ToolDefinition {
            name: "git_status".to_string(),
            description: "Get git repository status".to_string(),
            category: ToolCategory::Git,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {}
            }),
            requires_confirmation: false,
            dangerous: false,
        }).await?;
        
        // Search Tools
        self.register_tool(ToolDefinition {
            name: "grep".to_string(),
            description: "Search for text patterns in files".to_string(),
            category: ToolCategory::Search,
            parameters: serde_json::json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Pattern to search for"
                    },
                    "path": {
                        "type": "string",
                        "description": "Path to search in"
                    }
                },
                "required": ["pattern"]
            }),
            requires_confirmation: false,
            dangerous: false,
        }).await?;
        
        Ok(())
    }
    
    /// Register a new tool
    pub async fn register_tool(&self, tool: ToolDefinition) -> Result<()> {
        self.tools.insert(tool.name.clone(), tool);
        Ok(())
    }
    
    /// Unregister a tool
    pub async fn unregister_tool(&self, name: &str) -> Result<()> {
        self.tools.remove(name)
            .context("Tool not found")?;
        Ok(())
    }
    
    /// Get tool definition
    pub async fn get_tool(&self, name: &str) -> Option<ToolDefinition> {
        self.tools.get(name).map(|t| t.clone())
    }
    
    /// List all available tools
    pub async fn list_tools(&self) -> Vec<ToolDefinition> {
        self.tools.iter().map(|entry| entry.value().clone()).collect()
    }
    
    /// List tools by category
    pub async fn list_tools_by_category(&self, category: ToolCategory) -> Vec<ToolDefinition> {
        self.tools
            .iter()
            .filter(|entry| entry.category == category)
            .map(|entry| entry.value().clone())
            .collect()
    }
    
    /// Execute a tool
    pub async fn execute_tool(
        &self,
        tool_call: ToolCall,
        context: ToolContext,
    ) -> Result<ToolResult> {
        // Get tool definition
        let tool_def = self.get_tool(&tool_call.name).await
            .context("Tool not found")?;
        
        // Check if confirmation is required
        if tool_def.requires_confirmation {
            // In production, implement actual confirmation UI
            tracing::warn!("Tool {} requires confirmation", tool_call.name);
        }
        
        // Validate permissions
        if tool_def.dangerous && !context.permissions.contains(&"dangerous_tools".to_string()) {
            anyhow::bail!("Permission denied: dangerous tool execution not allowed");
        }
        
        // Start timing - PRODUCTION READY
        let start_time = std::time::Instant::now();
        
        // Execute tool based on type
        let result = match tool_call.name.as_str() {
            "read_file" => self.execute_read_file(&tool_call.arguments).await?,
            "write_file" => self.execute_write_file(&tool_call.arguments).await?,
            "run_command" => self.execute_run_command(&tool_call.arguments).await?,
            "git_status" => self.execute_git_status().await?,
            "grep" => self.execute_grep(&tool_call.arguments).await?,
            _ => anyhow::bail!("Tool not implemented: {}", tool_call.name),
        };
        
        // Calculate execution time - PRODUCTION READY
        let execution_time_ms = start_time.elapsed().as_millis() as u64;
        
        tracing::debug!("Tool {} executed in {}ms", tool_call.name, execution_time_ms);
        
        Ok(ToolResult {
            tool_call_id: tool_call.id.clone(),
            output: result,
            error: None,
            execution_time_ms,
        })
    }
    
    /// Execute read_file tool
    async fn execute_read_file(&self, args: &Value) -> Result<String> {
        let path = args.get("path")
            .and_then(|v| v.as_str())
            .context("Missing 'path' argument")?;
        
        let content = tokio::fs::read_to_string(path).await
            .context("Failed to read file")?;
        
        Ok(content)
    }
    
    /// Execute write_file tool
    async fn execute_write_file(&self, args: &Value) -> Result<String> {
        let path = args.get("path")
            .and_then(|v| v.as_str())
            .context("Missing 'path' argument")?;
        
        let content = args.get("content")
            .and_then(|v| v.as_str())
            .context("Missing 'content' argument")?;
        
        tokio::fs::write(path, content).await
            .context("Failed to write file")?;
        
        Ok(format!("File written successfully: {}", path))
    }
    
    /// Execute run_command tool
    async fn execute_run_command(&self, args: &Value) -> Result<String> {
        let command = args.get("command")
            .and_then(|v| v.as_str())
            .context("Missing 'command' argument")?;
        
        let args_array = args.get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        
        let output = tokio::process::Command::new(command)
            .args(args_array)
            .current_dir(self.working_directory.read().await.as_str())
            .output()
            .await
            .context("Failed to execute command")?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            anyhow::bail!("Command failed: {}", String::from_utf8_lossy(&output.stderr))
        }
    }
    
    /// Execute git_status tool
    async fn execute_git_status(&self) -> Result<String> {
        let output = tokio::process::Command::new("git")
            .arg("status")
            .arg("--short")
            .current_dir(self.working_directory.read().await.as_str())
            .output()
            .await
            .context("Failed to execute git status")?;
        
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
    
    /// Execute grep tool
    async fn execute_grep(&self, args: &Value) -> Result<String> {
        let pattern = args.get("pattern")
            .and_then(|v| v.as_str())
            .context("Missing 'pattern' argument")?;
        
        let path = args.get("path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");
        
        let output = tokio::process::Command::new("grep")
            .arg("-r")
            .arg(pattern)
            .arg(path)
            .current_dir(self.working_directory.read().await.as_str())
            .output()
            .await
            .context("Failed to execute grep")?;
        
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
    
    /// Set working directory
    pub async fn set_working_directory(&self, dir: String) {
        let mut working_dir = self.working_directory.write().await;
        *working_dir = dir;
    }
    
    /// Get working directory
    pub async fn get_working_directory(&self) -> String {
        self.working_directory.read().await.clone()
    }
    
    /// Get available tools count
    pub async fn get_tools_count(&self) -> usize {
        self.tools.len()
    }
}

impl Default for ToolService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_tool_service_creation() {
        let service = ToolService::new();
        service.initialize().await.unwrap();
        
        let tools = service.list_tools().await;
        assert!(!tools.is_empty());
    }
    
    #[tokio::test]
    async fn test_tool_registration() {
        let service = ToolService::new();
        
        let tool = ToolDefinition {
            name: "test_tool".to_string(),
            description: "Test tool".to_string(),
            category: ToolCategory::Custom,
            parameters: serde_json::json!({}),
            requires_confirmation: false,
            dangerous: false,
        };
        
        service.register_tool(tool).await.unwrap();
        
        assert!(service.get_tool("test_tool").await.is_some());
    }
}

