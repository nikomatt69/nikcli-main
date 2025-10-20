/*!
 * Persistence Module
 * Complete session and state persistence systems
 */

pub mod work_session_manager;
pub mod edit_history;
pub mod enhanced_session_manager;

pub use work_session_manager::{WorkSessionManager, WorkSession, WorkSessionSummary};
pub use edit_history::{EditHistory, FileOperation, OperationType};
pub use enhanced_session_manager::{EnhancedSessionManager, ChatSession};

