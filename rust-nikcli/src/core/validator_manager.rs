use crate::core::types::*;
use crate::error::NikCliResult;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Validator trait for all validators
#[async_trait::async_trait]
pub trait Validator: Send + Sync {
    /// Get validator name
    fn get_name(&self) -> &str;
    
    /// Get validator type
    fn get_type(&self) -> ValidationType;
    
    /// Validate data
    async fn validate(&self, data: &serde_json::Value, rules: &[ValidationRule]) -> NikCliResult<ValidationResult>;
    
    /// Get supported rule types
    fn get_supported_rule_types(&self) -> Vec<ValidationRuleType>;
}

/// Validator manager for managing validation operations
pub struct ValidatorManager {
    validators: Arc<RwLock<HashMap<String, Arc<dyn Validator>>>>,
    validation_cache: Arc<RwLock<HashMap<String, ValidationResult>>>,
    validation_history: Arc<RwLock<Vec<ValidationResult>>>,
    metrics: Arc<RwLock<ValidationMetrics>>,
    cache_ttl_seconds: u64,
}

/// Validation metrics
#[derive(Debug, Clone)]
pub struct ValidationMetrics {
    pub total_validations: u64,
    pub successful_validations: u64,
    pub failed_validations: u64,
    pub average_validation_time_ms: f64,
    pub cache_hit_rate: f64,
    pub most_common_errors: HashMap<String, u64>,
    pub validation_types_used: HashMap<ValidationType, u64>,
}

impl ValidatorManager {
    /// Create a new validator manager
    pub fn new() -> Self {
        Self {
            validators: Arc::new(RwLock::new(HashMap::new())),
            validation_cache: Arc::new(RwLock::new(HashMap::new())),
            validation_history: Arc::new(RwLock::new(Vec::new())),
            metrics: Arc::new(RwLock::new(ValidationMetrics {
                total_validations: 0,
                successful_validations: 0,
                failed_validations: 0,
                average_validation_time_ms: 0.0,
                cache_hit_rate: 0.0,
                most_common_errors: HashMap::new(),
                validation_types_used: HashMap::new(),
            })),
            cache_ttl_seconds: 300, // 5 minutes
        }
    }
    
    /// Register a validator
    pub async fn register_validator(&self, validator: Arc<dyn Validator>) -> NikCliResult<()> {
        let name = validator.get_name().to_string();
        info!("Registering validator: {}", name);
        
        {
            let mut validators = self.validators.write().await;
            validators.insert(name.clone(), validator);
        }
        
        info!("Validator registered successfully: {}", name);
        Ok(())
    }
    
    /// Validate data using a specific validator
    pub async fn validate(&self, validator_name: &str, data: &serde_json::Value, rules: &[ValidationRule]) -> NikCliResult<ValidationResult> {
        let start_time = std::time::Instant::now();
        
        // Check cache first
        let cache_key = format!("{}:{}", validator_name, self.hash_data(data));
        {
            let cache = self.validation_cache.read().await;
            if let Some(cached_result) = cache.get(&cache_key) {
                if self.is_cache_valid(cached_result) {
                    debug!("Validation cache hit for {}", validator_name);
                    return Ok(cached_result.clone());
                }
            }
        }
        
        // Get validator
        let validator = {
            let validators = self.validators.read().await;
            validators.get(validator_name).cloned()
        };
        
        let validator = validator.ok_or_else(|| crate::error::NikCliError::NotFound(format!("Validator {} not found", validator_name)))?;
        
        // Perform validation
        let result = validator.validate(data, rules).await?;
        
        let validation_time = start_time.elapsed().as_millis() as u64;
        
        // Update metrics
        self.update_metrics(&result, validation_time).await;
        
        // Cache result
        {
            let mut cache = self.validation_cache.write().await;
            cache.insert(cache_key, result.clone());
        }
        
        // Store in history
        {
            let mut history = self.validation_history.write().await;
            history.push(result.clone());
            
            // Keep only last 1000 validations
            if history.len() > 1000 {
                history.remove(0);
            }
        }
        
        debug!("Validation completed for {} in {}ms", validator_name, validation_time);
        Ok(result)
    }
    
    /// Validate data using the most appropriate validator
    pub async fn validate_auto(&self, data: &serde_json::Value, rules: &[ValidationRule]) -> NikCliResult<ValidationResult> {
        // Determine the best validator based on data type and rules
        let validator_name = self.select_best_validator(data, rules).await?;
        self.validate(&validator_name, data, rules).await
    }
    
    /// Select the best validator for the given data and rules
    async fn select_best_validator(&self, data: &serde_json::Value, rules: &[ValidationRule]) -> NikCliResult<String> {
        let validators = self.validators.read().await;
        
        // Simple selection logic based on data type
        let data_type = match data {
            serde_json::Value::Object(_) => "object",
            serde_json::Value::Array(_) => "array",
            serde_json::Value::String(_) => "string",
            serde_json::Value::Number(_) => "number",
            serde_json::Value::Bool(_) => "boolean",
            serde_json::Value::Null => "null",
        };
        
        // Find validator that supports the most rules
        let mut best_validator = None;
        let mut best_score = 0;
        
        for (name, validator) in validators.iter() {
            let supported_rules = validator.get_supported_rule_types();
            let score = rules.iter()
                .filter(|rule| supported_rules.contains(&rule.rule_type))
                .count();
            
            if score > best_score {
                best_score = score;
                best_validator = Some(name.clone());
            }
        }
        
        best_validator.ok_or_else(|| crate::error::NikCliError::NotFound("No suitable validator found".to_string()))
    }
    
