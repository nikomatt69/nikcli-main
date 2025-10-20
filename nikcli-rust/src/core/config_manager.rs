use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{debug, info};

/// Configuration manager for NikCLI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub model: String,
    pub api_key: Option<String>,
    pub openrouter_api_key: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub temperature: f32,
    pub max_tokens: usize,
    pub streaming: bool,
    pub auto_save: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            model: "anthropic/claude-3.5-sonnet".to_string(),
            api_key: None,
            openrouter_api_key: None,
            anthropic_api_key: None,
            openai_api_key: None,
            temperature: 0.7,
            max_tokens: 4096,
            streaming: true,
            auto_save: true,
        }
    }
}

pub struct ConfigManager {
    config: Config,
    config_path: PathBuf,
    project_path: PathBuf,
}

impl ConfigManager {
    /// Create a new config manager
    pub async fn new(project_path: &Path) -> Result<Self> {
        let config_path = Self::get_config_path()?;
        let mut manager = Self {
            config: Config::default(),
            config_path,
            project_path: project_path.to_path_buf(),
        };

        // Try to load existing config
        if let Err(e) = manager.load().await {
            debug!("Could not load config: {}, using defaults", e);
        }

        // Override with environment variables
        manager.apply_env_overrides();

        Ok(manager)
    }

    /// Get the config file path
    fn get_config_path() -> Result<PathBuf> {
        let proj_dirs = ProjectDirs::from("com", "nikcli", "nikcli-rust")
            .context("Failed to determine project directories")?;

        let config_dir = proj_dirs.config_dir();
        fs::create_dir_all(config_dir)
            .context("Failed to create config directory")?;

        Ok(config_dir.join("config.json"))
    }

    /// Load configuration from file
    pub async fn load(&mut self) -> Result<()> {
        if !self.config_path.exists() {
            info!("Config file not found, using defaults");
            return self.save().await;
        }

        let content = tokio::fs::read_to_string(&self.config_path)
            .await
            .context("Failed to read config file")?;

        self.config = serde_json::from_str(&content)
            .context("Failed to parse config file")?;

        info!("Configuration loaded from {:?}", self.config_path);
        Ok(())
    }

    /// Save configuration to file
    pub async fn save(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(&self.config)
            .context("Failed to serialize config")?;

        tokio::fs::write(&self.config_path, content)
            .await
            .context("Failed to write config file")?;

        debug!("Configuration saved to {:?}", self.config_path);
        Ok(())
    }

    /// Apply environment variable overrides
    fn apply_env_overrides(&mut self) {
        if let Ok(key) = std::env::var("OPENROUTER_API_KEY") {
            self.config.openrouter_api_key = Some(key);
        }

        if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
            self.config.anthropic_api_key = Some(key);
        }

        if let Ok(key) = std::env::var("OPENAI_API_KEY") {
            self.config.openai_api_key = Some(key);
        }

        if let Ok(model) = std::env::var("NIKCLI_MODEL") {
            self.config.model = model;
        }

        if let Ok(temp) = std::env::var("NIKCLI_TEMPERATURE") {
            if let Ok(temp_f) = temp.parse::<f32>() {
                self.config.temperature = temp_f;
            }
        }
    }

    /// Get current model
    pub fn get_current_model(&self) -> String {
        self.config.model.clone()
    }

    /// Set model
    pub fn set_model(&mut self, model: &str) -> Result<()> {
        self.config.model = model.to_string();
        Ok(())
    }

    /// Get API key for the current model
    pub fn get_api_key(&self) -> Option<String> {
        // Try provider-specific keys first
        if self.config.model.contains("anthropic") || self.config.model.contains("claude") {
            if let Some(key) = &self.config.anthropic_api_key {
                return Some(key.clone());
            }
        }

        if self.config.model.contains("openai") || self.config.model.contains("gpt") {
            if let Some(key) = &self.config.openai_api_key {
                return Some(key.clone());
            }
        }

        // Fall back to OpenRouter or generic API key
        self.config
            .openrouter_api_key
            .clone()
            .or_else(|| self.config.api_key.clone())
    }

    /// Set API key
    pub fn set_api_key(&mut self, key: String) {
        self.config.api_key = Some(key);
    }

    /// Get configuration reference
    pub fn get_config(&self) -> &Config {
        &self.config
    }

    /// Get mutable configuration reference
    pub fn get_config_mut(&mut self) -> &mut Config {
        &mut self.config
    }
}
