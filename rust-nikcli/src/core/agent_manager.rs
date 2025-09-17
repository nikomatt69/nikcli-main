use crate::core::types::*;
use crate::core::config::NikCliConfig;
use crate::error::NikCliResult;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc, Mutex};
use tracing::{debug, info, warn, error};

/// Agent trait for all agents
#[async_trait::async_trait]
pub trait Agent: Send + Sync {
    /// Get agent ID
    fn get_id(&self) -> &str;
    
    /// Get agent name
    fn get_name(&self) -> &str;
    
    /// Get agent specialization
    fn get_specialization(&self) -> &str;
    
    /// Get agent capabilities
    fn get_capabilities(&self) -> &[String];
    
    /// Initialize the agent
    async fn initialize(&mut self, context: AgentContext) -> NikCliResult<()>;
    
    /// Execute a task
    async fn execute_task(&mut self, task: AgentTask) -> NikCliResult<AgentTaskResult>;
    
    /// Get agent status
    async fn get_status(&self) -> AgentStatus;
    
    /// Get agent metrics
    async fn get_metrics(&self) -> AgentMetrics;
    
    /// Shutdown the agent
    async fn shutdown(&mut self) -> NikCliResult<()>;
}

/// Agent status
#[derive(Debug, Clone, PartialEq)]
pub enum AgentStatus {
    Initializing,
    Ready,
    Busy,
    Error,
    Shutdown,
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentStatus::Initializing => write!(f, "initializing"),
            AgentStatus::Ready => write!(f, "ready"),
            AgentStatus::Busy => write!(f, "busy"),
            AgentStatus::Error => write!(f, "error"),
            AgentStatus::Shutdown => write!(f, "shutdown"),
        }
    }
}

/// Agent manager for managing agent lifecycle and task coordination
pub struct AgentManager {
    config: Arc<RwLock<NikCliConfig>>,
    agents: Arc<RwLock<HashMap<String, Arc<Mutex<dyn Agent>>>>>,
    agent_registry: Arc<RwLock<HashMap<String, AgentRegistryEntry>>>,
    task_queues: Arc<RwLock<HashMap<String, Vec<AgentTask>>>>,
    task_history: Arc<RwLock<HashMap<String, AgentTaskResult>>>,
    active_tasks: Arc<RwLock<HashMap<String, AgentTask>>>,
    event_sender: Option<mpsc::UnboundedSender<AgentEvent>>,
    metrics: Arc<RwLock<HashMap<String, AgentMetrics>>>,
    max_concurrent_agents: u32,
    max_concurrent_tasks: u32,
}

impl AgentManager {
    /// Create a new agent manager
    pub fn new(config: Arc<RwLock<NikCliConfig>>) -> Self {
        Self {
            config,
            agents: Arc::new(RwLock::new(HashMap::new())),
            agent_registry: Arc::new(RwLock::new(HashMap::new())),
            task_queues: Arc::new(RwLock::new(HashMap::new())),
            task_history: Arc::new(RwLock::new(HashMap::new())),
            active_tasks: Arc::new(RwLock::new(HashMap::new())),
            event_sender: None,
            metrics: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent_agents: 10,
            max_concurrent_tasks: 100,
        }
    }
    
    /// Initialize the agent manager
    pub async fn initialize(&mut self) -> NikCliResult<()> {
        info!("Initializing AgentManager");
        
        // Load configuration
        let config = self.config.read().await;
        self.max_concurrent_agents = config.max_concurrent_agents;
        self.max_concurrent_tasks = config.max_concurrent_tasks;
        
        info!("AgentManager initialized successfully");
        Ok(())
    }
    
