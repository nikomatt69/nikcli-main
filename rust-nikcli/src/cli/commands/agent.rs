use crate::agents::manager::AgentManager;
use crate::agents::types::*;
use crate::cli::args::AgentArgs;
use crate::core::ConfigManager;
use crate::error::{NikCliError, NikCliResult};
use colored::*;
use dialoguer::{Confirm, Input, Select};
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Execute agent command
pub async fn execute(args: AgentArgs) -> NikCliResult<()> {
    // Initialize agent manager
    let config_manager = Arc::new(ConfigManager::new()?);
    let agent_manager = AgentManager::new(config_manager);
    
    // Register agents
    crate::agents::register_agents(&agent_manager)?;
    
    match args {
        AgentArgs::List => {
            list_agents(&agent_manager).await?;
        }
        AgentArgs::Start { agent, task } => {
            start_agent(&agent_manager, &agent, task.as_deref()).await?;
        }
        AgentArgs::Stop { agent_id } => {
            stop_agent(&agent_manager, &agent_id).await?;
        }
        AgentArgs::Status { agent_id } => {
            show_agent_status(&agent_manager, agent_id.as_deref()).await?;
        }
        AgentArgs::Create { name, agent_type, config } => {
            create_agent(&agent_manager, &name, &agent_type, config.as_deref()).await?;
        }
    }
    
    Ok(())
}

/// List available agents
async fn list_agents(agent_manager: &AgentManager) -> NikCliResult<()> {
    println!("{}", "🤖 Available Agents".cyan().bold());
    println!();
    
    let agents = agent_manager.list_agents().await;
    
    if agents.is_empty() {
        println!("{}", "No agents available. Creating default agents...".yellow());
        
        // Create universal agent
        agent_manager.create_agent("universal-agent").await?;
        
        let agents = agent_manager.list_agents().await;
        for agent in agents {
            println!("  {}: {} ({})", 
                     agent.id.green(), 
                     agent.config.name.blue(),
                     agent.status.to_string().dim());
        }
    } else {
        for agent in agents {
            println!("  {}: {} ({})", 
                     agent.id.green(), 
                     agent.config.name.blue(),
                     agent.status.to_string().dim());
        }
    }
    
    println!();
    println!("{}", "Use 'nikcli agent start <agent-name>' to start an agent".dim());
    
    Ok(())
}

/// Start an agent
async fn start_agent(agent_manager: &AgentManager, agent_name: &str, task: Option<&str>) -> NikCliResult<()> {
    info!("Starting agent: {}", agent_name);
    
    // Create agent if it doesn't exist
    agent_manager.create_agent(agent_name).await?;
    
    // Get task if not provided
    let task_description = if let Some(task) = task {
        task.to_string()
    } else {
        Input::<String>::new()
            .with_prompt("Enter task description")
            .interact()?
    };
    
    if task_description.is_empty() {
        return Err(NikCliError::Agent("Task description cannot be empty".to_string()));
    }
    
    println!("{}", format!("🚀 Starting {} agent...", agent_name).green().bold());
    println!("{}", format!("Task: {}", task_description).cyan());
    
    // Create agent task
    let agent_task = AgentTask {
        id: uuid::Uuid::new_v4().to_string(),
        description: task_description,
        priority: TaskPriority::Normal,
        estimated_duration: None,
        dependencies: Vec::new(),
        context: AgentContext {
            working_directory: std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            project_type: None,
            language: None,
            framework: None,
            dependencies: Vec::new(),
            environment_variables: std::collections::HashMap::new(),
            user_preferences: std::collections::HashMap::new(),
        },
        created_at: chrono::Utc::now(),
        deadline: None,
    };
    
    // Run task with agent
    let result = agent_manager.run_task(agent_name, agent_task).await?;
    
    println!("{}", "Agent task completed!".green());
    println!("{}", format!("Result: {}", result.output).dim());
    
    if !result.files_modified.is_empty() {
        println!("{}", "Files modified:".yellow());
        for file in &result.files_modified {
            println!("  {}", file.blue());
        }
    }
    
    if !result.commands_executed.is_empty() {
        println!("{}", "Commands executed:".yellow());
        for cmd in &result.commands_executed {
            println!("  {}", cmd.blue());
        }
    }
    
    Ok(())
}

