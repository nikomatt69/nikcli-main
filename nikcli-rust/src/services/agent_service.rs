/*!
 * Agent Service
 * Manages agent lifecycle, task distribution, and monitoring
 */

use anyhow::{Context, Result};
use async_trait::async_trait;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::types::{Agent, AgentConfig, AgentStatus, AgentTask, AgentTaskResult, TaskStatus};

/// Agent Service for managing agents
pub struct AgentService {
    agents: Arc<DashMap<String, Agent>>,
    tasks: Arc<DashMap<String, AgentTask>>,
    task_results: Arc<DashMap<String, AgentTaskResult>>,
    active_tasks: Arc<DashMap<String, String>>, // task_id -> agent_id
    initialized: Arc<RwLock<bool>>,
}

impl AgentService {
    /// Create a new AgentService
    pub fn new() -> Self {
        Self {
            agents: Arc::new(DashMap::new()),
            tasks: Arc::new(DashMap::new()),
            task_results: Arc::new(DashMap::new()),
            active_tasks: Arc::new(DashMap::new()),
            initialized: Arc::new(RwLock::new(false)),
        }
    }
    
    /// Initialize the service
    pub async fn initialize(&self) -> Result<()> {
        let mut init = self.initialized.write().await;
        if *init {
            return Ok(());
        }
        
        // Register default agents
        self.register_default_agents().await?;
        
        *init = true;
        Ok(())
    }
    
    /// Register default agents
    async fn register_default_agents(&self) -> Result<()> {
        // Universal Agent (default)
        let universal_config = AgentConfig {
            id: "universal-agent".to_string(),
            name: "Universal Agent".to_string(),
            specialization: "general".to_string(),
            capabilities: vec![
                "code_generation".to_string(),
                "code_review".to_string(),
                "planning".to_string(),
                "documentation".to_string(),
            ],
            max_concurrent_tasks: 5,
            timeout_ms: 300000, // 5 minutes
            retry_attempts: 3,
            autonomy_level: crate::types::AutonomyLevel::FullyAutonomous,
        };
        
        self.create_agent(universal_config).await?;
        
        Ok(())
    }
    
    /// Create a new agent
    pub async fn create_agent(&self, config: AgentConfig) -> Result<Agent> {
        let agent = Agent {
            id: config.id.clone(),
            name: config.name.clone(),
            specialization: config.specialization.clone(),
            description: format!("{} - {}", config.name, config.specialization),
            capabilities: config.capabilities.clone(),
            status: AgentStatus::Ready,
            current_tasks: 0,
            max_concurrent_tasks: config.max_concurrent_tasks,
            created_at: chrono::Utc::now(),
            last_activity: chrono::Utc::now(),
        };
        
        self.agents.insert(agent.id.clone(), agent.clone());
        
        Ok(agent)
    }
    
    /// Get agent by ID
    pub async fn get_agent(&self, agent_id: &str) -> Option<Agent> {
        self.agents.get(agent_id).map(|a| a.clone())
    }
    
    /// List all agents
    pub async fn list_agents(&self) -> Vec<Agent> {
        self.agents.iter().map(|entry| entry.value().clone()).collect()
    }
    
    /// Get active agents
    pub async fn get_active_agents(&self) -> Vec<Agent> {
        self.agents
            .iter()
            .filter(|entry| entry.status == AgentStatus::Busy)
            .map(|entry| entry.value().clone())
            .collect()
    }
    
    /// Assign task to an agent
    pub async fn assign_task(&self, mut task: AgentTask) -> Result<String> {
        // Find available agent with required capabilities
        let agent_id = self.find_available_agent(&task.required_capabilities).await
            .context("No available agent found")?;
        
        // Update task with agent assignment
        task.agent_id = Some(agent_id.clone());
        task.status = TaskStatus::InProgress;
        task.started_at = Some(chrono::Utc::now());
        
        let task_id = task.id.clone();
        
        // Store task
        self.tasks.insert(task_id.clone(), task);
        self.active_tasks.insert(task_id.clone(), agent_id.clone());
        
        // Update agent status
        if let Some(mut agent) = self.agents.get_mut(&agent_id) {
            agent.current_tasks += 1;
            agent.status = AgentStatus::Busy;
            agent.last_activity = chrono::Utc::now();
        }
        
        Ok(task_id)
    }
    
    /// Find available agent with capabilities
    async fn find_available_agent(&self, capabilities: &[String]) -> Option<String> {
        for entry in self.agents.iter() {
            let agent = entry.value();
            
            // Check if agent is available
            if agent.status != AgentStatus::Ready && agent.status != AgentStatus::Idle {
                continue;
            }
            
            // Check if agent has capacity
            if agent.current_tasks >= agent.max_concurrent_tasks {
                continue;
            }
            
            // Check if agent has required capabilities
            if capabilities.is_empty() || 
               capabilities.iter().all(|cap| agent.capabilities.contains(cap)) {
                return Some(agent.id.clone());
            }
        }
        
        None
    }
    
    /// Complete a task
    pub async fn complete_task(&self, task_id: &str, result: AgentTaskResult) -> Result<()> {
        // Update task status
        if let Some(mut task) = self.tasks.get_mut(task_id) {
            task.status = if result.success {
                TaskStatus::Completed
            } else {
                TaskStatus::Failed
            };
            task.completed_at = Some(chrono::Utc::now());
        }
        
        // Store result
        self.task_results.insert(task_id.to_string(), result.clone());
        
        // Update agent status
        if let Some(agent_id) = self.active_tasks.get(task_id) {
            if let Some(mut agent) = self.agents.get_mut(agent_id.as_str()) {
                agent.current_tasks = agent.current_tasks.saturating_sub(1);
                agent.last_activity = chrono::Utc::now();
                
                // Update status
                if agent.current_tasks == 0 {
                    agent.status = AgentStatus::Ready;
                }
            }
            
            // Remove from active tasks
            drop(agent_id);
            self.active_tasks.remove(task_id);
        }
        
        Ok(())
    }
    
