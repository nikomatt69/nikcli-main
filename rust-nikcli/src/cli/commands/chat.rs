use crate::cli::args::ChatArgs;
use crate::core::ConfigManager;
use crate::error::{NikCliError, NikCliResult};
use colored::*;
use dialoguer::{Confirm, Input, Select};
use std::io::{self, Write};
use tracing::{debug, info, warn};

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

/// Handle special commands
async fn handle_command(command: &str, session: &ChatSession) -> NikCliResult<()> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    let cmd = parts[0];
    
    match cmd {
        "/help" => {
            show_help();
        }
        "/status" => {
            show_status(session);
        }
        "/clear" => {
            clear_screen();
        }
        "/exit" | "/quit" => {
            println!("{}", "Goodbye!".green().bold());
            std::process::exit(0);
        }
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