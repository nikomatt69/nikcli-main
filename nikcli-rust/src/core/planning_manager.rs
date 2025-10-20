use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tracing::{debug, info};
use uuid::Uuid;

/// Execution plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub id: String,
    pub title: String,
    pub description: String,
    pub steps: Vec<PlanStep>,
    pub status: PlanStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Plan step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: StepStatus,
    pub dependencies: Vec<String>,
    pub estimated_duration: Option<u64>,
}

/// Plan status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PlanStatus {
    Draft,
    Active,
    Completed,
    Failed,
    Cancelled,
}

/// Step status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum StepStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Skipped,
}

/// Planning manager for creating and executing plans
pub struct PlanningManager {
    plans: Vec<ExecutionPlan>,
    active_plan: Option<String>,
    working_directory: PathBuf,
}

impl PlanningManager {
    /// Create a new planning manager
    pub fn new(working_directory: &Path) -> Self {
        Self {
            plans: Vec::new(),
            active_plan: None,
            working_directory: working_directory.to_path_buf(),
        }
    }

    /// Create a new plan
    pub fn create_plan(&mut self, title: impl Into<String>, description: impl Into<String>) -> String {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now();

        let plan = ExecutionPlan {
            id: id.clone(),
            title: title.into(),
            description: description.into(),
            steps: Vec::new(),
            status: PlanStatus::Draft,
            created_at: now,
            updated_at: now,
        };

        info!("Created plan: {} ({})", plan.title, plan.id);
        self.plans.push(plan);
        id
    }

    /// Add a step to a plan
    pub fn add_step(
        &mut self,
        plan_id: &str,
        title: impl Into<String>,
        description: impl Into<String>,
    ) -> Result<String> {
        let step_id = Uuid::new_v4().to_string();

        let plan = self
            .plans
            .iter_mut()
            .find(|p| p.id == plan_id)
            .ok_or_else(|| anyhow::anyhow!("Plan not found: {}", plan_id))?;

        let step = PlanStep {
            id: step_id.clone(),
            title: title.into(),
            description: description.into(),
            status: StepStatus::Pending,
            dependencies: Vec::new(),
            estimated_duration: None,
        };

        debug!("Added step to plan {}: {}", plan_id, step.title);
        plan.steps.push(step);
        plan.updated_at = chrono::Utc::now();

        Ok(step_id)
    }

    /// Get a plan by ID
    pub fn get_plan(&self, plan_id: &str) -> Option<&ExecutionPlan> {
        self.plans.iter().find(|p| p.id == plan_id)
    }

    /// Update step status
    pub fn update_step_status(
        &mut self,
        plan_id: &str,
        step_id: &str,
        status: StepStatus,
    ) -> Result<()> {
        let plan = self
            .plans
            .iter_mut()
            .find(|p| p.id == plan_id)
            .ok_or_else(|| anyhow::anyhow!("Plan not found: {}", plan_id))?;

        let step = plan
            .steps
            .iter_mut()
            .find(|s| s.id == step_id)
            .ok_or_else(|| anyhow::anyhow!("Step not found: {}", step_id))?;

        debug!("Updated step {} status to {:?}", step_id, status);
        step.status = status;
        plan.updated_at = chrono::Utc::now();

        Ok(())
    }

    /// Execute a plan
    pub async fn execute_plan(&mut self, plan_id: &str) -> Result<()> {
        info!("Executing plan: {}", plan_id);

        let plan = self
            .plans
            .iter_mut()
            .find(|p| p.id == plan_id)
            .ok_or_else(|| anyhow::anyhow!("Plan not found: {}", plan_id))?;

        plan.status = PlanStatus::Active;
        self.active_plan = Some(plan_id.to_string());

        // TODO: Implement actual plan execution
        // For now, just mark as completed
        plan.status = PlanStatus::Completed;
        plan.updated_at = chrono::Utc::now();

        Ok(())
    }

    /// Save a plan to file
    pub async fn save_plan(&self, plan_id: &str, path: Option<PathBuf>) -> Result<PathBuf> {
        let plan = self
            .get_plan(plan_id)
            .ok_or_else(|| anyhow::anyhow!("Plan not found: {}", plan_id))?;

        let file_path = path.unwrap_or_else(|| {
            self.working_directory
                .join(format!("plan_{}.json", plan_id))
        });

        let content = serde_json::to_string_pretty(plan)?;
        tokio::fs::write(&file_path, content).await?;

        info!("Saved plan to: {:?}", file_path);
        Ok(file_path)
    }

    /// Load a plan from file
    pub async fn load_plan(&mut self, path: &Path) -> Result<String> {
        let content = tokio::fs::read_to_string(path).await?;
        let plan: ExecutionPlan = serde_json::from_str(&content)?;

        let plan_id = plan.id.clone();
        info!("Loaded plan: {} from {:?}", plan.title, path);
        self.plans.push(plan);

        Ok(plan_id)
    }

    /// List all plans
    pub fn list_plans(&self) -> Vec<&ExecutionPlan> {
        self.plans.iter().collect()
    }

    /// Get active plan
    pub fn get_active_plan(&self) -> Option<&ExecutionPlan> {
        self.active_plan
            .as_ref()
            .and_then(|id| self.get_plan(id))
    }
}
