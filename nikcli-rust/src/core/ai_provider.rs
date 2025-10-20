use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

/// AI message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIMessage {
    pub role: String,
    pub content: String,
}

/// AI response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIResponse {
    pub content: String,
    pub model: String,
    pub usage: TokenUsage,
    pub finish_reason: Option<String>,
}

/// Token usage information
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TokenUsage {
    pub prompt_tokens: Option<usize>,
    pub completion_tokens: Option<usize>,
    pub total_tokens: Option<usize>,
}

/// OpenRouter API request structure
#[derive(Debug, Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<AIMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

/// OpenRouter API response structure
#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Vec<Choice>,
    usage: Option<Usage>,
    model: String,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: Message,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Message {
    content: String,
}

#[derive(Debug, Deserialize)]
struct Usage {
    prompt_tokens: Option<usize>,
    completion_tokens: Option<usize>,
    total_tokens: Option<usize>,
}

/// AI Provider for interacting with various AI APIs
pub struct AIProvider {
    client: Client,
}

impl AIProvider {
    /// Create a new AI provider
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    /// Send a message to the AI and get a response
    pub async fn send_message(
        &self,
        messages: &[AIMessage],
        model: &str,
        api_key: &str,
    ) -> Result<AIResponse> {
        info!("Sending message to AI (model: {})", model);
        debug!("Messages: {:?}", messages);

        // Determine which API to use based on model name
        if model.contains("anthropic") || model.contains("claude") {
            self.send_to_openrouter(messages, model, api_key).await
        } else if model.contains("openai") || model.contains("gpt") {
            self.send_to_openrouter(messages, model, api_key).await
        } else {
            // Default to OpenRouter for all models
            self.send_to_openrouter(messages, model, api_key).await
        }
    }

    /// Send message via OpenRouter API
    async fn send_to_openrouter(
        &self,
        messages: &[AIMessage],
        model: &str,
        api_key: &str,
    ) -> Result<AIResponse> {
        let url = "https://openrouter.ai/api/v1/chat/completions";

        let request = OpenRouterRequest {
            model: model.to_string(),
            messages: messages.to_vec(),
            temperature: Some(0.7),
            max_tokens: Some(4096),
            stream: Some(false),
        };

        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("HTTP-Referer", "https://github.com/nikomatt69/nikcli")
            .header("X-Title", "NikCLI Rust")
            .json(&request)
            .send()
            .await
            .context("Failed to send request to OpenRouter")?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            anyhow::bail!("OpenRouter API error ({}): {}", status, error_text);
        }

        let openrouter_response: OpenRouterResponse = response
            .json()
            .await
            .context("Failed to parse OpenRouter response")?;

        let choice = openrouter_response
            .choices
            .first()
            .context("No choices in response")?;

        let usage = if let Some(usage) = openrouter_response.usage {
            TokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
            }
        } else {
            TokenUsage::default()
        };

        Ok(AIResponse {
            content: choice.message.content.clone(),
            model: openrouter_response.model,
            usage,
            finish_reason: choice.finish_reason.clone(),
        })
    }

    /// Stream a response from the AI (TODO: implement streaming)
    pub async fn stream_message(
        &self,
        _messages: &[AIMessage],
        _model: &str,
        _api_key: &str,
    ) -> Result<impl futures::Stream<Item = Result<String>>> {
        // TODO: Implement streaming support
        anyhow::bail!("Streaming not yet implemented")
    }
}

impl Default for AIProvider {
    fn default() -> Self {
        Self::new()
    }
}
