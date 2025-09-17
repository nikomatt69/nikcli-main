use crate::error::{config_error, NikCliError, NikCliResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

/// AI Provider types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AiProvider {
    OpenAi,
    Anthropic,
    Google,
    Ollama,
    Vercel,
    Gateway,
    OpenRouter,
}

impl std::fmt::Display for AiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiProvider::OpenAi => write!(f, "openai"),
            AiProvider::Anthropic => write!(f, "anthropic"),
            AiProvider::Google => write!(f, "google"),
            AiProvider::Ollama => write!(f, "ollama"),
            AiProvider::Vercel => write!(f, "vercel"),
            AiProvider::Gateway => write!(f, "gateway"),
            AiProvider::OpenRouter => write!(f, "openrouter"),
        }
    }
}

/// Model configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub provider: AiProvider,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            provider: AiProvider::Anthropic,
            model: "claude-3-sonnet-20240229".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(8000),
        }
    }
}

/// Model routing configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRouting {
    pub enabled: bool,
    pub verbose: bool,
    pub mode: String, // conservative, balanced, aggressive
}

impl Default for ModelRouting {
    fn default() -> Self {
        Self {
            enabled: true,
            verbose: false,
            mode: "balanced".to_string(),
        }
    }
}

/// MCP server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub r#type: String, // local, remote
    pub command: Option<Vec<String>>,
    pub enabled: bool,
    pub environment: Option<HashMap<String, String>>,
    pub timeout: Option<u64>,
    pub retries: Option<u32>,
    pub priority: Option<u32>,
    pub capabilities: Option<Vec<String>>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
}

/// Redis configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub database: u8,
    pub password: Option<String>,
    pub fallback: FallbackConfig,
}

impl Default for RedisConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: "127.0.0.1".to_string(),
            port: 6379,
            database: 0,
            password: None,
            fallback: FallbackConfig::default(),
        }
    }
}

/// Fallback configuration for cache
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FallbackConfig {
    pub enabled: bool,
    pub max_size: usize,
    pub ttl_seconds: u64,
}

impl Default for FallbackConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_size: 1000,
            ttl_seconds: 3600,
        }
    }
}

/// Supabase configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseConfig {
    pub enabled: bool,
    pub url: Option<String>,
    pub anon_key: Option<String>,
    pub features: SupabaseFeatures,
}

impl Default for SupabaseConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            url: None,
            anon_key: None,
            features: SupabaseFeatures::default(),
        }
    }
}

/// Supabase features configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseFeatures {
    pub auth: bool,
    pub storage: bool,
    pub realtime: bool,
    pub edge_functions: bool,
    pub vector_search: bool,
}

impl Default for SupabaseFeatures {
    fn default() -> Self {
        Self {
            auth: false,
            storage: false,
            realtime: false,
            edge_functions: false,
            vector_search: false,
        }
    }
}

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub current_model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub chat_history: bool,
    pub max_history_length: u32,
    pub system_prompt: Option<String>,
    pub auto_analyze_workspace: bool,
    pub enable_auto_approve: bool,
    pub preferred_agent: Option<String>,
    pub models: HashMap<String, ModelConfig>,
    pub api_keys: Option<HashMap<String, String>>,
    pub model_routing: ModelRouting,
    pub mcp: Option<HashMap<String, McpServerConfig>>,
    pub redis: RedisConfig,
    pub supabase: SupabaseConfig,
}

impl Default for Config {
    fn default() -> Self {
        let mut models = HashMap::new();
        models.insert(
            "claude-3-sonnet".to_string(),
            ModelConfig {
                provider: AiProvider::Anthropic,
                model: "claude-3-sonnet-20240229".to_string(),
                temperature: Some(0.7),
                max_tokens: Some(8000),
            },
        );
        models.insert(
            "gpt-4".to_string(),
            ModelConfig {
                provider: AiProvider::OpenAi,
                model: "gpt-4".to_string(),
                temperature: Some(0.7),
                max_tokens: Some(8000),
            },
        );
        models.insert(
            "llama3.1:8b".to_string(),
            ModelConfig {
                provider: AiProvider::Ollama,
                model: "llama3.1:8b".to_string(),
                temperature: Some(0.7),
                max_tokens: Some(8000),
            },
        );

        Self {
            current_model: "claude-3-sonnet".to_string(),
            temperature: 0.7,
            max_tokens: 8000,
            chat_history: true,
            max_history_length: 100,
            system_prompt: None,
            auto_analyze_workspace: true,
            enable_auto_approve: false,
            preferred_agent: None,
            models,
            api_keys: None,
            model_routing: ModelRouting::default(),
            mcp: None,
            redis: RedisConfig::default(),
            supabase: SupabaseConfig::default(),
        }
    }
}

