use anyhow::{Context, Result};
use colored::Colorize;
use rustyline::error::ReadlineError;
use rustyline::{DefaultEditor, Result as RustylineResult};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info, warn};

mod nik_cli;
mod options;

pub use nik_cli::NikCLI;
pub use options::*;

use crate::commands::SlashCommandHandler;
use crate::core::{
    AgentManager, ChatManager, ConfigManager, PlanningManager, SessionContext, TokenManager,
};
use crate::ui::{UIManager, render_welcome_banner};

/// Main CLI interface structure
pub struct CLIInterface {
    editor: DefaultEditor,
    config_manager: Arc<Mutex<ConfigManager>>,
    agent_manager: Arc<Mutex<AgentManager>>,
    planning_manager: Arc<Mutex<PlanningManager>>,
    chat_manager: Arc<Mutex<ChatManager>>,
    token_manager: Arc<Mutex<TokenManager>>,
    slash_handler: SlashCommandHandler,
    ui_manager: UIManager,
    session_context: Arc<Mutex<SessionContext>>,
    working_directory: PathBuf,
    current_mode: String,
    current_agent: Option<String>,
    execution_in_progress: bool,
}

impl CLIInterface {
    /// Create a new CLI interface
    pub async fn new() -> Result<Self> {
        let working_directory = std::env::current_dir()
            .context("Failed to get current directory")?;

        let config_manager = Arc::new(Mutex::new(ConfigManager::new(&working_directory).await?));
        let agent_manager = Arc::new(Mutex::new(AgentManager::new()));
        let planning_manager = Arc::new(Mutex::new(PlanningManager::new(&working_directory)));
        let chat_manager = Arc::new(Mutex::new(ChatManager::new()));
        let token_manager = Arc::new(Mutex::new(TokenManager::new()));
        let session_context = Arc::new(Mutex::new(SessionContext::new()));

        let editor = DefaultEditor::new()
            .context("Failed to create readline editor")?;

        let slash_handler = SlashCommandHandler::new();
        let ui_manager = UIManager::new();

        Ok(Self {
            editor,
            config_manager,
            agent_manager,
            planning_manager,
            chat_manager,
            token_manager,
            slash_handler,
            ui_manager,
            session_context,
            working_directory,
            current_mode: "default".to_string(),
            current_agent: None,
            execution_in_progress: false,
        })
    }

    /// Start enhanced chat interface
    pub async fn start_enhanced_chat(&mut self, options: NikCLIOptions) -> Result<()> {
        info!("Starting enhanced chat interface");

        // Apply options
        if let Some(model) = options.model {
            self.switch_model(&model).await?;
        }

        if options.plan {
            self.current_mode = "plan".to_string();
        }

        if let Some(agent) = options.agent {
            self.current_agent = Some(agent);
        }

        // Initialize systems
        self.initialize_systems().await?;

        // Render welcome banner
        render_welcome_banner(&self.ui_manager);

        // Show current status
        self.display_status().await?;

        // Main chat loop
        loop {
            let prompt = self.get_prompt();

            match self.editor.readline(&prompt) {
                Ok(line) => {
                    let line = line.trim();

                    if line.is_empty() {
                        continue;
                    }

                    // Add to history
                    let _ = self.editor.add_history_entry(line);

                    // Handle input
                    if let Err(e) = self.handle_input(line).await {
                        self.ui_manager.print_error(&format!("Error: {}", e));
                    }

                    // Check if should exit
                    if self.should_exit(line) {
                        break;
                    }
                }
                Err(ReadlineError::Interrupted) => {
                    self.ui_manager.print_info("Use /exit or Ctrl+D to exit");
                    continue;
                }
                Err(ReadlineError::Eof) => {
                    self.ui_manager.print_info("Exiting...");
                    break;
                }
                Err(err) => {
                    self.ui_manager.print_error(&format!("Error: {}", err));
                    break;
                }
            }
        }

        // Cleanup
        self.cleanup().await?;

        Ok(())
    }

