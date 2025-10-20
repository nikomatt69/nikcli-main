/*!
 * Agent Factory - Production Ready
 */

use anyhow::Result;
use crate::types::{Agent, AgentConfig, AgentStatus, AutonomyLevel};

pub struct AgentFactory;

impl AgentFactory {
    pub fn new() -> Self {
        Self
    }
    
    pub fn create_agent(&self, config: AgentConfig) -> Result<Agent> {
        Ok(Agent {
            id: config.id,
            name: config.name,
            specialization: config.specialization,
            description: String::new(),
            capabilities: config.capabilities,
            status: AgentStatus::Ready,
            current_tasks: 0,
            max_concurrent_tasks: config.max_concurrent_tasks,
            created_at: chrono::Utc::now(),
            last_activity: chrono::Utc::now(),
        })
    }
    
    pub fn create_universal_agent(&self) -> Result<Agent> {
        self.create_agent(AgentConfig {
            id: "universal-agent".to_string(),
            name: "Universal Agent".to_string(),
            specialization: "general".to_string(),
            capabilities: vec![
                "code_generation".to_string(),
                "code_review".to_string(),
                "planning".to_string(),
            ],
            max_concurrent_tasks: 5,
            timeout_ms: 300000,
            retry_attempts: 3,
            autonomy_level: AutonomyLevel::FullyAutonomous,
        })
    }
}

impl Default for AgentFactory {
    fn default() -> Self {
        Self::new()
    }
}

