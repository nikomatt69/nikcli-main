/*!
 * CLI Module - Production Ready
 */

pub mod nik_cli;
pub mod unified_cli;
pub mod main_orchestrator;
pub mod banner_animator;
pub mod introduction_module;
pub mod system_module;
pub mod service_module;
pub mod streaming_module;
pub mod onboarding_module;
pub mod slash_command_handler;
pub mod register_agents;
pub mod prompt_renderer;

pub use nik_cli::NikCLI;
pub use unified_cli::UnifiedCLI;
pub use main_orchestrator::MainOrchestrator;
pub use banner_animator::BannerAnimator;
pub use introduction_module::IntroductionModule;
pub use system_module::SystemModule;
pub use service_module::ServiceModule;
pub use streaming_module::{StreamingModule, StreamMessage, StreamContext, MessageType, MessageStatus};
pub use onboarding_module::OnboardingModule;
pub use slash_command_handler::{SlashCommandHandler, CommandResult};
pub use register_agents::register_agents;
pub use prompt_renderer::PromptRenderer;
