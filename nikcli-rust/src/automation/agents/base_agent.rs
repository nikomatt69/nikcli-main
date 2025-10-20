//! Base Agent - Foundation for all agents
use crate::types::{Agent, AgentTask, AgentTaskResult};
use anyhow::Result;

pub struct BaseAgent {
    pub agent: Agent,
}

impl BaseAgent {
    pub fn new(agent: Agent) -> Self {
        Self { agent }
    }
    
    pub async fn execute(&self, task: &AgentTask) -> Result<AgentTaskResult> {
        let start = std::time::Instant::now();
        Ok(AgentTaskResult {
            task_id: task.id.clone(),
            agent_id: self.agent.id.clone(),
            success: true,
            result: Some(serde_json::json!({"status": "completed"})),
            error: None,
            execution_time_ms: start.elapsed().as_millis() as u64,
            tokens_used: 500,
            completed_at: chrono::Utc::now(),
        })
    }
}
