/*!
 * Performance Middleware - Production Ready
 */

use std::time::Instant;

pub struct PerformanceMiddleware {
    enabled: bool,
}

impl PerformanceMiddleware {
    pub fn new() -> Self {
        Self { enabled: true }
    }
    
    pub fn start_timer(&self) -> Option<Instant> {
        if self.enabled {
            Some(Instant::now())
        } else {
            None
        }
    }
    
    pub fn end_timer(&self, start: Option<Instant>) -> Option<u128> {
        start.map(|s| s.elapsed().as_millis())
    }
}

impl Default for PerformanceMiddleware {
    fn default() -> Self {
        Self::new()
    }
}

