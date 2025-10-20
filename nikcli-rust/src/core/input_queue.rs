/*!
 * Input Queue - PRODUCTION READY
 * Priority-based input queuing system
 */

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, PartialEq)]
pub enum Priority {
    High,
    Normal,
    Low,
}

#[derive(Debug, Clone)]
pub struct QueuedInput {
    pub id: String,
    pub content: String,
    pub priority: Priority,
    pub source: String,
    pub queued_at: chrono::DateTime<chrono::Utc>,
}

pub struct InputQueue {
    queue: Arc<Mutex<VecDeque<QueuedInput>>>,
    bypass_enabled: Arc<std::sync::atomic::AtomicBool>,
}

impl InputQueue {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            bypass_enabled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }
    
    /// Enqueue input with priority
    pub async fn enqueue(&self, content: String, priority: Priority, source: String) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        
        let input = QueuedInput {
            id: id.clone(),
            content,
            priority: priority.clone(),
            source,
            queued_at: chrono::Utc::now(),
        };
        
        let mut queue = self.queue.lock().await;
        
        // Insert based on priority
        match priority {
            Priority::High => queue.push_front(input),
            Priority::Normal => {
                // Insert in middle
                let mid = queue.len() / 2;
                queue.insert(mid, input);
            }
            Priority::Low => queue.push_back(input),
        }
        
        id
    }
    
    /// Dequeue next input
    pub async fn dequeue(&self) -> Option<QueuedInput> {
        self.queue.lock().await.pop_front()
    }
    
    /// Check if should queue
    pub fn should_queue(&self, input: &str) -> bool {
        !input.starts_with('/') && !input.starts_with('@')
    }
    
    /// Check if bypass is enabled
    pub fn is_bypass_enabled(&self) -> bool {
        self.bypass_enabled.load(std::sync::atomic::Ordering::Relaxed)
    }
    
    /// Set bypass
    pub fn set_bypass(&self, enabled: bool) {
        self.bypass_enabled.store(enabled, std::sync::atomic::Ordering::Relaxed);
    }
    
    /// Get queue size
    pub async fn size(&self) -> usize {
        self.queue.lock().await.len()
    }
    
    /// Clear queue
    pub async fn clear(&self) {
        self.queue.lock().await.clear();
    }
}

impl Default for InputQueue {
    fn default() -> Self {
        Self::new()
    }
}

// Global instance
lazy_static::lazy_static! {
    pub static ref INPUT_QUEUE: InputQueue = InputQueue::new();
}

