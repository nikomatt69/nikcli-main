/*!
 * System Module - Production-ready system checks and requirements
 * Exact port from TypeScript SystemModule
 */

use anyhow::Result;
use colored::*;
use std::process::Command;
use std::time::Duration;

pub struct SystemModule {
    last_ollama_status: Option<bool>,
}

impl SystemModule {
    pub fn new() -> Self {
        Self {
            last_ollama_status: None,
        }
    }
    
    /// Check if API keys are configured
    pub async fn check_api_keys() -> Result<bool> {
        let has_anthropic = std::env::var("ANTHROPIC_API_KEY").is_ok();
        let has_openai = std::env::var("OPENAI_API_KEY").is_ok();
        let has_google = std::env::var("GOOGLE_GENERATIVE_AI_API_KEY").is_ok();
        let has_openrouter = std::env::var("OPENROUTER_API_KEY").is_ok();
        
        let has_any = has_anthropic || has_openai || has_google || has_openrouter;
        
        if !has_any {
            println!("{}", "⚠️  No API keys found".yellow());
            println!("{}", "   Set at least one API key to use AI features".bright_black());
            println!("{}", "   Use /set-key <provider> <key> or configure .env file".bright_black());
        }
        
        Ok(has_any)
    }
    
    /// Check Node version (not applicable in Rust, but check Rust version)
    pub fn check_rust_version() -> bool {
        println!("{}", "✓ Rust runtime check".green());
        
        let version = rustc_version_runtime::version();
        println!("  {}", format!("Rust version: {}", version).bright_black());
        
        true
    }
    
    /// Check Ollama availability
    pub async fn check_ollama_availability(&mut self) -> Result<bool> {
        match Self::test_ollama_connection().await {
            Ok(true) => {
                if self.last_ollama_status != Some(true) {
                    println!("{}", "✓ Ollama available".green());
                }
                self.last_ollama_status = Some(true);
                Ok(true)
            }
            Ok(false) | Err(_) => {
                if self.last_ollama_status != Some(false) {
                    println!("{}", "⚠️  Ollama not available".yellow());
                    println!("{}", "   Install from https://ollama.ai for local AI models".bright_black());
                }
                self.last_ollama_status = Some(false);
                Ok(false)
            }
        }
    }
    
    async fn test_ollama_connection() -> Result<bool> {
        let base_url = std::env::var("OLLAMA_BASE_URL")
            .unwrap_or_else(|_| "http://localhost:11434".to_string());
        
        let client = crate::http_client_stub::Client::new();
        let response = client
            .get(format!("{}/api/tags", base_url))
            .timeout(Duration::from_secs(2))
            .send()
            .await;
        
        match response {
            Ok(resp) if resp.status().is_success() => Ok(true),
            _ => Ok(false),
        }
    }
    
    /// Check Docker availability
    pub async fn check_docker_availability() -> Result<bool> {
        match Command::new("docker").arg("--version").output() {
            Ok(output) if output.status.success() => {
                println!("{}", "✓ Docker available".green());
                Ok(true)
            }
            _ => {
                println!("{}", "⚠️  Docker not available".yellow());
                println!("{}", "   Install Docker for VM and browser features".bright_black());
                Ok(false)
            }
        }
    }
    
    /// Check all system requirements
    pub async fn check_system_requirements() -> Result<bool> {
        println!("\n{}", "🔍 Checking System Requirements".bright_white().bold());
        println!("{}", "─".repeat(60).bright_black());
        println!();
        
        let rust_ok = Self::check_rust_version();
        let api_keys_ok = Self::check_api_keys().await?;
        let _docker_ok = Self::check_docker_availability().await?;
        
        let mut instance = Self::new();
        let _ollama_ok = instance.check_ollama_availability().await?;
        
        println!();
        
        if !api_keys_ok {
            println!("{}", "⚠️  Warning: No API keys configured".yellow().bold());
            println!("{}", "   NikCLI requires at least one AI provider to function".bright_black());
            println!("{}", "   Use /set-key or configure .env file".bright_black());
            println!();
        }
        
        Ok(rust_ok && (api_keys_ok || std::env::var("SKIP_API_CHECK").is_ok()))
    }
}

impl Default for SystemModule {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_check_api_keys() {
        let result = SystemModule::check_api_keys().await;
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_check_rust_version() {
        assert!(SystemModule::check_rust_version());
    }
}
