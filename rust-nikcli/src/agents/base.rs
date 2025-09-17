use crate::agents::types::*;
use crate::error::NikCliResult;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// Base trait for all agents
#[async_trait]
pub trait Agent: Send + Sync {
    /// Get agent information
    fn get_info(&self) -> &AgentConfig;
    
    /// Initialize the agent
    async fn initialize(&mut self) -> NikCliResult<()>;
    
    /// Run a task
    async fn run_task(&mut self, task: AgentTask) -> NikCliResult<AgentTaskResult>;
    
    /// Get current status
    fn get_status(&self) -> AgentStatus;
    
    /// Get current metrics
    fn get_metrics(&self) -> &AgentMetrics;
    
    /// Cleanup resources
    async fn cleanup(&mut self) -> NikCliResult<()>;
    
    /// Handle task cognition for advanced orchestration
    async fn analyze_task(&self, task: &str) -> NikCliResult<TaskCognition>;
    
    /// Get agent capabilities
    fn get_capabilities(&self) -> &[String];
    
    /// Check if agent can handle a specific capability
    fn can_handle(&self, capability: &str) -> bool;
}

/// Base agent implementation
pub struct BaseAgent {
    pub config: AgentConfig,
    pub status: AgentStatus,
    pub metrics: AgentMetrics,
    pub context: AgentContext,
    pub current_task: Option<AgentTask>,
    pub task_sender: Option<mpsc::UnboundedSender<AgentTask>>,
    pub result_receiver: Option<mpsc::UnboundedReceiver<AgentTaskResult>>,
}

impl BaseAgent {
    /// Create a new base agent
    pub fn new(config: AgentConfig) -> Self {
        Self {
            config,
            status: AgentStatus::Idle,
            metrics: AgentMetrics {
                tasks_completed: 0,
                success_rate: 0.0,
                average_duration_ms: 0.0,
                total_tokens_used: 0,
                total_cost: 0.0,
                last_active: chrono::Utc::now(),
            },
            context: AgentContext {
                working_directory: std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                project_type: None,
                language: None,
                framework: None,
                dependencies: Vec::new(),
                environment_variables: HashMap::new(),
                user_preferences: HashMap::new(),
            },
            current_task: None,
            task_sender: None,
            result_receiver: None,
        }
    }
    
    /// Update agent status
    pub fn update_status(&mut self, status: AgentStatus) {
        self.status = status;
        self.metrics.last_active = chrono::Utc::now();
        debug!("Agent {} status updated to: {:?}", self.config.id, status);
    }
    
    /// Update metrics after task completion
    pub fn update_metrics(&mut self, result: &AgentTaskResult) {
        self.metrics.tasks_completed += 1;
        
        // Update success rate
        let total_tasks = self.metrics.tasks_completed as f64;
        let successful_tasks = if result.success {
            (self.metrics.success_rate * (total_tasks - 1.0)) + 1.0
        } else {
            self.metrics.success_rate * (total_tasks - 1.0)
        };
        self.metrics.success_rate = successful_tasks / total_tasks;
        
        // Update average duration
        let total_duration = self.metrics.average_duration_ms * (total_tasks - 1.0) + result.duration_ms as f64;
        self.metrics.average_duration_ms = total_duration / total_tasks;
        
        // Update token usage and cost
        self.metrics.total_tokens_used += result.metrics.total_tokens_used;
        self.metrics.total_cost += result.metrics.total_cost;
        
        self.metrics.last_active = chrono::Utc::now();
        
        info!("Agent {} metrics updated: {} tasks, {:.2}% success rate", 
              self.config.id, 
              self.metrics.tasks_completed,
              self.metrics.success_rate * 100.0);
    }
    
