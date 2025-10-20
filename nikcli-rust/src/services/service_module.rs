/*!
 * Service Module
 * Initialization and management of all services
 */

use anyhow::Result;
use std::sync::Arc;

use super::{
    AgentService, LspService, MemoryService, PlanningService, SnapshotService, ToolService,
};

/// Service Module for managing all services
pub struct ServiceModule {
    agent_service: Arc<AgentService>,
    tool_service: Arc<ToolService>,
    planning_service: Arc<PlanningService>,
    memory_service: Arc<MemoryService>,
    lsp_service: Arc<LspService>,
    snapshot_service: Arc<SnapshotService>,
}

impl ServiceModule {
    /// Create a new ServiceModule
    pub fn new() -> Self {
        Self {
            agent_service: Arc::new(AgentService::new()),
            tool_service: Arc::new(ToolService::new()),
            planning_service: Arc::new(PlanningService::new()),
            memory_service: Arc::new(MemoryService::new()),
            lsp_service: Arc::new(LspService::new()),
            snapshot_service: Arc::new(SnapshotService::new()),
        }
    }
    
    /// Initialize all services
    pub async fn initialize_all(&self) -> Result<()> {
        self.agent_service.initialize().await?;
        self.tool_service.initialize().await?;
        self.planning_service.initialize().await?;
        self.memory_service.initialize().await?;
        self.lsp_service.initialize().await?;
        self.snapshot_service.initialize().await?;
        
        Ok(())
    }
    
    /// Get agent service
    pub fn agent_service(&self) -> Arc<AgentService> {
        self.agent_service.clone()
    }
    
    /// Get tool service
    pub fn tool_service(&self) -> Arc<ToolService> {
        self.tool_service.clone()
    }
    
    /// Get planning service
    pub fn planning_service(&self) -> Arc<PlanningService> {
        self.planning_service.clone()
    }
    
    /// Get memory service
    pub fn memory_service(&self) -> Arc<MemoryService> {
        self.memory_service.clone()
    }
    
    /// Get LSP service
    pub fn lsp_service(&self) -> Arc<LspService> {
        self.lsp_service.clone()
    }
    
    /// Get snapshot service
    pub fn snapshot_service(&self) -> Arc<SnapshotService> {
        self.snapshot_service.clone()
    }
}

impl Default for ServiceModule {
    fn default() -> Self {
        Self::new()
    }
}

