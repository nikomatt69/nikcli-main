use crate::core::types::*;
use crate::error::NikCliResult;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Tool trait for all tools
#[async_trait::async_trait]
pub trait Tool: Send + Sync {
    /// Get tool name
    fn get_name(&self) -> &str;
    
    /// Get tool description
    fn get_description(&self) -> &str;
    
    /// Get tool version
    fn get_version(&self) -> &str;
    
    /// Get tool configuration
    fn get_config(&self) -> &ToolConfig;
    
    /// Execute the tool
    async fn execute(&self, parameters: HashMap<String, serde_json::Value>) -> NikCliResult<ToolExecutionResult>;
    
    /// Validate parameters
    async fn validate_parameters(&self, parameters: &HashMap<String, serde_json::Value>) -> NikCliResult<ValidationResult>;
    
    /// Get tool status
    async fn get_status(&self) -> ToolStatus;
}

/// Tool status
#[derive(Debug, Clone, PartialEq)]
pub enum ToolStatus {
    Available,
    Busy,
    Error,
    Unavailable,
}

impl std::fmt::Display for ToolStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ToolStatus::Available => write!(f, "available"),
            ToolStatus::Busy => write!(f, "busy"),
            ToolStatus::Error => write!(f, "error"),
            ToolStatus::Unavailable => write!(f, "unavailable"),
        }
    }
}

/// Tool router for managing and routing tool executions
pub struct ToolRouter {
    tools: Arc<RwLock<HashMap<String, Arc<dyn Tool>>>>,
    tool_registry: Arc<RwLock<HashMap<String, ToolRegistryEntry>>>,
    execution_history: Arc<RwLock<Vec<ToolExecutionResult>>>,
    metrics: Arc<RwLock<HashMap<String, ToolMetrics>>>,
    max_concurrent_executions: u32,
    execution_timeout: u64,
}

/// Tool registry entry
#[derive(Debug, Clone)]
pub struct ToolRegistryEntry {
    pub config: ToolConfig,
    pub is_enabled: bool,
    pub usage_count: u64,
    pub success_rate: f64,
    pub average_execution_time: f64,
    pub last_used: Option<chrono::DateTime<chrono::Utc>>,
}

/// Tool metrics
#[derive(Debug, Clone)]
pub struct ToolMetrics {
    pub tool_name: String,
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub average_execution_time_ms: f64,
    pub success_rate: f64,
    pub last_execution: Option<chrono::DateTime<chrono::Utc>>,
    pub custom_metrics: HashMap<String, f64>,
}

impl ToolRouter {
    /// Create a new tool router
    pub fn new() -> Self {
        Self {
            tools: Arc::new(RwLock::new(HashMap::new())),
            tool_registry: Arc::new(RwLock::new(HashMap::new())),
            execution_history: Arc::new(RwLock::new(Vec::new())),
            metrics: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent_executions: 50,
            execution_timeout: 300, // 5 minutes
        }
    }
    
