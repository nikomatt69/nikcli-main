#!/usr/bin/env rust

/**
 * NikCLI - Unified Autonomous AI Development Assistant
 * Rust Implementation
 */

use anyhow::Result;
use clap::Parser;
use colored::*;
use std::process;
use tracing::{error, info};

mod ai;
mod agents;
mod chat;
mod cli;
mod core;
mod error;
mod utils;

use cli::args::Args;
use error::NikCliError;

/// ASCII Art Banner
const BANNER: &str = r#"
███╗   ██╗██╗██╗  ██╗ ██████╗██╗     ██╗
████╗  ██║██║██║ ██╔╝██╔════╝██║     ██║
██╔██╗ ██║██║█████╔╝ ██║     ██║     ██║
██║╚██╗██║██║██╔═██╗ ██║     ██║     ██║
██║ ╚████║██║██║  ██╗╚██████╗███████╗██║
╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝
"#;

/// Display the NikCLI banner
fn display_banner() {
    println!("{}", BANNER.cyan().bold());
}

/// Initialize logging system
fn init_logging(verbose: bool) -> Result<()> {
    let level = if verbose { "debug" } else { "info" };
    
    tracing_subscriber::fmt()
        .with_env_filter(format!("nikcli={}", level))
        .with_target(false)
        .with_thread_ids(false)
        .with_thread_names(false)
        .init();
    
    Ok(())
}

/// Main entry point
#[tokio::main]
async fn main() -> Result<()> {
    // Parse command line arguments
    let args = Args::parse();
    
    // Initialize logging
    init_logging(args.verbose)?;
    
    // Display banner
    if !args.quiet {
        display_banner();
    }
    
    // Handle global error handlers
    setup_global_handlers();
    
    info!("Starting NikCLI v{}", env!("CARGO_PKG_VERSION"));
    
    // Execute the main CLI logic
    match cli::execute(args).await {
        Ok(_) => {
            info!("NikCLI completed successfully");
            Ok(())
        }
        Err(e) => {
            error!("NikCLI failed: {}", e);
            
            if !e.to_string().is_empty() {
                eprintln!("{} {}", "Error:".red().bold(), e);
            }
            
            process::exit(1);
        }
    }
}

/// Setup global error handlers for graceful shutdown
fn setup_global_handlers() {
    // Handle Ctrl+C gracefully
    tokio::spawn(async {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to listen for ctrl+c");
        
        info!("Received shutdown signal");
        process::exit(0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_banner_display() {
        // Test that banner can be displayed without panicking
        display_banner();
    }
    
    #[test]
    fn test_logging_init() {
        // Test logging initialization
        assert!(init_logging(false).is_ok());
        assert!(init_logging(true).is_ok());
    }
}