    /// Hash data for cache key
    fn hash_data(&self, data: &serde_json::Value) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(serde_json::to_string(data).unwrap_or_default().as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Check if cached result is still valid
    fn is_cache_valid(&self, result: &ValidationResult) -> bool {
        let now = chrono::Utc::now();
        let cache_age = now.signed_duration_since(result.validated_at).num_seconds();
        cache_age < self.cache_ttl_seconds as i64
    }
    
    /// Update validation metrics
    async fn update_metrics(&self, result: &ValidationResult, validation_time_ms: u64) {
        let mut metrics = self.metrics.write().await;
        
        metrics.total_validations += 1;
        if result.success {
            metrics.successful_validations += 1;
        } else {
            metrics.failed_validations += 1;
        }
        
        // Update average validation time
        let total_time = metrics.average_validation_time_ms * (metrics.total_validations - 1) as f64 + validation_time_ms as f64;
        metrics.average_validation_time_ms = total_time / metrics.total_validations as f64;
        
        // Track common errors
        for error in &result.errors {
            *metrics.most_common_errors.entry(error.message.clone()).or_insert(0) += 1;
        }
    }
    
    /// Get validator by name
    pub async fn get_validator(&self, name: &str) -> Option<Arc<dyn Validator>> {
        let validators = self.validators.read().await;
        validators.get(name).cloned()
    }
    
    /// Get all validators
    pub async fn get_all_validators(&self) -> HashMap<String, Arc<dyn Validator>> {
        let validators = self.validators.read().await;
        validators.clone()
    }
    
    /// Get validation metrics
    pub async fn get_metrics(&self) -> ValidationMetrics {
        let metrics = self.metrics.read().await;
        metrics.clone()
    }
    
    /// Get validation history
    pub async fn get_validation_history(&self, limit: Option<usize>) -> Vec<ValidationResult> {
        let history = self.validation_history.read().await;
        let limit = limit.unwrap_or(100);
        
        if history.len() <= limit {
            history.clone()
        } else {
            history[history.len() - limit..].to_vec()
        }
    }
    
    /// Clear validation cache
    pub async fn clear_cache(&self) -> NikCliResult<()> {
        let mut cache = self.validation_cache.write().await;
        cache.clear();
        info!("Validation cache cleared");
        Ok(())
    }
    
    /// Clear validation history
    pub async fn clear_history(&self) -> NikCliResult<()> {
        let mut history = self.validation_history.write().await;
        history.clear();
        info!("Validation history cleared");
        Ok(())
    }
    
    /// Set cache TTL
    pub fn set_cache_ttl(&mut self, ttl_seconds: u64) {
        self.cache_ttl_seconds = ttl_seconds;
        info!("Validation cache TTL set to {} seconds", ttl_seconds);
    }
    
    /// Unregister validator
    pub async fn unregister_validator(&self, name: &str) -> NikCliResult<bool> {
        let mut validators = self.validators.write().await;
        let removed = validators.remove(name).is_some();
        
        if removed {
            info!("Validator unregistered: {}", name);
        }
        
        Ok(removed)
    }
}

/// Built-in JSON schema validator
pub struct JsonSchemaValidator {
    name: String,
    schema_cache: HashMap<String, serde_json::Value>,
}

impl JsonSchemaValidator {
    /// Create a new JSON schema validator
    pub fn new() -> Self {
        Self {
            name: "json-schema".to_string(),
            schema_cache: HashMap::new(),
        }
    }
    
