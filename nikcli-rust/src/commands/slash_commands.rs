use anyhow::Result;
use colored::Colorize;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, info};

use crate::core::{AgentManager, ChatManager, ConfigManager, PlanningManager};
use crate::ui::UIManager;

/// Slash command handler
pub struct SlashCommandHandler {
    commands: Vec<SlashCommand>,
}

/// Slash command definition
struct SlashCommand {
    name: &'static str,
    aliases: Vec<&'static str>,
    description: &'static str,
    usage: &'static str,
}

impl SlashCommandHandler {
    /// Create a new slash command handler
    pub fn new() -> Self {
        let mut handler = Self {
            commands: Vec::new(),
        };

        handler.register_default_commands();
        handler
    }

    /// Register default slash commands
    fn register_default_commands(&mut self) {
        self.commands = vec![
            SlashCommand {
                name: "/help",
                aliases: vec!["/h", "/?"],
                description: "Show help information",
                usage: "/help [command]",
            },
            SlashCommand {
                name: "/exit",
                aliases: vec!["/quit", "/q"],
                description: "Exit the CLI",
                usage: "/exit",
            },
            SlashCommand {
                name: "/clear",
                aliases: vec!["/cls"],
                description: "Clear chat history",
                usage: "/clear",
            },
            SlashCommand {
                name: "/model",
                aliases: vec!["/m"],
                description: "Switch AI model",
                usage: "/model <model-name>",
            },
            SlashCommand {
                name: "/agent",
                aliases: vec!["/a"],
                description: "Use a specific agent",
                usage: "/agent <agent-name> <task>",
            },
            SlashCommand {
                name: "/plan",
                aliases: vec!["/p"],
                description: "Create an execution plan",
                usage: "/plan <task-description>",
            },
            SlashCommand {
                name: "/status",
                aliases: vec!["/s"],
                description: "Show current status",
                usage: "/status",
            },
            SlashCommand {
                name: "/config",
                aliases: vec!["/cfg"],
                description: "Show configuration",
                usage: "/config",
            },
            SlashCommand {
                name: "/agents",
                aliases: vec![],
                description: "List available agents",
                usage: "/agents",
            },
            SlashCommand {
                name: "/models",
                aliases: vec![],
                description: "List available models",
                usage: "/models",
            },
        ];
    }

    /// Handle a slash command
    pub async fn handle_command(
        &self,
        command: &str,
        args: &[&str],
        config_manager: &Arc<Mutex<ConfigManager>>,
        agent_manager: &Arc<Mutex<AgentManager>>,
        planning_manager: &Arc<Mutex<PlanningManager>>,
        chat_manager: &Arc<Mutex<ChatManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        debug!("Handling command: {} with args: {:?}", command, args);

        match command {
            "/help" | "/h" | "/?" => self.handle_help(args, ui_manager),
            "/exit" | "/quit" | "/q" => self.handle_exit(ui_manager),
            "/clear" | "/cls" => self.handle_clear(chat_manager, ui_manager).await,
            "/model" | "/m" => self.handle_model(args, config_manager, ui_manager).await,
            "/agent" | "/a" => self.handle_agent(args, agent_manager, ui_manager).await,
            "/plan" | "/p" => self.handle_plan(args, planning_manager, ui_manager).await,
            "/status" | "/s" => self.handle_status(config_manager, ui_manager).await,
            "/config" | "/cfg" => self.handle_config(config_manager, ui_manager).await,
            "/agents" => self.handle_agents(agent_manager, ui_manager).await,
            "/models" => self.handle_models(ui_manager),
            _ => {
                ui_manager.print_error(&format!("Unknown command: {}", command));
                ui_manager.print_info("Type /help for available commands");
                Ok(())
            }
        }
    }

    /// Handle /help command
    fn handle_help(&self, args: &[&str], ui_manager: &UIManager) -> Result<()> {
        if args.is_empty() {
            ui_manager.print_info(&format!("{}", "Available Commands:".bright_cyan().bold()));
            println!();

            for cmd in &self.commands {
                let aliases = if !cmd.aliases.is_empty() {
                    format!(" ({})", cmd.aliases.join(", "))
                } else {
                    String::new()
                };

                println!(
                    "  {} {}",
                    cmd.name.bright_yellow(),
                    aliases.bright_black()
                );
                println!("    {}", cmd.description.bright_white());
                println!("    Usage: {}", cmd.usage.bright_black());
                println!();
            }
        } else {
            // Show help for specific command
            let cmd_name = format!("/{}", args[0].trim_start_matches('/'));
            if let Some(cmd) = self.commands.iter().find(|c| c.name == cmd_name) {
                println!("{}", cmd.name.bright_yellow().bold());
                println!("  {}", cmd.description);
                println!("  Usage: {}", cmd.usage.bright_black());
            } else {
                ui_manager.print_error(&format!("Unknown command: {}", cmd_name));
            }
        }

        Ok(())
    }

    /// Handle /exit command
    fn handle_exit(&self, ui_manager: &UIManager) -> Result<()> {
        ui_manager.print_success("Goodbye!");
        std::process::exit(0);
    }

