use crate::ai::types::*;
use crate::ai::adaptive_router::AdaptiveModelRouter;
use crate::core::config::NikCliConfig;
use crate::error::NikCliResult;
use async_trait::async_trait;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Advanced AI provider with autonomous capabilities
pub struct AdvancedAiProvider {
    config: Arc<RwLock<NikCliConfig>>,
    model_router: AdaptiveModelRouter,
    tools: HashMap<String, AiTool>,
    context_cache: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    execution_history: Arc<RwLock<Vec<CommandExecutionResult>>>,
}

impl AdvancedAiProvider {
    /// Create a new advanced AI provider
    pub fn new(config: Arc<RwLock<NikCliConfig>>) -> Self {
        let model_router = AdaptiveModelRouter::new(config.clone());
        
        let mut tools = HashMap::new();
        
        // Register built-in tools
        tools.insert("execute_command".to_string(), AiTool {
            name: "execute_command".to_string(),
            description: "Execute shell commands safely".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Command to execute"},
                    "working_dir": {"type": "string", "description": "Working directory"},
                    "timeout": {"type": "number", "description": "Timeout in seconds"}
                },
                "required": ["command"]
            }),
            required: vec!["command".to_string()],
        });
        
        tools.insert("read_file".to_string(), AiTool {
            name: "read_file".to_string(),
            description: "Read file contents".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path to read"}
                },
                "required": ["path"]
            }),
            required: vec!["path".to_string()],
        });
        
        tools.insert("write_file".to_string(), AiTool {
            name: "write_file".to_string(),
            description: "Write content to file".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path to write"},
                    "content": {"type": "string", "description": "Content to write"},
                    "backup": {"type": "boolean", "description": "Create backup before writing"}
                },
                "required": ["path", "content"]
            }),
            required: vec!["path".to_string(), "content".to_string()],
        });
        
        tools.insert("search_packages".to_string(), AiTool {
            name: "search_packages".to_string(),
            description: "Search for packages in package registry".to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "registry": {"type": "string", "description": "Package registry (npm, cargo, pip)"}
                },
                "required": ["query"]
            }),
            required: vec!["query".to_string()],
        });
        
        Self {
            config,
            model_router,
            tools,
            context_cache: Arc::new(RwLock::new(HashMap::new())),
            execution_history: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    /// Stream chat with full autonomy
    pub async fn stream_chat_with_full_autonomy(
        &self,
        messages: Vec<ChatMessage>,
        abort_signal: Option<tokio::sync::oneshot::Receiver<()>>,
    ) -> impl tokio_stream::Stream<Item = StreamEvent> {
        let messages_clone = messages.clone();
        let tools_clone = self.tools.clone();
        let context_cache = self.context_cache.clone();
        let execution_history = self.execution_history.clone();
        
        tokio_stream::unfold((messages_clone, false), move |(msgs, completed)| async move {
            if completed {
                return None;
            }
            
            // Check abort signal
            if let Some(ref signal) = abort_signal {
                if signal.try_recv().is_ok() {
                    return Some((StreamEvent {
                        event_type: StreamEventType::Error,
                        content: None,
                        tool_name: None,
                        tool_args: None,
                        tool_result: None,
                        error: Some("Operation aborted".to_string()),
                        metadata: None,
                    }, (msgs, true)));
                }
            }
            
            // Start event
            if msgs.len() == 1 {
                return Some((StreamEvent {
                    event_type: StreamEventType::Start,
                    content: Some("Starting autonomous chat session".to_string()),
                    tool_name: None,
                    tool_args: None,
                    tool_result: None,
                    error: None,
                    metadata: None,
                }, (msgs, false)));
            }
            
            // Thinking event
            let thinking_event = StreamEvent {
                event_type: StreamEventType::Thinking,
                content: Some("Analyzing request and planning response".to_string()),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: None,
                metadata: None,
            };
            
            // Simulate tool calls
            let tool_calls = self.generate_tool_calls(&msgs).await;
            
            if !tool_calls.is_empty() {
                for tool_call in tool_calls {
                    // Tool call event
                    let tool_call_event = StreamEvent {
                        event_type: StreamEventType::ToolCall,
                        content: None,
                        tool_name: Some(tool_call.tool_name.clone()),
                        tool_args: Some(tool_call.arguments),
                        tool_result: None,
                        error: None,
                        metadata: None,
                    };
                    
                    // Execute tool
                    let tool_result = self.execute_tool(&tool_call).await;
                    
                    // Tool result event
                    let tool_result_event = StreamEvent {
                        event_type: StreamEventType::ToolResult,
                        content: Some(tool_result.content.clone()),
                        tool_name: Some(tool_call.tool_name),
                        tool_args: None,
                        tool_result: Some(json!({
                            "content": tool_result.content,
                            "is_error": tool_result.is_error
                        })),
                        error: if tool_result.is_error { Some(tool_result.content) } else { None },
                        metadata: None,
                    };
                    
                    return Some((tool_call_event, (msgs.clone(), false)));
                }
            }
            
            // Generate text response
            let response = self.generate_autonomous_response(&msgs).await;
            
            // Text delta event
            let text_event = StreamEvent {
                event_type: StreamEventType::TextDelta,
                content: Some(response),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: None,
                metadata: None,
            };
            
            // Complete event
            let complete_event = StreamEvent {
                event_type: StreamEventType::Complete,
                content: Some("Autonomous chat session completed".to_string()),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: None,
                metadata: None,
            };
            
            Some((complete_event, (msgs, true)))
        })
    }
    
    /// Execute autonomous task
    pub async fn execute_autonomous_task(
        &self,
        task: String,
        context: Option<serde_json::Value>,
    ) -> impl tokio_stream::Stream<Item = StreamEvent> {
        let task_clone = task.clone();
        let context_clone = context.clone();
        
        tokio_stream::unfold((task_clone, context_clone, false), move |(task, ctx, completed)| async move {
            if completed {
                return None;
            }
            
            // Start event
            let start_event = StreamEvent {
                event_type: StreamEventType::Start,
                content: Some(format!("Starting autonomous task: {}", task)),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: None,
                metadata: None,
            };
            
            // Thinking event
            let thinking_event = StreamEvent {
                event_type: StreamEventType::Thinking,
                content: Some("Analyzing task and creating execution plan".to_string()),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: None,
                metadata: None,
            };
            
            // Execute task steps
            let steps = self.plan_task_execution(&task, &ctx).await;
            
            for (i, step) in steps.iter().enumerate() {
                // Tool call event
                let tool_call_event = StreamEvent {
                    event_type: StreamEventType::ToolCall,
                    content: Some(format!("Executing step {}: {}", i + 1, step.description)),
                    tool_name: Some(step.command_type.to_string()),
                    tool_args: Some(json!({
                        "command": step.command,
                        "working_dir": step.working_dir,
                        "description": step.description
                    })),
                    tool_result: None,
                    error: None,
                    metadata: None,
                };
                
                // Execute command
                let result = self.execute_command_safely(step).await;
                
                // Tool result event
                let tool_result_event = StreamEvent {
                    event_type: StreamEventType::ToolResult,
                    content: Some(result.output.clone()),
                    tool_name: Some(step.command_type.to_string()),
                    tool_args: None,
                    tool_result: Some(json!({
                        "success": result.success,
                        "output": result.output,
                        "duration": result.duration
                    })),
                    error: if !result.success { Some(result.error.unwrap_or_default()) } else { None },
                    metadata: None,
                };
                
                return Some((tool_call_event, (task.clone(), ctx.clone(), false)));
            }
            
            // Complete event
            let complete_event = StreamEvent {
                event_type: StreamEventType::Complete,
                content: Some("Autonomous task execution completed".to_string()),
                tool_name: None,
                tool_args: None,
                tool_result: None,
                error: None,
                metadata: None,
            };
            
            Some((complete_event, (task, ctx, true)))
        })
    }
    
    /// Generate tool calls based on messages
    async fn generate_tool_calls(&self, messages: &[ChatMessage]) -> Vec<ToolCall> {
        let mut tool_calls = Vec::new();
        
        // Simple heuristic-based tool call generation
        if let Some(last_message) = messages.last() {
            let content = last_message.content.to_lowercase();
            
            if content.contains("run") || content.contains("execute") || content.contains("command") {
                tool_calls.push(ToolCall {
                    id: uuid::Uuid::new_v4().to_string(),
                    tool_name: "execute_command".to_string(),
                    arguments: json!({
                        "command": "echo 'Command execution simulated'",
                        "working_dir": ".",
                        "timeout": 30
                    }),
                });
            }
            
            if content.contains("read") || content.contains("file") {
                tool_calls.push(ToolCall {
                    id: uuid::Uuid::new_v4().to_string(),
                    tool_name: "read_file".to_string(),
                    arguments: json!({
                        "path": "README.md"
                    }),
                });
            }
            
            if content.contains("search") || content.contains("package") {
                tool_calls.push(ToolCall {
                    id: uuid::Uuid::new_v4().to_string(),
                    tool_name: "search_packages".to_string(),
                    arguments: json!({
                        "query": "rust",
                        "registry": "cargo"
                    }),
                });
            }
        }
        
        tool_calls
    }
    
    /// Execute tool call
    async fn execute_tool(&self, tool_call: &ToolCall) -> ToolResult {
        match tool_call.tool_name.as_str() {
            "execute_command" => {
                let command = tool_call.arguments["command"].as_str().unwrap_or("");
                let working_dir = tool_call.arguments["working_dir"].as_str().unwrap_or(".");
                let timeout = tool_call.arguments["timeout"].as_u64().unwrap_or(30);
                
                // Simulate command execution
                let output = format!("Executed command: {} in {}", command, working_dir);
                
                ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: output,
                    is_error: false,
                }
            }
            "read_file" => {
                let path = tool_call.arguments["path"].as_str().unwrap_or("");
                
                // Simulate file reading
                let content = format!("File content for: {}", path);
                
                ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content,
                    is_error: false,
                }
            }
            "write_file" => {
                let path = tool_call.arguments["path"].as_str().unwrap_or("");
                let content = tool_call.arguments["content"].as_str().unwrap_or("");
                
                // Simulate file writing
                let result = format!("Written {} bytes to {}", content.len(), path);
                
                ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: result,
                    is_error: false,
                }
            }
            "search_packages" => {
                let query = tool_call.arguments["query"].as_str().unwrap_or("");
                let registry = tool_call.arguments["registry"].as_str().unwrap_or("npm");
                
                // Simulate package search
                let results = json!([
                    {
                        "name": format!("{}-example", query),
                        "version": "1.0.0",
                        "description": format!("Example package for {}", query),
                        "downloads": 1000,
                        "verified": true
                    }
                ]);
                
                ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: results.to_string(),
                    is_error: false,
                }
            }
            _ => {
                ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    content: format!("Unknown tool: {}", tool_call.tool_name),
                    is_error: true,
                }
            }
        }
    }
    
    /// Generate autonomous response
    async fn generate_autonomous_response(&self, messages: &[ChatMessage]) -> String {
        // Simple response generation - in reality this would use the AI model
        if let Some(last_message) = messages.last() {
            format!("I understand you want me to help with: {}. I'll analyze this and provide assistance.", last_message.content)
        } else {
            "Hello! I'm ready to help you with your tasks.".to_string()
        }
    }
    
    /// Plan task execution
    async fn plan_task_execution(&self, task: &str, context: &Option<serde_json::Value>) -> Vec<Command> {
        let mut commands = Vec::new();
        
        // Simple task planning based on keywords
        let task_lower = task.to_lowercase();
        
        if task_lower.contains("create") && task_lower.contains("project") {
            commands.push(Command {
                command_type: CommandType::Npm,
                command: "npm init -y".to_string(),
                args: None,
                working_dir: None,
                description: "Initialize new project".to_string(),
                safety: SafetyLevel::Safe,
                requires_approval: false,
                estimated_duration: Some(5),
                dependencies: None,
                expected_output_pattern: None,
            });
        }
        
        if task_lower.contains("install") {
            commands.push(Command {
                command_type: CommandType::Npm,
                command: "npm install".to_string(),
                args: None,
                working_dir: None,
                description: "Install dependencies".to_string(),
                safety: SafetyLevel::Safe,
                requires_approval: false,
                estimated_duration: Some(30),
                dependencies: None,
                expected_output_pattern: None,
            });
        }
        
        if task_lower.contains("build") {
            commands.push(Command {
                command_type: CommandType::Build,
                command: "npm run build".to_string(),
                args: None,
                working_dir: None,
                description: "Build project".to_string(),
                safety: SafetyLevel::Safe,
                requires_approval: false,
                estimated_duration: Some(60),
                dependencies: None,
                expected_output_pattern: None,
            });
        }
        
        if commands.is_empty() {
            // Default command
            commands.push(Command {
                command_type: CommandType::Bash,
                command: "echo 'Task completed'".to_string(),
                args: None,
                working_dir: None,
                description: "Default task completion".to_string(),
                safety: SafetyLevel::Safe,
                requires_approval: false,
                estimated_duration: Some(1),
                dependencies: None,
                expected_output_pattern: None,
            });
        }
        
        commands
    }
    
    /// Execute command safely
    async fn execute_command_safely(&self, command: &Command) -> CommandExecutionResult {
        let start_time = std::time::Instant::now();
        
        // Simulate command execution
        let success = command.safety != SafetyLevel::Risky;
        let output = if success {
            format!("Successfully executed: {}", command.command)
        } else {
            "Command execution blocked due to safety concerns".to_string()
        };
        
        let duration = start_time.elapsed().as_millis() as u64;
        
        let result = CommandExecutionResult {
            success,
            output,
            error: if success { None } else { Some("Safety check failed".to_string()) },
            duration,
            command: command.clone(),
            timestamp: chrono::Utc::now(),
            workspace_state: Some(WorkspaceState {
                files_created: None,
                files_modified: None,
                packages_installed: None,
            }),
        };
        
        // Store in execution history
        {
            let mut history = self.execution_history.write().await;
            history.push(result.clone());
            
            // Keep only last 100 executions
            if history.len() > 100 {
                history.remove(0);
            }
        }
        
        result
    }
    
    /// Get available tools
    pub fn get_available_tools(&self) -> &HashMap<String, AiTool> {
        &self.tools
    }
    
    /// Add custom tool
    pub fn add_tool(&mut self, name: String, tool: AiTool) {
        self.tools.insert(name, tool);
    }
    
    /// Get execution history
    pub async fn get_execution_history(&self) -> Vec<CommandExecutionResult> {
        self.execution_history.read().await.clone()
    }
    
    /// Clear execution history
    pub async fn clear_execution_history(&self) {
        let mut history = self.execution_history.write().await;
        history.clear();
    }
    
    /// Get context cache
    pub async fn get_context_cache(&self) -> HashMap<String, serde_json::Value> {
        self.context_cache.read().await.clone()
    }
    
    /// Set context cache entry
    pub async fn set_context_cache(&self, key: String, value: serde_json::Value) {
        let mut cache = self.context_cache.write().await;
        cache.insert(key, value);
    }
    
    /// Get model router
    pub fn get_model_router(&self) -> &AdaptiveModelRouter {
        &self.model_router
    }
}

