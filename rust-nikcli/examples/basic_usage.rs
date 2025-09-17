use nikcli::agents::manager::AgentManager;
use nikcli::agents::types::*;
use nikcli::core::ConfigManager;
use nikcli::error::NikCliResult;
use std::sync::Arc;

/// Basic usage example of the NikCLI Rust implementation
#[tokio::main]
async fn main() -> NikCliResult<()> {
    // Initialize logging
    tracing_subscriber::fmt::init();
    
    println!("🚀 NikCLI Rust - Basic Usage Example");
    println!("=====================================");
    
    // 1. Initialize configuration manager
    println!("\n📋 Step 1: Initializing configuration...");
    let config_manager = Arc::new(ConfigManager::new()?);
    println!("✅ Configuration manager initialized");
    
    // 2. Create agent manager
    println!("\n🤖 Step 2: Creating agent manager...");
    let agent_manager = AgentManager::new(config_manager);
    println!("✅ Agent manager created");
    
    // 3. Register agents
    println!("\n📝 Step 3: Registering agents...");
    nikcli::agents::register_agents(&agent_manager)?;
    println!("✅ Agents registered");
    
    // 4. Create universal agent
    println!("\n🔧 Step 4: Creating universal agent...");
    let agent_id = agent_manager.create_agent("universal-agent").await?;
    println!("✅ Universal agent created: {}", agent_id);
    
    // 5. List available agents
    println!("\n📊 Step 5: Listing available agents...");
    let agents = agent_manager.list_agents().await;
    for agent in agents {
        println!("  - {}: {} ({})", 
                 agent.id, 
                 agent.config.name, 
                 agent.status);
    }
    
    // 6. Create a sample task
    println!("\n📋 Step 6: Creating a sample task...");
    let task = AgentTask {
        id: uuid::Uuid::new_v4().to_string(),
        description: "Create a simple Rust hello world program".to_string(),
        priority: TaskPriority::Normal,
        estimated_duration: Some(30000), // 30 seconds
        dependencies: Vec::new(),
        context: AgentContext {
            working_directory: std::env::current_dir()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            project_type: Some("rust".to_string()),
            language: Some("rust".to_string()),
            framework: None,
            dependencies: vec!["tokio".to_string(), "serde".to_string()],
            environment_variables: std::collections::HashMap::new(),
            user_preferences: std::collections::HashMap::new(),
        },
        created_at: chrono::Utc::now(),
        deadline: None,
    };
    println!("✅ Task created: {}", task.description);
    
    // 7. Run task with universal agent
    println!("\n⚡ Step 7: Running task with universal agent...");
    let result = agent_manager.run_task("universal-agent", task).await?;
    println!("✅ Task completed successfully!");
    println!("   Duration: {}ms", result.duration_ms);
    println!("   Success: {}", result.success);
    println!("   Output: {}", result.output);
    
    if !result.files_modified.is_empty() {
        println!("   Files modified:");
        for file in &result.files_modified {
            println!("     - {}", file);
        }
    }
    
    if !result.commands_executed.is_empty() {
        println!("   Commands executed:");
        for cmd in &result.commands_executed {
            println!("     - {}", cmd);
        }
    }
    
    // 8. Show agent statistics
    println!("\n📈 Step 8: Agent statistics...");
    let stats = agent_manager.get_agent_statistics().await;
    println!("   Total agents: {}", stats.total_agents);
    println!("   Active agents: {}", stats.active_agents);
    println!("   Total tasks: {}", stats.total_tasks);
    println!("   Average success rate: {:.1}%", stats.average_success_rate * 100.0);
    
    // 9. Analyze a complex task
    println!("\n🧠 Step 9: Analyzing complex task...");
    let complex_task = "Create a full-stack web application with React frontend, Node.js backend, PostgreSQL database, Docker containers, and CI/CD pipeline";
    let cognition = agent_manager.analyze_task(complex_task).await?;
    
    println!("   Task ID: {}", cognition.id);
    println!("   Original: {}", cognition.original_task);
    println!("   Intent: {:?}", cognition.intent.primary);
    println!("   Complexity: {:?}", cognition.intent.complexity);
    println!("   Urgency: {:?}", cognition.intent.urgency);
    println!("   Required capabilities: {}", cognition.required_capabilities.join(", "));
    println!("   Suggested agents: {}", cognition.suggested_agents.join(", "));
    println!("   Risk level: {:?}", cognition.risk_level);
    
    if let Some(plan) = &cognition.orchestration_plan {
        println!("   Orchestration plan: {} phases", plan.phases.len());
        for phase in &plan.phases {
            println!("     - {}: {} ({:?})", 
                     phase.name, 
                     phase.phase_type, 
                     phase.estimated_duration);
        }
    }
    
    println!("\n🎉 Example completed successfully!");
    println!("This demonstrates the core functionality of the NikCLI Rust implementation.");
    
    Ok(())
}