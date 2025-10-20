/*!
 * Cache Provider - Production Ready
 */

use dashmap::DashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
struct CacheEntry<T> {
    value: T,
    expires_at: Option<u64>,
}

pub struct CacheProvider<T: Clone> {
    storage: Arc<DashMap<String, CacheEntry<T>>>,
}

impl<T: Clone> CacheProvider<T> {
    pub fn new() -> Self {
        Self {
            storage: Arc::new(DashMap::new()),
        }
    }
    
    pub fn get(&self, key: &str) -> Option<T> {
        if let Some(entry) = self.storage.get(key) {
            if let Some(expires_at) = entry.expires_at {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                
                if now >= expires_at {
                    drop(entry);
                    self.storage.remove(key);
                    return None;
                }
            }
            
            Some(entry.value.clone())
        } else {
            None
        }
    }
    
    pub fn set(&self, key: String, value: T, ttl_seconds: Option<u64>) {
        let expires_at = ttl_seconds.map(|ttl| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + ttl
        });
        
        self.storage.insert(
            key,
            CacheEntry {
                value,
                expires_at,
            },
        );
    }
    
    pub fn delete(&self, key: &str) {
        self.storage.remove(key);
    }
    
    pub fn clear(&self) {
        self.storage.clear();
    }
}

impl<T: Clone> Default for CacheProvider<T> {
    fn default() -> Self {
        Self::new()
    }
}

