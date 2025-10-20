/*!
 * Planning Manager - Production Ready
 * Orchestrates plan generation and execution
 */

use anyhow::Result;
use crate::services::PlanningService;
use std::sync::Arc;

pub struct PlanningManager {
    planning_service: Arc<PlanningService>,
}

impl PlanningManager {
    pub fn new(planning_service: Arc<PlanningService>) -> Self {
        Self { planning_service }
    }
    
    pub async fn create_plan(&self, user_request: String) -> Result<String> {
        let plan = self.planning_service.generate_plan(user_request).await?;
        Ok(plan.id)
    }
}

