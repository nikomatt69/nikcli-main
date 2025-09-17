use crate::ai::types::*;
use crate::core::config::NikCliConfig;
use crate::error::NikCliResult;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Model provider for handling different AI providers
pub struct ModelProvider {
    config: Arc<RwLock<NikCliConfig>>,
    http_client: Client,
    stats: Arc<RwLock<HashMap<String, AiCallStats>>>,
}

impl ModelProvider {
    /// Create a new model provider
    pub fn new(config: Arc<RwLock<NikCliConfig>>) -> Self {
        Self {
            config,
            http_client: Client::new(),
            stats: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Get current model configuration
    async fn get_current_model_config(&self) -> NikCliResult<ModelConfig> {
        let config = self.config.read().await;
        let current_model = &config.current_model;
        
        let model_config = config.models.get(current_model)
            .ok_or_else(|| crate::error::NikCliError::Config(
                format!("Model '{}' not found in configuration", current_model)
            ))?;
        
        let api_key = config.api_keys
            .as_ref()
            .and_then(|keys| keys.get(current_model))
            .cloned();
        
        Ok(ModelConfig {
            provider: match model_config.provider {
                crate::core::config::ModelProvider::OpenAi => AiProvider::OpenAi,
                crate::core::config::ModelProvider::Anthropic => AiProvider::Anthropic,
                crate::core::config::ModelProvider::Google => AiProvider::Google,
                crate::core::config::ModelProvider::Ollama => AiProvider::Ollama,
                crate::core::config::ModelProvider::Vercel => AiProvider::Vercel,
                crate::core::config::ModelProvider::Gateway => AiProvider::Gateway,
                crate::core::config::ModelProvider::OpenRouter => AiProvider::OpenRouter,
            },
            model: model_config.model.clone(),
            temperature: model_config.temperature,
            max_tokens: model_config.max_tokens,
            api_key,
            base_url: None,
            timeout: Some(30000), // 30 seconds
        })
    }
    
    /// Update statistics for a model
    async fn update_stats(&self, model_name: &str, success: bool, tokens: u32, duration: u64) {
        let mut stats = self.stats.write().await;
        let model_stats = stats.entry(model_name.to_string()).or_insert_with(|| AiCallStats {
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
            total_tokens: 0,
            total_cost: 0.0,
            average_response_time: 0.0,
            last_call: None,
        });
        
        model_stats.total_calls += 1;
        if success {
            model_stats.successful_calls += 1;
        } else {
            model_stats.failed_calls += 1;
        }
        model_stats.total_tokens += tokens as u64;
        model_stats.last_call = Some(chrono::Utc::now());
        
        // Update average response time
        let total_time = model_stats.average_response_time * (model_stats.total_calls - 1) as f64 + duration as f64;
        model_stats.average_response_time = total_time / model_stats.total_calls as f64;
    }
    
    /// Make HTTP request to AI provider
    async fn make_request(&self, config: &ModelConfig, messages: &[ChatMessage]) -> NikCliResult<serde_json::Value> {
        let api_key = config.api_key.as_ref()
            .ok_or_else(|| crate::error::NikCliError::Api("API key not configured".to_string()))?;
        
        let url = match config.provider {
            AiProvider::OpenAi => "https://api.openai.com/v1/chat/completions",
            AiProvider::Anthropic => "https://api.anthropic.com/v1/messages",
            AiProvider::Google => "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
            AiProvider::Ollama => "http://localhost:11434/api/chat",
            AiProvider::Vercel => "https://api.vercel.com/v1/chat/completions",
            AiProvider::Gateway => "https://api.gateway.ai/v1/chat/completions",
            AiProvider::OpenRouter => "https://openrouter.ai/api/v1/chat/completions",
        };
        
        // Convert messages to provider format
        let request_body = self.format_messages_for_provider(config, messages)?;
        
        let mut request = self.http_client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_body);
        
        // Add provider-specific headers
        match config.provider {
            AiProvider::Anthropic => {
                request = request.header("anthropic-version", "2023-06-01");
            }
            AiProvider::Google => {
                request = request.header("x-goog-api-key", api_key);
            }
            _ => {}
        }
        
        let response = request.send().await
            .map_err(|e| crate::error::NikCliError::Network(e.to_string()))?;
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(crate::error::NikCliError::Api(format!(
                "API request failed with status {}: {}", 
                response.status(), 
                error_text
            )));
        }
        
        let response_json: serde_json::Value = response.json().await
            .map_err(|e| crate::error::NikCliError::Serialization(e.to_string()))?;
        
        Ok(response_json)
    }
    
