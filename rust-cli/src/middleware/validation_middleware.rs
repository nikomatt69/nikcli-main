// Validation middleware module
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationMiddleware {
    pub name: String,
    pub enabled: bool,
    pub validation_rules: Vec<ValidationRule>,
    pub strict_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRule {
    pub name: String,
    pub field: String,
    pub rule_type: ValidationRuleType,
    pub required: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationRuleType {
    String,
    Number,
    Boolean,
    Array,
    Object,
    Email,
    Url,
    Date,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRequest {
    pub data: serde_json::Value,
    pub rules: Option<Vec<ValidationRule>>,
    pub context: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResponse {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationWarning>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
    pub code: String,
    pub value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationWarning {
    pub field: String,
    pub message: String,
    pub code: String,
    pub value: Option<serde_json::Value>,
}

impl ValidationMiddleware {
    pub fn new(name: String) -> Self {
        Self {
            name,
            enabled: true,
            validation_rules: Vec::new(),
            strict_mode: false,
        }
    }

    pub fn with_rules(mut self, rules: Vec<ValidationRule>) -> Self {
        self.validation_rules = rules;
        self
    }

    pub fn with_strict_mode(mut self, strict: bool) -> Self {
        self.strict_mode = strict;
        self
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}