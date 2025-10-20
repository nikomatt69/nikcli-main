/*!
 * Introduction Module - Production-ready startup banners and info
 * Exact port from TypeScript IntroductionModule
 */

use colored::*;

pub struct IntroductionModule;

impl IntroductionModule {
    /// Display welcome banner
    pub fn display_banner() {
        println!("{}", "═".repeat(60).cyan());
        println!("{}", "🤖 NikCLI - Context-Aware AI Development Assistant".bright_cyan().bold());
        println!("{}", "═".repeat(60).cyan());
    }
    
    /// Display API key setup instructions
    pub fn display_api_key_setup() {
        println!("\n{}", "🔑 API Key Setup".bright_white().bold());
        println!("{}", "─".repeat(60).bright_black());
        println!();
        
        println!("{}", "NikCLI supports multiple AI providers:".white());
        println!();
        
        println!("{} {}", "•".cyan(), "Anthropic (Claude)".bright_white());
        println!("  {}", "Set ANTHROPIC_API_KEY in .env or use /set-key".bright_black());
        println!();
        
        println!("{} {}", "•".cyan(), "OpenAI (GPT)".bright_white());
        println!("  {}", "Set OPENAI_API_KEY in .env or use /set-key".bright_black());
        println!();
        
        println!("{} {}", "•".cyan(), "Google (Gemini)".bright_white());
        println!("  {}", "Set GOOGLE_GENERATIVE_AI_API_KEY in .env or use /set-key".bright_black());
        println!();
        
        println!("{} {}", "•".cyan(), "Ollama (Local)".bright_white());
        println!("  {}", "Install from https://ollama.ai - No API key needed".bright_black());
        println!();
        
        println!("{} {}", "•".cyan(), "OpenRouter (Multi-provider)".bright_white());
        println!("  {}", "Set OPENROUTER_API_KEY in .env or use /set-key".bright_black());
        println!();
    }
    
    /// Display startup information
    pub fn display_startup_info() {
        println!("\n{}", "🚀 Quick Start".bright_white().bold());
        println!("{}", "─".repeat(60).bright_black());
        println!();
        
        println!("{}", "Getting started:".white());
        println!("  {} - Show available commands", "/help".cyan());
        println!("  {} - Switch AI model", "/model <name>".cyan());
        println!("  {} - List available models", "/models".cyan());
        println!("  {} - Create execution plan", "/plan".cyan());
        println!("  {} - List available agents", "/agents".cyan());
        println!();
        
        println!("{}", "Advanced features:".white());
        println!("  {} - Autonomous multi-agent execution", "/auto <task>".cyan());
        println!("  {} - Create VM container for isolated work", "/vm-create <repo>".cyan());
        println!("  {} - Analyze images with AI vision", "/analyze-image <path>".cyan());
        println!("  {} - Long-term memory management", "/remember <fact>".cyan());
        println!();
        
        println!("{}", "Configuration:".white());
        println!("  {} - Set API key", "/set-key <provider> <key>".cyan());
        println!("  {} - Import .env file", "/env <path>".cyan());
        println!("  {} - Show current config", "/config".cyan());
        println!();
        
        println!("{}", "Tips:".bright_yellow());
        println!("  {} - Access slash menu", "Type /".bright_black());
        println!("  {} - Cycle between modes (default/plan/vm)", "Shift+Tab".bright_black());
        println!("  {} - Interrupt processing", "Ctrl+C".bright_black());
        println!("  {} - Exit NikCLI", "/quit".bright_black());
        println!();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_introduction_module() {
        // Just ensure methods don't panic
        IntroductionModule::display_banner();
        IntroductionModule::display_api_key_setup();
        IntroductionModule::display_startup_info();
    }
}
