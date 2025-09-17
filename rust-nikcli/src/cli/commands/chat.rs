use crate::cli::args::ChatArgs;
use crate::core::ConfigManager;
use crate::error::{NikCliError, NikCliResult};
use colored::*;
use dialoguer::{Confirm, Input, Select};
use std::io::{self, Write};
use tracing::{debug, info, warn};

mod slash_commands;
use slash_commands::*;

/// Execute chat command
pub async fn execute(args: ChatArgs) -> NikCliResult<()> {
    info!("Starting chat session");
    
    // Initialize configuration manager
    let mut config_manager = ConfigManager::new()?;
    
    // Validate configuration
    config_manager.validate()?;
    
    // Check system requirements
    check_system_requirements(&config_manager).await?;
    
    // Setup chat session
    let chat_session = setup_chat_session(&args, &mut config_manager).await?;
    
    // Start interactive chat
    if let Some(initial_message) = args.message {
        // Non-interactive mode with initial message
        process_message(&initial_message, &chat_session).await?;
    } else {
        // Interactive mode
        start_interactive_chat(&chat_session).await?;
    }
    
    Ok(())
}

/// Chat session configuration
#[derive(Debug, Clone)]
pub struct ChatSession {
    pub model: String,
    pub provider: String,
    pub autonomous: bool,
    pub plan_mode: bool,
    pub auto_accept: bool,
    pub temperature: f32,
    pub max_tokens: u32,
    pub system_prompt: Option<String>,
    pub structured_ui: bool,
}

/// Check system requirements
async fn check_system_requirements(config_manager: &ConfigManager) -> NikCliResult<()> {
    info!("Checking system requirements");
    
    // Check if API keys are configured
    if !config_manager.has_api_keys() {
        warn!("No API keys configured");
        
        // Check for Ollama models
        let current_model = config_manager.get_current_model()?;
        if current_model.provider.to_string() == "ollama" {
            info!("Using Ollama model, API keys not required");
        } else {
            return Err(NikCliError::SystemRequirement(
                "API keys are required for non-Ollama models".to_string()
            ));
        }
    }
    
    // Check Ollama availability if using Ollama
    let current_model = config_manager.get_current_model()?;
    if current_model.provider.to_string() == "ollama" {
        check_ollama_availability().await?;
    }
    
    debug!("System requirements check passed");
    Ok(())
}

/// Check Ollama availability
async fn check_ollama_availability() -> NikCliResult<()> {
    let host = std::env::var("OLLAMA_HOST").unwrap_or_else(|_| "127.0.0.1:11434".to_string());
    let base_url = if host.startsWith("http") {
        host
    } else {
        format!("http://{}", host)
    };
    
    let client = reqwest::Client::new();
    let response = client
        .get(&format!("{}/api/tags", base_url))
        .send()
        .await;
    
    match response {
        Ok(resp) => {
            if resp.status().is_success() {
                info!("Ollama service is available");
                Ok(())
            } else {
                Err(NikCliError::SystemRequirement(
                    format!("Ollama service returned status: {}", resp.status())
                ))
            }
        }
        Err(_) => {
            Err(NikCliError::SystemRequirement(
                format!("Ollama service not reachable at {}", base_url)
            ))
        }
    }
}

/// Setup chat session
async fn setup_chat_session(args: &ChatArgs, config_manager: &mut ConfigManager) -> NikCliResult<ChatSession> {
    let config = config_manager.get_config();
    let current_model = config_manager.get_current_model()?;
    
    // Determine model and provider
    let (model, provider) = if let Some(model_name) = &args.model {
        if let Some(model_config) = config.models.get(model_name) {
            (model_name.clone(), model_config.provider.to_string())
        } else {
            return Err(NikCliError::Config(format!("Model '{}' not found", model_name)));
        }
    } else if let Some(provider_enum) = &args.provider {
        // Find a model for the specified provider
        let provider_str = provider_enum.to_string();
        let model_name = config.models.iter()
            .find(|(_, model_config)| model_config.provider.to_string() == provider_str)
            .map(|(name, _)| name.clone())
            .ok_or_else(|| NikCliError::Config(format!("No model found for provider: {}", provider_str)))?;
        
        (model_name, provider_str)
    } else {
        (config.current_model.clone(), current_model.provider.to_string())
    };
    
    // Update current model if changed
    if model != config.current_model {
        config_manager.set_current_model(&model)?;
    }
    
    let session = ChatSession {
        model,
        provider,
        autonomous: args.autonomous,
        plan_mode: args.plan,
        auto_accept: args.auto_accept,
        temperature: args.temperature,
        max_tokens: args.max_tokens,
        system_prompt: args.system_prompt.clone(),
        structured_ui: args.structured_ui,
    };
    
    info!("Chat session configured: model={}, provider={}, autonomous={}", 
          session.model, session.provider, session.autonomous);
    
    Ok(session)
}

