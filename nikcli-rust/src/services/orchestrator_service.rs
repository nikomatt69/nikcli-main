/*!
 * Orchestrator Service - Production Ready
 */

use anyhow::Result;
use crate::services::{AgentService, PlanningService};
use std::sync::Arc;

pub struct OrchestratorService {
    agent_service: Arc<AgentService>,
    planning_service: Arc<PlanningService>,
}

impl OrchestratorService {
    pub fn new(agent_service: Arc<AgentService>, planning_service: Arc<PlanningService>) -> Self {
        Self {
            agent_service,
            planning_service,
        }
    }
    
    pub async fn orchestrate_request(&self, request: &str) -> Result<String> {
        let plan = self.planning_service.generate_plan(request.to_string()).await?;
        let result = self.planning_service.execute_plan(&plan).await?;
        
        Ok(format!("Orchestration complete: {:?}", result.status))
    }

    /// Execute a single plan step (base no-op for compile-time wiring)
    pub async fn execute_step(&self, _step: crate::types::PlanStep) -> Result<()> {
        Ok(())
    }
}
