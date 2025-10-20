/*!
 * Register Agents - PRODUCTION READY
 * Register all standard agents with the agent manager
 */

use std::sync::Arc;
use anyhow::Result;
use crate::core::agent_manager::{AgentManager, AgentMetadata};
use crate::types::AutonomyLevel;

/// Register all standard agents - PRODUCTION READY
pub fn register_agents(agent_manager: Arc<AgentManager>) -> Result<()> {
    tracing::info!("Registering all standard agents...");
    
    // 1. Universal Agent
    let universal = AgentMetadata {
        id: "universal".to_string(),
        name: "UniversalAgent".to_string(),
        description: "All-in-one enterprise agent".to_string(),
        capabilities: vec![
            "coding".to_string(),
            "analysis".to_string(),
            "refactoring".to_string(),
            "testing".to_string(),
            "debugging".to_string(),
        ],
        specialization: "fullstack".to_string(),
        version: "1.0.0".to_string(),
        autonomy_level: AutonomyLevel::FullyAutonomous,
    };
    agent_manager.register_agent_class(universal);
    
    // 2. Cognitive Agent Base
    let cognitive = AgentMetadata {
        id: "cognitive".to_string(),
        name: "CognitiveAgentBase".to_string(),
        description: "Intelligent code generation and analysis".to_string(),
        capabilities: vec![
            "code-generation".to_string(),
            "analysis".to_string(),
            "autonomous".to_string(),
        ],
        specialization: "cognitive".to_string(),
        version: "1.0.0".to_string(),
        autonomy_level: AutonomyLevel::FullyAutonomous,
    };
    agent_manager.register_agent_class(cognitive);
    
    // 3. Secure VM Agent
    let vm_agent = AgentMetadata {
        id: "vm".to_string(),
        name: "SecureVMAgent".to_string(),
        description: "Isolated VM development agent".to_string(),
        capabilities: vec![
            "repository-analysis".to_string(),
            "autonomous".to_string(),
            "secure".to_string(),
        ],
        specialization: "vm-development".to_string(),
        version: "1.0.0".to_string(),
        autonomy_level: AutonomyLevel::FullyAutonomous,
    };
    agent_manager.register_agent_class(vm_agent);
    
    // 4. Coding Agent
    let coding = AgentMetadata {
        id: "coding".to_string(),
        name: "CodingAgent".to_string(),
        description: "Code implementation specialist".to_string(),
        capabilities: vec!["coding".to_string(), "refactoring".to_string()],
        specialization: "coding".to_string(),
        version: "1.0.0".to_string(),
        autonomy_level: AutonomyLevel::SemiAutonomous,
    };
    agent_manager.register_agent_class(coding);
    
    // 5. Frontend Agent
    let frontend = AgentMetadata {
        id: "frontend".to_string(),
        name: "FrontendAgent".to_string(),
        description: "Frontend development specialist".to_string(),
        capabilities: vec!["react".to_string(), "ui".to_string(), "css".to_string()],
        specialization: "frontend".to_string(),
        version: "1.0.0".to_string(),
        autonomy_level: AutonomyLevel::SemiAutonomous,
    };
    agent_manager.register_agent_class(frontend);
    
    // 6. Backend Agent
    let backend = AgentMetadata {
        id: "backend".to_string(),
        name: "BackendAgent".to_string(),
        description: "Backend development specialist".to_string(),
        capabilities: vec!["api".to_string(), "database".to_string(), "server".to_string()],
        specialization: "backend".to_string(),
        version: "1.0.0".to_string(),
        autonomy_level: AutonomyLevel::SemiAutonomous,
    };
    agent_manager.register_agent_class(backend);
    
    // 7. DevOps Agent
    let devops = AgentMetadata {
        id: "devops".to_string(),
        name: "DevOpsAgent".to_string(),
        description: "DevOps and infrastructure specialist".to_string(),
        capabilities: vec!["docker".to_string(), "ci-cd".to_string(), "deployment".to_string()],
        specialization: "devops".to_string(),
        version: "1.0.0".to_string(),
        autonomy_level: AutonomyLevel::Supervised,
    };
    agent_manager.register_agent_class(devops);
    
    tracing::info!("✅ Registered 7 standard agents");
    
    Ok(())
}
