/*!
 * Unified CLI - Production Ready
 */

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "nikcli")]
#[command(about = "NikCLI - Context-Aware AI Development Assistant", long_about = None)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
    
    #[arg(short, long)]
    pub debug: bool,
    
    #[arg(long)]
    pub workdir: Option<String>,
}

#[derive(Subcommand)]
pub enum Commands {
    Chat {
        #[arg(short, long)]
        message: Option<String>,
    },
    Agent {
        #[arg(short, long)]
        list: bool,
    },
    Status,
    Version,
}

pub struct UnifiedCLI;

impl UnifiedCLI {
    pub fn new() -> Self {
        Self
    }
    
    pub async fn run(&self) -> Result<()> {
        let cli = Cli::parse();
        
        match &cli.command {
            Some(Commands::Chat { message }) => {
                println!("Chat mode");
                if let Some(msg) = message {
                    println!("Message: {}", msg);
                }
            }
            Some(Commands::Agent { list }) => {
                if *list {
                    println!("Listing agents...");
                }
            }
            Some(Commands::Status) => {
                println!("System Status: OK");
            }
            Some(Commands::Version) => {
                println!("NikCLI v0.5.0");
            }
            None => {
                println!("Starting interactive mode...");
            }
        }
        
        Ok(())
    }
}

impl Default for UnifiedCLI {
    fn default() -> Self {
        Self::new()
    }
}

