use crate::cli::args::ConfigArgs;
use crate::core::ConfigManager;
use crate::error::{NikCliError, NikCliResult};
use colored::*;
use dialoguer::{Confirm, Input, Select};
use serde_json;
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// Execute config command
pub async fn execute(args: ConfigArgs) -> NikCliResult<()> {
    let mut config_manager = ConfigManager::new()?;
    
    match args {
        ConfigArgs::Show => {
            show_config(&config_manager).await?;
        }
        ConfigArgs::Set { key, value } => {
            set_config_value(&mut config_manager, &key, &value).await?;
        }
        ConfigArgs::Get { key } => {
            get_config_value(&config_manager, &key).await?;
        }
        ConfigArgs::Init { interactive } => {
            init_config(&mut config_manager, interactive).await?;
        }
        ConfigArgs::Validate => {
            validate_config(&config_manager).await?;
        }
        ConfigArgs::Reset { confirm } => {
            reset_config(&mut config_manager, confirm).await?;
        }
    }
    
    Ok(())
}

/// Show current configuration
async fn show_config(config_manager: &ConfigManager) -> NikCliResult<()> {
    let config = config_manager.get_config();
    
    println!("{}", "📋 Current Configuration".cyan().bold());
    println!();
    
    // Basic settings
    println!("{}: {}", "Current Model".green(), config.current_model);
    println!("{}: {}", "Temperature".green(), config.temperature);
    println!("{}: {}", "Max Tokens".green(), config.max_tokens);
    println!("{}: {}", "Chat History".green(), config.chat_history);
    println!("{}: {}", "Max History Length".green(), config.max_history_length);
    println!("{}: {}", "Auto Analyze Workspace".green(), config.auto_analyze_workspace);
    println!("{}: {}", "Enable Auto Approve".green(), config.enable_auto_approve);
    
    if let Some(ref preferred_agent) = config.preferred_agent {
        println!("{}: {}", "Preferred Agent".green(), preferred_agent);
    }
    
    if let Some(ref system_prompt) = config.system_prompt {
        println!("{}: {}", "System Prompt".green(), system_prompt);
    }
    
    println!();
    
    // Model configurations
    println!("{}", "🤖 Available Models".cyan().bold());
    for (name, model_config) in &config.models {
        println!("  {}: {} ({})", 
                 name.green(), 
                 model_config.model.blue(), 
                 model_config.provider.to_string().yellow());
    }
    
    println!();
    
    // API Keys status
    println!("{}", "🔑 API Keys Status".cyan().bold());
    if let Some(ref api_keys) = config.api_keys {
        for (provider, _) in api_keys {
            println!("  {}: {}", provider.green(), "✓ Configured".green());
        }
    } else {
        println!("  {}", "No API keys configured".yellow());
    }
    
    println!();
    
    // Enhanced services
    println!("{}", "🚀 Enhanced Services".cyan().bold());
    println!("  {}: {}", "Redis".green(), if config.redis.enabled { "Enabled".green() } else { "Disabled".dim() });
    println!("  {}: {}", "Supabase".green(), if config.supabase.enabled { "Enabled".green() } else { "Disabled".dim() });
    
    Ok(())
}

