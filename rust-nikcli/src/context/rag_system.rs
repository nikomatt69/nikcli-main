use crate::context::types::*;
use crate::error::NikCliResult;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Unified RAG system for intelligent information retrieval
pub struct UnifiedRAGSystem {
    config: RagConfig,
    embeddings: Arc<RwLock<HashMap<String, EmbeddingVector>>>,
    index: Arc<RwLock<RagIndex>>,
    storage_path: PathBuf,
}

/// RAG index for efficient vector search
#[derive(Debug, Clone)]
pub struct RagIndex {
    pub vectors: Vec<EmbeddingVector>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub last_updated: chrono::DateTime<chrono::Utc>,
    pub total_documents: usize,
    pub average_vector_length: f32,
}

impl UnifiedRAGSystem {
    /// Create a new unified RAG system
    pub fn new(config: RagConfig) -> NikCliResult<Self> {
        let storage_path = PathBuf::from(&config.storage_path);
        
        // Ensure storage directory exists
        std::fs::create_dir_all(&storage_path)
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        let system = Self {
            config,
            embeddings: Arc::new(RwLock::new(HashMap::new())),
            index: Arc::new(RwLock::new(RagIndex {
                vectors: Vec::new(),
                metadata: HashMap::new(),
                last_updated: chrono::Utc::now(),
                total_documents: 0,
                average_vector_length: 0.0,
            })),
            storage_path,
        };
        
        // Load existing index if available
        system.load_index().await?;
        
        Ok(system)
    }
    
    /// Load index from storage
    async fn load_index(&self) -> NikCliResult<()> {
        let index_file = self.storage_path.join("rag_index.json");
        
        if index_file.exists() {
            match tokio::fs::read_to_string(&index_file).await {
                Ok(content) => {
                    match serde_json::from_str::<RagIndex>(&content) {
                        Ok(index) => {
                            let mut current_index = self.index.write().await;
                            *current_index = index;
                            info!("Loaded RAG index with {} documents", current_index.total_documents);
                        }
                        Err(e) => {
                            warn!("Could not parse RAG index: {}, creating new", e);
                        }
                    }
                }
                Err(e) => {
                    warn!("Could not read RAG index: {}, creating new", e);
                }
            }
        }
        
        Ok(())
    }
    
    /// Save index to storage
    async fn save_index(&self) -> NikCliResult<()> {
        let index_file = self.storage_path.join("rag_index.json");
        let index = self.index.read().await;
        
        let content = serde_json::to_string_pretty(&*index)
            .map_err(|e| crate::error::NikCliError::Serialization(e.to_string()))?;
        
        tokio::fs::write(&index_file, content).await
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        debug!("Saved RAG index to storage");
        Ok(())
    }
    
    /// Add document to RAG system
    pub async fn add_document(&self, content: String, metadata: HashMap<String, serde_json::Value>) -> NikCliResult<String> {
        let document_id = uuid::Uuid::new_v4().to_string();
        
        // Generate embedding
        let embedding = self.generate_embedding(&content).await?;
        
        let embedding_vector = EmbeddingVector {
            id: document_id.clone(),
            content: content.clone(),
            vector: embedding,
            metadata,
            timestamp: chrono::Utc::now(),
        };
        
        // Store embedding
        {
            let mut embeddings = self.embeddings.write().await;
            embeddings.insert(document_id.clone(), embedding_vector.clone());
        }
        
        // Update index
        {
            let mut index = self.index.write().await;
            index.vectors.push(embedding_vector);
            index.total_documents += 1;
            index.last_updated = chrono::Utc::now();
            
            // Calculate average vector length
            let total_length: f32 = index.vectors.iter().map(|v| v.vector.len() as f32).sum();
            index.average_vector_length = total_length / index.vectors.len() as f32;
        }
        
        // Save index
        self.save_index().await?;
        
        info!("Added document to RAG system: {}", document_id);
        Ok(document_id)
    }
    
    /// Remove document from RAG system
    pub async fn remove_document(&self, document_id: &str) -> NikCliResult<bool> {
        let mut removed = false;
        
        // Remove from embeddings
        {
            let mut embeddings = self.embeddings.write().await;
            removed = embeddings.remove(document_id).is_some();
        }
        
        // Remove from index
        if removed {
            let mut index = self.index.write().await;
            index.vectors.retain(|v| v.id != document_id);
            index.total_documents = index.vectors.len();
            index.last_updated = chrono::Utc::now();
            
            // Recalculate average vector length
            if !index.vectors.is_empty() {
                let total_length: f32 = index.vectors.iter().map(|v| v.vector.len() as f32).sum();
                index.average_vector_length = total_length / index.vectors.len() as f32;
            } else {
                index.average_vector_length = 0.0;
            }
        }
        
        if removed {
            self.save_index().await?;
            info!("Removed document from RAG system: {}", document_id);
        }
        
        Ok(removed)
    }
    
