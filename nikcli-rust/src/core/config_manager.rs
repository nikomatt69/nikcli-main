/*!
 * Configuration Manager
 * Complete implementation matching config-manager.ts
 * Handles all configuration including models, API keys, Redis, Supabase, etc.
 */

use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use crate::types::{ModelProvider, LogLevel, ApprovalMode};

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliConfig {
    pub current_model: String,
    pub models: HashMap<String, ModelConfig>,
    pub api_keys: HashMap<String, String>,
    pub redis: RedisConfig,
    pub supabase: SupabaseConfig,
    pub vector: VectorConfig,
    pub agent_manager: AgentManagerConfig,
    pub embedding_provider: EmbeddingProviderConfig,
    pub security_mode: SecurityMode,
    pub tool_approval_policies: ToolApprovalPolicies,
    pub middleware: MiddlewareConfig,
    pub session: SessionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub provider: ModelProvider,
    pub model: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub enable_reasoning: bool,
    pub reasoning_mode: ReasoningMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningMode {
    Auto,
    Explicit,
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConfig {
    pub enabled: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    pub key_prefix: String,
    pub ttl_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseConfig {
    pub enabled: bool,
    pub url: Option<String>,
    pub anon_key: Option<String>,
    pub service_role_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorConfig {
    pub enabled: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    pub dimension: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentManagerConfig {
    pub max_concurrent_agents: usize,
    pub enable_guidance_system: bool,
    pub default_agent_timeout_ms: u64,
    pub log_level: LogLevel,
    pub require_approval_for_network: bool,
    pub approval_policy: ApprovalMode,
    pub sandbox: SandboxConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    pub enabled: bool,
    pub allow_file_system: bool,
    pub allow_network: bool,
    pub allow_commands: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingProviderConfig {
    pub default: String,
    pub fallback_chain: Vec<String>,
    pub cost_optimization: bool,
    pub auto_switch_on_failure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SecurityMode {
    Safe,
    Default,
    Developer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolApprovalPolicies {
    pub file_operations: ApprovalPolicy,
    pub git_operations: ApprovalPolicy,
    pub package_operations: ApprovalPolicy,
    pub system_commands: ApprovalPolicy,
    pub network_requests: ApprovalPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalPolicy {
    Always,
    Risky,
    Never,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MiddlewareConfig {
    pub enabled: bool,
    pub security: SecurityMiddlewareConfig,
    pub logging: LoggingMiddlewareConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityMiddlewareConfig {
    pub enabled: bool,
    pub priority: u32,
    pub strict_mode: bool,
    pub require_approval: bool,
    pub risk_threshold: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggingMiddlewareConfig {
    pub enabled: bool,
    pub priority: u32,
    pub log_level: LogLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub auto_save: bool,
    pub save_interval_ms: u64,
    pub max_history: usize,
}

/// Configuration Manager
#[derive(Clone)]
pub struct ConfigManager {
    config: Arc<RwLock<CliConfig>>,
    config_path: PathBuf,
}

impl ConfigManager {
    /// Create a new configuration manager
    pub fn new() -> Result<Self> {
        let config_path = Self::get_config_path()?;
        let config = Self::load_or_create_config(&config_path)?;

        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            config_path,
        })
    }

    /// Get the configuration file path
    fn get_config_path() -> Result<PathBuf> {
        let home = dirs::home_dir()
            .context("Could not find home directory")?;
        
        let config_dir = home.join(".nikcli");
        
        // Create config directory if it doesn't exist
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)?;
        }

        Ok(config_dir.join("config.json"))
    }

    /// Load configuration from file or create default
    fn load_or_create_config(path: &Path) -> Result<CliConfig> {
        if path.exists() {
            let content = fs::read_to_string(path)?;
            let config: CliConfig = serde_json::from_str(&content)?;
            Ok(config)
        } else {
            let config = Self::default_config();
            Self::save_config_to_file(path, &config)?;
            Ok(config)
        }
    }

    /// Save configuration to file
    fn save_config_to_file(path: &Path, config: &CliConfig) -> Result<()> {
        let json = serde_json::to_string_pretty(config)?;
        fs::write(path, json)?;
        Ok(())
    }

    /// Get default configuration
    fn default_config() -> CliConfig {
        let mut models = HashMap::new();
        
        // Add default models
        models.insert("claude-sonnet-4".to_string(), ModelConfig {
            provider: ModelProvider::Anthropic,
            model: "claude-sonnet-4-20250514".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4096),
            enable_reasoning: true,
            reasoning_mode: ReasoningMode::Auto,
        });

        models.insert("gpt-4o".to_string(), ModelConfig {
            provider: ModelProvider::OpenAI,
            model: "gpt-4o".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4096),
            enable_reasoning: false,
            reasoning_mode: ReasoningMode::Disabled,
        });

        models.insert("claude-haiku-4.5".to_string(), ModelConfig {
            provider: ModelProvider::Anthropic,
            model: "anthropic/claude-haiku-4.5".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4096),
            enable_reasoning: true,
            reasoning_mode: ReasoningMode::Auto,
        });

        models.insert("gemini-2.0-flash".to_string(), ModelConfig {
            provider: ModelProvider::Google,
            model: "gemini-2.0-flash-exp".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(8192),
            enable_reasoning: false,
            reasoning_mode: ReasoningMode::Disabled,
        });

        CliConfig {
            current_model: "claude-sonnet-4".to_string(),
            models,
            api_keys: HashMap::new(),
            redis: RedisConfig {
                enabled: false,
                url: None,
                token: None,
                key_prefix: "nikcli:".to_string(),
                ttl_seconds: 3600,
            },
            supabase: SupabaseConfig {
                enabled: false,
                url: None,
                anon_key: None,
                service_role_key: None,
            },
            vector: VectorConfig {
                enabled: false,
                url: None,
                token: None,
                dimension: 1536,
            },
            agent_manager: AgentManagerConfig {
                max_concurrent_agents: 3,
                enable_guidance_system: true,
                default_agent_timeout_ms: 60000,
                log_level: LogLevel::Info,
                require_approval_for_network: true,
                approval_policy: ApprovalMode::Always,
                sandbox: SandboxConfig {
                    enabled: true,
                    allow_file_system: true,
                    allow_network: true,
                    allow_commands: true,
                },
            },
            embedding_provider: EmbeddingProviderConfig {
                default: "openai".to_string(),
                fallback_chain: vec!["openai".to_string(), "openrouter".to_string()],
                cost_optimization: true,
                auto_switch_on_failure: true,
            },
            security_mode: SecurityMode::Safe,
            tool_approval_policies: ToolApprovalPolicies {
                file_operations: ApprovalPolicy::Risky,
                git_operations: ApprovalPolicy::Risky,
                package_operations: ApprovalPolicy::Risky,
                system_commands: ApprovalPolicy::Always,
                network_requests: ApprovalPolicy::Always,
            },
            middleware: MiddlewareConfig {
                enabled: true,
                security: SecurityMiddlewareConfig {
                    enabled: true,
                    priority: 1000,
                    strict_mode: false,
                    require_approval: true,
                    risk_threshold: "medium".to_string(),
                },
                logging: LoggingMiddlewareConfig {
                    enabled: true,
                    priority: 500,
                    log_level: LogLevel::Info,
                },
            },
            session: SessionConfig {
                auto_save: true,
                save_interval_ms: 30000,
                max_history: 1000,
            },
        }
    }

    /// Get the entire configuration
    pub fn get_config(&self) -> CliConfig {
        self.config.read().unwrap().clone()
    }

    /// Get a specific configuration value
    pub fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        let config = self.config.read().unwrap();
        let json = serde_json::to_value(&*config).ok()?;
        
        let parts: Vec<&str> = key.split('.').collect();
        let mut current = &json;
        
        for part in parts {
            current = current.get(part)?;
        }
        
        serde_json::from_value(current.clone()).ok()
    }

    /// Set a configuration value
    pub fn set<T: Serialize>(&self, key: &str, value: T) -> Result<()> {
        let mut config = self.config.write().unwrap();
        
        // Convert to JSON for easier manipulation
        let mut json = serde_json::to_value(&*config)?;
        
        let parts: Vec<&str> = key.split('.').collect();
        let mut current = &mut json;
        
        let mut val_json = serde_json::to_value(value)?;
        for (i, part) in parts.iter().enumerate() {
            if i == parts.len() - 1 {
                current[part] = val_json.take();
            } else {
                if !current[part].is_object() {
                    current[part] = serde_json::json!({});
                }
                current = &mut current[part];
            }
        }
        
        *config = serde_json::from_value(json)?;
        
        // Save to file
        Self::save_config_to_file(&self.config_path, &config)?;
        
        Ok(())
    }

    /// Get current model configuration
    pub fn get_current_model(&self) -> ModelConfig {
        let config = self.config.read().unwrap();
        config.models.get(&config.current_model)
            .cloned()
            .unwrap_or_else(|| {
                // Fallback to first available model
                config.models.values().next().cloned().unwrap()
            })
    }

    /// Set current model
    pub fn set_current_model(&self, model_name: &str) -> Result<()> {
        let mut config = self.config.write().unwrap();
        
        if !config.models.contains_key(model_name) {
            anyhow::bail!("Model {} not found in configuration", model_name);
        }
        
        config.current_model = model_name.to_string();
        Self::save_config_to_file(&self.config_path, &config)?;
        
        Ok(())
    }

    /// Get API key for a model or provider
    pub fn get_api_key(&self, key: &str) -> Option<String> {
        // First check config
        let config = self.config.read().unwrap();
        if let Some(api_key) = config.api_keys.get(key) {
            return Some(api_key.clone());
        }
        
        // Then check environment variables
        let env_key = format!("{}_API_KEY", key.to_uppercase().replace('-', "_"));
        std::env::var(&env_key).ok()
    }

    /// Set API key
    pub fn set_api_key(&self, key: &str, value: &str) -> Result<()> {
        let mut config = self.config.write().unwrap();
        config.api_keys.insert(key.to_string(), value.to_string());
        Self::save_config_to_file(&self.config_path, &config)?;
        Ok(())
    }

    /// Get Redis configuration
    pub fn get_redis_config(&self) -> RedisConfig {
        self.config.read().unwrap().redis.clone()
    }

    /// Get Supabase configuration
    pub fn get_supabase_config(&self) -> SupabaseConfig {
        self.config.read().unwrap().supabase.clone()
    }

    /// Save configuration
    pub fn save(&self) -> Result<()> {
        let config = self.config.read().unwrap();
        Self::save_config_to_file(&self.config_path, &config)
    }
}

impl Default for ConfigManager {
    fn default() -> Self {
        Self::new().expect("Failed to create default ConfigManager")
    }
}

// Global singleton instance
lazy_static::lazy_static! {
    pub static ref CONFIG_MANAGER: ConfigManager = ConfigManager::new()
        .expect("Failed to initialize global ConfigManager");
}
