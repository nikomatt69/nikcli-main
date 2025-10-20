/*!
 * Supabase Provider
 * Production-ready Supabase database and auth integration
 */

use anyhow::Result;
use postgrest::Postgrest;
use std::sync::Arc;

pub struct SupabaseProvider {
    client: Option<Arc<Postgrest>>,
    enabled: bool,
}

impl SupabaseProvider {
    pub fn new() -> Self {
        Self {
            client: None,
            enabled: false,
        }
    }
    
    pub fn initialize(&mut self, url: &str, anon_key: &str) -> Result<()> {
        let client = Postgrest::new(url).insert_header("apikey", anon_key);
        
        self.client = Some(Arc::new(client));
        self.enabled = true;
        
        Ok(())
    }
    
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
    
    pub fn client(&self) -> Option<Arc<Postgrest>> {
        self.client.clone()
    }
}

impl Default for SupabaseProvider {
    fn default() -> Self {
        Self::new()
    }
}