    /// Get task by ID
    pub async fn get_task(&self, task_id: &str) -> Option<AgentTask> {
        self.tasks.get(task_id).map(|t| t.clone())
    }
    
    /// Get task result
    pub async fn get_task_result(&self, task_id: &str) -> Option<AgentTaskResult> {
        self.task_results.get(task_id).map(|r| r.clone())
    }
    
    /// List all tasks
    pub async fn list_tasks(&self) -> Vec<AgentTask> {
        self.tasks.iter().map(|entry| entry.value().clone()).collect()
    }
    
    /// List active tasks
    pub async fn list_active_tasks(&self) -> Vec<AgentTask> {
        self.tasks
            .iter()
            .filter(|entry| entry.status == TaskStatus::InProgress)
            .map(|entry| entry.value().clone())
            .collect()
    }
    
    /// Cancel a task
    pub async fn cancel_task(&self, task_id: &str) -> Result<()> {
        if let Some(mut task) = self.tasks.get_mut(task_id) {
            task.status = TaskStatus::Cancelled;
            task.completed_at = Some(chrono::Utc::now());
        }
        
        // Update agent status
        if let Some(agent_id) = self.active_tasks.get(task_id) {
            if let Some(mut agent) = self.agents.get_mut(agent_id.as_str()) {
                agent.current_tasks = agent.current_tasks.saturating_sub(1);
                
                if agent.current_tasks == 0 {
                    agent.status = AgentStatus::Ready;
                }
            }
            
            drop(agent_id);
            self.active_tasks.remove(task_id);
        }
        
        Ok(())
    }
    
    /// Get agent statistics
    pub async fn get_agent_stats(&self, agent_id: &str) -> Option<AgentStats> {
        let agent = self.agents.get(agent_id)?;
        
        let completed_tasks = self.task_results
            .iter()
            .filter(|e| e.agent_id == agent_id && e.success)
            .count();
        
        let failed_tasks = self.task_results
            .iter()
            .filter(|e| e.agent_id == agent_id && !e.success)
            .count();
        
        let total_tasks = completed_tasks + failed_tasks;
        
        let success_rate = if total_tasks > 0 {
            completed_tasks as f32 / total_tasks as f32
        } else {
            0.0
        };
        
        Some(AgentStats {
            agent_id: agent.id.clone(),
            agent_name: agent.name.clone(),
            current_tasks: agent.current_tasks,
            completed_tasks,
            failed_tasks,
            success_rate,
            status: agent.status.clone(),
        })
    }
    
    /// Shutdown an agent
    pub async fn shutdown_agent(&self, agent_id: &str) -> Result<()> {
        if let Some(mut agent) = self.agents.get_mut(agent_id) {
            agent.status = AgentStatus::Terminated;
        }
        
        Ok(())
    }
    
    /// Cancel all running tasks - PRODUCTION READY
    pub async fn cancel_all_tasks(&self) -> usize {
        let mut cancelled_count = 0;
        
        // Iterate through all active tasks
        for entry in self.active_tasks.iter() {
            let task_id = entry.key().clone();
            
            // Get task and cancel it
            if let Some(mut task) = self.tasks.get_mut(&task_id) {
                if task.status == TaskStatus::InProgress || task.status == TaskStatus::Pending {
                    task.status = TaskStatus::Cancelled;
                    task.completed_at = Some(chrono::Utc::now());
                    cancelled_count += 1;
                    
                    tracing::info!("Cancelled task: {}", task_id);
                }
            }
        }
        
        // Clear active tasks mapping
        self.active_tasks.clear();
        
        // Update agent statuses
        for mut entry in self.agents.iter_mut() {
            let agent = entry.value_mut();
            if agent.current_tasks > 0 {
                agent.current_tasks = 0;
                agent.status = AgentStatus::Ready;
            }
        }
        
        tracing::info!("Cancelled {} tasks total", cancelled_count);
        
        cancelled_count
    }
}

impl Default for AgentService {
    fn default() -> Self {
        Self::new()
    }
}

/// Agent statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStats {
    pub agent_id: String,
    pub agent_name: String,
    pub current_tasks: usize,
    pub completed_tasks: usize,
    pub failed_tasks: usize,
    pub success_rate: f32,
    pub status: AgentStatus,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{TaskPriority};
    
    #[tokio::test]
    async fn test_agent_service_creation() {
        let service = AgentService::new();
        service.initialize().await.unwrap();
        
        let agents = service.list_agents().await;
        assert!(!agents.is_empty());
    }
    
    #[tokio::test]
    async fn test_task_assignment() {
        let service = AgentService::new();
        service.initialize().await.unwrap();
        
        let task = AgentTask {
            id: Uuid::new_v4().to_string(),
            description: "Test task".to_string(),
            agent_id: None,
            status: TaskStatus::Pending,
            priority: TaskPriority::Medium,
            required_capabilities: vec![],
            dependencies: vec![],
            context: std::collections::HashMap::new(),
            created_at: chrono::Utc::now(),
            started_at: None,
            completed_at: None,
            timeout_ms: None,
        };
        
        let task_id = service.assign_task(task).await.unwrap();
        assert!(!task_id.is_empty());
        
        let assigned_task = service.get_task(&task_id).await;
        assert!(assigned_task.is_some());
        assert!(assigned_task.unwrap().agent_id.is_some());
    }
}

