use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{debug, info};

/// Agent definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub capabilities: Vec<String>,
    pub model_preference: Option<String>,
}

impl Agent {
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        system_prompt: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            system_prompt: system_prompt.into(),
            capabilities: Vec::new(),
            model_preference: None,
        }
    }

    pub fn with_capabilities(mut self, capabilities: Vec<String>) -> Self {
        self.capabilities = capabilities;
        self
    }

    pub fn with_model_preference(mut self, model: impl Into<String>) -> Self {
        self.model_preference = Some(model.into());
        self
    }
}

/// Agent manager for registering and executing agents
pub struct AgentManager {
    agents: HashMap<String, Agent>,
}

impl AgentManager {
    /// Create a new agent manager
    pub fn new() -> Self {
        Self {
            agents: HashMap::new(),
        }
    }

    /// Register an agent
    pub fn register_agent(&mut self, agent: Agent) {
        debug!("Registering agent: {}", agent.name);
        self.agents.insert(agent.name.clone(), agent);
    }

    /// Get an agent by name
    pub fn get_agent(&self, name: &str) -> Option<&Agent> {
        self.agents.get(name)
    }

    /// List all available agents
    pub fn list_agents(&self) -> Vec<&Agent> {
        self.agents.values().collect()
    }

    /// Register default agents
    pub fn register_default_agents(&mut self) {
        info!("Registering default agents");

        // General purpose agent
        let general = Agent::new(
            "general",
            "General purpose AI assistant",
            "You are a helpful AI assistant that can help with a variety of tasks.",
        )
        .with_capabilities(vec![
            "conversation".to_string(),
            "analysis".to_string(),
            "general_tasks".to_string(),
        ]);

        // Code-focused agent
        let code = Agent::new(
            "code",
            "Code-focused development agent",
            "You are an expert software developer assistant. You help with code review, debugging, optimization, and writing high-quality code.",
        )
        .with_capabilities(vec![
            "code_review".to_string(),
            "debugging".to_string(),
            "refactoring".to_string(),
            "testing".to_string(),
        ]);

        // Planning agent
        let plan = Agent::new(
            "plan",
            "Planning and architecture agent",
            "You are an expert at breaking down complex tasks into actionable plans. You help with project planning, architecture design, and task decomposition.",
        )
        .with_capabilities(vec![
            "planning".to_string(),
            "architecture".to_string(),
            "task_breakdown".to_string(),
        ]);

        // Documentation agent
        let docs = Agent::new(
            "docs",
            "Documentation specialist agent",
            "You are an expert at creating clear, comprehensive documentation. You help write README files, API documentation, and technical guides.",
        )
        .with_capabilities(vec![
            "documentation".to_string(),
            "technical_writing".to_string(),
            "api_docs".to_string(),
        ]);

        // Testing agent
        let test = Agent::new(
            "test",
            "Testing and quality assurance agent",
            "You are an expert in software testing. You help write unit tests, integration tests, and ensure code quality.",
        )
        .with_capabilities(vec![
            "unit_testing".to_string(),
            "integration_testing".to_string(),
            "test_coverage".to_string(),
        ]);

        self.register_agent(general);
        self.register_agent(code);
        self.register_agent(plan);
        self.register_agent(docs);
        self.register_agent(test);
    }

    /// Execute an agent with a task
    pub async fn execute_agent(&self, name: &str, task: &str) -> Result<String> {
        let agent = self
            .get_agent(name)
            .context(format!("Agent '{}' not found", name))?;

        info!("Executing agent '{}' with task: {}", agent.name, task);

        // TODO: Implement actual agent execution with AI provider
        Ok(format!(
            "Agent '{}' would execute task: {}",
            agent.name, task
        ))
    }
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new()
    }
}
