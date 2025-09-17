use crate::agents::base::*;
use crate::agents::types::*;
use crate::agents::universal::UniversalAgent;
use crate::core::ConfigManager;
use crate::error::NikCliResult;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};

/// Agent manager for handling multiple agents
pub struct AgentManager {
    agents: Arc<RwLock<HashMap<String, Arc<Mutex<dyn Agent + Send + Sync>>>>>,
    agent_configs: Arc<RwLock<HashMap<String, AgentConfig>>>,
    config_manager: Arc<ConfigManager>,
    performance_tracker: Arc<RwLock<HashMap<String, AgentPerformanceMetrics>>>,
}

impl AgentManager {
    /// Create a new agent manager
    pub fn new(config_manager: Arc<ConfigManager>) -> Self {
        Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            agent_configs: Arc::new(RwLock::new(HashMap::new())),
            config_manager,
            performance_tracker: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Register an agent class
    pub async fn register_agent_class<T>(&self, agent_class: T, config: AgentConfig) -> NikCliResult<()>
    where
        T: Agent + Send + Sync + 'static,
    {
        info!("Registering agent class: {}", config.id);
        
        let mut configs = self.agent_configs.write().await;
        configs.insert(config.id.clone(), config);
        
        Ok(())
    }
    
    /// Create an agent instance
    pub async fn create_agent(&self, agent_id: &str) -> NikCliResult<String> {
        info!("Creating agent instance: {}", agent_id);
        
        // Check if agent is already created
        {
            let agents = self.agents.read().await;
            if agents.contains_key(agent_id) {
                warn!("Agent {} already exists", agent_id);
                return Ok(agent_id.to_string());
            }
        }
        
        // Get agent configuration
        let config = {
            let configs = self.agent_configs.read().await;
            configs.get(agent_id).cloned()
                .ok_or_else(|| crate::error::NikCliError::Agent(format!("Agent {} not registered", agent_id)))?
        };
        
        // Create agent instance based on type
        let agent: Arc<Mutex<dyn Agent + Send + Sync>> = match config.specialization {
            AgentSpecialization::Universal => {
                let mut universal_agent = UniversalAgent::new();
                universal_agent.initialize().await?;
                Arc::new(Mutex::new(universal_agent))
            }
            _ => {
                // For now, create a base agent for other specializations
                let mut base_agent = BaseAgent::new(config.clone());
                base_agent.initialize().await?;
                Arc::new(Mutex::new(base_agent))
            }
        };
        
        // Store agent instance
        {
            let mut agents = self.agents.write().await;
            agents.insert(agent_id.to_string(), agent);
        }
        
        // Initialize performance tracking
        {
            let mut tracker = self.performance_tracker.write().await;
            tracker.insert(agent_id.to_string(), AgentPerformanceMetrics {
                agent_id: agent_id.to_string(),
                task_count: 0,
                success_rate: 0.0,
                average_duration: 0.0,
                complexity_handled: 0,
                resource_efficiency: 0.0,
                user_satisfaction: 0.0,
                last_active: chrono::Utc::now(),
                specializations: config.capabilities.clone(),
                strengths: Vec::new(),
                weaknesses: Vec::new(),
            });
        }
        
        info!("Agent {} created successfully", agent_id);
        Ok(agent_id.to_string())
    }
    
    /// Get agent instance
    pub async fn get_agent(&self, agent_id: &str) -> Option<Arc<Mutex<dyn Agent + Send + Sync>>> {
        let agents = self.agents.read().await;
        agents.get(agent_id).cloned()
    }
    
    /// List all available agents
    pub async fn list_agents(&self) -> Vec<AgentInstance> {
        let mut instances = Vec::new();
        
        let agents = self.agents.read().await;
        let configs = self.agent_configs.read().await;
        let performance = self.performance_tracker.read().await;
        
        for (agent_id, agent) in agents.iter() {
            if let Some(config) = configs.get(agent_id) {
                let agent_guard = agent.lock().await;
                let metrics = performance.get(agent_id).cloned().unwrap_or_else(|| {
                    AgentPerformanceMetrics {
                        agent_id: agent_id.clone(),
                        task_count: 0,
                        success_rate: 0.0,
                        average_duration: 0.0,
                        complexity_handled: 0,
                        resource_efficiency: 0.0,
                        user_satisfaction: 0.0,
                        last_active: chrono::Utc::now(),
                        specializations: Vec::new(),
                        strengths: Vec::new(),
                        weaknesses: Vec::new(),
                    }
                });
                
                instances.push(AgentInstance {
                    id: agent_id.clone(),
                    config: config.clone(),
                    status: agent_guard.get_status(),
                    current_task: None, // TODO: Track current task
                    metrics: agent_guard.get_metrics().clone(),
                    created_at: chrono::Utc::now(), // TODO: Track creation time
                    last_heartbeat: chrono::Utc::now(), // TODO: Track heartbeat
                });
            }
        }
        
        instances
    }
    
    /// Run a task with an agent
    pub async fn run_task(&self, agent_id: &str, task: AgentTask) -> NikCliResult<AgentTaskResult> {
        info!("Running task with agent {}: {}", agent_id, task.description);
        
        let agent = self.get_agent(agent_id)
            .ok_or_else(|| crate::error::NikCliError::Agent(format!("Agent {} not found", agent_id)))?;
        
        let mut agent_guard = agent.lock().await;
        let result = agent_guard.run_task(task).await?;
        
        // Update performance metrics
        self.update_performance_metrics(agent_id, &result).await?;
        
        Ok(result)
    }
    
    /// Update performance metrics for an agent
    async fn update_performance_metrics(&self, agent_id: &str, result: &AgentTaskResult) -> NikCliResult<()> {
        let mut tracker = self.performance_tracker.write().await;
        
        if let Some(metrics) = tracker.get_mut(agent_id) {
            metrics.task_count += 1;
            metrics.last_active = chrono::Utc::now();
            
            // Update success rate
            let total_tasks = metrics.task_count as f64;
            let successful_tasks = if result.success {
                (metrics.success_rate * (total_tasks - 1.0)) + 1.0
            } else {
                metrics.success_rate * (total_tasks - 1.0)
            };
            metrics.success_rate = successful_tasks / total_tasks;
            
            // Update average duration
            let total_duration = metrics.average_duration * (total_tasks - 1.0) + result.duration_ms as f64;
            metrics.average_duration = total_duration / total_tasks;
            
            debug!("Updated performance metrics for agent {}: {} tasks, {:.2}% success rate", 
                   agent_id, 
                   metrics.task_count,
                   metrics.success_rate * 100.0);
        }
        
        Ok(())
    }
    
    /// Get performance metrics for an agent
    pub async fn get_performance_metrics(&self, agent_id: &str) -> Option<AgentPerformanceMetrics> {
        let tracker = self.performance_tracker.read().await;
        tracker.get(agent_id).cloned()
    }
    
    /// Get all performance metrics
    pub async fn get_all_performance_metrics(&self) -> HashMap<String, AgentPerformanceMetrics> {
        let tracker = self.performance_tracker.read().await;
        tracker.clone()
    }
    
    /// Stop an agent
    pub async fn stop_agent(&self, agent_id: &str) -> NikCliResult<()> {
        info!("Stopping agent: {}", agent_id);
        
        if let Some(agent) = self.get_agent(agent_id).await {
            let mut agent_guard = agent.lock().await;
            agent_guard.cleanup().await?;
        }
        
        // Remove from active agents
        {
            let mut agents = self.agents.write().await;
            agents.remove(agent_id);
        }
        
        info!("Agent {} stopped", agent_id);
        Ok(())
    }
    
    /// Get agent status
    pub async fn get_agent_status(&self, agent_id: &str) -> Option<AgentStatus> {
        if let Some(agent) = self.get_agent(agent_id).await {
            let agent_guard = agent.lock().await;
            Some(agent_guard.get_status())
        } else {
            None
        }
    }
    
    /// Find best agent for a task
    pub async fn find_best_agent(&self, task: &AgentTask) -> Option<String> {
        let agents = self.agents.read().await;
        let configs = self.agent_configs.read().await;
        
        let mut best_agent = None;
        let mut best_score = 0.0;
        
        for (agent_id, agent) in agents.iter() {
            if let Some(config) = configs.get(agent_id) {
                let agent_guard = agent.lock().await;
                
                // Skip if agent is not available
                if agent_guard.get_status() != AgentStatus::Idle {
                    continue;
                }
                
                // Calculate compatibility score
                let score = self.calculate_agent_score(&config, task);
                
                if score > best_score {
                    best_score = score;
                    best_agent = Some(agent_id.clone());
                }
            }
        }
        
        best_agent
    }
    
    /// Calculate agent compatibility score for a task
    fn calculate_agent_score(&self, config: &AgentConfig, task: &AgentTask) -> f64 {
        let mut score = 0.0;
        
        // Base score for universal agents
        if config.specialization == AgentSpecialization::Universal {
            score += 0.5;
        }
        
        // Score based on capabilities
        let task_lower = task.description.to_lowercase();
        for capability in &config.capabilities {
            if task_lower.contains(capability) {
                score += 0.1;
            }
        }
        
        // Score based on autonomy level
        match config.default_config.autonomy_level {
            AutonomyLevel::FullyAutonomous => score += 0.3,
            AutonomyLevel::SemiAutonomous => score += 0.2,
            AutonomyLevel::Supervised => score += 0.1,
        }
        
        // Score based on permissions
        if config.default_config.permissions.can_execute_commands {
            score += 0.1;
        }
        
        if config.default_config.permissions.can_write_files {
            score += 0.1;
        }
        
        score
    }
    
    /// Analyze task and suggest agents
    pub async fn analyze_task(&self, task: &str) -> NikCliResult<TaskCognition> {
        // Use universal agent for task analysis
        if let Some(agent) = self.get_agent("universal-agent").await {
            let agent_guard = agent.lock().await;
            agent_guard.analyze_task(task).await
        } else {
            // Fallback to basic analysis
            Ok(TaskCognition {
                id: uuid::Uuid::new_v4().to_string(),
                original_task: task.to_string(),
                normalized_task: task.to_lowercase(),
                intent: TaskIntent {
                    primary: PrimaryIntent::Create,
                    secondary: Vec::new(),
                    confidence: 0.5,
                    complexity: ComplexityLevel::Medium,
                    urgency: UrgencyLevel::Normal,
                },
                entities: Vec::new(),
                dependencies: Vec::new(),
                contexts: Vec::new(),
                estimated_complexity: 2,
                required_capabilities: Vec::new(),
                suggested_agents: vec!["universal-agent".to_string()],
                risk_level: RiskLevel::Low,
                orchestration_plan: None,
            })
        }
    }
    
    /// Get agent statistics
    pub async fn get_agent_statistics(&self) -> AgentStatistics {
        let agents = self.agents.read().await;
        let performance = self.performance_tracker.read().await;
        
        let total_agents = agents.len();
        let active_agents = agents.values()
            .filter(|agent| {
                // This is a simplified check - in reality we'd need to check status
                true
            })
            .count();
        
        let total_tasks = performance.values()
            .map(|metrics| metrics.task_count)
            .sum();
        
        let average_success_rate = if !performance.is_empty() {
            performance.values()
                .map(|metrics| metrics.success_rate)
                .sum::<f64>() / performance.len() as f64
        } else {
            0.0
        };
        
        AgentStatistics {
            total_agents,
            active_agents,
            total_tasks,
            average_success_rate,
            last_updated: chrono::Utc::now(),
        }
    }
}

/// Agent statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatistics {
    pub total_agents: usize,
    pub active_agents: usize,
    pub total_tasks: u32,
    pub average_success_rate: f64,
    pub last_updated: chrono::DateTime<chrono::Utc>,
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new(Arc::new(ConfigManager::default()))
    }
}