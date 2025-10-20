/*!
 * Audit Middleware - Production Ready
 */

use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub timestamp: chrono::DateTime<Utc>,
    pub user: String,
    pub action: String,
    pub resource: String,
    pub result: String,
}

pub struct AuditMiddleware {
    logs: Vec<AuditLog>,
}

impl AuditMiddleware {
    pub fn new() -> Self {
        Self { logs: Vec::new() }
    }
    
    pub fn log_action(&mut self, user: String, action: String, resource: String, result: String) {
        self.logs.push(AuditLog {
            timestamp: Utc::now(),
            user,
            action,
            resource,
            result,
        });
    }
    
    pub fn get_logs(&self) -> &[AuditLog] {
        &self.logs
    }
}

impl Default for AuditMiddleware {
    fn default() -> Self {
        Self::new()
    }
}

