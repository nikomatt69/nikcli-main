use std::collections::HashMap;
use std::path::Path;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use tokio::fs;

use crate::types::config::*;

/// Configuration manager for NikCLI
pub struct ConfigManager {
    config: HashMap<String, serde_json::Value>,
    config_path: String,
}

impl ConfigManager {
    pub fn new(config_path: String) -> Self {
        Self {
            config: HashMap::new(),
            config_path,
        }
    }

    pub async fn load(&mut self) -> Result<()> {
        if Path::new(&self.config_path).exists() {
            let content = fs::read_to_string(&self.config_path).await?;
            self.config = serde_json::from_str(&content)?;
        }
        Ok(())
    }

    pub async fn save(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(&self.config)?;
        fs::write(&self.config_path, content).await?;
        Ok(())
    }

    pub fn get<T>(&self, key: &str) -> Option<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        self.config.get(key).and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    pub fn set<T>(&mut self, key: &str, value: T) -> Result<()>
    where
        T: Serialize,
    {
        let json_value = serde_json::to_value(value)?;
        self.config.insert(key.to_string(), json_value);
        Ok(())
    }

    pub fn has(&self, key: &str) -> bool {
        self.config.contains_key(key)
    }

    pub fn delete(&mut self, key: &str) -> bool {
        self.config.remove(key).is_some()
    }

    pub fn clear(&mut self) {
        self.config.clear();
    }

    pub fn get_all(&self) -> &HashMap<String, serde_json::Value> {
        &self.config
    }

    pub fn get_current_model(&self) -> Option<String> {
        self.get("currentModel")
    }

    pub fn set_current_model(&mut self, model: String) -> Result<()> {
        self.set("currentModel", model)
    }

    pub fn get_models(&self) -> Option<HashMap<String, ModelConfig>> {
        self.get("models")
    }

    pub fn add_model(&mut self, name: String, config: ModelConfig) -> Result<()> {
        let mut models: HashMap<String, ModelConfig> = self.get_models().unwrap_or_default();
        models.insert(name, config);
        self.set("models", models)
    }

    pub fn get_supabase_credentials(&self) -> SupabaseCredentials {
        SupabaseCredentials {
            url: self.get("supabase.url").unwrap_or_default(),
            anon_key: self.get("supabase.anonKey").unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseCredentials {
    pub url: String,
    pub anon_key: String,
}

/// Simple configuration manager implementation
pub struct SimpleConfigManager {
    inner: ConfigManager,
}

impl SimpleConfigManager {
    pub fn new() -> Self {
        Self {
            inner: ConfigManager::new("config.json".to_string()),
        }
    }

    pub async fn initialize(&mut self) -> Result<()> {
        self.inner.load().await?;
        Ok(())
    }

    pub fn get<T>(&self, key: &str) -> T
    where
        T: for<'de> Deserialize<'de> + Default,
    {
        self.inner.get(key).unwrap_or_default()
    }

    pub fn set<T>(&mut self, key: &str, value: T) -> Result<()>
    where
        T: Serialize,
    {
        self.inner.set(key, value)
    }

    pub fn has(&self, key: &str) -> bool {
        self.inner.has(key)
    }

    pub fn delete(&mut self, key: &str) -> bool {
        self.inner.delete(key)
    }

    pub fn clear(&mut self) {
        self.inner.clear();
    }

    pub fn get_all(&self) -> HashMap<String, serde_json::Value> {
        self.inner.get_all().clone()
    }

    pub fn get_current_model(&self) -> String {
        self.inner.get_current_model().unwrap_or_else(|| "claude-3-sonnet".to_string())
    }

    pub fn set_current_model(&mut self, model: String) -> Result<()> {
        self.inner.set_current_model(model)
    }

    pub fn get_models(&self) -> HashMap<String, ModelConfig> {
        self.inner.get_models().unwrap_or_default()
    }

    pub fn add_model(&mut self, name: String, config: ModelConfig) -> Result<()> {
        self.inner.add_model(name, config)
    }

    pub fn get_supabase_credentials(&self) -> SupabaseCredentials {
        self.inner.get_supabase_credentials()
    }
}

impl Default for SimpleConfigManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_config_manager() {
        let mut config = ConfigManager::new("test_config.json".to_string());
        
        config.set("test_key", "test_value").unwrap();
        let value: String = config.get("test_key").unwrap();
        assert_eq!(value, "test_value");
        
        assert!(config.has("test_key"));
        assert!(!config.has("nonexistent_key"));
        
        config.delete("test_key");
        assert!(!config.has("test_key"));
    }

    #[test]
    fn test_simple_config_manager() {
        let mut config = SimpleConfigManager::new();
        
        config.set("test_key", "test_value").unwrap();
        let value: String = config.get("test_key");
        assert_eq!(value, "test_value");
        
        let default_value: String = config.get("nonexistent_key");
        assert_eq!(default_value, "");
    }
}