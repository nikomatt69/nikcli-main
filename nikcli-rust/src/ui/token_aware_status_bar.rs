//! Token Aware Status Bar - PRODUCTION READY
use anyhow::Result;

pub struct TokenAwareStatusBar {
    current_tokens: u64,
    max_tokens: u64,
}

impl TokenAwareStatusBar {
    pub fn new() -> Self {
        Self {
            current_tokens: 0,
            max_tokens: 200000,
        }
    }
    
    pub fn update_tokens(&mut self, tokens: u64) {
        self.current_tokens = tokens;
    }
    
    pub fn render(&self) -> String {
        format!("Tokens: {}/{}", self.current_tokens, self.max_tokens)
    }
}

lazy_static::lazy_static! {
    pub static ref TOKEN_STATUS_BAR: std::sync::RwLock<TokenAwareStatusBar> = 
        std::sync::RwLock::new(TokenAwareStatusBar::new());
}
