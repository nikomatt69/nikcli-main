use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Embedding vector for semantic search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingVector {
    pub id: String,
    pub content: String,
    pub vector: Vec<f32>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

/// File memory for context awareness
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMemory {
    pub path: String,
    pub hash: String,
    pub content: String,
    pub summary: String,
    pub language: String,
    pub imports: Vec<String>,
    pub exports: Vec<String>,
    pub functions: Vec<String>,
    pub classes: Vec<String>,
    pub last_analyzed: DateTime<Utc>,
    pub importance: f32,
}

/// Action memory for tracking operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionMemory {
    pub action_type: ActionType,
    pub target: String,
    pub params: serde_json::Value,
    pub result: serde_json::Value,
    pub duration_ms: u64,
}

/// Action types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ActionType {
    ReadFile,
    WriteFile,
    ExecuteCommand,
    Analyze,
    Generate,
    Search,
    Index,
    Embed,
}

impl std::fmt::Display for ActionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionType::ReadFile => write!(f, "read_file"),
            ActionType::WriteFile => write!(f, "write_file"),
            ActionType::ExecuteCommand => write!(f, "execute_command"),
            ActionType::Analyze => write!(f, "analyze"),
            ActionType::Generate => write!(f, "generate"),
            ActionType::Search => write!(f, "search"),
            ActionType::Index => write!(f, "index"),
            ActionType::Embed => write!(f, "embed"),
        }
    }
}

/// Interaction memory for tracking user interactions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractionMemory {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub user_input: String,
    pub ai_response: String,
    pub actions: Vec<ActionMemory>,
    pub context: String,
    pub successful: bool,
}

/// Workspace context information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceContext {
    pub root_path: String,
    pub project_name: String,
    pub framework: String,
    pub languages: Vec<String>,
    pub dependencies: HashMap<String, String>,
    pub structure: serde_json::Value,
    pub current_goals: Vec<String>,
    pub recent_changes: Vec<String>,
    pub problems_identified: Vec<String>,
    pub solutions_applied: Vec<String>,
}

/// Workspace memory container
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceMemory {
    pub files: HashMap<String, FileMemory>,
    pub interactions: Vec<InteractionMemory>,
    pub context: WorkspaceContext,
    pub embeddings: Vec<EmbeddingVector>,
    pub last_updated: DateTime<Utc>,
}

/// File context for workspace analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContext {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub modified: DateTime<Utc>,
    pub language: String,
    pub importance: f32, // 0-100
    pub summary: Option<String>,
    pub dependencies: Option<Vec<String>>,
    pub exports: Option<Vec<String>>,
    pub hash: Option<String>,
    pub embedding: Option<Vec<f32>>,
    pub semantic_score: Option<f32>,
    pub last_analyzed: Option<DateTime<Utc>>,
    pub cache_version: Option<String>,
    pub functions: Option<Vec<String>>,
    pub classes: Option<Vec<String>>,
    pub types: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
}

/// Directory context for workspace analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryContext {
    pub path: String,
    pub files: Vec<FileContext>,
    pub subdirectories: Vec<DirectoryContext>,
    pub total_files: u32,
    pub total_size: u64,
    pub main_languages: Vec<String>,
    pub framework: Option<String>,
    pub importance: f32,
    pub summary: Option<String>,
}

/// Project metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub name: Option<String>,
    pub framework: Option<String>,
    pub languages: Vec<String>,
    pub dependencies: Vec<String>,
    pub structure: serde_json::Value,
    pub patterns: Option<Vec<String>>,
    pub architecture: Option<String>,
    pub complexity: Option<f32>,
    pub test_coverage: Option<f32>,
}

/// Cache statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub last_cleanup: DateTime<Utc>,
}

/// Enhanced workspace context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedWorkspaceContext {
    pub root_path: String,
    pub selected_paths: Vec<String>,
    pub directories: HashMap<String, DirectoryContext>,
    pub files: HashMap<String, FileContext>,
    pub project_metadata: ProjectMetadata,
    pub last_updated: DateTime<Utc>,
    pub semantic_index: Option<HashMap<String, Vec<f32>>>,
    pub rag_available: Option<bool>,
    pub cache_stats: Option<CacheStats>,
}