    /// Get the current prompt string
    fn get_prompt(&self) -> String {
        let mode_indicator = match self.current_mode.as_str() {
            "plan" => "📋".to_string(),
            "vm" => "🖥️ ".to_string(),
            _ => "💬".to_string(),
        };

        let agent_indicator = if let Some(agent) = &self.current_agent {
            format!(" [{}]", agent.cyan())
        } else {
            String::new()
        };

        format!("{} {}{} ", mode_indicator, "nikcli".bright_blue().bold(), agent_indicator)
    }

    /// Handle user input
    async fn handle_input(&mut self, input: &str) -> Result<()> {
        debug!("Processing input: {}", input);

        // Check for slash commands
        if input.starts_with('/') {
            return self.handle_slash_command(input).await;
        }

        // Handle paste detection (multi-line input)
        if self.is_paste_input(input) {
            return self.handle_paste_input(input).await;
        }

        // Regular chat message
        self.process_chat_message(input).await
    }

    /// Handle slash commands
    async fn handle_slash_command(&mut self, input: &str) -> Result<()> {
        let parts: Vec<&str> = input.split_whitespace().collect();
        let command = parts[0];
        let args = &parts[1..];

        self.slash_handler
            .handle_command(
                command,
                args,
                &self.config_manager,
                &self.agent_manager,
                &self.planning_manager,
                &self.chat_manager,
                &self.ui_manager,
            )
            .await
    }

    /// Process regular chat message
    async fn process_chat_message(&mut self, message: &str) -> Result<()> {
        self.execution_in_progress = true;
        self.ui_manager.show_thinking();

        let mut chat_manager = self.chat_manager.lock().await;
        let config_manager = self.config_manager.lock().await;
        let token_manager = self.token_manager.lock().await;

        // Get AI response
        let response = chat_manager
            .send_message(message, &config_manager, &token_manager)
            .await?;

        self.ui_manager.hide_thinking();
        self.ui_manager.print_assistant_message(&response);

        self.execution_in_progress = false;
        Ok(())
    }

    /// Check if input is a paste (typically multi-line)
    fn is_paste_input(&self, input: &str) -> bool {
        input.len() > 1000 || input.lines().count() > 10
    }

    /// Handle pasted content
    async fn handle_paste_input(&mut self, input: &str) -> Result<()> {
        self.ui_manager
            .print_info(&format!("Processing pasted content ({} bytes)...", input.len()));
        self.process_chat_message(input).await
    }

    /// Check if should exit
    fn should_exit(&self, input: &str) -> bool {
        matches!(input.trim(), "/exit" | "/quit" | "exit" | "quit")
    }

    /// Initialize all systems
    async fn initialize_systems(&mut self) -> Result<()> {
        info!("Initializing systems...");

        // Initialize configuration
        let mut config = self.config_manager.lock().await;
        config.load().await?;
        drop(config);

        // Register default agents
        let mut agent_manager = self.agent_manager.lock().await;
        agent_manager.register_default_agents();
        drop(agent_manager);

        // Initialize session
        let mut session = self.session_context.lock().await;
        session.initialize();
        drop(session);

        Ok(())
    }

    /// Display current status
    async fn display_status(&self) -> Result<()> {
        let config = self.config_manager.lock().await;
        let model = config.get_current_model();

        self.ui_manager.print_info(&format!(
            "Mode: {} | Model: {}",
            self.current_mode.bright_cyan(),
            model.bright_yellow()
        ));

        Ok(())
    }

    /// Switch AI model
    async fn switch_model(&mut self, model: &str) -> Result<()> {
        let mut config = self.config_manager.lock().await;
        config.set_model(model)?;
        self.ui_manager
            .print_success(&format!("Switched to model: {}", model));
        Ok(())
    }

    /// Cleanup resources
    async fn cleanup(&mut self) -> Result<()> {
        info!("Cleaning up resources...");

        // Save session
        let session = self.session_context.lock().await;
        session.save().await?;

        self.ui_manager.print_success("Session saved");
        Ok(())
    }
}
