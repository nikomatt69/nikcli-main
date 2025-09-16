use std::env;
use std::process;
use tokio;
use anyhow::Result;
use tracing::{info, error, warn};
use tracing_subscriber;

mod types;
mod core;
mod services;
mod ai;
mod chat;
mod planning;
mod automation;
mod tools;
mod ui;
mod middleware;
mod integrations;
mod providers;
mod utils;

use types::*;

/// Main entry point for NikCLI Rust implementation
#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    init_logging()?;

    info!("Starting NikCLI Rust implementation");

    // Parse command line arguments
    let args: Vec<String> = env::args().collect();
    
    // Handle different modes
    match args.get(1).map(|s| s.as_str()) {
        Some("--acp") | Some("acp") => {
            info!("Starting in ACP mode");
            run_acp_mode().await?;
        }
        Some("report") | Some("--report") => {
            info!("Starting in report mode");
            run_report_mode(&args).await?;
        }
        _ => {
            info!("Starting in interactive mode");
            run_interactive_mode().await?;
        }
    }

    Ok(())
}

/// Initialize logging system
fn init_logging() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    
    Ok(())
}

/// Run ACP (Agent Control Protocol) mode
async fn run_acp_mode() -> Result<()> {
    info!("ACP mode not yet implemented");
    // TODO: Implement ACP functionality
    Ok(())
}

/// Run report generation mode
async fn run_report_mode(args: &[String]) -> Result<()> {
    info!("Report mode not yet implemented");
    // TODO: Implement report generation
    Ok(())
}

/// Run interactive CLI mode
async fn run_interactive_mode() -> Result<()> {
    info!("Interactive mode not yet implemented");
    // TODO: Implement interactive CLI
    Ok(())
}

/// Display banner
fn display_banner() {
    let banner = r#"
███╗   ██╗██╗██╗  ██╗ ██████╗██╗     ██╗
████╗  ██║██║██║ ██╔╝██╔════╝██║     ██║
██╔██╗ ██║██║█████╔╝ ██║     ██║     ██║
██║╚██╗██║██║██╔═██╗ ██║     ██║     ██║
██║ ╚████║██║██║  ██╗╚██████╗███████╗██║
╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝
"#;
    
    println!("{}", banner);
}

/// Version information
#[derive(Debug, Clone)]
pub struct VersionInfo {
    pub current: String,
    pub latest: Option<String>,
    pub has_update: bool,
    pub error: Option<String>,
}

impl VersionInfo {
    pub fn new() -> Self {
        Self {
            current: env!("CARGO_PKG_VERSION").to_string(),
            latest: None,
            has_update: false,
            error: None,
        }
    }
}

/// System requirements checker
pub struct SystemChecker;

impl SystemChecker {
    pub async fn check_requirements() -> Result<bool> {
        info!("Checking system requirements");
        
        // Check Rust version
        Self::check_rust_version()?;
        
        // Check API keys
        Self::check_api_keys().await?;
        
        // Check system resources
        Self::check_system_resources()?;
        
        info!("All system requirements met");
        Ok(true)
    }
    
    fn check_rust_version() -> Result<()> {
        let version = std::env::var("RUSTC_SEMVER").unwrap_or_else(|_| "unknown".to_string());
        info!("Rust version: {}", version);
        Ok(())
    }
    
    async fn check_api_keys() -> Result<()> {
        let anthropic_key = env::var("ANTHROPIC_API_KEY").ok();
        let openai_key = env::var("OPENAI_API_KEY").ok();
        let google_key = env::var("GOOGLE_GENERATIVE_AI_API_KEY").ok();
        
        if anthropic_key.is_some() || openai_key.is_some() || google_key.is_some() {
            info!("API keys detected");
        } else {
            warn!("No API keys found");
        }
        
        Ok(())
    }
    
    fn check_system_resources() -> Result<()> {
        // TODO: Implement system resource checking
        info!("System resources check passed");
        Ok(())
    }
}

/// Error handling
#[derive(Debug, thiserror::Error)]
pub enum NikCLIError {
    #[error("Configuration error: {0}")]
    Configuration(String),
    
    #[error("Network error: {0}")]
    Network(String),
    
    #[error("Execution error: {0}")]
    Execution(String),
    
    #[error("Validation error: {0}")]
    Validation(String),
    
    #[error("Agent error: {0}")]
    Agent(String),
    
    #[error("Streaming error: {0}")]
    Streaming(String),
}

/// Graceful shutdown handler
pub struct ShutdownHandler;

impl ShutdownHandler {
    pub fn setup() -> Result<()> {
        tokio::spawn(async {
            tokio::signal::ctrl_c().await.expect("Failed to listen for ctrl+c");
            info!("Received shutdown signal");
            process::exit(0);
        });
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_info() {
        let version = VersionInfo::new();
        assert!(!version.current.is_empty());
    }

    #[tokio::test]
    async fn test_system_checker() {
        let result = SystemChecker::check_requirements().await;
        assert!(result.is_ok());
    }
}