    /// Register an agent in the system
    pub async fn register_agent(&self, agent: Arc<Mutex<dyn Agent>>) -> NikCliResult<()> {
        let agent_id = {
            let agent_guard = agent.lock().await;
            agent_guard.get_id().to_string()
        };
        
        info!("Registering agent: {}", agent_id);
        
        // Build agent context
        let context = self.build_agent_context(&agent_id).await?;
        
        // Initialize agent
        {
            let mut agent_guard = agent.lock().await;
            agent_guard.initialize(context).await?;
        }
        
        // Store agent
        {
            let mut agents = self.agents.write().await;
            agents.insert(agent_id.clone(), agent);
        }
        
        // Initialize task queue
        {
            let mut task_queues = self.task_queues.write().await;
            task_queues.insert(agent_id.clone(), Vec::new());
        }
        
        // Initialize metrics
        {
            let mut metrics = self.metrics.write().await;
            metrics.insert(agent_id.clone(), AgentMetrics {
                agent_id: agent_id.clone(),
                total_tasks: 0,
                completed_tasks: 0,
                failed_tasks: 0,
                cancelled_tasks: 0,
                average_execution_time_ms: 0.0,
                success_rate: 0.0,
                uptime_seconds: 0,
                last_activity: Some(chrono::Utc::now()),
                memory_usage_bytes: 0,
                cpu_usage_percent: 0.0,
                custom_metrics: HashMap::new(),
            });
        }
        
        // Emit registration event
        self.emit_event(AgentEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AgentEventType::AgentRegistered,
            agent_id: Some(agent_id.clone()),
            task_id: None,
            timestamp: chrono::Utc::now(),
            data: HashMap::new(),
        }).await;
        