/// Configuration manager
pub struct ConfigManager {
    config: Config,
    config_path: PathBuf,
}

impl ConfigManager {
    /// Create a new configuration manager
    pub fn new() -> NikCliResult<Self> {
        let config_path = Self::get_config_path()?;
        let config = Self::load_config(&config_path)?;
        
        Ok(Self {
            config,
            config_path,
        })
    }
    
    /// Get the default configuration file path
    fn get_config_path() -> NikCliResult<PathBuf> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| config_error!("Could not find home directory"))?;
        
        let config_dir = home_dir.join(".config").join("nikcli");
        
        // Create config directory if it doesn't exist
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)
                .map_err(|e| config_error!("Failed to create config directory: {}", e))?;
        }
        
        Ok(config_dir.join("config.toml"))
    }
    
    /// Load configuration from file
    fn load_config(path: &Path) -> NikCliResult<Config> {
        if !path.exists() {
            info!("Configuration file not found, creating default configuration");
            let default_config = Config::default();
            Self::save_config(&default_config, path)?;
            return Ok(default_config);
        }
        
        let content = fs::read_to_string(path)
            .map_err(|e| config_error!("Failed to read config file: {}", e))?;
        
        let config: Config = toml::from_str(&content)
            .map_err(|e| config_error!("Failed to parse config file: {}", e))?;
        
        debug!("Loaded configuration from {:?}", path);
        Ok(config)
    }
    
    /// Save configuration to file
    fn save_config(config: &Config, path: &Path) -> NikCliResult<()> {
        let content = toml::to_string_pretty(config)
            .map_err(|e| config_error!("Failed to serialize config: {}", e))?;
        
        fs::write(path, content)
            .map_err(|e| config_error!("Failed to write config file: {}", e))?;
        
        debug!("Saved configuration to {:?}", path);
        Ok(())
    }
    
    /// Get current configuration
    pub fn get_config(&self) -> &Config {
        &self.config
    }
    
    /// Get mutable reference to configuration
    pub fn get_config_mut(&mut self) -> &mut Config {
        &mut self.config
    }
    
    /// Save current configuration to file
    pub fn save(&self) -> NikCliResult<()> {
        Self::save_config(&self.config, &self.config_path)
    }
    
    /// Get current model configuration
    pub fn get_current_model(&self) -> NikCliResult<&ModelConfig> {
        self.config.models.get(&self.config.current_model)
            .ok_or_else(|| config_error!("Current model '{}' not found in configuration", self.config.current_model))
    }
    
    /// Set current model
    pub fn set_current_model(&mut self, model_name: &str) -> NikCliResult<()> {
        if !self.config.models.contains_key(model_name) {
            return Err(config_error!("Model '{}' not found in configuration", model_name));
        }
        
        self.config.current_model = model_name.to_string();
        info!("Switched to model: {}", model_name);
        Ok(())
    }
    
    /// Add a new model configuration
    pub fn add_model(&mut self, name: &str, config: ModelConfig) -> NikCliResult<()> {
        self.config.models.insert(name.to_string(), config);
        info!("Added model: {}", name);
        Ok(())
    }
    
    /// Remove a model configuration
    pub fn remove_model(&mut self, name: &str) -> NikCliResult<()> {
        if self.config.current_model == name {
            return Err(config_error!("Cannot remove current model '{}'", name));
        }
        
        if self.config.models.remove(name).is_some() {
            info!("Removed model: {}", name);
        }
        Ok(())
    }
    
    /// Get API key for a provider
    pub fn get_api_key(&self, provider: &AiProvider) -> Option<String> {
        self.config.api_keys.as_ref()
            .and_then(|keys| keys.get(&provider.to_string()))
            .cloned()
    }
    
    /// Set API key for a provider
    pub fn set_api_key(&mut self, provider: &AiProvider, key: &str) -> NikCliResult<()> {
        if self.config.api_keys.is_none() {
            self.config.api_keys = Some(HashMap::new());
        }
        
        self.config.api_keys.as_mut()
            .unwrap()
            .insert(provider.to_string(), key.to_string());
        
        info!("Set API key for provider: {}", provider);
        Ok(())
    }
    
    /// Check if API keys are configured
    pub fn has_api_keys(&self) -> bool {
        self.config.api_keys.as_ref()
            .map(|keys| !keys.is_empty())
            .unwrap_or(false)
    }
    
    /// Get Supabase credentials
    pub fn get_supabase_credentials(&self) -> (Option<String>, Option<String>) {
        (
            self.config.supabase.url.clone(),
            self.config.supabase.anon_key.clone(),
        )
    }
    
    /// Set Supabase credentials
    pub fn set_supabase_credentials(&mut self, url: &str, anon_key: &str) -> NikCliResult<()> {
        self.config.supabase.url = Some(url.to_string());
        self.config.supabase.anon_key = Some(anon_key.to_string());
        self.config.supabase.enabled = true;
        
        info!("Set Supabase credentials");
        Ok(())
    }
    
    /// Validate configuration
    pub fn validate(&self) -> NikCliResult<()> {
        // Check if current model exists
        if !self.config.models.contains_key(&self.config.current_model) {
            return Err(config_error!("Current model '{}' not found", self.config.current_model));
        }
        
        // Validate temperature range
        if self.config.temperature < 0.0 || self.config.temperature > 2.0 {
            return Err(config_error!("Temperature must be between 0.0 and 2.0"));
        }
        
        // Validate max tokens
        if self.config.max_tokens == 0 {
            return Err(config_error!("Max tokens must be greater than 0"));
        }
        
        // Validate model configurations
        for (name, model_config) in &self.config.models {
            if model_config.temperature.is_some() {
                let temp = model_config.temperature.unwrap();
                if temp < 0.0 || temp > 2.0 {
                    return Err(config_error!("Model '{}' has invalid temperature: {}", name, temp));
                }
            }
            
            if model_config.max_tokens.is_some() {
                let tokens = model_config.max_tokens.unwrap();
                if tokens == 0 {
                    return Err(config_error!("Model '{}' has invalid max_tokens: {}", name, tokens));
                }
            }
        }
        
        debug!("Configuration validation passed");
        Ok(())
    }
    
    /// Reset to default configuration
    pub fn reset_to_defaults(&mut self) -> NikCliResult<()> {
        self.config = Config::default();
        info!("Reset configuration to defaults");
        Ok(())
    }
}

