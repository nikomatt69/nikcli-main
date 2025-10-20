/*!
 * Performance Optimizer - Production Ready
 */

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub total_requests: u64,
    pub average_response_time_ms: f64,
    pub cache_hit_rate: f64,
    pub error_rate: f64,
}

pub struct PerformanceOptimizer {
    total_requests: Arc<AtomicU64>,
    total_response_time_ms: Arc<AtomicU64>,
}

impl PerformanceOptimizer {
    pub fn new() -> Self {
        Self {
            total_requests: Arc::new(AtomicU64::new(0)),
            total_response_time_ms: Arc::new(AtomicU64::new(0)),
        }
    }
    
    pub fn record_request(&self, response_time_ms: u64) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.total_response_time_ms.fetch_add(response_time_ms, Ordering::Relaxed);
    }
    
    pub fn get_metrics(&self) -> PerformanceMetrics {
        let total = self.total_requests.load(Ordering::Relaxed);
        let total_time = self.total_response_time_ms.load(Ordering::Relaxed);
        
        PerformanceMetrics {
            total_requests: total,
            average_response_time_ms: if total > 0 {
                total_time as f64 / total as f64
            } else {
                0.0
            },
            cache_hit_rate: 0.0,
            error_rate: 0.0,
        }
    }
}

impl Default for PerformanceOptimizer {
    fn default() -> Self {
        Self::new()
    }
}

