use crate::agents::manager::AgentManager;
use crate::agents::types::*;
use crate::error::NikCliResult;

/// Register all available agents with the agent manager
pub fn register_agents(agent_manager: &AgentManager) -> NikCliResult<()> {
    // Register Universal Agent
    register_universal_agent(agent_manager)?;
    
    // Register specialized agents (placeholders for now)
    register_react_agent(agent_manager)?;
    register_backend_agent(agent_manager)?;
    register_frontend_agent(agent_manager)?;
    register_devops_agent(agent_manager)?;
    register_code_review_agent(agent_manager)?;
    register_autonomous_coder_agent(agent_manager)?;
    
    Ok(())
}

/// Register Universal Agent
fn register_universal_agent(agent_manager: &AgentManager) -> NikCliResult<()> {
    let config = AgentConfig {
        id: "universal-agent".to_string(),
        name: "Universal Agent".to_string(),
        specialization: AgentSpecialization::Universal,
        version: "0.3.0-beta".to_string(),
        capabilities: vec![
            // Core capabilities
            "code-generation".to_string(),
            "code-analysis".to_string(),
            "code-review".to_string(),
            "optimization".to_string(),
            "debugging".to_string(),
            "refactoring".to_string(),
            "testing".to_string(),
            
            // Frontend capabilities
            "react".to_string(),
            "nextjs".to_string(),
            "typescript".to_string(),
            "javascript".to_string(),
            "html".to_string(),
            "css".to_string(),
            "frontend".to_string(),
            "components".to_string(),
            "hooks".to_string(),
            "jsx".to_string(),
            "tsx".to_string(),
            
            // Backend capabilities
            "backend".to_string(),
            "nodejs".to_string(),
            "api-development".to_string(),
            "database".to_string(),
            "server-architecture".to_string(),
            "rest-api".to_string(),
            "graphql".to_string(),
            "microservices".to_string(),
            
            // DevOps capabilities
            "devops".to_string(),
            "ci-cd".to_string(),
            "docker".to_string(),
            "kubernetes".to_string(),
            "deployment".to_string(),
            "infrastructure".to_string(),
            "monitoring".to_string(),
            "security".to_string(),
            
            // Autonomous capabilities
            "file-operations".to_string(),
            "project-creation".to_string(),
            "autonomous-coding".to_string(),
            "system-administration".to_string(),
            "full-stack-development".to_string(),
            
            // Analysis capabilities
            "performance-analysis".to_string(),
            "security-analysis".to_string(),
            "quality-assessment".to_string(),
            "architecture-review".to_string(),
            "documentation-generation".to_string(),
        ],
        category: "enterprise".to_string(),
        tags: vec![
            "universal".to_string(),
            "all-in-one".to_string(),
            "enterprise".to_string(),
            "autonomous".to_string(),
            "fullstack".to_string(),
        ],
        requires_guidance: false,
        default_config: AgentDefaultConfig {
            autonomy_level: AutonomyLevel::FullyAutonomous,
            max_concurrent_tasks: 3,
            default_timeout: 300000,
            retry_policy: RetryPolicy {
                max_attempts: 3,
                backoff_ms: 1000,
                backoff_multiplier: 2.0,
                retryable_errors: vec![
                    "timeout".to_string(),
                    "network".to_string(),
                    "temporary".to_string(),
                ],
            },
            enabled_tools: vec![
                "file".to_string(),
                "terminal".to_string(),
                "git".to_string(),
                "npm".to_string(),
                "analysis".to_string(),
            ],
            guidance_files: Vec::new(),
            log_level: "info".to_string(),
            permissions: AgentPermissions {
                can_read_files: true,
                can_write_files: true,
                can_delete_files: true,
                allowed_paths: vec!["*".to_string()],
                forbidden_paths: vec!["/etc".to_string(), "/system".to_string()],
                can_execute_commands: true,
                allowed_commands: vec!["*".to_string()],
                forbidden_commands: vec!["rm -rf /".to_string(), "format".to_string(), "fdisk".to_string()],
                can_access_network: true,
                allowed_domains: vec!["*".to_string()],
                can_install_packages: true,
                can_modify_config: true,
                can_access_secrets: false,
            },
            sandbox_restrictions: Vec::new(),
        },
    };
    
    // Note: In a real implementation, we would call agent_manager.register_agent_class()
    // For now, we just return Ok since the registration is handled elsewhere
    Ok(())
}

/// Register React Agent (placeholder)
fn register_react_agent(_agent_manager: &AgentManager) -> NikCliResult<()> {
    // TODO: Implement React agent registration
    Ok(())
}

/// Register Backend Agent (placeholder)
fn register_backend_agent(_agent_manager: &AgentManager) -> NikCliResult<()> {
    // TODO: Implement Backend agent registration
    Ok(())
}

/// Register Frontend Agent (placeholder)
fn register_frontend_agent(_agent_manager: &AgentManager) -> NikCliResult<()> {
    // TODO: Implement Frontend agent registration
    Ok(())
}

/// Register DevOps Agent (placeholder)
fn register_devops_agent(_agent_manager: &AgentManager) -> NikCliResult<()> {
    // TODO: Implement DevOps agent registration
    Ok(())
}

/// Register Code Review Agent (placeholder)
fn register_code_review_agent(_agent_manager: &AgentManager) -> NikCliResult<()> {
    // TODO: Implement Code Review agent registration
    Ok(())
}

/// Register Autonomous Coder Agent (placeholder)
fn register_autonomous_coder_agent(_agent_manager: &AgentManager) -> NikCliResult<()> {
    // TODO: Implement Autonomous Coder agent registration
    Ok(())
}