/// Stop an agent
async fn stop_agent(agent_manager: &AgentManager, agent_id: &str) -> NikCliResult<()> {
    info!("Stopping agent: {}", agent_id);
    
    println!("{}", format!("⏹️ Stopping agent: {}", agent_id).yellow().bold());
    
    agent_manager.stop_agent(agent_id).await?;
    
    println!("{}", "Agent stopped successfully!".green());
    
    Ok(())
}

/// Show agent status
async fn show_agent_status(agent_manager: &AgentManager, agent_id: Option<&str>) -> NikCliResult<()> {
    if let Some(id) = agent_id {
        // Show status for specific agent
        println!("{}", format!("📊 Agent Status: {}", id).cyan().bold());
        
        if let Some(status) = agent_manager.get_agent_status(id).await {
            println!("  {}: {}", "Status".green(), status.to_string().green());
            
            if let Some(metrics) = agent_manager.get_performance_metrics(id).await {
                println!("  {}: {}", "Tasks Completed".green(), metrics.task_count);
                println!("  {}: {}", "Success Rate".green(), format!("{:.1}%", metrics.success_rate * 100.0));
                println!("  {}: {}", "Average Duration".green(), format!("{:.1}ms", metrics.average_duration));
                println!("  {}: {}", "Last Active".green(), metrics.last_active.format("%Y-%m-%d %H:%M:%S").to_string().dim());
            }
        } else {
            println!("  {}", "Agent not found".red());
        }
    } else {
        // Show status for all agents
        println!("{}", "📊 All Agents Status".cyan().bold());
        println!();
        
        let agents = agent_manager.list_agents().await;
        
        if agents.is_empty() {
            println!("  {}", "No agents available".dim());
        } else {
            for agent in agents {
                let status_color = match agent.status {
                    AgentStatus::Idle => "dim",
                    AgentStatus::Running => "green",
                    AgentStatus::Paused => "yellow",
                    AgentStatus::Error => "red",
                    AgentStatus::Completed => "blue",
                };
                
                println!("  {}: {} ({} tasks)", 
                         agent.id.green(), 
                         agent.status.to_string().color(status_color),
                         agent.metrics.tasks_completed);
            }
        }
    }
    
    Ok(())
}

/// Create a new agent
async fn create_agent(agent_manager: &AgentManager, name: &str, agent_type: &str, config: Option<&str>) -> NikCliResult<()> {
    info!("Creating agent: {} of type {}", name, agent_type);
    
    // Validate agent type
    let valid_types = vec![
        "universal", "react-expert", "backend-expert", 
        "frontend-expert", "devops-expert", "code-review", "autonomous"
    ];
    
    if !valid_types.contains(&agent_type) {
        return Err(NikCliError::Agent(format!("Unknown agent type: {}", agent_type)));
    }
    
    // Parse configuration if provided
    let agent_config = if let Some(config_str) = config {
        serde_json::from_str::<serde_json::Value>(config_str)
            .map_err(|e| NikCliError::Agent(format!("Invalid JSON configuration: {}", e)))?
    } else {
        serde_json::Value::Object(serde_json::Map::new())
    };
    
    println!("{}", format!("🔧 Creating agent: {}", name).green().bold());
    println!("{}", format!("Type: {}", agent_type).cyan());
    println!("{}", format!("Configuration: {}", agent_config).dim());
    
    // Create the agent
    agent_manager.create_agent(name).await?;
    
    println!("{}", "Agent created successfully!".green());
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    
    #[tokio::test]
    async fn test_list_agents() {
        let config_manager = Arc::new(ConfigManager::new().unwrap());
        let agent_manager = AgentManager::new(config_manager);
        list_agents(&agent_manager).await.unwrap();
    }
    
    #[tokio::test]
    async fn test_create_agent_validation() {
        let config_manager = Arc::new(ConfigManager::new().unwrap());
        let agent_manager = AgentManager::new(config_manager);
        let result = create_agent(&agent_manager, "test", "invalid-type", None).await;
        assert!(result.is_err());
    }
    
    #[tokio::test]
    async fn test_agent_creation() {
        let config_manager = Arc::new(ConfigManager::new().unwrap());
        let agent_manager = AgentManager::new(config_manager);
        
        // Register agents first
        crate::agents::register_agents(&agent_manager).unwrap();
        
        // Create universal agent
        let result = agent_manager.create_agent("universal-agent").await;
        assert!(result.is_ok());
        
        // Check that agent exists
        let agents = agent_manager.list_agents().await;
        assert!(!agents.is_empty());
        assert!(agents.iter().any(|a| a.id == "universal-agent"));
    }
}