    /// Format messages for specific provider
    fn format_messages_for_provider(&self, config: &ModelConfig, messages: &[ChatMessage]) -> NikCliResult<serde_json::Value> {
        match config.provider {
            AiProvider::OpenAi | AiProvider::Vercel | AiProvider::Gateway | AiProvider::OpenRouter => {
                let formatted_messages: Vec<serde_json::Value> = messages.iter().map(|msg| {
                    json!({
                        "role": msg.role.to_string(),
                        "content": msg.content
                    })
                }).collect();
                
                Ok(json!({
                    "model": config.model,
                    "messages": formatted_messages,
                    "temperature": config.temperature.unwrap_or(0.7),
                    "max_tokens": config.max_tokens.unwrap_or(4000)
                }))
            }
            AiProvider::Anthropic => {
                let system_message = messages.iter()
                    .find(|msg| matches!(msg.role, ChatRole::System))
                    .map(|msg| msg.content.clone());
                
                let user_messages: Vec<serde_json::Value> = messages.iter()
                    .filter(|msg| matches!(msg.role, ChatRole::User | ChatRole::Assistant))
                    .map(|msg| {
                        json!({
                            "role": if matches!(msg.role, ChatRole::User) { "user" } else { "assistant" },
                            "content": msg.content
                        })
                    })
                    .collect();
                
                let mut body = json!({
                    "model": config.model,
                    "messages": user_messages,
                    "temperature": config.temperature.unwrap_or(0.7),
                    "max_tokens": config.max_tokens.unwrap_or(4000)
                });
                
                if let Some(system) = system_message {
                    body["system"] = json!(system);
                }
                
                Ok(body)
            }
            AiProvider::Google => {
                let contents: Vec<serde_json::Value> = messages.iter().map(|msg| {
                    json!({
                        "role": if matches!(msg.role, ChatRole::User) { "user" } else { "model" },
                        "parts": [{"text": msg.content}]
                    })
                }).collect();
                
                Ok(json!({
                    "contents": contents,
                    "generationConfig": {
                        "temperature": config.temperature.unwrap_or(0.7),
                        "maxOutputTokens": config.max_tokens.unwrap_or(4000)
                    }
                }))
            }
            AiProvider::Ollama => {
                let formatted_messages: Vec<serde_json::Value> = messages.iter().map(|msg| {
                    json!({
                        "role": msg.role.to_string(),
                        "content": msg.content
                    })
                }).collect();
                
                Ok(json!({
                    "model": config.model,
                    "messages": formatted_messages,
                    "stream": false,
                    "options": {
                        "temperature": config.temperature.unwrap_or(0.7),
                        "num_predict": config.max_tokens.unwrap_or(4000)
                    }
                }))
            }
        }
    }
    
