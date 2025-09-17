use clap::{Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};

/// NikCLI - Context-Aware AI Development Assistant
#[derive(Parser, Debug)]
#[command(
    name = "nikcli",
    version = env!("CARGO_PKG_VERSION"),
    about = "Context-Aware AI Development Assistant",
    long_about = "NikCLI is an autonomous AI development assistant that provides intelligent code analysis, generation, and automation capabilities."
)]
pub struct Args {
    /// Enable verbose output
    #[arg(short, long, global = true)]
    pub verbose: bool,
    
    /// Suppress all output except errors
    #[arg(short, long, global = true)]
    pub quiet: bool,
    
    /// Configuration file path
    #[arg(short, long, global = true, env = "NIKCLI_CONFIG")]
    pub config: Option<String>,
    
    /// Working directory
    #[arg(short, long, global = true)]
    pub workdir: Option<String>,
    
    /// Main command to execute
    #[command(subcommand)]
    pub command: Command,
}

/// Available AI providers
#[derive(Debug, Clone, ValueEnum, Serialize, Deserialize)]
pub enum AiProvider {
    #[value(name = "openai")]
    OpenAi,
    #[value(name = "anthropic")]
    Anthropic,
    #[value(name = "google")]
    Google,
    #[value(name = "ollama")]
    Ollama,
    #[value(name = "vercel")]
    Vercel,
    #[value(name = "gateway")]
    Gateway,
    #[value(name = "openrouter")]
    OpenRouter,
}

/// Available commands
#[derive(Subcommand, Debug)]
pub enum Command {
    /// Start interactive chat session
    Chat(ChatArgs),
    
    /// Manage configuration
    Config(ConfigArgs),
    
    /// Manage AI agents
    Agent(AgentArgs),
    
    /// Generate project reports
    Report(ReportArgs),
    
    /// Show version information
    Version,
    
    /// Show detailed help
    Help,
}

/// Chat command arguments
#[derive(Parser, Debug)]
pub struct ChatArgs {
    /// AI model to use
    #[arg(short, long, env = "NIKCLI_MODEL")]
    pub model: Option<String>,
    
    /// AI provider to use
    #[arg(short, long, value_enum, env = "NIKCLI_PROVIDER")]
    pub provider: Option<AiProvider>,
    
    /// Enable autonomous mode
    #[arg(short, long)]
    pub autonomous: bool,
    
    /// Enable plan mode
    #[arg(short, long)]
    pub plan: bool,
    
    /// Auto-accept all changes
    #[arg(short, long)]
    pub auto_accept: bool,
    
    /// System prompt override
    #[arg(long)]
    pub system_prompt: Option<String>,
    
    /// Temperature for AI responses (0.0-2.0)
    #[arg(long, default_value = "0.7")]
    pub temperature: f32,
    
    /// Maximum tokens for responses
    #[arg(long, default_value = "8000")]
    pub max_tokens: u32,
    
    /// Enable structured UI mode
    #[arg(long)]
    pub structured_ui: bool,
    
    /// Initial message to send
    #[arg()]
    pub message: Option<String>,
}

/// Configuration command arguments
#[derive(Subcommand, Debug)]
pub enum ConfigArgs {
    /// Show current configuration
    Show,
    
    /// Set configuration value
    Set {
        /// Configuration key
        key: String,
        /// Configuration value
        value: String,
    },
    
    /// Get configuration value
    Get {
        /// Configuration key
        key: String,
    },
    
    /// Initialize configuration
    Init {
        /// Interactive setup
        #[arg(short, long)]
        interactive: bool,
    },
    
    /// Validate configuration
    Validate,
    
    /// Reset to defaults
    Reset {
        /// Confirm reset
        #[arg(short, long)]
        confirm: bool,
    },
}

/// Agent command arguments
#[derive(Subcommand, Debug)]
pub enum AgentArgs {
    /// List available agents
    List,
    
    /// Start an agent
    Start {
        /// Agent name or type
        agent: String,
        /// Task description
        task: Option<String>,
    },
    
    /// Stop an agent
    Stop {
        /// Agent ID
        agent_id: String,
    },
    
    /// Show agent status
    Status {
        /// Agent ID (optional, shows all if not provided)
        agent_id: Option<String>,
    },
    
    /// Create a new agent
    Create {
        /// Agent name
        name: String,
        /// Agent type
        agent_type: String,
        /// Agent configuration (JSON)
        config: Option<String>,
    },
}

/// Report command arguments
#[derive(Parser, Debug)]
pub struct ReportArgs {
    /// Output file path
    #[arg(short, long)]
    pub output: Option<String>,
    
    /// Report type
    #[arg(short, long, default_value = "analysis")]
    pub report_type: String,
    
    /// Analysis depth (1-5)
    #[arg(short, long, default_value = "3")]
    pub depth: u8,
    
    /// Include code metrics
    #[arg(long)]
    pub include_metrics: bool,
    
    /// Include security analysis
    #[arg(long)]
    pub include_security: bool,
    
    /// Include performance analysis
    #[arg(long)]
    pub include_performance: bool,
    
    /// Target directory for analysis
    #[arg()]
    pub target: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;
    
    #[test]
    fn test_args_parsing() {
        // Test that Args can be created without panicking
        let _args = Args::command();
    }
    
    #[test]
    fn test_chat_args_parsing() {
        let args = ChatArgs::parse_from(&["nikcli", "chat", "--autonomous"]);
        assert!(args.autonomous);
        assert!(!args.plan);
    }
    
    #[test]
    fn test_config_args_parsing() {
        let args = ConfigArgs::parse_from(&["nikcli", "config", "show"]);
        assert!(matches!(args, ConfigArgs::Show));
    }
    
    #[test]
    fn test_agent_args_parsing() {
        let args = AgentArgs::parse_from(&["nikcli", "agent", "list"]);
        assert!(matches!(args, AgentArgs::List));
    }
    
    #[test]
    fn test_report_args_parsing() {
        let args = ReportArgs::parse_from(&["nikcli", "report", "--depth", "5"]);
        assert_eq!(args.depth, 5);
    }
}