        info!("Agent registered successfully: {}", agent_id);
        Ok(())
    }
    
    /// Register an agent class in the registry
    pub async fn register_agent_class(&self, metadata: AgentMetadata) -> NikCliResult<()> {
        let registry_entry = AgentRegistryEntry {
            metadata: metadata.clone(),
            is_enabled: true,
            last_used: None,
            usage_count: 0,
            success_rate: 0.0,
            average_execution_time: 0.0,
        };
        
        {
            let mut registry = self.agent_registry.write().await;
            registry.insert(metadata.id.clone(), registry_entry);
        }
        
        info!("Registered agent class: {}", metadata.id);
        Ok(())
    }
    
    /// Create and register an agent from registry
    pub async fn create_agent_from_registry(&self, agent_id: &str, config: AgentConfig) -> NikCliResult<String> {
        let registry = self.agent_registry.read().await;
        let entry = registry.get(agent_id)
            .ok_or_else(|| crate::error::NikCliError::NotFound(format!("Agent class {} not found in registry", agent_id)))?;
        
        if !entry.is_enabled {
            return Err(crate::error::NikCliError::Disabled(format!("Agent class {} is disabled", agent_id)));
        }
        
        // Create agent instance (simplified - in real implementation, this would use the agent class)
        let agent = self.create_agent_instance(agent_id, config).await?;
        
        // Register the agent
        self.register_agent(agent).await?;
        
        Ok(agent_id.to_string())
    }
    
    /// Create agent instance (placeholder implementation)
    async fn create_agent_instance(&self, agent_id: &str, _config: AgentConfig) -> NikCliResult<Arc<Mutex<dyn Agent>>> {
        // This is a simplified implementation
        // In a real implementation, this would create the appropriate agent type
        Err(crate::error::NikCliError::NotImplemented(format!("Agent creation for {} not implemented", agent_id)))
    }
    
    /// Submit a task to an agent
    pub async fn submit_task(&self, agent_id: &str, task: AgentTask) -> NikCliResult<String> {
        // Check if agent exists
        {
            let agents = self.agents.read().await;
            if !agents.contains_key(agent_id) {
                return Err(crate::error::NikCliError::NotFound(format!("Agent {} not found", agent_id)));
            }
        }
        
        // Check concurrent task limit
        {
            let active_tasks = self.active_tasks.read().await;
            if active_tasks.len() >= self.max_concurrent_tasks as usize {
                return Err(crate::error::NikCliError::ResourceExhausted(
                    format!("Maximum concurrent tasks ({}) exceeded", self.max_concurrent_tasks)
                ));
            }
        }
        
        // Add task to queue
        {
            let mut task_queues = self.task_queues.write().await;
            if let Some(queue) = task_queues.get_mut(agent_id) {
                queue.push(task.clone());
            }
        }
        
        // Emit task created event
        self.emit_event(AgentEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AgentEventType::TaskCreated,
            agent_id: Some(agent_id.to_string()),
            task_id: Some(task.id.clone()),
            timestamp: chrono::Utc::now(),
            data: HashMap::new(),
        }).await;
        
        // Start task execution if agent is available
        self.process_task_queue(agent_id).await?;
        
        info!("Task submitted to agent {}: {}", agent_id, task.id);
        Ok(task.id)
    }
    
    /// Process task queue for an agent
    async fn process_task_queue(&self, agent_id: &str) -> NikCliResult<()> {
        // Check if agent is available
        let agent_available = {
            let agents = self.agents.read().await;
            if let Some(agent) = agents.get(agent_id) {
                let agent_guard = agent.lock().await;
                matches!(agent_guard.get_status().await, AgentStatus::Ready)
            } else {
                false
            }
        };
        
        if !agent_available {
            return Ok(());
        }
        
        // Get next task from queue
        let next_task = {
            let mut task_queues = self.task_queues.write().await;
            if let Some(queue) = task_queues.get_mut(agent_id) {
                queue.pop()
            } else {
                None
            }
        };
        
        if let Some(task) = next_task {
            // Add to active tasks
            {
                let mut active_tasks = self.active_tasks.write().await;
                active_tasks.insert(task.id.clone(), task.clone());
            }
            
            // Execute task
            self.execute_task(agent_id, task).await?;
        }
        
        Ok(())
    }
    
    /// Execute a task
    async fn execute_task(&self, agent_id: &str, task: AgentTask) -> NikCliResult<()> {
        let start_time = std::time::Instant::now();
        
        // Emit task started event
        self.emit_event(AgentEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: AgentEventType::TaskStarted,
            agent_id: Some(agent_id.to_string()),
            task_id: Some(task.id.clone()),
            timestamp: chrono::Utc::now(),
            data: HashMap::new(),
        }).await;
        
        // Get agent and execute task
        let result = {
            let agents = self.agents.read().await;
            if let Some(agent) = agents.get(agent_id) {
                let mut agent_guard = agent.lock().await;
                agent_guard.execute_task(task.clone()).await
            } else {
                Err(crate::error::NikCliError::NotFound(format!("Agent {} not found", agent_id)))
            }
        };
        
        let execution_time = start_time.elapsed().as_millis() as u64;
        
        // Create task result
        let task_result = match result {
            Ok(mut task_result) => {
                task_result.execution_time_ms = execution_time;
                task_result.completed_at = Some(chrono::Utc::now());
                task_result
            }
            Err(e) => AgentTaskResult {
                task_id: task.id.clone(),
                agent_id: agent_id.to_string(),
                status: TaskStatus::Failed,
                result: None,
                error: Some(e.to_string()),
                execution_time_ms: execution_time,
                started_at: chrono::Utc::now(),
                completed_at: Some(chrono::Utc::now()),
                retry_count: task.retry_count,
                metadata: HashMap::new(),
            }
        };
        
        // Remove from active tasks
        {
            let mut active_tasks = self.active_tasks.write().await;
            active_tasks.remove(&task.id);
        }
        
        // Store in history
        {
            let mut task_history = self.task_history.write().await;
            task_history.insert(task.id.clone(), task_result.clone());
        }
        
        // Update metrics
        self.update_agent_metrics(agent_id, &task_result).await;
        
        // Emit task completed event
        let event_type = match task_result.status {
            TaskStatus::Completed => AgentEventType::TaskCompleted,
            TaskStatus::Failed => AgentEventType::TaskFailed,
            TaskStatus::Cancelled => AgentEventType::TaskCancelled,
            _ => AgentEventType::TaskCompleted,
        };
        
        self.emit_event(AgentEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type,
            agent_id: Some(agent_id.to_string()),
            task_id: Some(task.id.clone()),
            timestamp: chrono::Utc::now(),
            data: HashMap::new(),
        }).await;
        
        // Process next task in queue
        self.process_task_queue(agent_id).await?;
        
        info!("Task executed by agent {}: {} ({}ms)", agent_id, task.id, execution_time);
        Ok(())
    }
    
    /// Update agent metrics
    async fn update_agent_metrics(&self, agent_id: &str, task_result: &AgentTaskResult) {
        let mut metrics = self.metrics.write().await;
        if let Some(agent_metrics) = metrics.get_mut(agent_id) {
            agent_metrics.total_tasks += 1;
            agent_metrics.last_activity = Some(chrono::Utc::now());
            
            match task_result.status {
                TaskStatus::Completed => {
                    agent_metrics.completed_tasks += 1;
                }
                TaskStatus::Failed => {
                    agent_metrics.failed_tasks += 1;
                }
                TaskStatus::Cancelled => {
                    agent_metrics.cancelled_tasks += 1;
                }
                _ => {}
            }
            
            // Update success rate
            if agent_metrics.total_tasks > 0 {
                agent_metrics.success_rate = agent_metrics.completed_tasks as f64 / agent_metrics.total_tasks as f64;
            }
            
            // Update average execution time
            let total_time = agent_metrics.average_execution_time_ms * (agent_metrics.total_tasks - 1) as f64 + task_result.execution_time_ms as f64;
            agent_metrics.average_execution_time_ms = total_time / agent_metrics.total_tasks as f64;
        }
    }
    
    /// Build agent context
    async fn build_agent_context(&self, agent_id: &str) -> NikCliResult<AgentContext> {
        let config = self.config.read().await;
        
        Ok(AgentContext {
            agent_id: agent_id.to_string(),
            workspace_path: std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            current_task: None,
            available_tools: Vec::new(),
            memory_limit: 1024 * 1024 * 1024, // 1GB
            execution_timeout: 300, // 5 minutes
            environment: std::env::vars().collect(),
            shared_state: HashMap::new(),
            metadata: HashMap::new(),
        })
    }
    
    /// Get agent by ID
    pub async fn get_agent(&self, agent_id: &str) -> Option<Arc<Mutex<dyn Agent>>> {
        let agents = self.agents.read().await;
        agents.get(agent_id).cloned()
    }
    
    /// Get all agents
    pub async fn get_all_agents(&self) -> HashMap<String, Arc<Mutex<dyn Agent>>> {
        let agents = self.agents.read().await;
        agents.clone()
    }
    
    /// Get agent metrics
    pub async fn get_agent_metrics(&self, agent_id: &str) -> Option<AgentMetrics> {
        let metrics = self.metrics.read().await;
        metrics.get(agent_id).cloned()
    }
    
    /// Get all agent metrics
    pub async fn get_all_metrics(&self) -> HashMap<String, AgentMetrics> {
        let metrics = self.metrics.read().await;
        metrics.clone()
    }
    
    /// Get task history
    pub async fn get_task_history(&self, limit: Option<usize>) -> Vec<AgentTaskResult> {
        let task_history = self.task_history.read().await;
        let limit = limit.unwrap_or(100);
        
        let mut results: Vec<AgentTaskResult> = task_history.values().cloned().collect();
        results.sort_by(|a, b| b.started_at.cmp(&a.started_at));
        results.truncate(limit);
        
        results
    }
    
    /// Get active tasks
    pub async fn get_active_tasks(&self) -> Vec<AgentTask> {
        let active_tasks = self.active_tasks.read().await;
        active_tasks.values().cloned().collect()
    }
    
    /// Cancel a task
    pub async fn cancel_task(&self, task_id: &str) -> NikCliResult<bool> {
        // Remove from active tasks
        let removed = {
            let mut active_tasks = self.active_tasks.write().await;
            active_tasks.remove(task_id).is_some()
        };
        
        if removed {
            // Update task history
            {
                let mut task_history = self.task_history.write().await;
                if let Some(mut task_result) = task_history.get_mut(task_id) {
                    task_result.status = TaskStatus::Cancelled;
                    task_result.completed_at = Some(chrono::Utc::now());
                }
            }
            
            // Emit task cancelled event
            self.emit_event(AgentEvent {
                id: uuid::Uuid::new_v4().to_string(),
                event_type: AgentEventType::TaskCancelled,
                agent_id: None,
                task_id: Some(task_id.to_string()),
                timestamp: chrono::Utc::now(),
                data: HashMap::new(),
            }).await;
            
            info!("Task cancelled: {}", task_id);
        }
        
        Ok(removed)
    }
    
    /// Unregister an agent
    pub async fn unregister_agent(&self, agent_id: &str) -> NikCliResult<bool> {
        // Shutdown agent
        {
            let agents = self.agents.read().await;
            if let Some(agent) = agents.get(agent_id) {
                let mut agent_guard = agent.lock().await;
                agent_guard.shutdown().await?;
            }
        }
        
        // Remove agent
        let removed = {
            let mut agents = self.agents.write().await;
            agents.remove(agent_id).is_some()
        };
        
        if removed {
            // Remove task queue
            {
                let mut task_queues = self.task_queues.write().await;
                task_queues.remove(agent_id);
            }
            
            // Remove metrics
            {
                let mut metrics = self.metrics.write().await;
                metrics.remove(agent_id);
            }
            
            // Emit unregistration event
            self.emit_event(AgentEvent {
                id: uuid::Uuid::new_v4().to_string(),
                event_type: AgentEventType::AgentUnregistered,
                agent_id: Some(agent_id.to_string()),
                task_id: None,
                timestamp: chrono::Utc::now(),
                data: HashMap::new(),
            }).await;
            
            info!("Agent unregistered: {}", agent_id);
        }
        
        Ok(removed)
    }
    
    /// Set event sender
    pub fn set_event_sender(&mut self, sender: mpsc::UnboundedSender<AgentEvent>) {
        self.event_sender = Some(sender);
    }
    
    /// Get event receiver
    pub fn get_event_receiver(&self) -> Option<mpsc::UnboundedReceiver<AgentEvent>> {
        let (sender, receiver) = mpsc::unbounded_channel();
        self.event_sender = Some(sender);
        Some(receiver)
    }
    
    /// Emit agent event
    async fn emit_event(&self, event: AgentEvent) {
        if let Some(ref sender) = self.event_sender {
            let _ = sender.send(event);
        }
    }
    
    /// Shutdown agent manager
    pub async fn shutdown(&self) -> NikCliResult<()> {
        info!("Shutting down AgentManager");
        
        // Shutdown all agents
        {
            let agents = self.agents.read().await;
            for (agent_id, agent) in agents.iter() {
                let mut agent_guard = agent.lock().await;
                if let Err(e) = agent_guard.shutdown().await {
                    error!("Failed to shutdown agent {}: {}", agent_id, e);
                }
            }
        }
        
        // Clear all data
        {
            let mut agents = self.agents.write().await;
            agents.clear();
        }
        
        {
            let mut task_queues = self.task_queues.write().await;
            task_queues.clear();
        }
        
        {
            let mut active_tasks = self.active_tasks.write().await;
            active_tasks.clear();
        }
        
        {
            let mut metrics = self.metrics.write().await;
            metrics.clear();
        }
        
        info!("AgentManager shutdown complete");
        Ok(())
    }
}