#[async_trait]
impl crate::ai::types::AiProvider for AdvancedAiProvider {
    fn name(&self) -> &str {
        "advanced-ai-provider"
    }
    
    async fn is_available(&self) -> bool {
        self.model_router.get_routing_config().enabled
    }
    
    async fn generate_text(&self, options: GenerateOptions) -> NikCliResult<ModelResponse> {
        // Route to appropriate model
        let model_name = self.model_router.route_request(&options).await?;
        
        // Generate response using the selected model
        // This is a simplified implementation
        let response_text = format!("Generated response for model: {}", model_name);
        
        Ok(ModelResponse {
            text: response_text,
            usage: Some(TokenUsage {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
            }),
            finish_reason: Some(FinishReason::Stop),
            warnings: None,
        })
    }
    
    async fn stream_text(&self, options: GenerateOptions) -> NikCliResult<Box<dyn tokio_stream::Stream<Item = StreamEvent> + Send + Unpin>> {
        let stream = self.stream_chat_with_full_autonomy(options.messages, None).await;
        Ok(Box::new(stream))
    }
    
    async fn generate_structured<T>(&self, options: GenerateOptions, _schema: &T) -> NikCliResult<T>
    where
        T: serde::de::DeserializeOwned + Send + Sync,
    {
        // This would use the AI model to generate structured data
        // For now, return a default value
        Err(crate::error::NikCliError::NotImplemented("Structured generation not yet implemented".to_string()))
    }
    
    fn get_model_info(&self) -> ModelConfig {
        ModelConfig {
            provider: AiProvider::OpenAi,
            model: "gpt-4".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4000),
            api_key: None,
            base_url: None,
            timeout: Some(30000),
        }
    }
    
    fn get_stats(&self) -> AiCallStats {
        AiCallStats {
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
            total_tokens: 0,
            total_cost: 0.0,
            average_response_time: 0.0,
            last_call: None,
        }
    }
}