/// Set configuration value
async fn set_config_value(config_manager: &mut ConfigManager, key: &str, value: &str) -> NikCliResult<()> {
    let mut config = config_manager.get_config_mut();
    
    match key {
        "current_model" => {
            if !config.models.contains_key(value) {
                return Err(NikCliError::Config(format!("Model '{}' not found", value)));
            }
            config.current_model = value.to_string();
            info!("Set current model to: {}", value);
        }
        "temperature" => {
            let temp: f32 = value.parse()
                .map_err(|_| NikCliError::Config("Invalid temperature value".to_string()))?;
            if temp < 0.0 || temp > 2.0 {
                return Err(NikCliError::Config("Temperature must be between 0.0 and 2.0".to_string()));
            }
            config.temperature = temp;
            info!("Set temperature to: {}", temp);
        }
        "max_tokens" => {
            let tokens: u32 = value.parse()
                .map_err(|_| NikCliError::Config("Invalid max_tokens value".to_string()))?;
            if tokens == 0 {
                return Err(NikCliError::Config("Max tokens must be greater than 0".to_string()));
            }
            config.max_tokens = tokens;
            info!("Set max_tokens to: {}", tokens);
        }
        "chat_history" => {
            let enabled: bool = value.parse()
                .map_err(|_| NikCliError::Config("Invalid boolean value".to_string()))?;
            config.chat_history = enabled;
            info!("Set chat_history to: {}", enabled);
        }
        "max_history_length" => {
            let length: u32 = value.parse()
                .map_err(|_| NikCliError::Config("Invalid max_history_length value".to_string()))?;
            if length == 0 {
                return Err(NikCliError::Config("Max history length must be greater than 0".to_string()));
            }
            config.max_history_length = length;
            info!("Set max_history_length to: {}", length);
        }
        "auto_analyze_workspace" => {
            let enabled: bool = value.parse()
                .map_err(|_| NikCliError::Config("Invalid boolean value".to_string()))?;
            config.auto_analyze_workspace = enabled;
            info!("Set auto_analyze_workspace to: {}", enabled);
        }
        "enable_auto_approve" => {
            let enabled: bool = value.parse()
                .map_err(|_| NikCliError::Config("Invalid boolean value".to_string()))?;
            config.enable_auto_approve = enabled;
            info!("Set enable_auto_approve to: {}", enabled);
        }
        "preferred_agent" => {
            if value == "null" || value.is_empty() {
                config.preferred_agent = None;
                info!("Cleared preferred_agent");
            } else {
                config.preferred_agent = Some(value.to_string());
                info!("Set preferred_agent to: {}", value);
            }
        }
        "system_prompt" => {
            if value == "null" || value.is_empty() {
                config.system_prompt = None;
                info!("Cleared system_prompt");
            } else {
                config.system_prompt = Some(value.to_string());
                info!("Set system_prompt to: {}", value);
            }
        }
        _ => {
            return Err(NikCliError::Config(format!("Unknown configuration key: {}", key)));
        }
    }
    
    // Save configuration
    config_manager.save()?;
    println!("{}", format!("✓ Set {} = {}", key, value).green());
    
    Ok(())
}

/// Get configuration value
async fn get_config_value(config_manager: &ConfigManager, key: &str) -> NikCliResult<()> {
    let config = config_manager.get_config();
    
    let value = match key {
        "current_model" => config.current_model.clone(),
        "temperature" => config.temperature.to_string(),
        "max_tokens" => config.max_tokens.to_string(),
        "chat_history" => config.chat_history.to_string(),
        "max_history_length" => config.max_history_length.to_string(),
        "auto_analyze_workspace" => config.auto_analyze_workspace.to_string(),
        "enable_auto_approve" => config.enable_auto_approve.to_string(),
        "preferred_agent" => config.preferred_agent.clone().unwrap_or_else(|| "null".to_string()),
        "system_prompt" => config.system_prompt.clone().unwrap_or_else(|| "null".to_string()),
        _ => {
            return Err(NikCliError::Config(format!("Unknown configuration key: {}", key)));
        }
    };
    
    println!("{}", value);
    Ok(())
}

/// Initialize configuration interactively
async fn init_config(config_manager: &mut ConfigManager, interactive: bool) -> NikCliResult<()> {
    if interactive {
        println!("{}", "🔧 Interactive Configuration Setup".cyan().bold());
        println!();
        
        // API Keys setup
        setup_api_keys(config_manager).await?;
        
        // Model selection
        select_model(config_manager).await?;
        
        // Enhanced services setup
        setup_enhanced_services(config_manager).await?;
        
        println!("{}", "✓ Configuration setup complete!".green().bold());
    } else {
        // Non-interactive setup with defaults
        config_manager.reset_to_defaults()?;
        config_manager.save()?;
        println!("{}", "✓ Default configuration created!".green().bold());
    }
    
    Ok(())
}

/// Setup API keys interactively
async fn setup_api_keys(config_manager: &mut ConfigManager) -> NikCliResult<()> {
    println!("{}", "🔑 API Key Setup".cyan().bold());
    
    let providers = vec![
        ("anthropic", "Anthropic (Claude)"),
        ("openai", "OpenAI (GPT)"),
        ("google", "Google (Gemini)"),
        ("ollama", "Ollama (Local)"),
        ("gateway", "AI Gateway"),
    ];
    
    let selection = Select::new()
        .with_prompt("Select AI provider to configure")
        .items(&providers)
        .interact()?;
    
    let (provider_key, provider_name) = &providers[selection];
    
    match *provider_key {
        "ollama" => {
            println!("{}", format!("Ollama setup: {}", provider_name).green());
            // Ollama doesn't need API keys
        }
        _ => {
            let api_key = Input::<String>::new()
                .with_prompt(format!("Enter {} API key", provider_name))
                .interact()?;
            
            if !api_key.is_empty() {
                // Parse provider enum
                let provider = match *provider_key {
                    "anthropic" => crate::core::config::AiProvider::Anthropic,
                    "openai" => crate::core::config::AiProvider::OpenAi,
                    "google" => crate::core::config::AiProvider::Google,
                    "gateway" => crate::core::config::AiProvider::Gateway,
                    _ => return Err(NikCliError::Config("Invalid provider".to_string())),
                };
                
                config_manager.set_api_key(&provider, &api_key)?;
                println!("{}", format!("✓ {} API key configured", provider_name).green());
            }
        }
    }
    
    Ok(())
}

