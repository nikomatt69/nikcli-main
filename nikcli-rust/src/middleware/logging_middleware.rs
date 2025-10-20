/*!
 * Logging Middleware - Production Ready
 */

pub struct LoggingMiddleware;

impl LoggingMiddleware {
    pub fn new() -> Self {
        Self
    }
    
    pub fn log_request(&self, method: &str, path: &str) {
        tracing::info!("Request: {} {}", method, path);
    }
    
    pub fn log_response(&self, status: u16) {
        tracing::info!("Response: {}", status);
    }
}

impl Default for LoggingMiddleware {
    fn default() -> Self {
        Self::new()
    }
}

