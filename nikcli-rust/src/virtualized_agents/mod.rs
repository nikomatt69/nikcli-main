/*!
 * Virtualized Agents Module - Production Ready
 * Container-based agent virtualization
 */

pub mod container_manager;
pub mod vm_orchestrator;
pub mod secure_vm_agent;
pub mod vm_selector;

pub use container_manager::ContainerManager;
pub use vm_orchestrator::{VMOrchestrator, ContainerInfo, VMResponse};
pub use secure_vm_agent::{SecureVMAgent, VMState, VMMetrics, VMAgentConfig, VMAgentStatus};
pub use vm_selector::{VMSelector, VMSelectionInfo, VMSystemInfo, initialize_vm_selector, get_vm_selector};