    /// Validate against JSON schema
    async fn validate_schema(&self, data: &serde_json::Value, schema: &serde_json::Value) -> NikCliResult<ValidationResult> {
        // This is a simplified schema validation
        // In a real implementation, this would use a proper JSON schema validator
        
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        
        // Basic type validation
        if let Some(expected_type) = schema.get("type") {
            let actual_type = match data {
                serde_json::Value::Object(_) => "object",
                serde_json::Value::Array(_) => "array",
                serde_json::Value::String(_) => "string",
                serde_json::Value::Number(_) => "number",
                serde_json::Value::Bool(_) => "boolean",
                serde_json::Value::Null => "null",
            };
            
            if expected_type.as_str() != Some(actual_type) {
                errors.push(ValidationError {
                    rule_name: "type".to_string(),
                    message: format!("Expected type {}, got {}", expected_type, actual_type),
                    severity: ValidationSeverity::Error,
                    field: None,
                    value: Some(data.clone()),
                    suggestion: Some(format!("Change the value to be of type {}", expected_type)),
                });
            }
        }
        
        // Required fields validation
        if let Some(required_fields) = schema.get("required").and_then(|r| r.as_array()) {
            if let serde_json::Value::Object(obj) = data {
                for field in required_fields {
                    if let Some(field_name) = field.as_str() {
                        if !obj.contains_key(field_name) {
                            errors.push(ValidationError {
                                rule_name: "required".to_string(),
                                message: format!("Required field '{}' is missing", field_name),
                                severity: ValidationSeverity::Error,
                                field: Some(field_name.to_string()),
                                value: None,
                                suggestion: Some(format!("Add the required field '{}'", field_name)),
                            });
                        }
                    }
                }
            }
        }
        
        let success = errors.is_empty();
        
        Ok(ValidationResult {
            validation_id: uuid::Uuid::new_v4().to_string(),
            success,
            errors,
            warnings,
            execution_time_ms: 0, // Would be calculated
            validated_at: chrono::Utc::now(),
            metadata: HashMap::new(),
        })
    }
}

#[async_trait::async_trait]
impl Validator for JsonSchemaValidator {
    fn get_name(&self) -> &str {
        &self.name
    }
    
    fn get_type(&self) -> ValidationType {
        ValidationType::Schema
    }
    
    async fn validate(&self, data: &serde_json::Value, rules: &[ValidationRule]) -> NikCliResult<ValidationResult> {
        // Convert rules to schema format
        let mut schema = serde_json::Map::new();
        
        for rule in rules {
            match rule.rule_type {
                ValidationRuleType::Required => {
                    if let Some(required) = schema.get_mut("required") {
                        if let Some(required_array) = required.as_array_mut() {
                            required_array.push(serde_json::Value::String("field".to_string()));
                        }
                    } else {
                        schema.insert("required".to_string(), serde_json::Value::Array(vec![serde_json::Value::String("field".to_string())]));
                    }
                }
                ValidationRuleType::MinLength => {
                    if let Some(min_length) = rule.parameters.get("value").and_then(|v| v.as_u64()) {
                        schema.insert("minLength".to_string(), serde_json::Value::Number(serde_json::Number::from(min_length)));
                    }
                }
                ValidationRuleType::MaxLength => {
                    if let Some(max_length) = rule.parameters.get("value").and_then(|v| v.as_u64()) {
                        schema.insert("maxLength".to_string(), serde_json::Value::Number(serde_json::Number::from(max_length)));
                    }
                }
                ValidationRuleType::Pattern => {
                    if let Some(pattern) = rule.parameters.get("value").and_then(|v| v.as_str()) {
                        schema.insert("pattern".to_string(), serde_json::Value::String(pattern.to_string()));
                    }
                }
                _ => {}
            }
        }
        
        let schema_value = serde_json::Value::Object(schema);
        self.validate_schema(data, &schema_value).await
    }
    
    fn get_supported_rule_types(&self) -> Vec<ValidationRuleType> {
        vec![
            ValidationRuleType::Required,
            ValidationRuleType::MinLength,
            ValidationRuleType::MaxLength,
            ValidationRuleType::Pattern,
        ]
    }
}

/// Built-in format validator
pub struct FormatValidator {
    name: String,
}

impl FormatValidator {
    /// Create a new format validator
    pub fn new() -> Self {
        Self {
            name: "format".to_string(),
        }
    }
}

#[async_trait::async_trait]
impl Validator for FormatValidator {
    fn get_name(&self) -> &str {
        &self.name
    }
    
    fn get_type(&self) -> ValidationType {
        ValidationType::Format
    }
    
    async fn validate(&self, data: &serde_json::Value, rules: &[ValidationRule]) -> NikCliResult<ValidationResult> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();
        
        for rule in rules {
            match rule.rule_type {
                ValidationRuleType::Pattern => {
                    if let (Some(pattern), Some(value)) = (rule.parameters.get("value").and_then(|v| v.as_str()), data.as_str()) {
                        let regex = regex::Regex::new(pattern)
                            .map_err(|e| crate::error::NikCliError::Validation(format!("Invalid regex pattern: {}", e)))?;
                        
                        if !regex.is_match(value) {
                            errors.push(ValidationError {
                                rule_name: rule.name.clone(),
                                message: format!("Value '{}' does not match pattern '{}'", value, pattern),
                                severity: rule.severity.clone(),
                                field: None,
                                value: Some(data.clone()),
                                suggestion: Some(format!("Ensure the value matches the pattern: {}", pattern)),
                            });
                        }
                    }
                }
                _ => {}
            }
        }
        
        let success = errors.is_empty();
        
        Ok(ValidationResult {
            validation_id: uuid::Uuid::new_v4().to_string(),
            success,
            errors,
            warnings,
            execution_time_ms: 0,
            validated_at: chrono::Utc::now(),
            metadata: HashMap::new(),
        })
    }
    
    fn get_supported_rule_types(&self) -> Vec<ValidationRuleType> {
        vec![ValidationRuleType::Pattern]
    }
}

impl Default for ValidatorManager {
    fn default() -> Self {
        Self::new()
    }
}