/// Select model interactively
async fn select_model(config_manager: &mut ConfigManager) -> NikCliResult<()> {
    println!("{}", "🤖 Model Selection".cyan().bold());
    
    let config = config_manager.get_config();
    let model_names: Vec<&String> = config.models.keys().collect();
    
    if model_names.is_empty() {
        println!("{}", "No models available".yellow());
        return Ok(());
    }
    
    let selection = Select::new()
        .with_prompt("Select default model")
        .items(&model_names)
        .default(0)
        .interact()?;
    
    let selected_model = model_names[selection];
    config_manager.set_current_model(selected_model)?;
    
    println!("{}", format!("✓ Selected model: {}", selected_model).green());
    Ok(())
}

/// Setup enhanced services
async fn setup_enhanced_services(config_manager: &mut ConfigManager) -> NikCliResult<()> {
    println!("{}", "🚀 Enhanced Services Setup".cyan().bold());
    
    let mut config = config_manager.get_config_mut();
    
    // Redis setup
    if Confirm::new()
        .with_prompt("Enable Redis cache?")
        .default(false)
        .interact()? {
        
        config.redis.enabled = true;
        let host = Input::<String>::new()
            .with_prompt("Redis host")
            .default("127.0.0.1".to_string())
            .interact()?;
        config.redis.host = host;
        
        let port = Input::<String>::new()
            .with_prompt("Redis port")
            .default("6379".to_string())
            .interact()?;
        config.redis.port = port.parse().unwrap_or(6379);
        
        println!("{}", "✓ Redis configured".green());
    }
    
    // Supabase setup
    if Confirm::new()
        .with_prompt("Enable Supabase integration?")
        .default(false)
        .interact()? {
        
        config.supabase.enabled = true;
        let url = Input::<String>::new()
            .with_prompt("Supabase URL")
            .interact()?;
        config.supabase.url = Some(url);
        
        let anon_key = Input::<String>::new()
            .with_prompt("Supabase anonymous key")
            .interact()?;
        config.supabase.anon_key = Some(anon_key);
        
        println!("{}", "✓ Supabase configured".green());
    }
    
    Ok(())
}

/// Validate configuration
async fn validate_config(config_manager: &ConfigManager) -> NikCliResult<()> {
    println!("{}", "🔍 Validating Configuration".cyan().bold());
    
    match config_manager.validate() {
        Ok(_) => {
            println!("{}", "✓ Configuration is valid".green().bold());
        }
        Err(e) => {
            println!("{}", format!("✗ Configuration validation failed: {}", e).red().bold());
            return Err(e);
        }
    }
    
    // Additional checks
    let config = config_manager.get_config();
    
    // Check if current model exists
    if !config.models.contains_key(&config.current_model) {
        println!("{}", format!("✗ Current model '{}' not found", config.current_model).red());
        return Err(NikCliError::Config("Current model not found".to_string()));
    }
    
    // Check API keys
    if !config_manager.has_api_keys() {
        let current_model = config_manager.get_current_model()?;
        if current_model.provider.to_string() != "ollama" {
            println!("{}", "⚠ No API keys configured for non-Ollama model".yellow());
        }
    }
    
    println!("{}", "✓ All validation checks passed".green());
    Ok(())
}

/// Reset configuration to defaults
async fn reset_config(config_manager: &mut ConfigManager, confirm: bool) -> NikCliResult<()> {
    if !confirm {
        let confirmed = Confirm::new()
            .with_prompt("Are you sure you want to reset configuration to defaults?")
            .default(false)
            .interact()?;
        
        if !confirmed {
            println!("{}", "Configuration reset cancelled".yellow());
            return Ok(());
        }
    }
    
    config_manager.reset_to_defaults()?;
    config_manager.save()?;
    
    println!("{}", "✓ Configuration reset to defaults".green().bold());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[test]
    fn test_config_validation() {
        let config_manager = ConfigManager::new().unwrap();
        assert!(config_manager.validate().is_ok());
    }
    
    #[test]
    fn test_config_show() {
        let config_manager = ConfigManager::new().unwrap();
        // This test would need to capture stdout to verify output
        // For now, just ensure it doesn't panic
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(show_config(&config_manager)).unwrap();
    }
}