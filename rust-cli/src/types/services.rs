use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Service status enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ServiceStatus {
    Starting,
    Running,
    Stopping,
    Stopped,
    Error,
    Unknown,
}

impl std::fmt::Display for ServiceStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ServiceStatus::Starting => write!(f, "starting"),
            ServiceStatus::Running => write!(f, "running"),
            ServiceStatus::Stopping => write!(f, "stopping"),
            ServiceStatus::Stopped => write!(f, "stopped"),
            ServiceStatus::Error => write!(f, "error"),
            ServiceStatus::Unknown => write!(f, "unknown"),
        }
    }
}

/// Service health representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceHealth {
    pub status: ServiceStatus,
    pub uptime: Option<u64>,
    pub memory_usage: Option<u64>,
    pub cpu_usage: Option<f64>,
    pub response_time: Option<u64>,
    pub last_health_check: Option<DateTime<Utc>>,
    pub error_count: Option<u32>,
    pub success_rate: Option<f64>, // 0.0-100.0
}

impl ServiceHealth {
    pub fn new(status: ServiceStatus) -> Self {
        Self {
            status,
            uptime: None,
            memory_usage: None,
            cpu_usage: None,
            response_time: None,
            last_health_check: Some(Utc::now()),
            error_count: None,
            success_rate: None,
        }
    }
}

/// Authentication type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AuthType {
    Bearer,
    Basic,
    ApiKey,
    None,
}

impl std::fmt::Display for AuthType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthType::Bearer => write!(f, "bearer"),
            AuthType::Basic => write!(f, "basic"),
            AuthType::ApiKey => write!(f, "api-key"),
            AuthType::None => write!(f, "none"),
        }
    }
}

/// Authentication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub auth_type: AuthType,
    pub token: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub api_key: Option<String>,
    pub api_key_header: Option<String>,
}

impl AuthConfig {
    pub fn new(auth_type: AuthType) -> Self {
        Self {
            auth_type,
            token: None,
            username: None,
            password: None,
            api_key: None,
            api_key_header: None,
        }
    }
}

/// API client configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIClientConfig {
    pub base_url: String,
    pub timeout: u64,
    pub retries: u32,
    pub headers: Option<HashMap<String, String>>,
    pub auth: Option<AuthConfig>,
}

impl APIClientConfig {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            timeout: 30,
            retries: 3,
            headers: None,
            auth: None,
        }
    }
}

/// HTTP method enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Head,
    Options,
}

impl std::fmt::Display for HttpMethod {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HttpMethod::Get => write!(f, "GET"),
            HttpMethod::Post => write!(f, "POST"),
            HttpMethod::Put => write!(f, "PUT"),
            HttpMethod::Delete => write!(f, "DELETE"),
            HttpMethod::Patch => write!(f, "PATCH"),
            HttpMethod::Head => write!(f, "HEAD"),
            HttpMethod::Options => write!(f, "OPTIONS"),
        }
    }
}

/// API request representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIRequest {
    pub method: HttpMethod,
    pub path: String,
    pub headers: Option<HashMap<String, String>>,
    pub params: Option<HashMap<String, String>>,
    pub body: Option<serde_json::Value>,
    pub timeout: Option<u64>,
}

impl APIRequest {
    pub fn new(method: HttpMethod, path: String) -> Self {
        Self {
            method,
            path,
            headers: None,
            params: None,
            body: None,
            timeout: None,
        }
    }
}

/// API response representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct APIResponse<T = serde_json::Value> {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub data: T,
    pub response_time: u64,
    pub request: APIRequest,
}

impl<T> APIResponse<T> {
    pub fn new(status: u16, status_text: String, data: T, request: APIRequest) -> Self {
        Self {
            status,
            status_text,
            headers: HashMap::new(),
            data,
            response_time: 0,
            request,
        }
    }
}

/// Cache entry representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry<T = serde_json::Value> {
    pub key: String,
    pub value: T,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub hits: Option<u32>,
    pub size: Option<u64>,
}

impl<T> CacheEntry<T> {
    pub fn new(key: String, value: T) -> Self {
        Self {
            key,
            value,
            expires_at: None,
            created_at: Utc::now(),
            hits: Some(0),
            size: None,
        }
    }
}

/// Cache configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub ttl: u64,
    pub max_size: u64,
    pub compression: Option<bool>,
    pub encryption: Option<bool>,
    pub namespace: Option<String>,
}

impl CacheConfig {
    pub fn new(ttl: u64, max_size: u64) -> Self {
        Self {
            ttl,
            max_size,
            compression: None,
            encryption: None,
            namespace: None,
        }
    }
}

/// Queue message representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueMessage<T = serde_json::Value> {
    pub id: String,
    pub message_type: String,
    pub priority: u8, // 0-10
    pub data: T,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub retry_count: Option<u32>,
    pub max_retries: Option<u32>,
}

impl<T> QueueMessage<T> {
    pub fn new(message_type: String, data: T) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            message_type,
            priority: 5,
            data,
            created_at: Utc::now(),
            expires_at: None,
            retry_count: Some(0),
            max_retries: Some(3),
        }
    }
}

