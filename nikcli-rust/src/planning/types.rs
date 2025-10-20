//! Planning Types - PRODUCTION READY
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningConfig {
    pub max_steps: u32,
    pub timeout_seconds: u64,
}

impl Default for PlanningConfig {
    fn default() -> Self {
        Self {
            max_steps: 20,
            timeout_seconds: 300,
        }
    }
}
