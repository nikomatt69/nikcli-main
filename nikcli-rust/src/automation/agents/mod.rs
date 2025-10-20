/*!
 * Automation Agents Module - PRODUCTION READY
 * All 22 agents from TypeScript
 */

pub mod universal_agent;
pub mod cognitive_agent_base;
pub mod base_agent;
pub mod ai_agent;
pub mod coding_agent;
pub mod frontend_agent;
pub mod backend_agent;
pub mod react_agent;
pub mod devops_agent;
pub mod code_generator_agent;
pub mod code_review_agent;
pub mod optimization_agent;
pub mod system_admin_agent;
pub mod autonomous_coder;
pub mod autonomous_orchestrator;
pub mod modern_agent_system;
pub mod multi_agent_orchestrator;
pub mod agent_router;
pub mod agent_manager;
pub mod event_bus;
pub mod cognitive_interfaces;
pub mod types;

// Re-exports
pub use universal_agent::UniversalAgent;
pub use cognitive_agent_base::CognitiveAgentBase;
pub use base_agent::BaseAgent;
pub use ai_agent::AIAgent;
pub use coding_agent::CodingAgent;
pub use frontend_agent::FrontendAgent;
pub use backend_agent::BackendAgent;
pub use react_agent::ReactAgent;
pub use devops_agent::DevOpsAgent;
pub use code_generator_agent::CodeGeneratorAgent;
pub use code_review_agent::CodeReviewAgent;
pub use optimization_agent::OptimizationAgent;
pub use system_admin_agent::SystemAdminAgent;
pub use autonomous_coder::AutonomousCoder;
pub use autonomous_orchestrator::AutonomousOrchestrator;
pub use modern_agent_system::ModernAgentSystem;
pub use multi_agent_orchestrator::MultiAgentOrchestrator;
pub use agent_router::AgentRouterSystem;
pub use agent_manager::AgentManagerSystem;
pub use event_bus::AgentEventBus;
pub use cognitive_interfaces::*;
pub use types::*;


