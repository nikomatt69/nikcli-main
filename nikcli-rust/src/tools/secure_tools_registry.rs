/*!
 * Secure Tools Registry
 * Production-ready secure tool execution system
 */

use anyhow::Result;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermissions {
    pub dangerous: bool,
    pub requires_confirmation: bool,
    pub allowed_paths: Vec<String>,
}

pub struct SecureToolsRegistry {
    permissions: Arc<DashMap<String, ToolPermissions>>,
}

impl SecureToolsRegistry {
    pub fn new() -> Self {
        let registry = Self {
            permissions: Arc::new(DashMap::new()),
        };
        
        registry.register_default_permissions();
        registry
    }
    
    fn register_default_permissions(&self) {
        self.permissions.insert(
            "read_file".to_string(),
            ToolPermissions {
                dangerous: false,
                requires_confirmation: false,
                allowed_paths: vec![],
            },
        );
        
        self.permissions.insert(
            "write_file".to_string(),
            ToolPermissions {
                dangerous: false,
                requires_confirmation: true,
                allowed_paths: vec![],
            },
        );
        
        self.permissions.insert(
            "run_command".to_string(),
            ToolPermissions {
                dangerous: true,
                requires_confirmation: true,
                allowed_paths: vec![],
            },
        );
    }
    
    pub fn check_permission(&self, tool_name: &str) -> Option<ToolPermissions> {
        self.permissions.get(tool_name).map(|p| p.clone())
    }
}

impl Default for SecureToolsRegistry {
    fn default() -> Self {
        Self::new()
    }
}

