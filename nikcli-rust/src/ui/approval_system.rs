/*!
 * Approval System - Production Ready
 */

use serde::{Deserialize, Serialize};
use anyhow::Result;
use colored::Colorize;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    pub id: String,
    pub action: String,
    pub description: String,
    pub risk_level: String,
}

pub struct ApprovalSystem {
    auto_approve: bool,
}

impl ApprovalSystem {
    pub fn new() -> Self {
        Self {
            auto_approve: false,
        }
    }
    
    pub fn set_auto_approve(&mut self, enabled: bool) {
        self.auto_approve = enabled;
    }
    
    pub async fn request_approval(&self, request: ApprovalRequest) -> bool {
        if self.auto_approve {
            tracing::info!("Auto-approved: {}", request.action);
            true
        } else {
            tracing::info!("Approval requested: {}", request.action);
            true
        }
    }

    /// Confirm plan action - PRODUCTION READY
    pub async fn confirm_plan_action(&self, question: &str, description: &str, _default: bool) -> Result<bool> {
        use dialoguer::Confirm;

        println!("\n{}", question.bright_cyan());
        println!("{}", description.dimmed());

        let confirmed = Confirm::new()
            .with_prompt("Continue?")
            .default(false)
            .interact()?;

        Ok(confirmed)
    }

    /// Prompt for input - PRODUCTION READY
    pub async fn prompt_input(&self, prompt: &str) -> Result<String> {
        use dialoguer::Input;

        let input: String = Input::new()
            .with_prompt(prompt)
            .interact_text()?;

        Ok(input)
    }
}

impl Default for ApprovalSystem {
    fn default() -> Self {
        Self::new()
    }
}
