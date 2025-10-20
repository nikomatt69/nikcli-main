//! Services Types for NikCLI
//! Defines types for service integration, API clients, and external systems

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

// Service Status Types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    Starting,
    Running,
    Stopping,
    Stopped,
    Error,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceHealth {
    pub status: ServiceStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uptime: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory_usage: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_usage: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_time: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_health_check: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success_rate: Option<f64>, // 0-100
}

// API Client Types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct APIClientConfig {
    pub base_url: String,
    pub timeout: u64,
    pub retries: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<APIAuth>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct APIAuth {
    #[serde(rename = "type")]
    pub auth_type: AuthType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_header: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuthType {
    Bearer,
    Basic,
    ApiKey,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct APIRequest {
    pub method: HttpMethod,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    HEAD,
    OPTIONS,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct APIResponse<T = serde_json::Value> {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub data: T,
    pub response_time: u64,
    pub request: APIRequest,
}

// Cache Types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry<T = serde_json::Value> {
    pub key: String,
    pub value: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hits: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheConfig {
    pub ttl: u64,
    pub max_size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compression: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encryption: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
}

// Queue Types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueMessage<T = serde_json::Value> {
    pub id: String,
    #[serde(rename = "type")]
    pub message_type: String,
    pub priority: u8, // 0-10
    pub data: T,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueConfig {
    pub name: String,
    pub max_size: u64,
    pub default_ttl: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_policy: Option<QueueRetryPolicy>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueRetryPolicy {
    pub max_retries: u32,
    pub backoff_multiplier: f64,
    pub initial_delay: u64,
}

// Database Types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConnection {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_timeout: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query_timeout: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQuery {
    pub sql: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseResult<T = HashMap<String, serde_json::Value>> {
    pub rows: Vec<T>,
    pub row_count: u64,
    pub execution_time: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_rows: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_insert_id: Option<serde_json::Value>,
}

// Message Queue Types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message<T = serde_json::Value> {
    pub id: String,
    pub topic: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    pub value: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<HashMap<String, String>>,
    pub timestamp: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<u64>,
}

pub struct MessageHandler<T = serde_json::Value> {
    pub topic: String,
    pub handler: Box<dyn Fn(Message<T>) -> futures::future::BoxFuture<'static, ()> + Send + Sync>,
    pub options: Option<MessageHandlerOptions>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageHandlerOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_commit: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_beginning: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

// File Storage Types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    pub uploaded_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub acl: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires: Option<DateTime<Utc>>,
}

// Service Interfaces (as traits in Rust)
#[async_trait::async_trait]
pub trait Service: Send + Sync {
    type Config;

    fn get_name(&self) -> &str;
    fn get_version(&self) -> &str;
    fn get_status(&self) -> ServiceStatus;
    async fn get_health(&self) -> anyhow::Result<ServiceHealth>;
    async fn configure(&mut self, config: Self::Config) -> anyhow::Result<()>;
    async fn start(&mut self) -> anyhow::Result<()>;
    async fn stop(&mut self) -> anyhow::Result<()>;
    async fn restart(&mut self) -> anyhow::Result<()>;
}

#[async_trait::async_trait]
pub trait APIClient: Send + Sync {
    async fn request<T: serde::de::DeserializeOwned>(&self, request: APIRequest) -> anyhow::Result<APIResponse<T>>;
    async fn get<T: serde::de::DeserializeOwned>(&self, path: &str, params: Option<HashMap<String, String>>) -> anyhow::Result<APIResponse<T>>;
    async fn post<T: serde::de::DeserializeOwned>(&self, path: &str, body: Option<serde_json::Value>) -> anyhow::Result<APIResponse<T>>;
    async fn put<T: serde::de::DeserializeOwned>(&self, path: &str, body: Option<serde_json::Value>) -> anyhow::Result<APIResponse<T>>;
    async fn delete<T: serde::de::DeserializeOwned>(&self, path: &str) -> anyhow::Result<APIResponse<T>>;
}

#[async_trait::async_trait]
pub trait Cache<T = serde_json::Value>: Send + Sync {
    async fn get(&self, key: &str) -> anyhow::Result<Option<T>>;
    async fn set(&self, key: &str, value: T, ttl: Option<u64>) -> anyhow::Result<()>;
    async fn delete(&self, key: &str) -> anyhow::Result<bool>;
    async fn clear(&self) -> anyhow::Result<()>;
    async fn has(&self, key: &str) -> anyhow::Result<bool>;
    async fn size(&self) -> anyhow::Result<usize>;
}

#[async_trait::async_trait]
pub trait Queue<T = serde_json::Value>: Send + Sync {
    async fn enqueue(&mut self, message: QueueMessage<T>) -> anyhow::Result<()>;
    async fn dequeue(&mut self) -> anyhow::Result<Option<QueueMessage<T>>>;
    async fn peek(&self) -> anyhow::Result<Option<QueueMessage<T>>>;
    async fn size(&self) -> anyhow::Result<usize>;
    async fn clear(&mut self) -> anyhow::Result<()>;
}

#[async_trait::async_trait]
pub trait DatabaseClient: Send + Sync {
    async fn connect(&mut self) -> anyhow::Result<()>;
    async fn disconnect(&mut self) -> anyhow::Result<()>;
    async fn query<T: serde::de::DeserializeOwned>(&self, query: DatabaseQuery) -> anyhow::Result<DatabaseResult<T>>;
    async fn transaction<T, F>(&mut self, callback: F) -> anyhow::Result<T>
    where
        F: FnOnce(&mut dyn DatabaseClient) -> futures::future::BoxFuture<'static, anyhow::Result<T>> + Send,
        T: Send + 'static;
    fn is_connected(&self) -> bool;
}

#[async_trait::async_trait]
pub trait MessageQueue<T = serde_json::Value>: Send + Sync {
    async fn publish(&mut self, message: Message<T>) -> anyhow::Result<()>;
    async fn subscribe(&mut self, handler: MessageHandler<T>) -> anyhow::Result<()>;
    async fn unsubscribe(&mut self, handler: MessageHandler<T>) -> anyhow::Result<()>;
    async fn create_topic(&mut self, topic: &str, partitions: Option<u32>) -> anyhow::Result<()>;
    async fn delete_topic(&mut self, topic: &str) -> anyhow::Result<()>;
}

#[async_trait::async_trait]
pub trait FileStorage: Send + Sync {
    async fn upload(&mut self, file: Vec<u8>, filename: &str, options: Option<UploadOptions>) -> anyhow::Result<FileMetadata>;
    async fn download(&self, path: &str) -> anyhow::Result<Vec<u8>>;
    async fn delete(&mut self, path: &str) -> anyhow::Result<()>;
    async fn list(&self, prefix: Option<&str>) -> anyhow::Result<Vec<FileMetadata>>;
    async fn exists(&self, path: &str) -> anyhow::Result<bool>;
    async fn get_metadata(&self, path: &str) -> anyhow::Result<FileMetadata>;
}

// Configuration Types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceRegistryConfig {
    pub discovery: DiscoveryConfig,
    pub health_check: HealthCheckConfig,
    pub load_balancing: LoadBalancingConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryConfig {
    pub enabled: bool,
    pub interval: u64,
    pub timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckConfig {
    pub enabled: bool,
    pub interval: u64,
    pub timeout: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadBalancingConfig {
    pub strategy: LoadBalancingStrategy,
    pub enabled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LoadBalancingStrategy {
    RoundRobin,
    LeastConnections,
    Weighted,
}

