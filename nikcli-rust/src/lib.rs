/*!
 * NikCLI Library Module
 * Exports all public interfaces and types
 */

// Public module exports
pub mod types;      // Must be first - defines core types
pub mod core;       // Core systems (config, logger, etc)
pub mod ui;         // UI components
pub mod ai;         // AI system with ai-lib
pub mod providers;  // External providers (Redis, Supabase)
pub mod tools;      // Tool system
pub mod services;   // Services layer
pub mod planning;   // Planning system
pub mod context;    // Context management
pub mod streaming;  // Streaming system
pub mod chat;       // Chat interface
pub mod cli;        // CLI entry points

// Optional/Advanced modules
pub mod automation;
pub mod background_agents;
pub mod browser;
pub mod commands;
pub mod config;
pub mod guidance;
pub mod integrations;
pub mod lsp;
pub mod middleware;
pub mod policies;
pub mod prompts;
pub mod utils;
pub mod virtualized_agents;
pub mod persistence;

// Re-export commonly used types
pub use types::{
    Agent, AgentConfig, AgentTask, AgentStatus,
    ExecutionPlan, PlanStep, TaskStatus,
};

pub use core::{
    config_manager::ConfigManager,
    agent_manager::AgentManager,
};

pub use services::{
    agent_service::AgentService,
    tool_service::ToolService,
    planning_service::PlanningService,
};
pub mod streaming_orchestrator;
pub use streaming_orchestrator::StreamingOrchestrator;
pub mod http_client_stub;