/// Start interactive chat loop
async fn start_interactive_chat(session: &ChatSession) -> NikCliResult<()> {
    println!("{}", "Starting interactive chat session...".green().bold());
    println!("{}", "Type '/help' for available commands, or start chatting!".cyan());
    println!("{}", "Press Ctrl+C to exit.".dim());
    println!();
    
    loop {
        // Display prompt
        display_prompt(session);
        
        // Read user input
        let mut input = String::new();
        io::stdout().flush()?;
        io::stdin().read_line(&mut input)?;
        
        let input = input.trim();
        if input.is_empty() {
            continue;
        }
        
        // Handle special commands
        if input.starts_with('/') {
            if let Err(e) = handle_command(input, session).await {
                eprintln!("{} {}", "Command error:".red().bold(), e);
            }
            continue;
        }
        
        // Process regular message
        if let Err(e) = process_message(input, session).await {
            eprintln!("{} {}", "Error:".red().bold(), e);
        }
    }
}

/// Display chat prompt
fn display_prompt(session: &ChatSession) {
    let dir = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .file_name()
        .unwrap_or_else(|| std::ffi::OsStr::new("."))
        .to_string_lossy()
        .to_string();
    
    let modes = if session.plan_mode { " plan" } else { "" };
    let auto_accept = if session.auto_accept { " auto-accept" } else { "" };
    
    print!("\n┌─[🎛️:{}]─[{}]─[{}]\n└─❯ ", 
           dir.green(), 
           session.model.cyan(),
           format!("{}{}", modes, auto_accept).yellow());
}

/// Handle special commands - Complete implementation of all slash commands
async fn handle_command(command: &str, session: &ChatSession) -> NikCliResult<()> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Ok(());
    }
    
    let cmd = parts[0];
    let args = &parts[1..];
    
    match cmd {
        // Basic commands
        "/help" => help_command().await?,
        "/quit" | "/exit" => quit_command().await?,
        "/clear" => clear_command().await?,
        "/default" => default_mode_command().await?,
        
        // Model and configuration commands
        "/model" => model_command(args).await?,
        "/models" => models_command().await?,
        "/set-key" => set_key_command(args).await?,
        "/config" => config_command().await?,
        "/temp" => temperature_command(args).await?,
        "/router" => router_command(args).await?,
        
        // Session management
        "/new" => new_session_command(args).await?,
        "/sessions" => sessions_command().await?,
        "/export" => export_command(args).await?,
        "/history" => history_command(args).await?,
        
        // System and stats
        "/system" => system_command(args).await?,
        "/stats" => stats_command().await?,
        "/debug" => debug_command().await?,
        
        // Agent commands
        "/agent" => agent_command(args).await?,
        "/agents" => list_agents_command().await?,
        "/auto" => autonomous_command(args).await?,
        "/parallel" => parallel_command(args).await?,
        "/factory" => factory_command().await?,
        "/create-agent" => create_agent_command(args).await?,
        "/launch-agent" => launch_agent_command(args).await?,
        
        // File operations
        "/read" => read_file_command(args).await?,
        "/write" => write_file_command(args).await?,
        "/edit" => edit_file_command(args).await?,
        "/ls" => list_files_command(args).await?,
        "/search" => search_command(args).await?,
        
        // Command execution
        "/run" => run_command_command(args).await?,
        "/install" => install_command(args).await?,
        "/npm" => npm_command(args).await?,
        "/yarn" => yarn_command(args).await?,
        "/git" => git_command(args).await?,
        "/docker" => docker_command(args).await?,
        "/process" => process_command().await?,
        "/kill" => kill_command(args).await?,
        "/build" => build_command().await?,
        "/test" => test_command(args).await?,
        "/lint" => lint_command().await?,
        "/create-project" => create_project_command(args).await?,
        
        // VM and container commands
        "/vm" => vm_command(args).await?,
        "/vm-create" => vm_create_command(args).await?,
        "/vm-list" => vm_list_command().await?,
        "/vm-stop" => vm_stop_command(args).await?,
        "/vm-remove" => vm_remove_command(args).await?,
        "/vm-connect" => vm_connect_command(args).await?,
        "/vm-logs" => vm_logs_command(args).await?,
        "/vm-mode" => vm_mode_command().await?,
        "/vm-switch" => vm_switch_command().await?,
        "/vm-dashboard" => vm_dashboard_command().await?,
        "/vm-select" => vm_select_command(args).await?,
        "/vm-status" => vm_status_command(args).await?,
        "/vm-exec" => vm_exec_command(args).await?,
        "/vm-ls" => vm_ls_command(args).await?,
        "/vm-broadcast" => vm_broadcast_command(args).await?,
        "/vm-health" => vm_health_command().await?,
        "/vm-backup" => vm_backup_command(args).await?,
        "/vm-stats" => vm_stats_command().await?,
        "/vm-create-pr" => vm_create_pr_command(args).await?,
        
        // Planning and todo
        "/plan" => plan_command(args).await?,
        "/todo" => todo_command(args).await?,
        "/todos" => todos_command(args).await?,
        "/compact" => compact_command(args).await?,
        "/super-compact" => super_compact_command(args).await?,
        "/approval" => approval_command(args).await?,
        
        // Security and modes
        "/security" => security_command(args).await?,
        "/dev-mode" => dev_mode_command(args).await?,
        "/safe-mode" => safe_mode_command().await?,
        "/clear-approvals" => clear_approvals_command().await?,
        
        // Blueprint system
        "/blueprints" => blueprints_command().await?,
        "/blueprint" => blueprint_command(args).await?,
        "/delete-blueprint" => delete_blueprint_command(args).await?,
        "/export-blueprint" => export_blueprint_command(args).await?,
        "/import-blueprint" => import_blueprint_command(args).await?,
        "/search-blueprints" => search_blueprints_command(args).await?,
        
        // Context and streaming
        "/context" => context_command(args).await?,
        "/stream" => stream_command(args).await?,
        
        // Image and vision
        "/analyze-image" => analyze_image_command(args).await?,
        "/images" => images_command().await?,
        "/generate-image" => generate_image_command(args).await?,
        
        // Web3 features
        "/web3" => web3_command(args).await?,
        
        // Memory system
        "/remember" => remember_command(args).await?,
        "/recall" => recall_command(args).await?,
        "/memory" => memory_command(args).await?,
        "/forget" => forget_command(args).await?,
        
        // Snapshot system
        "/snapshot" => snapshot_command(args).await?,
        "/restore" => restore_command(args).await?,
        "/list-snapshots" => list_snapshots_command(args).await?,
        
        // Diagnostic system
        "/index" => index_command(args).await?,
        "/diagnostic" => diagnostic_command(args).await?,
        "/monitor" => monitor_command(args).await?,
        "/diagnostic-status" => diagnostic_status_command().await?,
        "/start-diagnostic" => start_diagnostic_monitoring(args).await?,
        "/stop-diagnostic" => stop_diagnostic_monitoring(args).await?,
        
        _ => {
            println!("{}", format!("Unknown command: {}", cmd).red());
            println!("{}", "Type '/help' for available commands.".dim());
        }
    }
    
    Ok(())
}

