/*!
 * Integrations Module
 * External service integrations with complete interfaces
 */

pub mod git_integration;
pub mod figma;
pub mod web3;
pub mod browsegpt;

// Re-exports
pub use git_integration::GitIntegration;
pub mod ide_diagnostic_integration;
pub use ide_diagnostic_integration::{IDEDiagnosticIntegration, IDE_DIAGNOSTIC_INTEGRATION};