impl Default for ConfigManager {
    fn default() -> Self {
        Self::new().expect("Failed to create default ConfigManager")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[test]
    fn test_config_default() {
        let config = Config::default();
        assert_eq!(config.current_model, "claude-3-sonnet");
        assert_eq!(config.temperature, 0.7);
        assert!(config.models.contains_key("claude-3-sonnet"));
    }
    
    #[test]
    fn test_model_config_default() {
        let model_config = ModelConfig::default();
        assert_eq!(model_config.provider, AiProvider::Anthropic);
        assert_eq!(model_config.model, "claude-3-sonnet-20240229");
    }
    
    #[test]
    fn test_config_validation() {
        let mut config = Config::default();
        assert!(ConfigManager::validate_config(&config).is_ok());
        
        config.temperature = 3.0;
        assert!(ConfigManager::validate_config(&config).is_err());
    }
    
    #[test]
    fn test_config_serialization() {
        let config = Config::default();
        let serialized = toml::to_string(&config).unwrap();
        let deserialized: Config = toml::from_str(&serialized).unwrap();
        
        assert_eq!(config.current_model, deserialized.current_model);
        assert_eq!(config.temperature, deserialized.temperature);
    }
    
    #[test]
    fn test_ai_provider_display() {
        assert_eq!(AiProvider::Anthropic.to_string(), "anthropic");
        assert_eq!(AiProvider::OpenAi.to_string(), "openai");
        assert_eq!(AiProvider::Ollama.to_string(), "ollama");
    }
}