/// Process a user message
async fn process_message(message: &str, session: &ChatSession) -> NikCliResult<()> {
    info!("Processing message: {}", message);
    
    // TODO: Implement actual AI processing
    // This is a placeholder implementation
    
    println!("{}", "🤖 AI Response:".blue().bold());
    println!("{}", format!("You said: \"{}\"", message).dim());
    println!("{}", "This is a placeholder response. AI integration will be implemented in the next phase.".yellow());
    println!();
    
    Ok(())
}

/// Show help information
fn show_help() {
    println!("{}", "📋 Available Commands".cyan().bold());
    println!();
    println!("{}", "/help     Show this help message".green());
    println!("{}", "/status   Show current session status".green());
    println!("{}", "/clear    Clear the screen".green());
    println!("{}", "/exit     Exit the chat session".green());
    println!();
    println!("{}", "Just type your message to start chatting with the AI!".dim());
}

/// Show current session status
fn show_status(session: &ChatSession) {
    println!("{}", "📊 Session Status".cyan().bold());
    println!();
    println!("{}: {}", "Model".green(), session.model);
    println!("{}: {}", "Provider".green(), session.provider);
    println!("{}: {}", "Autonomous".green(), session.autonomous);
    println!("{}: {}", "Plan Mode".green(), session.plan_mode);
    println!("{}: {}", "Auto Accept".green(), session.auto_accept);
    println!("{}: {}", "Temperature".green(), session.temperature);
    println!("{}: {}", "Max Tokens".green(), session.max_tokens);
    println!("{}: {}", "Structured UI".green(), session.structured_ui);
}

/// Clear the screen
fn clear_screen() {
    print!("\x1B[2J\x1B[1;1H");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::args::{ChatArgs, AiProvider};
    
    #[test]
    fn test_chat_session_creation() {
        let session = ChatSession {
            model: "test-model".to_string(),
            provider: "test-provider".to_string(),
            autonomous: false,
            plan_mode: false,
            auto_accept: false,
            temperature: 0.7,
            max_tokens: 8000,
            system_prompt: None,
            structured_ui: false,
        };
        
        assert_eq!(session.model, "test-model");
        assert_eq!(session.provider, "test-provider");
        assert!(!session.autonomous);
    }
    
    #[test]
    fn test_command_parsing() {
        let command = "/help";
        let parts: Vec<&str> = command.split_whitespace().collect();
        assert_eq!(parts[0], "/help");
    }
}