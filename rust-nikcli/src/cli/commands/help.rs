use crate::error::NikCliResult;
use colored::*;

/// Execute help command
pub async fn execute() -> NikCliResult<()> {
    println!("{}", "📚 NikCLI Help".cyan().bold());
    println!();
    
    // Main description
    println!("{}", "NikCLI is a context-aware AI development assistant that provides intelligent".white());
    println!("{}", "code analysis, generation, and automation capabilities.".white());
    println!();
    
    // Usage
    println!("{}", "## Usage".green().bold());
    println!("{}", "nikcli [OPTIONS] <COMMAND>".dim());
    println!();
    
    // Global options
    println!("{}", "## Global Options".green().bold());
    println!("{}", "  -v, --verbose     Enable verbose output".white());
    println!("{}", "  -q, --quiet       Suppress all output except errors".white());
    println!("{}", "  -c, --config      Configuration file path".white());
    println!("{}", "  -w, --workdir     Working directory".white());
    println!("{}", "  -h, --help        Show help information".white());
    println!("{}", "  -V, --version     Show version information".white());
    println!();
    
    // Commands
    println!("{}", "## Commands".green().bold());
    println!();
    
    // Chat command
    println!("{}", "### chat".yellow().bold());
    println!("{}", "  Start interactive chat session with AI".white());
    println!();
    println!("{}", "  Options:".dim());
    println!("{}", "    -m, --model <MODEL>        AI model to use".dim());
    println!("{}", "    -p, --provider <PROVIDER>  AI provider to use".dim());
    println!("{}", "    -a, --autonomous           Enable autonomous mode".dim());
    println!("{}", "    --plan                     Enable plan mode".dim());
    println!("{}", "    --auto-accept              Auto-accept all changes".dim());
    println!("{}", "    --system-prompt <PROMPT>   System prompt override".dim());
    println!("{}", "    --temperature <FLOAT>      Temperature (0.0-2.0)".dim());
    println!("{}", "    --max-tokens <INT>         Maximum tokens".dim());
    println!("{}", "    --structured-ui            Enable structured UI mode".dim());
    println!();
    println!("{}", "  Examples:".dim());
    println!("{}", "    nikcli chat".dim());
    println!("{}", "    nikcli chat --autonomous --model claude-3-sonnet".dim());
    println!("{}", "    nikcli chat \"Help me write a Rust function\"".dim());
    println!();
    
    // Config command
    println!("{}", "### config".yellow().bold());
    println!("{}", "  Manage configuration settings".white());
    println!();
    println!("{}", "  Subcommands:".dim());
    println!("{}", "    show                       Show current configuration".dim());
    println!("{}", "    set <KEY> <VALUE>          Set configuration value".dim());
    println!("{}", "    get <KEY>                  Get configuration value".dim());
    println!("{}", "    init [--interactive]       Initialize configuration".dim());
    println!("{}", "    validate                   Validate configuration".dim());
    println!("{}", "    reset [--confirm]          Reset to defaults".dim());
    println!();
    println!("{}", "  Examples:".dim());
    println!("{}", "    nikcli config show".dim());
    println!("{}", "    nikcli config set temperature 0.8".dim());
    println!("{}", "    nikcli config init --interactive".dim());
    println!();
    
    // Agent command
    println!("{}", "### agent".yellow().bold());
    println!("{}", "  Manage AI agents".white());
    println!();
    println!("{}", "  Subcommands:".dim());
    println!("{}", "    list                       List available agents".dim());
    println!("{}", "    start <AGENT> [TASK]       Start an agent".dim());
    println!("{}", "    stop <AGENT_ID>            Stop an agent".dim());
    println!("{}", "    status [AGENT_ID]          Show agent status".dim());
    println!("{}", "    create <NAME> <TYPE> [CONFIG]  Create new agent".dim());
    println!();
    println!("{}", "  Examples:".dim());
    println!("{}", "    nikcli agent list".dim());
    println!("{}", "    nikcli agent start universal-agent".dim());
    println!("{}", "    nikcli agent status".dim());
    println!();
    
    // Report command
    println!("{}", "### report".yellow().bold());
    println!("{}", "  Generate project reports".white());
    println!();
    println!("{}", "  Options:".dim());
    println!("{}", "    -o, --output <FILE>        Output file path".dim());
    println!("{}", "    -t, --report-type <TYPE>   Report type (analysis, metrics, security, performance)".dim());
    println!("{}", "    -d, --depth <INT>          Analysis depth (1-5)".dim());
    println!("{}", "    --include-metrics          Include code metrics".dim());
    println!("{}", "    --include-security         Include security analysis".dim());
    println!("{}", "    --include-performance      Include performance analysis".dim());
    println!();
    println!("{}", "  Examples:".dim());
    println!("{}", "    nikcli report".dim());
    println!("{}", "    nikcli report --output report.md --include-metrics".dim());
    println!("{}", "    nikcli report --report-type security --depth 5".dim());
    println!();
    
    // Environment variables
    println!("{}", "## Environment Variables".green().bold());
    println!("{}", "  NIKCLI_CONFIG               Configuration file path".white());
    println!("{}", "  ANTHROPIC_API_KEY           Anthropic API key".white());
    println!("{}", "  OPENAI_API_KEY              OpenAI API key".white());
    println!("{}", "  GOOGLE_GENERATIVE_AI_API_KEY Google API key".white());
    println!("{}", "  AI_GATEWAY_API_KEY          AI Gateway API key".white());
    println!("{}", "  OLLAMA_HOST                 Ollama host (default: 127.0.0.1:11434)".white());
    println!();
    
    // Examples
    println!("{}", "## Examples".green().bold());
    println!();
    println!("{}", "  # Start interactive chat".white());
    println!("{}", "  nikcli chat".dim());
    println!();
    println!("{}", "  # Start autonomous mode with specific model".white());
    println!("{}", "  nikcli chat --autonomous --model claude-3-sonnet".dim());
    println!();
    println!("{}", "  # Configure API key".white());
    println!("{}", "  nikcli config set api_key anthropic sk-...".dim());
    println!();
    println!("{}", "  # Generate project analysis report".white());
    println!("{}", "  nikcli report --output analysis.md --include-metrics".dim());
    println!();
    println!("{}", "  # Start a specific agent".white());
    println!("{}", "  nikcli agent start react-expert \"Review my React components\"".dim());
    println!();
    
    // Support
    println!("{}", "## Support".green().bold());
    println!("{}", "  For more information, visit:".white());
    println!("{}", "  https://github.com/nikomatt69/nikcli-main".blue().underline());
    println!();
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_help_execution() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(execute());
        assert!(result.is_ok());
    }
}