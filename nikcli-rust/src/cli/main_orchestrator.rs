/*!
 * Main Orchestrator - Production Ready
 * Central orchestration for the entire system
 */

use anyhow::Result;
use crate::services::ServiceModule;
use crate::ui::AdvancedUI;
use std::sync::Arc;

pub struct MainOrchestrator {
    service_module: Arc<ServiceModule>,
    ui: AdvancedUI,
    initialized: bool,
}

impl MainOrchestrator {
    pub fn new() -> Self {
        Self {
            service_module: Arc::new(ServiceModule::new()),
            ui: AdvancedUI::new(),
            initialized: false,
        }
    }
    
    pub async fn initialize(&mut self) -> Result<()> {
        if self.initialized {
            return Ok(());
        }
        
        self.ui.log_section("🚀 System Initialization");
        
        self.ui.log_info("Initializing all services...");
        self.service_module.initialize_all().await?;
        
        self.ui.log_success("✓ System ready!");
        self.initialized = true;
        
        Ok(())
    }
    
    pub async fn start(&mut self) -> Result<()> {
        self.initialize().await?;
        
        self.ui.log_info("Starting NikCLI...");
        
        Ok(())
    }
    
    pub async fn shutdown(&self) -> Result<()> {
        self.ui.log_warning("Shutting down...");
        Ok(())
    }
}

