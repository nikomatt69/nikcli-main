/*!
 * Module Manager - Production Ready
 */

use anyhow::Result;
use dashmap::DashMap;
use std::sync::Arc;

pub trait Module: Send + Sync {
    fn name(&self) -> &str;
    fn initialize(&self) -> Result<()>;
    fn shutdown(&self) -> Result<()>;
}

pub struct ModuleManager {
    modules: Arc<DashMap<String, Arc<dyn Module>>>,
}

impl ModuleManager {
    pub fn new() -> Self {
        Self {
            modules: Arc::new(DashMap::new()),
        }
    }
    
    pub fn register_module(&self, module: Arc<dyn Module>) -> Result<()> {
        let name = module.name().to_string();
        self.modules.insert(name, module);
        Ok(())
    }
    
    pub fn initialize_all(&self) -> Result<()> {
        for entry in self.modules.iter() {
            entry.value().initialize()?;
        }
        Ok(())
    }
    
    pub fn shutdown_all(&self) -> Result<()> {
        for entry in self.modules.iter() {
            entry.value().shutdown()?;
        }
        Ok(())
    }
}

impl Default for ModuleManager {
    fn default() -> Self {
        Self::new()
    }
}