/// Retry policy for queues
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub backoff_multiplier: f64,
    pub initial_delay: u64,
}

impl RetryPolicy {
    pub fn new(max_retries: u32, backoff_multiplier: f64, initial_delay: u64) -> Self {
        Self {
            max_retries,
            backoff_multiplier,
            initial_delay,
        }
    }
}

/// Queue configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueConfig {
    pub name: String,
    pub max_size: u64,
    pub default_ttl: u64,
    pub retry_policy: Option<RetryPolicy>,
}

impl QueueConfig {
    pub fn new(name: String, max_size: u64, default_ttl: u64) -> Self {
        Self {
            name,
            max_size,
            default_ttl,
            retry_policy: None,
        }
    }
}

/// Database connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConnection {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    pub ssl: Option<bool>,
    pub connection_timeout: Option<u64>,
    pub query_timeout: Option<u64>,
}

impl DatabaseConnection {
    pub fn new(host: String, port: u16, database: String, username: String, password: String) -> Self {
        Self {
            host,
            port,
            database,
            username,
            password,
            ssl: None,
            connection_timeout: None,
            query_timeout: None,
        }
    }
}

/// Database query representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseQuery {
    pub sql: String,
    pub params: Option<Vec<serde_json::Value>>,
    pub timeout: Option<u64>,
    pub read_only: Option<bool>,
}

impl DatabaseQuery {
    pub fn new(sql: String) -> Self {
        Self {
            sql,
            params: None,
            timeout: None,
            read_only: None,
        }
    }
}

/// Database result representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseResult<T = HashMap<String, serde_json::Value>> {
    pub rows: Vec<T>,
    pub row_count: u32,
    pub execution_time: u64,
    pub affected_rows: Option<u32>,
    pub last_insert_id: Option<serde_json::Value>,
}

impl<T> DatabaseResult<T> {
    pub fn new(rows: Vec<T>) -> Self {
        Self {
            row_count: rows.len() as u32,
            rows,
            execution_time: 0,
            affected_rows: None,
            last_insert_id: None,
        }
    }
}

/// Message representation for message queues
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message<T = serde_json::Value> {
    pub id: String,
    pub topic: String,
    pub partition: Option<String>,
    pub key: Option<String>,
    pub value: T,
    pub headers: Option<HashMap<String, String>>,
    pub timestamp: DateTime<Utc>,
    pub offset: Option<u64>,
}

impl<T> Message<T> {
    pub fn new(topic: String, value: T) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            topic,
            partition: None,
            key: None,
            value,
            headers: None,
            timestamp: Utc::now(),
            offset: None,
        }
    }
}

/// Message handler options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageHandlerOptions {
    pub auto_commit: Option<bool>,
    pub from_beginning: Option<bool>,
    pub group_id: Option<String>,
}

impl MessageHandlerOptions {
    pub fn new() -> Self {
        Self {
            auto_commit: None,
            from_beginning: None,
            group_id: None,
        }
    }
}

/// Message handler representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageHandler {
    pub topic: String,
    pub options: Option<MessageHandlerOptions>,
}

impl MessageHandler {
    pub fn new(topic: String) -> Self {
        Self {
            topic,
            options: None,
        }
    }
}

/// File metadata representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub mime_type: String,
    pub encoding: Option<String>,
    pub hash: Option<String>,
    pub uploaded_at: DateTime<Utc>,
    pub last_modified: DateTime<Utc>,
    pub tags: Option<Vec<String>>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

impl FileMetadata {
    pub fn new(name: String, path: String, size: u64, mime_type: String) -> Self {
        let now = Utc::now();
        Self {
            name,
            path,
            size,
            mime_type,
            encoding: None,
            hash: None,
            uploaded_at: now,
            last_modified: now,
            tags: None,
            metadata: None,
        }
    }
}

/// Upload options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadOptions {
    pub content_type: Option<String>,
    pub acl: Option<String>,
    pub tags: Option<HashMap<String, String>>,
    pub metadata: Option<HashMap<String, String>>,
    pub expires: Option<DateTime<Utc>>,
}

impl UploadOptions {
    pub fn new() -> Self {
        Self {
            content_type: None,
            acl: None,
            tags: None,
            metadata: None,
            expires: None,
        }
    }
}

/// Service trait
pub trait Service<TConfig = serde_json::Value> {
    fn get_name(&self) -> &str;
    fn get_version(&self) -> &str;
    fn get_status(&self) -> ServiceStatus;
    fn get_health(&self) -> Result<ServiceHealth, Box<dyn std::error::Error>>;
    fn configure(&mut self, config: TConfig) -> Result<(), Box<dyn std::error::Error>>;
    fn start(&mut self) -> Result<(), Box<dyn std::error::Error>>;
    fn stop(&mut self) -> Result<(), Box<dyn std::error::Error>>;
    fn restart(&mut self) -> Result<(), Box<dyn std::error::Error>>;
}