    /// Parse response from provider
    fn parse_response(&self, config: &ModelConfig, response: serde_json::Value) -> NikCliResult<ModelResponse> {
        match config.provider {
            AiProvider::OpenAi | AiProvider::Vercel | AiProvider::Gateway | AiProvider::OpenRouter => {
                let choice = response["choices"][0].as_object()
                    .ok_or_else(|| crate::error::NikCliError::Api("Invalid response format".to_string()))?;
                
                let text = choice["message"]["content"].as_str()
                    .ok_or_else(|| crate::error::NikCliError::Api("No content in response".to_string()))?
                    .to_string();
                
                let usage = response["usage"].as_object().map(|usage| TokenUsage {
                    prompt_tokens: usage["prompt_tokens"].as_u64().unwrap_or(0) as u32,
                    completion_tokens: usage["completion_tokens"].as_u64().unwrap_or(0) as u32,
                    total_tokens: usage["total_tokens"].as_u64().unwrap_or(0) as u32,
                });
                
                let finish_reason = choice["finish_reason"].as_str().map(|reason| {
                    match reason {
                        "stop" => FinishReason::Stop,
                        "length" => FinishReason::Length,
                        "content_filter" => FinishReason::ContentFilter,
                        "tool_calls" => FinishReason::ToolCalls,
                        _ => FinishReason::Stop,
                    }
                });
                
                Ok(ModelResponse {
                    text,
                    usage,
                    finish_reason,
                    warnings: None,
                })
            }
            AiProvider::Anthropic => {
                let content = response["content"][0]["text"].as_str()
                    .ok_or_else(|| crate::error::NikCliError::Api("No content in response".to_string()))?
                    .to_string();
                
                let usage = response["usage"].as_object().map(|usage| TokenUsage {
                    prompt_tokens: usage["input_tokens"].as_u64().unwrap_or(0) as u32,
                    completion_tokens: usage["output_tokens"].as_u64().unwrap_or(0) as u32,
                    total_tokens: usage["input_tokens"].as_u64().unwrap_or(0) as u32 + 
                                usage["output_tokens"].as_u64().unwrap_or(0) as u32,
                });
                
                let stop_reason = response["stop_reason"].as_str().map(|reason| {
                    match reason {
                        "end_turn" => FinishReason::Stop,
                        "max_tokens" => FinishReason::Length,
                        "stop_sequence" => FinishReason::Stop,
                        _ => FinishReason::Stop,
                    }
                });
                
                Ok(ModelResponse {
                    text: content,
                    usage,
                    finish_reason: stop_reason,
                    warnings: None,
                })
            }
            AiProvider::Google => {
                let candidate = response["candidates"][0].as_object()
                    .ok_or_else(|| crate::error::NikCliError::Api("Invalid response format".to_string()))?;
                
                let content = candidate["content"]["parts"][0]["text"].as_str()
                    .ok_or_else(|| crate::error::NikCliError::Api("No content in response".to_string()))?
                    .to_string();
                
                let usage = response["usageMetadata"].as_object().map(|usage| TokenUsage {
                    prompt_tokens: usage["promptTokenCount"].as_u64().unwrap_or(0) as u32,
                    completion_tokens: usage["candidatesTokenCount"].as_u64().unwrap_or(0) as u32,
                    total_tokens: usage["totalTokenCount"].as_u64().unwrap_or(0) as u32,
                });
                
                Ok(ModelResponse {
                    text: content,
                    usage,
                    finish_reason: Some(FinishReason::Stop),
                    warnings: None,
                })
            }
            AiProvider::Ollama => {
                let message = response["message"].as_object()
                    .ok_or_else(|| crate::error::NikCliError::Api("Invalid response format".to_string()))?;
                
                let content = message["content"].as_str()
                    .ok_or_else(|| crate::error::NikCliError::Api("No content in response".to_string()))?
                    .to_string();
                
                Ok(ModelResponse {
                    text: content,
                    usage: None,
                    finish_reason: Some(FinishReason::Stop),
                    warnings: None,
                })
            }
        }
    }
}

#[async_trait]
impl crate::ai::types::AiProvider for ModelProvider {
    fn name(&self) -> &str {
        "model-provider"
    }
    
    async fn is_available(&self) -> bool {
        match self.get_current_model_config().await {
            Ok(config) => config.api_key.is_some(),
            Err(_) => false,
        }
    }
    
    async fn generate_text(&self, options: GenerateOptions) -> NikCliResult<ModelResponse> {
        let start_time = std::time::Instant::now();
        let config = self.get_current_model_config().await?;
        
        info!("Generating text with model: {} ({})", config.model, config.provider);
        
        let response_json = self.make_request(&config, &options.messages).await?;
        let response = self.parse_response(&config, response_json)?;
        
        let duration = start_time.elapsed().as_millis() as u64;
        let tokens = response.usage.as_ref().map(|u| u.total_tokens).unwrap_or(0);
        
        // Update statistics
        self.update_stats(&config.model, true, tokens, duration).await;
        
        info!("Generated text successfully in {}ms, {} tokens", duration, tokens);
        Ok(response)
    }
    
    async fn stream_text(&self, _options: GenerateOptions) -> NikCliResult<Box<dyn tokio_stream::Stream<Item = StreamEvent> + Send + Unpin>> {
        // TODO: Implement streaming
        Err(crate::error::NikCliError::NotImplemented("Streaming not yet implemented".to_string()))
    }
    
    async fn generate_structured<T>(&self, options: GenerateOptions, _schema: &T) -> NikCliResult<T>
    where
        T: serde::de::DeserializeOwned + Send + Sync,
    {
        let response = self.generate_text(options).await?;
        
        // Try to parse the response as JSON
        let parsed: T = serde_json::from_str(&response.text)
            .map_err(|e| crate::error::NikCliError::Serialization(format!("Failed to parse structured response: {}", e)))?;
        
        Ok(parsed)
    }
    
    fn get_model_info(&self) -> ModelConfig {
        // This is a simplified implementation
        // In a real implementation, this would return the current model config
        ModelConfig {
            provider: AiProvider::OpenAi,
            model: "gpt-4".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4000),
            api_key: None,
            base_url: None,
            timeout: Some(30000),
        }
    }
    
    fn get_stats(&self) -> AiCallStats {
        // This would return aggregated stats from all models
        AiCallStats {
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
            total_tokens: 0,
            total_cost: 0.0,
            average_response_time: 0.0,
            last_call: None,
        }
    }
}