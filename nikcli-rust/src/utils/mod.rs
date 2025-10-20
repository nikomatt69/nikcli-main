/*!
 * Utils Module
 * Production-ready utility functions
 */

pub mod logger;
pub mod syntax_highlighter;
pub mod text_wrapper;
pub mod async_lock;
pub mod circuit_breaker;
pub mod validation;
pub mod terminal_helpers;
pub mod string_extensions;

// Re-exports
pub use validation::*;
pub use terminal_helpers::*;
pub use logger::Logger;
pub use syntax_highlighter::SyntaxHighlighter;
pub use text_wrapper::TextWrapper;
pub use async_lock::AsyncLock;
pub use circuit_breaker::CircuitBreaker;
pub mod paste_handler;
pub mod structured_logger;
pub use paste_handler::{PasteHandler, PasteResult};
pub use structured_logger::{StructuredLogger, STRUCTURED_LOGGER};
pub use string_extensions::StringExtensions;
