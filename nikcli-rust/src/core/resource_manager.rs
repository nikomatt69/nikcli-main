/*!
 * Resource Manager - Production Ready
 */

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

pub struct ResourceManager {
    memory_limit_mb: u64,
    current_memory_mb: Arc<AtomicU64>,
}

impl ResourceManager {
    pub fn new(memory_limit_mb: u64) -> Self {
        Self {
            memory_limit_mb,
            current_memory_mb: Arc::new(AtomicU64::new(0)),
        }
    }
    
    pub fn allocate(&self, size_mb: u64) -> bool {
        let current = self.current_memory_mb.load(Ordering::Relaxed);
        if current + size_mb <= self.memory_limit_mb {
            self.current_memory_mb.fetch_add(size_mb, Ordering::Relaxed);
            true
        } else {
            false
        }
    }
    
    pub fn deallocate(&self, size_mb: u64) {
        self.current_memory_mb.fetch_sub(size_mb, Ordering::Relaxed);
    }
    
    pub fn get_usage_mb(&self) -> u64 {
        self.current_memory_mb.load(Ordering::Relaxed)
    }
    
    pub fn get_limit_mb(&self) -> u64 {
        self.memory_limit_mb
    }
}

impl Default for ResourceManager {
    fn default() -> Self {
        Self::new(2048)
    }
}

