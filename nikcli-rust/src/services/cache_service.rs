/*!
 * Cache Service - Production Ready
 */

use anyhow::Result;
use crate::providers::{RedisProvider, MemoryProvider};
use std::sync::Arc;

pub struct CacheService {
    redis: Arc<RedisProvider>,
    memory: Arc<MemoryProvider>,
}

impl CacheService {
    pub fn new() -> Self {
        Self {
            redis: Arc::new(RedisProvider::new()),
            memory: Arc::new(MemoryProvider::new()),
        }
    }
    
    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        if self.redis.is_enabled() {
            self.redis.get(key).await
        } else {
            Ok(self.memory.get(key))
        }
    }
    
    pub async fn set(&self, key: &str, value: &str, ttl: Option<usize>) -> Result<()> {
        if self.redis.is_enabled() {
            self.redis.set(key, value, ttl).await
        } else {
            self.memory.set(key.to_string(), value.to_string(), ttl.map(|t| t as u64));
            Ok(())
        }
    }
    
    pub async fn delete(&self, key: &str) -> Result<()> {
        if self.redis.is_enabled() {
            self.redis.delete(key).await
        } else {
            self.memory.delete(key);
            Ok(())
        }
    }
}

impl Default for CacheService {
    fn default() -> Self {
        Self::new()
    }
}