    /// Register a tool
    pub async fn register_tool(&self, tool: Arc<dyn Tool>) -> NikCliResult<()> {
        let tool_name = tool.get_name().to_string();
        
        info!("Registering tool: {}", tool_name);
        
        // Create registry entry
        let registry_entry = ToolRegistryEntry {
            config: tool.get_config().clone(),
            is_enabled: true,
            usage_count: 0,
            success_rate: 0.0,
            average_execution_time: 0.0,
            last_used: None,
        };
        
        // Store tool
        {
            let mut tools = self.tools.write().await;
            tools.insert(tool_name.clone(), tool);
        }
        
        // Store registry entry
        {
            let mut registry = self.tool_registry.write().await;
            registry.insert(tool_name.clone(), registry_entry);
        }
        
        // Initialize metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.insert(tool_name.clone(), ToolMetrics {
                tool_name: tool_name.clone(),
                total_executions: 0,
                successful_executions: 0,
                failed_executions: 0,
                average_execution_time_ms: 0.0,
                success_rate: 0.0,
                last_execution: None,
                custom_metrics: HashMap::new(),
            });
        }
        
        info!("Tool registered successfully: {}", tool_name);
        Ok(())
    }
    
    /// Execute a tool
    pub async fn execute_tool(&self, tool_name: &str, parameters: HashMap<String, serde_json::Value>) -> NikCliResult<ToolExecutionResult> {
        let start_time = std::time::Instant::now();
        
        // Get tool
        let tool = {
            let tools = self.tools.read().await;
            tools.get(tool_name).cloned()
        };
        
        let tool = tool.ok_or_else(|| crate::error::NikCliError::NotFound(format!("Tool {} not found", tool_name)))?;
        
        // Check if tool is enabled
        {
            let registry = self.tool_registry.read().await;
            if let Some(entry) = registry.get(tool_name) {
                if !entry.is_enabled {
                    return Err(crate::error::NikCliError::Disabled(format!("Tool {} is disabled", tool_name)));
                }
            }
        }
        
        // Validate parameters
        let validation_result = tool.validate_parameters(&parameters).await?;
        if !validation_result.success {
            return Err(crate::error::NikCliError::Validation(format!("Parameter validation failed: {:?}", validation_result.errors)));
        }
        
        // Execute tool with timeout
        let execution_result = tokio::time::timeout(
            std::time::Duration::from_secs(self.execution_timeout),
            tool.execute(parameters)
        ).await;
        
        let result = match execution_result {
            Ok(result) => result,
            Err(_) => ToolExecutionResult {
                tool_name: tool_name.to_string(),
                success: false,
                result: None,
                error: Some("Tool execution timeout".to_string()),
                execution_time_ms: self.execution_timeout * 1000,
                metadata: HashMap::new(),
            }
        };
        
        let execution_time = start_time.elapsed().as_millis() as u64;
        
        // Update execution time
        let mut final_result = result;
        final_result.execution_time_ms = execution_time;
        
        // Store in history
        {
            let mut history = self.execution_history.write().await;
            history.push(final_result.clone());
            
            // Keep only last 1000 executions
            if history.len() > 1000 {
                history.remove(0);
            }
        }
        
        // Update metrics
        self.update_tool_metrics(tool_name, &final_result).await;
        
        // Update registry
        self.update_tool_registry(tool_name, &final_result).await;
        
        debug!("Tool executed: {} ({}ms, success: {})", tool_name, execution_time, final_result.success);
        Ok(final_result)
    }
    
    /// Update tool metrics
    async fn update_tool_metrics(&self, tool_name: &str, result: &ToolExecutionResult) {
        let mut metrics = self.metrics.write().await;
        if let Some(tool_metrics) = metrics.get_mut(tool_name) {
            tool_metrics.total_executions += 1;
            tool_metrics.last_execution = Some(chrono::Utc::now());
            
            if result.success {
                tool_metrics.successful_executions += 1;
            } else {
                tool_metrics.failed_executions += 1;
            }
            
            // Update success rate
            if tool_metrics.total_executions > 0 {
                tool_metrics.success_rate = tool_metrics.successful_executions as f64 / tool_metrics.total_executions as f64;
            }
            
            // Update average execution time
            let total_time = tool_metrics.average_execution_time_ms * (tool_metrics.total_executions - 1) as f64 + result.execution_time_ms as f64;
            tool_metrics.average_execution_time_ms = total_time / tool_metrics.total_executions as f64;
        }
    }
    
    /// Update tool registry
    async fn update_tool_registry(&self, tool_name: &str, result: &ToolExecutionResult) {
        let mut registry = self.tool_registry.write().await;
        if let Some(entry) = registry.get_mut(tool_name) {
            entry.usage_count += 1;
            entry.last_used = Some(chrono::Utc::now());
            
            if result.success {
                // Update success rate
                if entry.usage_count > 0 {
                    let current_successes = (entry.success_rate * (entry.usage_count - 1) as f64) as u64 + 1;
                    entry.success_rate = current_successes as f64 / entry.usage_count as f64;
                }
            } else {
                // Update success rate
                if entry.usage_count > 0 {
                    let current_successes = (entry.success_rate * (entry.usage_count - 1) as f64) as u64;
                    entry.success_rate = current_successes as f64 / entry.usage_count as f64;
                }
            }
            
            // Update average execution time
            let total_time = entry.average_execution_time * (entry.usage_count - 1) as f64 + result.execution_time_ms as f64;
            entry.average_execution_time = total_time / entry.usage_count as f64;
        }
    }
    
    /// Get tool by name
    pub async fn get_tool(&self, tool_name: &str) -> Option<Arc<dyn Tool>> {
        let tools = self.tools.read().await;
        tools.get(tool_name).cloned()
    }
    
    /// Get all tools
    pub async fn get_all_tools(&self) -> HashMap<String, Arc<dyn Tool>> {
        let tools = self.tools.read().await;
        tools.clone()
    }
    
    /// Get tool registry
    pub async fn get_tool_registry(&self) -> HashMap<String, ToolRegistryEntry> {
        let registry = self.tool_registry.read().await;
        registry.clone()
    }
    
    /// Get tool metrics
    pub async fn get_tool_metrics(&self, tool_name: &str) -> Option<ToolMetrics> {
        let metrics = self.metrics.read().await;
        metrics.get(tool_name).cloned()
    }
    
    /// Get all tool metrics
    pub async fn get_all_metrics(&self) -> HashMap<String, ToolMetrics> {
        let metrics = self.metrics.read().await;
        metrics.clone()
    }
    
    /// Get execution history
    pub async fn get_execution_history(&self, limit: Option<usize>) -> Vec<ToolExecutionResult> {
        let history = self.execution_history.read().await;
        let limit = limit.unwrap_or(100);
        
        if history.len() <= limit {
            history.clone()
        } else {
            history[history.len() - limit..].to_vec()
        }
    }
    
    /// Search tools by capability
    pub async fn search_tools(&self, query: &str) -> Vec<String> {
        let tools = self.tools.read().await;
        let mut results = Vec::new();
        
        for (name, tool) in tools.iter() {
            if name.to_lowercase().contains(&query.to_lowercase()) ||
               tool.get_description().to_lowercase().contains(&query.to_lowercase()) {
                results.push(name.clone());
            }
        }
        
        results
    }
    
    /// Enable/disable tool
    pub async fn set_tool_enabled(&self, tool_name: &str, enabled: bool) -> NikCliResult<bool> {
        let mut registry = self.tool_registry.write().await;
        if let Some(entry) = registry.get_mut(tool_name) {
            entry.is_enabled = enabled;
            info!("Tool {} {}", tool_name, if enabled { "enabled" } else { "disabled" });
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    /// Unregister tool
    pub async fn unregister_tool(&self, tool_name: &str) -> NikCliResult<bool> {
        let mut removed = false;
        
        // Remove from tools
        {
            let mut tools = self.tools.write().await;
            removed = tools.remove(tool_name).is_some();
        }
        
        if removed {
            // Remove from registry
            {
                let mut registry = self.tool_registry.write().await;
                registry.remove(tool_name);
            }
            
            // Remove metrics
            {
                let mut metrics = self.metrics.write().await;
                metrics.remove(tool_name);
            }
            
            info!("Tool unregistered: {}", tool_name);
        }
        
        Ok(removed)
    }
    
    /// Get tool statistics
    pub async fn get_statistics(&self) -> ToolRouterStatistics {
        let tools = self.tools.read().await;
        let registry = self.tool_registry.read().await;
        let metrics = self.metrics.read().await;
        let history = self.execution_history.read().await;
        
        let total_tools = tools.len();
        let enabled_tools = registry.values().filter(|entry| entry.is_enabled).count();
        let total_executions: u64 = metrics.values().map(|m| m.total_executions).sum();
        let successful_executions: u64 = metrics.values().map(|m| m.successful_executions).sum();
        let failed_executions: u64 = metrics.values().map(|m| m.failed_executions).sum();
        
        let overall_success_rate = if total_executions > 0 {
            successful_executions as f64 / total_executions as f64
        } else {
            0.0
        };
        
        let average_execution_time = if !metrics.is_empty() {
            metrics.values().map(|m| m.average_execution_time_ms).sum::<f64>() / metrics.len() as f64
        } else {
            0.0
        };
        
        ToolRouterStatistics {
            total_tools,
            enabled_tools,
            total_executions,
            successful_executions,
            failed_executions,
            overall_success_rate,
            average_execution_time,
            history_size: history.len(),
        }
    }
    
    /// Clear execution history
    pub async fn clear_history(&self) -> NikCliResult<()> {
        let mut history = self.execution_history.write().await;
        history.clear();
        info!("Tool execution history cleared");
        Ok(())
    }
    
    /// Set execution timeout
    pub fn set_execution_timeout(&mut self, timeout_seconds: u64) {
        self.execution_timeout = timeout_seconds;
        info!("Tool execution timeout set to {} seconds", timeout_seconds);
    }
    
    /// Set max concurrent executions
    pub fn set_max_concurrent_executions(&mut self, max_executions: u32) {
        self.max_concurrent_executions = max_executions;
        info!("Max concurrent executions set to {}", max_executions);
    }
}

/// Tool router statistics
#[derive(Debug, Clone)]
pub struct ToolRouterStatistics {
    pub total_tools: usize,
    pub enabled_tools: usize,
    pub total_executions: u64,
    pub successful_executions: u64,
    pub failed_executions: u64,
    pub overall_success_rate: f64,
    pub average_execution_time: f64,
    pub history_size: usize,
}

impl Default for ToolRouter {
    fn default() -> Self {
        Self::new()
    }
}