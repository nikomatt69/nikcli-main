/*!
 * Event Bus - Production Ready
 */

use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

pub type EventHandler = Arc<dyn Fn(serde_json::Value) + Send + Sync>;

pub struct EventBus {
    subscribers: Arc<DashMap<String, Vec<EventHandler>>>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            subscribers: Arc::new(DashMap::new()),
        }
    }
    
    pub fn subscribe(&self, event_type: String, handler: EventHandler) {
        self.subscribers
            .entry(event_type)
            .or_insert_with(Vec::new)
            .push(handler);
    }
    
    pub async fn publish(&self, event_type: String, data: serde_json::Value) {
        if let Some(handlers) = self.subscribers.get(&event_type) {
            for handler in handlers.iter() {
                handler(data.clone());
            }
        }
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

