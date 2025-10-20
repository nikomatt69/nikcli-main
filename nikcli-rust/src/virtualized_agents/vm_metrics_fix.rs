use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VMMetrics {
    pub memory_usage: u64,
    pub cpu_usage: f32,
    pub disk_usage: u64,
    pub network_activity: u64,
    pub uptime: u64,
}
