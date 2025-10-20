/*!
 * VM Selector - PRODUCTION READY
 * Interactive VM selection and management
 */

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use super::{VMOrchestrator, ContainerInfo};

/// VM Selection Info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMSelectionInfo {
    pub id: String,
    pub name: String,
    pub container_id: String,
    pub repository_url: Option<String>,
    pub system_info: Option<VMSystemInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMSystemInfo {
    pub os: String,
    pub arch: String,
    pub working_directory: String,
}

/// VM Selector
pub struct VMSelector {
    orchestrator: Arc<VMOrchestrator>,
    selected_vm: Arc<RwLock<Option<VMSelectionInfo>>>,
    chat_history: Arc<RwLock<std::collections::HashMap<String, Vec<ChatMessage>>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl VMSelector {
    /// Create new VM Selector
    pub fn new(orchestrator: Arc<VMOrchestrator>) -> Self {
        Self {
            orchestrator,
            selected_vm: Arc::new(RwLock::new(None)),
            chat_history: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }
    
    /// Get selected VM
    pub async fn get_selected_vm(&self) -> Option<VMSelectionInfo> {
        self.selected_vm.read().await.clone()
    }
    
    /// Select VM
    pub async fn select_vm(&self, vm_id: String) -> Result<()> {
        // Get VM info
        let vms = self.orchestrator.list_containers().await;
        
        for vm in vms {
            if vm.id == vm_id {
                let selection = VMSelectionInfo {
                    id: vm.id.clone(),
                    name: vm.repository.clone(),
                    container_id: vm.id.clone(),
                    repository_url: Some(vm.repository.clone()),
                    system_info: Some(VMSystemInfo {
                        os: "Ubuntu 22.04".to_string(),
                        arch: "x86_64".to_string(),
                        working_directory: "/workspace".to_string(),
                    }),
                };
                
                *self.selected_vm.write().await = Some(selection);
                
                tracing::info!("Selected VM: {}", vm_id);
                return Ok(());
            }
        }
        
        Err(anyhow::anyhow!("VM not found: {}", vm_id))
    }
    
    /// Get chat history for VM
    pub async fn get_chat_history(&self, vm_id: &str) -> Vec<ChatMessage> {
        self.chat_history
            .read()
            .await
            .get(vm_id)
            .cloned()
            .unwrap_or_default()
    }
    
    /// Add message to chat history
    pub async fn add_chat_message(&self, vm_id: String, role: String, content: String) {
        let message = ChatMessage {
            role,
            content,
            timestamp: chrono::Utc::now(),
        };
        
        let mut history = self.chat_history.write().await;
        history
            .entry(vm_id)
            .or_insert_with(Vec::new)
            .push(message);
    }
    
    /// Clear selection
    pub async fn clear_selection(&self) {
        *self.selected_vm.write().await = None;
    }
    
    /// List available VMs
    pub async fn list_vms(&self) -> Vec<VMSelectionInfo> {
        let containers = self.orchestrator.list_containers().await;
        
        containers
            .into_iter()
            .map(|vm| VMSelectionInfo {
                id: vm.id.clone(),
                name: vm.repository.clone(),
                container_id: vm.id,
                repository_url: Some(vm.repository),
                system_info: Some(VMSystemInfo {
                    os: "Ubuntu 22.04".to_string(),
                    arch: "x86_64".to_string(),
                    working_directory: "/workspace".to_string(),
                }),
            })
            .collect()
    }
}

// Global VM Selector instance
lazy_static::lazy_static! {
    static ref VM_SELECTOR: Arc<RwLock<Option<VMSelector>>> = Arc::new(RwLock::new(None));
}

/// Initialize VM Selector
pub async fn initialize_vm_selector(orchestrator: Arc<VMOrchestrator>) {
    let selector = VMSelector::new(orchestrator);
    *VM_SELECTOR.write().await = Some(selector);
}

/// Get VM Selector instance
pub async fn get_vm_selector() -> Option<VMSelector> {
    VM_SELECTOR.read().await.as_ref().map(|s| VMSelector {
        orchestrator: s.orchestrator.clone(),
        selected_vm: s.selected_vm.clone(),
        chat_history: s.chat_history.clone(),
    })
}