    /// Validate task against agent capabilities
    pub fn validate_task(&self, task: &AgentTask) -> NikCliResult<()> {
        // Check if agent is available
        if self.status != AgentStatus::Idle {
            return Err(crate::error::NikCliError::Agent(
                format!("Agent {} is not available (status: {:?})", self.config.id, self.status)
            ));
        }
        
        // Check permissions
        if !self.config.default_config.permissions.can_execute_commands && 
           task.description.contains("execute") {
            return Err(crate::error::NikCliError::Agent(
                "Agent does not have permission to execute commands".to_string()
            ));
        }
        
        // Check if agent can handle the task complexity
        if task.priority == TaskPriority::Critical && 
           self.config.default_config.autonomy_level == AutonomyLevel::Supervised {
            return Err(crate::error::NikCliError::Agent(
                "Supervised agent cannot handle critical tasks".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Create task cognition for advanced orchestration
    pub fn create_task_cognition(&self, task: &str) -> TaskCognition {
        let id = uuid::Uuid::new_v4().to_string();
        
        // Basic task analysis (can be enhanced with AI)
        let intent = self.analyze_intent(task);
        let entities = self.extract_entities(task);
        let complexity = self.estimate_complexity(task);
        let capabilities = self.identify_required_capabilities(task);
        
        TaskCognition {
            id,
            original_task: task.to_string(),
            normalized_task: task.to_lowercase(),
            intent,
            entities,
            dependencies: Vec::new(),
            contexts: vec![self.context.working_directory.clone()],
            estimated_complexity: complexity,
            required_capabilities: capabilities,
            suggested_agents: vec![self.config.id.clone()],
            risk_level: RiskLevel::Low,
            orchestration_plan: None,
        }
    }
    
    /// Analyze task intent
    fn analyze_intent(&self, task: &str) -> TaskIntent {
        let task_lower = task.to_lowercase();
        
        // Determine primary intent
        let primary = if task_lower.contains("create") || task_lower.contains("new") {
            PrimaryIntent::Create
        } else if task_lower.contains("read") || task_lower.contains("show") || task_lower.contains("list") {
            PrimaryIntent::Read
        } else if task_lower.contains("update") || task_lower.contains("modify") || task_lower.contains("edit") {
            PrimaryIntent::Update
        } else if task_lower.contains("delete") || task_lower.contains("remove") {
            PrimaryIntent::Delete
        } else if task_lower.contains("analyze") || task_lower.contains("review") {
            PrimaryIntent::Analyze
        } else if task_lower.contains("optimize") || task_lower.contains("improve") {
            PrimaryIntent::Optimize
        } else if task_lower.contains("deploy") || task_lower.contains("publish") {
            PrimaryIntent::Deploy
        } else if task_lower.contains("test") {
            PrimaryIntent::Test
        } else if task_lower.contains("debug") || task_lower.contains("fix") {
            PrimaryIntent::Debug
        } else if task_lower.contains("refactor") {
            PrimaryIntent::Refactor
        } else {
            PrimaryIntent::Create // Default
        };
        
        // Determine complexity
        let complexity = if task_lower.contains("simple") || task_lower.contains("basic") {
            ComplexityLevel::Low
        } else if task_lower.contains("complex") || task_lower.contains("advanced") {
            ComplexityLevel::High
        } else if task_lower.contains("critical") || task_lower.contains("urgent") {
            ComplexityLevel::Extreme
        } else {
            ComplexityLevel::Medium
        };
        
        // Determine urgency
        let urgency = if task_lower.contains("urgent") || task_lower.contains("asap") {
            UrgencyLevel::Critical
        } else if task_lower.contains("important") || task_lower.contains("priority") {
            UrgencyLevel::High
        } else if task_lower.contains("low") || task_lower.contains("when possible") {
            UrgencyLevel::Low
        } else {
            UrgencyLevel::Normal
        };
        
        TaskIntent {
            primary,
            secondary: Vec::new(),
            confidence: 0.8, // Default confidence
            complexity,
            urgency,
        }
    }
    
    /// Extract entities from task description
    fn extract_entities(&self, task: &str) -> Vec<TaskEntity> {
        let mut entities = Vec::new();
        let task_lower = task.to_lowercase();
        
        // Look for file patterns
        if task_lower.contains(".rs") || task_lower.contains("rust") {
            entities.push(TaskEntity {
                entity_type: EntityType::File,
                name: "rust file".to_string(),
                confidence: 0.9,
                location: None,
            });
        }
        
        if task_lower.contains(".js") || task_lower.contains("javascript") {
            entities.push(TaskEntity {
                entity_type: EntityType::File,
                name: "javascript file".to_string(),
                confidence: 0.9,
                location: None,
            });
        }
        
        if task_lower.contains(".ts") || task_lower.contains("typescript") {
            entities.push(TaskEntity {
                entity_type: EntityType::File,
                name: "typescript file".to_string(),
                confidence: 0.9,
                location: None,
            });
        }
        
        // Look for function patterns
        if task_lower.contains("function") || task_lower.contains("fn ") {
            entities.push(TaskEntity {
                entity_type: EntityType::Function,
                name: "function".to_string(),
                confidence: 0.7,
                location: None,
            });
        }
        
        // Look for class patterns
        if task_lower.contains("class") || task_lower.contains("struct") {
            entities.push(TaskEntity {
                entity_type: EntityType::Class,
                name: "class/struct".to_string(),
                confidence: 0.7,
                location: None,
            });
        }
        
        entities
    }
    
    /// Estimate task complexity
    fn estimate_complexity(&self, task: &str) -> u32 {
        let task_lower = task.to_lowercase();
        let mut complexity = 1;
        
        // Increase complexity based on keywords
        if task_lower.contains("complex") || task_lower.contains("advanced") {
            complexity += 2;
        }
        
        if task_lower.contains("multiple") || task_lower.contains("several") {
            complexity += 1;
        }
        
        if task_lower.contains("integration") || task_lower.contains("connect") {
            complexity += 2;
        }
        
        if task_lower.contains("optimize") || task_lower.contains("performance") {
            complexity += 1;
        }
        
        if task_lower.contains("security") || task_lower.contains("auth") {
            complexity += 2;
        }
        
        complexity.min(5) // Cap at 5
    }
    
    /// Identify required capabilities
    fn identify_required_capabilities(&self, task: &str) -> Vec<String> {
        let mut capabilities = Vec::new();
        let task_lower = task.to_lowercase();
        
        // Frontend capabilities
        if task_lower.contains("react") || task_lower.contains("component") {
            capabilities.push("react".to_string());
            capabilities.push("frontend".to_string());
        }
        
        if task_lower.contains("css") || task_lower.contains("style") {
            capabilities.push("css".to_string());
            capabilities.push("frontend".to_string());
        }
        
        // Backend capabilities
        if task_lower.contains("api") || task_lower.contains("server") {
            capabilities.push("backend".to_string());
            capabilities.push("api-development".to_string());
        }
        
        if task_lower.contains("database") || task_lower.contains("db") {
            capabilities.push("database".to_string());
            capabilities.push("backend".to_string());
        }
        
        // DevOps capabilities
        if task_lower.contains("docker") || task_lower.contains("container") {
            capabilities.push("docker".to_string());
            capabilities.push("devops".to_string());
        }
        
        if task_lower.contains("deploy") || task_lower.contains("ci") {
            capabilities.push("deployment".to_string());
            capabilities.push("devops".to_string());
        }
        
        // General capabilities
        if task_lower.contains("test") {
            capabilities.push("testing".to_string());
        }
        
        if task_lower.contains("review") || task_lower.contains("analyze") {
            capabilities.push("code-review".to_string());
        }
        
        capabilities
    }
}

#[async_trait]
impl Agent for BaseAgent {
    fn get_info(&self) -> &AgentConfig {
        &self.config
    }
    
    async fn initialize(&mut self) -> NikCliResult<()> {
        info!("Initializing agent: {}", self.config.id);
        self.update_status(AgentStatus::Idle);
        Ok(())
    }
    
    async fn run_task(&mut self, task: AgentTask) -> NikCliResult<AgentTaskResult> {
        info!("Agent {} starting task: {}", self.config.id, task.description);
        
        // Validate task
        self.validate_task(&task)?;
        
        // Update status
        self.update_status(AgentStatus::Running);
        self.current_task = Some(task.clone());
        
        let start_time = std::time::Instant::now();
        
        // Execute task (to be implemented by specific agents)
        let result = self.execute_task(task).await?;
        
        let duration = start_time.elapsed();
        
        // Create result
        let task_result = AgentTaskResult {
            task_id: result.task_id,
            success: result.success,
            output: result.output,
            error: result.error,
            duration_ms: duration.as_millis() as u64,
            files_modified: result.files_modified,
            commands_executed: result.commands_executed,
            metrics: result.metrics,
            completed_at: chrono::Utc::now(),
        };
        
        // Update metrics
        self.update_metrics(&task_result);
        
        // Update status
        self.update_status(AgentStatus::Idle);
        self.current_task = None;
        
        info!("Agent {} completed task: {} ({}ms)", 
              self.config.id, 
              task_result.task_id,
              task_result.duration_ms);
        
        Ok(task_result)
    }
    
    fn get_status(&self) -> AgentStatus {
        self.status.clone()
    }
    
    fn get_metrics(&self) -> &AgentMetrics {
        &self.metrics
    }
    
    async fn cleanup(&mut self) -> NikCliResult<()> {
        info!("Cleaning up agent: {}", self.config.id);
        self.update_status(AgentStatus::Idle);
        Ok(())
    }
    
    async fn analyze_task(&self, task: &str) -> NikCliResult<TaskCognition> {
        Ok(self.create_task_cognition(task))
    }
    
    fn get_capabilities(&self) -> &[String] {
        &self.config.capabilities
    }
    
    fn can_handle(&self, capability: &str) -> bool {
        self.config.capabilities.iter().any(|c| c == capability)
    }
}

/// Task execution result (internal)
#[derive(Debug, Clone)]
pub struct TaskExecutionResult {
    pub task_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub files_modified: Vec<String>,
    pub commands_executed: Vec<String>,
    pub metrics: AgentMetrics,
}

impl BaseAgent {
    /// Execute a task (to be overridden by specific agents)
    async fn execute_task(&self, task: AgentTask) -> NikCliResult<TaskExecutionResult> {
        // Default implementation - just return a placeholder result
        Ok(TaskExecutionResult {
            task_id: task.id,
            success: true,
            output: format!("Task '{}' executed by agent {}", task.description, self.config.id),
            error: None,
            files_modified: Vec::new(),
            commands_executed: Vec::new(),
            metrics: AgentMetrics {
                tasks_completed: 0,
                success_rate: 1.0,
                average_duration_ms: 0.0,
                total_tokens_used: 0,
                total_cost: 0.0,
                last_active: chrono::Utc::now(),
            },
        })
    }
}