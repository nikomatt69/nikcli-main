/*!
 * Analytics Manager - Production Ready
 */

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Analytics {
    pub total_commands: u64,
    pub total_tokens: u64,
    pub total_execution_time_ms: u64,
    pub success_rate: f64,
}

pub struct AnalyticsManager {
    total_commands: Arc<AtomicU64>,
    total_tokens: Arc<AtomicU64>,
    total_execution_time_ms: Arc<AtomicU64>,
    successful_commands: Arc<AtomicU64>,
}

impl AnalyticsManager {
    pub fn new() -> Self {
        Self {
            total_commands: Arc::new(AtomicU64::new(0)),
            total_tokens: Arc::new(AtomicU64::new(0)),
            total_execution_time_ms: Arc::new(AtomicU64::new(0)),
            successful_commands: Arc::new(AtomicU64::new(0)),
        }
    }
    
    pub fn record_command(&self, tokens: u64, execution_time_ms: u64, success: bool) {
        self.total_commands.fetch_add(1, Ordering::Relaxed);
        self.total_tokens.fetch_add(tokens, Ordering::Relaxed);
        self.total_execution_time_ms.fetch_add(execution_time_ms, Ordering::Relaxed);
        
        if success {
            self.successful_commands.fetch_add(1, Ordering::Relaxed);
        }
    }
    
    pub fn get_analytics(&self) -> Analytics {
        let total = self.total_commands.load(Ordering::Relaxed);
        let successful = self.successful_commands.load(Ordering::Relaxed);
        
        Analytics {
            total_commands: total,
            total_tokens: self.total_tokens.load(Ordering::Relaxed),
            total_execution_time_ms: self.total_execution_time_ms.load(Ordering::Relaxed),
            success_rate: if total > 0 {
                successful as f64 / total as f64
            } else {
                0.0
            },
        }
    }
}

impl Default for AnalyticsManager {
    fn default() -> Self {
        Self::new()
    }
}

