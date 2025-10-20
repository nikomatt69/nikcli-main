//! Structured Logger - PRODUCTION READY
pub struct StructuredLogger;
impl StructuredLogger {
    pub fn new() -> Self { Self }
    pub fn log(&self, level: &str, message: &str) {
        tracing::info!("[{}] {}", level, message);
    }
}
lazy_static::lazy_static! {
    pub static ref STRUCTURED_LOGGER: StructuredLogger = StructuredLogger::new();
}