    /// Query RAG system
    pub async fn query(&self, query: RagQuery) -> NikCliResult<Vec<RagResult>> {
        let start_time = std::time::Instant::now();
        
        // Generate query embedding
        let query_embedding = self.generate_embedding(&query.query).await?;
        
        let index = self.index.read().await;
        let mut results = Vec::new();
        
        // Calculate similarities
        for vector in &index.vectors {
            let similarity = self.calculate_cosine_similarity(&query_embedding, &vector.vector);
            let threshold = query.similarity_threshold.unwrap_or(self.config.similarity_threshold);
            
            if similarity >= threshold {
                results.push(RagResult {
                    content: vector.content.clone(),
                    score: similarity,
                    source: vector.metadata.get("source")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    metadata: vector.metadata.clone(),
                    embedding: if query.include_metadata.unwrap_or(false) {
                        Some(vector.vector.clone())
                    } else {
                        None
                    },
                });
            }
        }
        
        // Sort by similarity score
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        
        // Apply limit
        let max_results = query.max_results.unwrap_or(10);
        results.truncate(max_results);
        
        let query_time = start_time.elapsed().as_millis() as u64;
        info!("RAG query completed in {}ms, found {} results", query_time, results.len());
        
        Ok(results)
    }
    
    /// Generate embedding for text
    async fn generate_embedding(&self, text: &str) -> NikCliResult<Vec<f32>> {
        // This is a simplified embedding generation
        // In a real implementation, this would use an AI embedding model
        let mut embedding = vec![0.0; self.config.vector_dimension];
        
        // Simple hash-based embedding
        let hash = self.calculate_text_hash(text);
        let hash_bytes = hash.as_bytes();
        
        for (i, &byte) in hash_bytes.iter().enumerate() {
            if i < self.config.vector_dimension {
                embedding[i] = (byte as f32) / 255.0;
            }
        }
        
        // Add some text-based features
        let words: Vec<&str> = text.split_whitespace().collect();
        for (i, word) in words.iter().enumerate() {
            if i < self.config.vector_dimension {
                let word_hash = self.calculate_text_hash(word);
                let word_bytes = word_hash.as_bytes();
                if let Some(&byte) = word_bytes.first() {
                    embedding[i] += (byte as f32) / 255.0 * 0.1;
                }
            }
        }
        
        // Normalize the vector
        let magnitude: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if magnitude > 0.0 {
            for val in &mut embedding {
                *val /= magnitude;
            }
        }
        
        Ok(embedding)
    }
    
    /// Calculate text hash
    fn calculate_text_hash(&self, text: &str) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Calculate cosine similarity between two vectors
    fn calculate_cosine_similarity(&self, a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() {
            return 0.0;
        }
        
        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let magnitude_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let magnitude_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if magnitude_a == 0.0 || magnitude_b == 0.0 {
            0.0
        } else {
            dot_product / (magnitude_a * magnitude_b)
        }
    }
    
    /// Get RAG statistics
    pub async fn get_statistics(&self) -> RagStatistics {
        let index = self.index.read().await;
        let embeddings = self.embeddings.read().await;
        
        let total_documents = index.total_documents;
        let total_embeddings = embeddings.len();
        let average_vector_length = index.average_vector_length;
        let last_updated = index.last_updated;
        
        // Calculate storage size (simplified)
        let storage_size_bytes = total_documents * self.config.vector_dimension * 4; // 4 bytes per f32
        
        RagStatistics {
            total_documents,
            total_embeddings,
            average_vector_length,
            storage_size_bytes,
            last_updated,
            config: self.config.clone(),
        }
    }
    
    /// Clear all documents
    pub async fn clear_all(&self) -> NikCliResult<()> {
        {
            let mut embeddings = self.embeddings.write().await;
            embeddings.clear();
        }
        
        {
            let mut index = self.index.write().await;
            index.vectors.clear();
            index.metadata.clear();
            index.total_documents = 0;
            index.average_vector_length = 0.0;
            index.last_updated = chrono::Utc::now();
        }
        
        self.save_index().await?;
        info!("Cleared all documents from RAG system");
        Ok(())
    }
    
    /// Update document
    pub async fn update_document(&self, document_id: &str, content: String, metadata: HashMap<String, serde_json::Value>) -> NikCliResult<bool> {
        // Remove existing document
        let existed = self.remove_document(document_id).await?;
        
        if existed {
            // Add updated document
            self.add_document(content, metadata).await?;
            info!("Updated document in RAG system: {}", document_id);
        }
        
        Ok(existed)
    }
    
