/*!
 * Redis Provider
 * Production-ready Redis caching implementation
 */

use anyhow::Result;
use redis::aio::ConnectionManager;
use redis::{AsyncCommands, Client};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct RedisProvider {
    client: Option<Arc<Client>>,
    connection: Arc<RwLock<Option<ConnectionManager>>>,
    enabled: bool,
}

impl RedisProvider {
    pub fn new() -> Self {
        Self {
            client: None,
            connection: Arc::new(RwLock::new(None)),
            enabled: false,
        }
    }
    
    pub async fn initialize(&mut self, redis_url: &str) -> Result<()> {
        let client = Client::open(redis_url)?;
        let connection = client.get_tokio_connection_manager().await?;
        
        self.client = Some(Arc::new(client));
        *self.connection.write().await = Some(connection);
        self.enabled = true;
        
        Ok(())
    }
    
    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        if !self.enabled {
            return Ok(None);
        }
        
        let mut conn_guard = self.connection.write().await;
        if let Some(conn) = conn_guard.as_mut() {
            let value: Option<String> = conn.get(key).await?;
            Ok(value)
        } else {
            Ok(None)
        }
    }
    
    pub async fn set(&self, key: &str, value: &str, ttl_seconds: Option<usize>) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }
        
        let mut conn_guard = self.connection.write().await;
        if let Some(conn) = conn_guard.as_mut() {
            if let Some(ttl) = ttl_seconds {
                conn.set_ex::<_, _, ()>(key, value, ttl as u64).await?;
            } else {
                conn.set::<_, _, ()>(key, value).await?;
            }
        }
        
        Ok(())
    }
    
    pub async fn delete(&self, key: &str) -> Result<()> {
        if !self.enabled {
            return Ok(());
        }
        
        let mut conn_guard = self.connection.write().await;
        if let Some(conn) = conn_guard.as_mut() {
            conn.del(key).await?;
        }
        
        Ok(())
    }
    
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

impl Default for RedisProvider {
    fn default() -> Self {
        Self::new()
    }
}
