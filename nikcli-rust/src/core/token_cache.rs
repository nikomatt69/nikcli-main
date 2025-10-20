/*!
 * Token Cache - Production Ready
 */

use super::cache_provider::CacheProvider;

#[derive(Debug, Clone)]
pub struct TokenCacheEntry {
    pub tokens: u32,
    pub text_hash: String,
}

pub struct TokenCache {
    cache: CacheProvider<TokenCacheEntry>,
}

impl TokenCache {
    pub fn new() -> Self {
        Self {
            cache: CacheProvider::new(),
        }
    }
    
    pub fn get_tokens(&self, text_hash: &str) -> Option<u32> {
        self.cache.get(text_hash).map(|entry| entry.tokens)
    }
    
    pub fn cache_tokens(&self, text_hash: String, tokens: u32) {
        self.cache.set(
            text_hash.clone(),
            TokenCacheEntry {
                tokens,
                text_hash,
            },
            Some(3600),
        );
    }
}

impl Default for TokenCache {
    fn default() -> Self {
        Self::new()
    }
}