    /// Handle /clear command
    async fn handle_clear(
        &self,
        chat_manager: &Arc<Mutex<ChatManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        let mut chat = chat_manager.lock().await;
        chat.clear();
        ui_manager.print_success("Chat history cleared");
        Ok(())
    }

    /// Handle /model command
    async fn handle_model(
        &self,
        args: &[&str],
        config_manager: &Arc<Mutex<ConfigManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        if args.is_empty() {
            let config = config_manager.lock().await;
            ui_manager.print_info(&format!(
                "Current model: {}",
                config.get_current_model().bright_yellow()
            ));
        } else {
            let model = args.join(" ");
            let mut config = config_manager.lock().await;
            config.set_model(&model)?;
            config.save().await?;
            ui_manager.print_success(&format!("Switched to model: {}", model));
        }
        Ok(())
    }

    /// Handle /agent command
    async fn handle_agent(
        &self,
        args: &[&str],
        agent_manager: &Arc<Mutex<AgentManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        if args.is_empty() {
            ui_manager.print_error("Usage: /agent <agent-name> <task>");
            return Ok(());
        }

        let agent_name = args[0];
        let task = args[1..].join(" ");

        if task.is_empty() {
            ui_manager.print_error("Please provide a task for the agent");
            return Ok(());
        }

        let agent_mgr = agent_manager.lock().await;
        let result = agent_mgr.execute_agent(agent_name, &task).await?;
        ui_manager.print_info(&result);

        Ok(())
    }

    /// Handle /plan command
    async fn handle_plan(
        &self,
        args: &[&str],
        planning_manager: &Arc<Mutex<PlanningManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        if args.is_empty() {
            ui_manager.print_error("Usage: /plan <task-description>");
            return Ok(());
        }

        let task = args.join(" ");
        let mut planner = planning_manager.lock().await;

        let plan_id = planner.create_plan(&task, "AI-generated plan");
        ui_manager.print_success(&format!("Created plan: {}", plan_id));

        // TODO: Generate plan steps using AI
        ui_manager.print_info("Plan generation with AI not yet implemented");

        Ok(())
    }

    /// Handle /status command
    async fn handle_status(
        &self,
        config_manager: &Arc<Mutex<ConfigManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        let config = config_manager.lock().await;

        println!("\n{}", "System Status".bright_cyan().bold());
        println!("{}", "─".repeat(50));
        println!(
            "  Model: {}",
            config.get_current_model().bright_yellow()
        );
        println!(
            "  API Key: {}",
            if config.get_api_key().is_some() {
                "Configured ✓".bright_green()
            } else {
                "Not configured ✗".bright_red()
            }
        );
        println!(
            "  Temperature: {}",
            config.get_config().temperature.to_string().bright_white()
        );
        println!(
            "  Max Tokens: {}",
            config.get_config().max_tokens.to_string().bright_white()
        );
        println!("{}", "─".repeat(50));

        Ok(())
    }

    /// Handle /config command
    async fn handle_config(
        &self,
        config_manager: &Arc<Mutex<ConfigManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        let config = config_manager.lock().await;
        let cfg = config.get_config();

        println!("\n{}", "Configuration".bright_cyan().bold());
        println!("{}", "─".repeat(50));
        println!("  Model: {}", cfg.model.bright_yellow());
        println!("  Temperature: {}", cfg.temperature);
        println!("  Max Tokens: {}", cfg.max_tokens);
        println!("  Streaming: {}", cfg.streaming);
        println!("  Auto Save: {}", cfg.auto_save);
        println!("{}", "─".repeat(50));

        Ok(())
    }

    /// Handle /agents command
    async fn handle_agents(
        &self,
        agent_manager: &Arc<Mutex<AgentManager>>,
        ui_manager: &UIManager,
    ) -> Result<()> {
        let mgr = agent_manager.lock().await;
        let agents = mgr.list_agents();

        println!("\n{}", "Available Agents".bright_cyan().bold());
        println!("{}", "─".repeat(50));

        for agent in agents {
            println!("  {} {}", "•".bright_yellow(), agent.name.bright_white().bold());
            println!("    {}", agent.description.bright_black());
            if !agent.capabilities.is_empty() {
                println!(
                    "    Capabilities: {}",
                    agent.capabilities.join(", ").bright_blue()
                );
            }
            println!();
        }

        Ok(())
    }

    /// Handle /models command
    fn handle_models(&self, ui_manager: &UIManager) -> Result<()> {
        println!("\n{}", "Available Models".bright_cyan().bold());
        println!("{}", "─".repeat(50));

        let models = vec![
            ("Claude 3.5 Sonnet", "anthropic/claude-3.5-sonnet", "Most capable Claude model"),
            ("Claude 3 Opus", "anthropic/claude-3-opus", "Powerful reasoning and analysis"),
            ("GPT-4", "openai/gpt-4", "OpenAI's most capable model"),
            ("GPT-3.5 Turbo", "openai/gpt-3.5-turbo", "Fast and cost-effective"),
        ];

        for (name, id, desc) in models {
            println!("  {} {}", "•".bright_yellow(), name.bright_white().bold());
            println!("    ID: {}", id.bright_blue());
            println!("    {}", desc.bright_black());
            println!();
        }

        Ok(())
    }
}

impl Default for SlashCommandHandler {
    fn default() -> Self {
        Self::new()
    }
}
