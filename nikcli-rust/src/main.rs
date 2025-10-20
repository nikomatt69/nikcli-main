use anyhow::Result;
use clap::{Parser, Subcommand};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

mod cli;
mod commands;
mod core;
mod ui;

use cli::NikCLI;

/// NikCLI - Advanced AI-powered CLI assistant
#[derive(Parser)]
#[command(name = "nikcli")]
#[command(about = "Advanced AI-powered CLI assistant", long_about = None)]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Agent to use for execution
    #[arg(short, long)]
    agent: Option<String>,

    /// AI model to use
    #[arg(short, long)]
    model: Option<String>,

    /// Enable auto mode (non-interactive)
    #[arg(long)]
    auto: bool,

    /// Enable planning mode
    #[arg(short, long)]
    plan: bool,

    /// Enable structured UI
    #[arg(long)]
    structured_ui: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Start interactive chat session
    Chat {
        /// Agent to use
        #[arg(short, long)]
        agent: Option<String>,

        /// AI model to use
        #[arg(short, long)]
        model: Option<String>,

        /// Enable planning mode
        #[arg(short, long)]
        plan: bool,
    },

    /// Generate execution plan for a task
    Plan {
        /// Task description
        task: String,

        /// Execute the plan immediately
        #[arg(short, long)]
        execute: bool,

        /// Save plan to file
        #[arg(short, long)]
        save: Option<String>,
    },

    /// Execute a specific agent
    Agent {
        /// Agent name
        name: String,

        /// Task for the agent
        task: String,

        /// Enable auto mode
        #[arg(long)]
        auto: bool,
    },

    /// Manage todo items
    Todo {
        /// List all todos
        #[arg(short, long)]
        list: bool,

        /// Add a new todo
        #[arg(short, long)]
        add: Option<String>,

        /// Complete a todo by ID
        #[arg(short, long)]
        complete: Option<String>,
    },

    /// Manage configuration
    Config {
        /// Show current configuration
        #[arg(short, long)]
        show: bool,

        /// Set AI model
        #[arg(short, long)]
        model: Option<String>,

        /// Set API key
        #[arg(short, long)]
        key: Option<String>,
    },

    /// Initialize project
    Init {
        /// Force re-initialization
        #[arg(short, long)]
        force: bool,
    },

    /// Show system status
    Status,

    /// List available agents
    Agents,

    /// List available AI models
    Models,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
        .init();

    let cli = Cli::parse();

    // Initialize NikCLI instance
    let mut nikcli = NikCLI::new().await?;

    // Handle commands
    match cli.command {
        Some(Commands::Chat { agent, model, plan }) => {
            nikcli
                .start_chat(cli::NikCLIOptions {
                    agent,
                    model,
                    auto: false,
                    plan,
                    structured_ui: cli.structured_ui,
                })
                .await?;
        }
        Some(Commands::Plan {
            task,
            execute,
            save,
        }) => {
            nikcli
                .generate_plan(
                    &task,
                    cli::PlanOptions {
                        execute: Some(execute),
                        save,
                    },
                )
                .await?;
        }
        Some(Commands::Agent { name, task, auto }) => {
            nikcli
                .execute_agent(&name, &task, cli::AgentOptions { auto: Some(auto) })
                .await?;
        }
        Some(Commands::Todo { list, add, complete }) => {
            nikcli
                .manage_todo(cli::TodoOptions {
                    list: Some(list),
                    add,
                    complete,
                })
                .await?;
        }
        Some(Commands::Config { show, model, key }) => {
            nikcli
                .manage_config(cli::ConfigOptions { show, model, key })
                .await?;
        }
        Some(Commands::Init { force }) => {
            nikcli.init_project(cli::InitOptions { force }).await?;
        }
        Some(Commands::Status) => {
            nikcli.show_status().await?;
        }
        Some(Commands::Agents) => {
            nikcli.list_agents().await?;
        }
        Some(Commands::Models) => {
            nikcli.list_models().await?;
        }
        None => {
            // Default: start chat with options
            nikcli
                .start_chat(cli::NikCLIOptions {
                    agent: cli.agent,
                    model: cli.model,
                    auto: cli.auto,
                    plan: cli.plan,
                    structured_ui: cli.structured_ui,
                })
                .await?;
        }
    }

    Ok(())
}