    /// Search by metadata
    pub async fn search_by_metadata(&self, metadata_query: HashMap<String, serde_json::Value>) -> NikCliResult<Vec<RagResult>> {
        let index = self.index.read().await;
        let mut results = Vec::new();
        
        for vector in &index.vectors {
            let mut matches = true;
            
            for (key, value) in &metadata_query {
                if let Some(vector_value) = vector.metadata.get(key) {
                    if vector_value != value {
                        matches = false;
                        break;
                    }
                } else {
                    matches = false;
                    break;
                }
            }
            
            if matches {
                results.push(RagResult {
                    content: vector.content.clone(),
                    score: 1.0, // Perfect match for metadata
                    source: vector.metadata.get("source")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    metadata: vector.metadata.clone(),
                    embedding: None,
                });
            }
        }
        
        info!("Found {} documents matching metadata query", results.len());
        Ok(results)
    }
    
    /// Get document by ID
    pub async fn get_document(&self, document_id: &str) -> Option<EmbeddingVector> {
        let embeddings = self.embeddings.read().await;
        embeddings.get(document_id).cloned()
    }
    
    /// List all documents
    pub async fn list_documents(&self, limit: Option<usize>) -> Vec<EmbeddingVector> {
        let index = self.index.read().await;
        let limit = limit.unwrap_or(100);
        
        if index.vectors.len() <= limit {
            index.vectors.clone()
        } else {
            index.vectors[0..limit].to_vec()
        }
    }
    
    /// Optimize index
    pub async fn optimize_index(&self) -> NikCliResult<()> {
        let start_time = std::time::Instant::now();
        
        {
            let mut index = self.index.write().await;
            
            // Remove duplicate vectors
            let mut seen_hashes = std::collections::HashSet::new();
            index.vectors.retain(|vector| {
                let content_hash = self.calculate_text_hash(&vector.content);
                seen_hashes.insert(content_hash)
            });
            
            // Update statistics
            index.total_documents = index.vectors.len();
            index.last_updated = chrono::Utc::now();
            
            // Recalculate average vector length
            if !index.vectors.is_empty() {
                let total_length: f32 = index.vectors.iter().map(|v| v.vector.len() as f32).sum();
                index.average_vector_length = total_length / index.vectors.len() as f32;
            } else {
                index.average_vector_length = 0.0;
            }
        }
        
        // Save optimized index
        self.save_index().await?;
        
        let optimization_time = start_time.elapsed().as_millis() as u64;
        info!("Optimized RAG index in {}ms", optimization_time);
        
        Ok(())
    }
    
    /// Get configuration
    pub fn get_config(&self) -> &RagConfig {
        &self.config
    }
    
    /// Update configuration
    pub fn update_config(&mut self, config: RagConfig) {
        self.config = config;
        info!("Updated RAG configuration");
    }
}

/// RAG statistics
#[derive(Debug, Clone)]
pub struct RagStatistics {
    pub total_documents: usize,
    pub total_embeddings: usize,
    pub average_vector_length: f32,
    pub storage_size_bytes: usize,
    pub last_updated: chrono::Utc,
    pub config: RagConfig,
}

/// Global RAG system instance
lazy_static::lazy_static! {
    pub static ref UNIFIED_RAG_SYSTEM: Arc<RwLock<Option<UnifiedRAGSystem>>> = Arc::new(RwLock::new(None));
}

/// Initialize global RAG system
pub async fn initialize_rag_system(config: RagConfig) -> NikCliResult<()> {
    let system = UnifiedRAGSystem::new(config)?;
    let mut global_system = UNIFIED_RAG_SYSTEM.write().await;
    *global_system = Some(system);
    info!("Initialized global RAG system");
    Ok(())
}

/// Get global RAG system
pub async fn get_rag_system() -> Option<Arc<UnifiedRAGSystem>> {
    let global_system = UNIFIED_RAG_SYSTEM.read().await;
    global_system.as_ref().map(|system| Arc::new(system.clone()))
}

/// Query global RAG system
pub async fn query_rag_system(query: RagQuery) -> NikCliResult<Vec<RagResult>> {
    let global_system = UNIFIED_RAG_SYSTEM.read().await;
    if let Some(system) = global_system.as_ref() {
        system.query(query).await
    } else {
        Err(crate::error::NikCliError::NotInitialized("RAG system not initialized".to_string()))
    }
}

/// Add document to global RAG system
pub async fn add_document_to_rag(content: String, metadata: HashMap<String, serde_json::Value>) -> NikCliResult<String> {
    let global_system = UNIFIED_RAG_SYSTEM.read().await;
    if let Some(system) = global_system.as_ref() {
        system.add_document(content, metadata).await
    } else {
        Err(crate::error::NikCliError::NotInitialized("RAG system not initialized".to_string()))
    }
}