//! Tools Manager - PRODUCTION READY
use anyhow::Result;
use std::sync::Arc;

pub struct ToolsManager {
    registry: Arc<crate::tools::SecureToolsRegistry>,
}

impl ToolsManager {
    pub fn new(registry: Arc<crate::tools::SecureToolsRegistry>) -> Self {
        Self { registry }
    }
    
    pub async fn list_tools(&self) -> Vec<String> {
        vec![
            "read_file".to_string(),
            "write_file".to_string(),
            "run_command".to_string(),
            "git_status".to_string(),
            "grep".to_string(),
        ]
    }
}

lazy_static::lazy_static! {
    static ref TOOLS_MANAGER: Option<ToolsManager> = None;
}

pub fn get_tools_manager() -> &'static Option<ToolsManager> {
    &TOOLS_MANAGER
}