/// API client trait
pub trait APIClient {
    fn request<T>(&self, request: APIRequest) -> Result<APIResponse<T>, Box<dyn std::error::Error>>;
    fn get<T>(&self, path: &str, params: Option<HashMap<String, String>>) -> Result<APIResponse<T>, Box<dyn std::error::Error>>;
    fn post<T>(&self, path: &str, body: Option<serde_json::Value>) -> Result<APIResponse<T>, Box<dyn std::error::Error>>;
    fn put<T>(&self, path: &str, body: Option<serde_json::Value>) -> Result<APIResponse<T>, Box<dyn std::error::Error>>;
    fn delete<T>(&self, path: &str) -> Result<APIResponse<T>, Box<dyn std::error::Error>>;
}

/// Cache trait
pub trait Cache<T = serde_json::Value> {
    fn get<K: AsRef<str>>(&self, key: K) -> Result<Option<T>, Box<dyn std::error::Error>>;
    fn set<K: AsRef<str>>(&self, key: K, value: T, ttl: Option<u64>) -> Result<(), Box<dyn std::error::Error>>;
    fn delete<K: AsRef<str>>(&self, key: K) -> Result<bool, Box<dyn std::error::Error>>;
    fn clear(&self) -> Result<(), Box<dyn std::error::Error>>;
    fn has<K: AsRef<str>>(&self, key: K) -> Result<bool, Box<dyn std::error::Error>>;
    fn size(&self) -> Result<usize, Box<dyn std::error::Error>>;
}

/// Queue trait
pub trait Queue<T = serde_json::Value> {
    fn enqueue(&self, message: QueueMessage<T>) -> Result<(), Box<dyn std::error::Error>>;
    fn dequeue(&self) -> Result<Option<QueueMessage<T>>, Box<dyn std::error::Error>>;
    fn peek(&self) -> Result<Option<QueueMessage<T>>, Box<dyn std::error::Error>>;
    fn size(&self) -> Result<usize, Box<dyn std::error::Error>>;
    fn clear(&self) -> Result<(), Box<dyn std::error::Error>>;
}

/// Database client trait
pub trait DatabaseClient {
    fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>>;
    fn disconnect(&mut self) -> Result<(), Box<dyn std::error::Error>>;
    fn query<T>(&self, query: DatabaseQuery) -> Result<DatabaseResult<T>, Box<dyn std::error::Error>>;
    fn transaction<T, F>(&self, callback: F) -> Result<T, Box<dyn std::error::Error>>
    where
        F: FnOnce(&dyn DatabaseClient) -> Result<T, Box<dyn std::error::Error>>;
    fn is_connected(&self) -> bool;
}

/// Message queue trait
pub trait MessageQueue<T = serde_json::Value> {
    fn publish(&self, message: Message<T>) -> Result<(), Box<dyn std::error::Error>>;
    fn subscribe<F>(&self, handler: F) -> Result<(), Box<dyn std::error::Error>>
    where
        F: Fn(Message<T>) -> Result<(), Box<dyn std::error::Error>> + Send + Sync + 'static;
    fn unsubscribe(&self, topic: &str) -> Result<(), Box<dyn std::error::Error>>;
    fn create_topic(&self, topic: &str, partitions: Option<u32>) -> Result<(), Box<dyn std::error::Error>>;
    fn delete_topic(&self, topic: &str) -> Result<(), Box<dyn std::error::Error>>;
}

/// File storage trait
pub trait FileStorage {
    fn upload(&self, file: &[u8], filename: &str, options: Option<UploadOptions>) -> Result<FileMetadata, Box<dyn std::error::Error>>;
    fn download(&self, path: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>>;
    fn delete(&self, path: &str) -> Result<(), Box<dyn std::error::Error>>;
    fn list(&self, prefix: Option<&str>) -> Result<Vec<FileMetadata>, Box<dyn std::error::Error>>;
    fn exists(&self, path: &str) -> Result<bool, Box<dyn std::error::Error>>;
    fn get_metadata(&self, path: &str) -> Result<FileMetadata, Box<dyn std::error::Error>>;
}

/// Load balancing strategy enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LoadBalancingStrategy {
    RoundRobin,
    LeastConnections,
    Weighted,
}

impl std::fmt::Display for LoadBalancingStrategy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LoadBalancingStrategy::RoundRobin => write!(f, "round-robin"),
            LoadBalancingStrategy::LeastConnections => write!(f, "least-connections"),
            LoadBalancingStrategy::Weighted => write!(f, "weighted"),
        }
    }
}

/// Service registry configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl ServiceRegistryConfig {
    pub fn new() -> Self {
        Self {
            discovery: DiscoveryConfig {
                enabled: true,
                interval: 30,
                timeout: 10,
            },
            health_check: HealthCheckConfig {
                enabled: true,
                interval: 60,
                timeout: 5,
            },
            load_balancing: LoadBalancingConfig {
                strategy: LoadBalancingStrategy::RoundRobin,
                enabled: true,
            },
        }
    }
}