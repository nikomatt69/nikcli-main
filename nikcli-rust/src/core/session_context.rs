use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::debug;
use uuid::Uuid;

/// Session context for maintaining state across the CLI session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionContext {
    pub session_id: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub data: HashMap<String, serde_json::Value>,
    pub metrics: SessionMetrics,
}

/// Session metrics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionMetrics {
    pub total_messages: usize,
    pub total_tokens_used: usize,
    pub total_cost: f64,
    pub commands_executed: usize,
    pub agents_used: HashMap<String, usize>,
}

impl SessionContext {
    /// Create a new session context
    pub fn new() -> Self {
        Self {
            session_id: Uuid::new_v4().to_string(),
            started_at: chrono::Utc::now(),
            data: HashMap::new(),
            metrics: SessionMetrics::default(),
        }
    }

    /// Initialize the session
    pub fn initialize(&mut self) {
        debug!("Initializing session: {}", self.session_id);
        self.started_at = chrono::Utc::now();
    }

    /// Set a context value
    pub fn set<T: Serialize>(&mut self, key: impl Into<String>, value: T) -> Result<()> {
        let key = key.into();
        let json_value = serde_json::to_value(value)?;
        self.data.insert(key, json_value);
        Ok(())
    }

    /// Get a context value
    pub fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Option<T> {
        self.data
            .get(key)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }

    /// Remove a context value
    pub fn remove(&mut self, key: &str) -> Option<serde_json::Value> {
        self.data.remove(key)
    }

    /// Clear all context data
    pub fn clear(&mut self) {
        self.data.clear();
    }

    /// Increment message count
    pub fn increment_messages(&mut self) {
        self.metrics.total_messages += 1;
    }

    /// Add token usage
    pub fn add_token_usage(&mut self, tokens: usize) {
        self.metrics.total_tokens_used += tokens;
    }

    /// Add cost
    pub fn add_cost(&mut self, cost: f64) {
        self.metrics.total_cost += cost;
    }

    /// Increment command count
    pub fn increment_commands(&mut self) {
        self.metrics.commands_executed += 1;
    }

    /// Track agent usage
    pub fn track_agent_usage(&mut self, agent: &str) {
        *self.metrics.agents_used.entry(agent.to_string()).or_insert(0) += 1;
    }

    /// Get session duration
    pub fn duration(&self) -> chrono::Duration {
        chrono::Utc::now() - self.started_at
    }

    /// Save session to storage
    pub async fn save(&self) -> Result<()> {
        // TODO: Implement session persistence
        debug!("Saving session: {}", self.session_id);
        Ok(())
    }

    /// Load session from storage
    pub async fn load(session_id: &str) -> Result<Self> {
        // TODO: Implement session loading
        debug!("Loading session: {}", session_id);
        Ok(Self::new())
    }
}

impl Default for SessionContext {
    fn default() -> Self {
        Self::new()
    }
}
