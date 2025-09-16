// Security middleware module
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityMiddleware {
    pub name: String,
    pub enabled: bool,
    pub security_policies: Vec<SecurityPolicy>,
    pub rate_limiting: Option<RateLimiting>,
    pub authentication: Option<Authentication>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityPolicy {
    pub name: String,
    pub policy_type: SecurityPolicyType,
    pub rules: Vec<SecurityRule>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityPolicyType {
    Authentication,
    Authorization,
    RateLimiting,
    InputValidation,
    OutputSanitization,
    CORS,
    CSRF,
    XSS,
    SQLInjection,
    PathTraversal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityRule {
    pub name: String,
    pub pattern: String,
    pub action: SecurityAction,
    pub severity: SecuritySeverity,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecurityAction {
    Allow,
    Deny,
    Log,
    Block,
    Redirect,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SecuritySeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimiting {
    pub enabled: bool,
    pub requests_per_minute: u32,
    pub requests_per_hour: u32,
    pub requests_per_day: u32,
    pub burst_limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Authentication {
    pub enabled: bool,
    pub auth_type: AuthType,
    pub token_validation: bool,
    pub session_management: bool,
    pub password_policy: Option<PasswordPolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthType {
    JWT,
    Session,
    APIKey,
    OAuth,
    Basic,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordPolicy {
    pub min_length: u32,
    pub require_uppercase: bool,
    pub require_lowercase: bool,
    pub require_numbers: bool,
    pub require_special_chars: bool,
    pub max_age_days: Option<u32>,
}

impl SecurityMiddleware {
    pub fn new(name: String) -> Self {
        Self {
            name,
            enabled: true,
            security_policies: Vec::new(),
            rate_limiting: None,
            authentication: None,
        }
    }

    pub fn with_policies(mut self, policies: Vec<SecurityPolicy>) -> Self {
        self.security_policies = policies;
        self
    }

    pub fn with_rate_limiting(mut self, rate_limiting: RateLimiting) -> Self {
        self.rate_limiting = Some(rate_limiting);
        self
    }

    pub fn with_authentication(mut self, authentication: Authentication) -> Self {
        self.authentication = Some(authentication);
        self
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}