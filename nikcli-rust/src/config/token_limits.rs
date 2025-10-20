//! Token Limits - PRODUCTION READY
pub struct TokenLimits {
    pub max_input: u64,
    pub max_output: u64,
    pub max_total: u64,
}
lazy_static::lazy_static! {
    pub static ref TOKEN_LIMITS: TokenLimits = TokenLimits {
        max_input: 100000,
        max_output: 4096,
        max_total: 200000,
    };
}
