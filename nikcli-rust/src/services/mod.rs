/*!
 * Services Module
 * Core services for NikCLI
 */

pub mod agent_service;
pub mod tool_service;
pub mod planning_service;
pub mod memory_service;
pub mod lsp_service;
pub mod snapshot_service;
pub mod service_module;
pub mod cache_service;
pub mod orchestrator_service;
pub mod ai_completion_service;

// Re-export main types
pub use agent_service::AgentService;
pub use tool_service::ToolService;
pub use planning_service::PlanningService;
pub use memory_service::MemoryService;
pub use lsp_service::LspService;
pub use snapshot_service::SnapshotService;
pub use service_module::ServiceModule;
pub use cache_service::CacheService;
pub use orchestrator_service::OrchestratorService;
pub use ai_completion_service::AICompletionService;

pub mod dashboard_service;
pub mod unified_tool_renderer;
pub use dashboard_service::DashboardService;
pub use unified_tool_renderer::{UnifiedToolRenderer, initialize_unified_tool_renderer, get_unified_tool_renderer};
