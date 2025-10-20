/*!
 * Agent Router - Production Ready
 */

use anyhow::Result;
use crate::types::{Agent, AgentTask};

pub struct AgentRouter;

impl AgentRouter {
    pub fn new() -> Self {
        Self
    }
    
    pub fn route_task(&self, task: &AgentTask, agents: &[Agent]) -> Option<String> {
        for agent in agents {
            if self.can_handle_task(agent, task) {
                return Some(agent.id.clone());
            }
        }
        None
    }
    
    fn can_handle_task(&self, agent: &Agent, task: &AgentTask) -> bool {
        if task.required_capabilities.is_empty() {
            return true;
        }
        
        task.required_capabilities
            .iter()
            .all(|cap| agent.capabilities.contains(cap))
    }
}

impl Default for AgentRouter {
    fn default() -> Self {
        Self::new()
    }
}