/// Semantic search options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchOptions {
    pub query: String,
    pub limit: Option<usize>,
    pub threshold: Option<f32>,
    pub include_content: Option<bool>,
    pub file_types: Option<Vec<String>>,
    pub exclude_paths: Option<Vec<String>>,
    pub use_rag: Option<bool>,
}

/// Context search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSearchResult {
    pub file: FileContext,
    pub score: f32,
    pub match_type: MatchType,
    pub snippet: Option<String>,
    pub highlights: Option<Vec<String>>,
}

/// Match types for search results
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MatchType {
    Exact,
    Semantic,
    Fuzzy,
    Content,
}

impl std::fmt::Display for MatchType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MatchType::Exact => write!(f, "exact"),
            MatchType::Semantic => write!(f, "semantic"),
            MatchType::Fuzzy => write!(f, "fuzzy"),
            MatchType::Content => write!(f, "content"),
        }
    }
}

/// RAG query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagQuery {
    pub query: String,
    pub context: Option<String>,
    pub max_results: Option<usize>,
    pub similarity_threshold: Option<f32>,
    pub include_metadata: Option<bool>,
}

/// RAG result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagResult {
    pub content: String,
    pub score: f32,
    pub source: String,
    pub metadata: HashMap<String, serde_json::Value>,
    pub embedding: Option<Vec<f32>>,
}

/// RAG configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagConfig {
    pub enabled: bool,
    pub max_embeddings: usize,
    pub similarity_threshold: f32,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
    pub embedding_model: String,
    pub vector_dimension: usize,
    pub index_type: IndexType,
    pub storage_path: String,
}

/// Index types for vector storage
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IndexType {
    InMemory,
    File,
    Database,
    VectorDB,
}

impl std::fmt::Display for IndexType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IndexType::InMemory => write!(f, "in_memory"),
            IndexType::File => write!(f, "file"),
            IndexType::Database => write!(f, "database"),
            IndexType::VectorDB => write!(f, "vector_db"),
        }
    }
}

/// Context analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextAnalysisResult {
    pub files_analyzed: u32,
    pub total_size: u64,
    pub languages_found: Vec<String>,
    pub frameworks_detected: Vec<String>,
    pub complexity_score: f32,
    pub architecture_patterns: Vec<String>,
    pub recommendations: Vec<String>,
    pub analysis_duration_ms: u64,
}

/// Context update event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextUpdateEvent {
    pub event_type: ContextUpdateType,
    pub path: String,
    pub timestamp: DateTime<Utc>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Context update types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ContextUpdateType {
    FileAdded,
    FileModified,
    FileDeleted,
    DirectoryAdded,
    DirectoryDeleted,
    ProjectStructureChanged,
    DependenciesUpdated,
    ConfigurationChanged,
}

impl std::fmt::Display for ContextUpdateType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ContextUpdateType::FileAdded => write!(f, "file_added"),
            ContextUpdateType::FileModified => write!(f, "file_modified"),
            ContextUpdateType::FileDeleted => write!(f, "file_deleted"),
            ContextUpdateType::DirectoryAdded => write!(f, "directory_added"),
            ContextUpdateType::DirectoryDeleted => write!(f, "directory_deleted"),
            ContextUpdateType::ProjectStructureChanged => write!(f, "project_structure_changed"),
            ContextUpdateType::DependenciesUpdated => write!(f, "dependencies_updated"),
            ContextUpdateType::ConfigurationChanged => write!(f, "configuration_changed"),
        }
    }
}

/// Context indexing options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextIndexingOptions {
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub max_file_size: Option<u64>,
    pub languages: Option<Vec<String>>,
    pub generate_embeddings: bool,
    pub update_existing: bool,
    pub parallel_processing: bool,
}

/// Context search statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextSearchStats {
    pub total_searches: u64,
    pub successful_searches: u64,
    pub average_response_time_ms: f64,
    pub cache_hit_rate: f64,
    pub most_searched_terms: Vec<String>,
    pub search_types_used: HashMap<MatchType, u64>,
}

/// Context performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPerformanceMetrics {
    pub indexing_time_ms: u64,
    pub search_time_ms: u64,
    pub memory_usage_bytes: u64,
    pub cache_size: usize,
    pub embedding_generation_time_ms: u64,
    pub similarity_computation_time_ms: u64,
}