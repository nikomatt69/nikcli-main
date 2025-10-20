/*!
 * Chat Module
 * Production-ready chat interface management
 */

pub mod chat_manager;
pub mod autonomous_claude_interface;
pub mod stream_manager;

pub use chat_manager::ChatManager;
pub use autonomous_claude_interface::AutonomousClaudeInterface;
pub use stream_manager::ChatStreamManager;

pub mod nik_cli_commands;
pub use nik_cli_commands::NikCLICommands;
