/*!
 * Execution Policy Manager - Production Ready
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    pub require_confirmation: bool,
    pub allow_dangerous_operations: bool,
    pub max_execution_time_ms: u64,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            require_confirmation: true,
            allow_dangerous_operations: false,
            max_execution_time_ms: 300000,
        }
    }
}

pub struct ExecutionPolicyManager {
    config: PolicyConfig,
}

impl ExecutionPolicyManager {
    pub fn new(config: PolicyConfig) -> Self {
        Self { config }
    }
    
    pub fn check_permission(&self, operation: &str) -> bool {
        if operation.contains("delete") || operation.contains("rm") {
            self.config.allow_dangerous_operations
        } else {
            true
        }
    }
    
    pub fn requires_confirmation(&self) -> bool {
        self.config.require_confirmation
    }
}

impl Default for ExecutionPolicyManager {
    fn default() -> Self {
        Self::new(PolicyConfig::default())
    }
}

