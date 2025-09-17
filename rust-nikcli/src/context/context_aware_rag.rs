use crate::context::types::*;
use crate::error::NikCliResult;
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Context-aware RAG system for intelligent workspace understanding
pub struct ContextAwareRAGSystem {
    memory: Arc<RwLock<WorkspaceMemory>>,
    memory_path: PathBuf,
    working_dir: PathBuf,
    config: RagConfig,
}

impl ContextAwareRAGSystem {
    /// Create a new context-aware RAG system
    pub fn new(working_directory: &str) -> NikCliResult<Self> {
        let working_dir = PathBuf::from(working_directory).canonicalize()
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        let memory_path = working_dir.join(".nikcli");
        
        // Ensure memory directory exists
        std::fs::create_dir_all(&memory_path)
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        let config = RagConfig {
            enabled: true,
            max_embeddings: 10000,
            similarity_threshold: 0.7,
            chunk_size: 1000,
            chunk_overlap: 200,
            embedding_model: "text-embedding-ada-002".to_string(),
            vector_dimension: 1536,
            index_type: IndexType::File,
            storage_path: memory_path.join("embeddings").to_string_lossy().to_string(),
        };
        
        let mut system = Self {
            memory: Arc::new(RwLock::new(WorkspaceMemory {
                files: HashMap::new(),
                interactions: Vec::new(),
                context: Self::create_initial_context(&working_dir),
                embeddings: Vec::new(),
                last_updated: chrono::Utc::now(),
            })),
            memory_path,
            working_dir,
            config,
        };
        
        system.load_memory().await?;
        Ok(system)
    }
    
    /// Load memory from disk
    async fn load_memory(&mut self) -> NikCliResult<()> {
        let memory_file = self.memory_path.join("workspace-memory.json");
        
        if memory_file.exists() {
            match tokio::fs::read_to_string(&memory_file).await {
                Ok(content) => {
                    match serde_json::from_str::<WorkspaceMemory>(&content) {
                        Ok(memory) => {
                            let mut current_memory = self.memory.write().await;
                            *current_memory = memory;
                            info!("Loaded workspace memory from disk");
                        }
                        Err(e) => {
                            warn!("Could not parse memory file: {}, creating new", e);
                        }
                    }
                }
                Err(e) => {
                    warn!("Could not read memory file: {}, creating new", e);
                }
            }
        }
        
        Ok(())
    }
    
    /// Save memory to disk
    async fn save_memory(&self) -> NikCliResult<()> {
        let memory_file = self.memory_path.join("workspace-memory.json");
        let memory = self.memory.read().await;
        
        let content = serde_json::to_string_pretty(&*memory)
            .map_err(|e| crate::error::NikCliError::Serialization(e.to_string()))?;
        
        tokio::fs::write(&memory_file, content).await
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        debug!("Saved workspace memory to disk");
        Ok(())
    }
    
    /// Create initial workspace context
    fn create_initial_context(working_dir: &Path) -> WorkspaceContext {
        WorkspaceContext {
            root_path: working_dir.to_string_lossy().to_string(),
            project_name: working_dir.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            framework: "unknown".to_string(),
            languages: Vec::new(),
            dependencies: HashMap::new(),
            structure: serde_json::Value::Object(serde_json::Map::new()),
            current_goals: Vec::new(),
            recent_changes: Vec::new(),
            problems_identified: Vec::new(),
            solutions_applied: Vec::new(),
        }
    }
    
    /// Analyze and index a file
    pub async fn analyze_file(&self, file_path: &str) -> NikCliResult<FileMemory> {
        let path = PathBuf::from(file_path);
        
        if !path.exists() {
            return Err(crate::error::NikCliError::NotFound(format!("File not found: {}", file_path)));
        }
        
        let content = tokio::fs::read_to_string(&path).await
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        let hash = self.calculate_file_hash(&content);
        let language = self.detect_language(&path);
        let summary = self.generate_file_summary(&content, &language).await?;
        
        let (imports, exports, functions, classes) = self.extract_code_elements(&content, &language);
        let importance = self.calculate_file_importance(&path, &content, &language);
        
        let file_memory = FileMemory {
            path: file_path.to_string(),
            hash,
            content,
            summary,
            language,
            imports,
            exports,
            functions,
            classes,
            last_analyzed: chrono::Utc::now(),
            importance,
        };
        
        // Store in memory
        {
            let mut memory = self.memory.write().await;
            memory.files.insert(file_path.to_string(), file_memory.clone());
            memory.last_updated = chrono::Utc::now();
        }
        
        // Generate embedding
        if self.config.enabled {
            self.generate_file_embedding(&file_memory).await?;
        }
        
        info!("Analyzed file: {} (importance: {:.2})", file_path, file_memory.importance);
        Ok(file_memory)
    }
    
    /// Calculate file hash
    fn calculate_file_hash(&self, content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Detect programming language from file extension
    fn detect_language(&self, path: &Path) -> String {
        match path.extension().and_then(|ext| ext.to_str()) {
            Some("rs") => "rust".to_string(),
            Some("ts") | Some("tsx") => "typescript".to_string(),
            Some("js") | Some("jsx") => "javascript".to_string(),
            Some("py") => "python".to_string(),
            Some("java") => "java".to_string(),
            Some("go") => "go".to_string(),
            Some("cpp") | Some("cc") | Some("cxx") => "cpp".to_string(),
            Some("c") => "c".to_string(),
            Some("cs") => "csharp".to_string(),
            Some("php") => "php".to_string(),
            Some("rb") => "ruby".to_string(),
            Some("swift") => "swift".to_string(),
            Some("kt") => "kotlin".to_string(),
            Some("scala") => "scala".to_string(),
            Some("html") => "html".to_string(),
            Some("css") => "css".to_string(),
            Some("json") => "json".to_string(),
            Some("yaml") | Some("yml") => "yaml".to_string(),
            Some("toml") => "toml".to_string(),
            Some("md") => "markdown".to_string(),
            Some("txt") => "text".to_string(),
            _ => "unknown".to_string(),
        }
    }
    
    /// Generate file summary
    async fn generate_file_summary(&self, content: &str, language: &str) -> NikCliResult<String> {
        // Simple summary generation based on content analysis
        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();
        
        if total_lines == 0 {
            return Ok("Empty file".to_string());
        }
        
        // Count different types of lines
        let code_lines = lines.iter().filter(|line| !line.trim().is_empty() && !line.trim().starts_with("//")).count();
        let comment_lines = lines.iter().filter(|line| line.trim().starts_with("//") || line.trim().starts_with("#")).count();
        
        // Extract key information based on language
        let summary = match language {
            "rust" => {
                let functions = lines.iter().filter(|line| line.contains("fn ")).count();
                let structs = lines.iter().filter(|line| line.contains("struct ")).count();
                let impls = lines.iter().filter(|line| line.contains("impl ")).count();
                format!("Rust file with {} functions, {} structs, {} implementations ({} lines)", 
                        functions, structs, impls, total_lines)
            }
            "typescript" | "javascript" => {
                let functions = lines.iter().filter(|line| line.contains("function ") || line.contains("=>")).count();
                let classes = lines.iter().filter(|line| line.contains("class ")).count();
                let imports = lines.iter().filter(|line| line.contains("import ")).count();
                format!("{} file with {} functions, {} classes, {} imports ({} lines)", 
                        language, functions, classes, imports, total_lines)
            }
            "python" => {
                let functions = lines.iter().filter(|line| line.contains("def ")).count();
                let classes = lines.iter().filter(|line| line.contains("class ")).count();
                let imports = lines.iter().filter(|line| line.contains("import ")).count();
                format!("Python file with {} functions, {} classes, {} imports ({} lines)", 
                        functions, classes, imports, total_lines)
            }
            _ => {
                format!("{} file with {} lines ({} code, {} comments)", 
                        language, total_lines, code_lines, comment_lines)
            }
        };
        
        Ok(summary)
    }
    
    /// Extract code elements from content
    fn extract_code_elements(&self, content: &str, language: &str) -> (Vec<String>, Vec<String>, Vec<String>, Vec<String>) {
        let mut imports = Vec::new();
        let mut exports = Vec::new();
        let mut functions = Vec::new();
        let mut classes = Vec::new();
        
        for line in content.lines() {
            let line = line.trim();
            
            match language {
                "rust" => {
                    if line.starts_with("use ") {
                        imports.push(line.to_string());
                    } else if line.starts_with("pub ") {
                        exports.push(line.to_string());
                    } else if line.contains("fn ") {
                        functions.push(line.to_string());
                    } else if line.contains("struct ") || line.contains("enum ") {
                        classes.push(line.to_string());
                    }
                }
                "typescript" | "javascript" => {
                    if line.starts_with("import ") {
                        imports.push(line.to_string());
                    } else if line.starts_with("export ") {
                        exports.push(line.to_string());
                    } else if line.contains("function ") || line.contains("=>") {
                        functions.push(line.to_string());
                    } else if line.contains("class ") {
                        classes.push(line.to_string());
                    }
                }
                "python" => {
                    if line.starts_with("import ") || line.starts_with("from ") {
                        imports.push(line.to_string());
                    } else if line.starts_with("def ") {
                        functions.push(line.to_string());
                    } else if line.starts_with("class ") {
                        classes.push(line.to_string());
                    }
                }
                _ => {
                    // Generic extraction for other languages
                    if line.contains("import") || line.contains("include") {
                        imports.push(line.to_string());
                    }
                }
            }
        }
        
        (imports, exports, functions, classes)
    }
    
    /// Calculate file importance score
    fn calculate_file_importance(&self, path: &Path, content: &str, language: &str) -> f32 {
        let mut importance = 0.0;
        
        // Base importance by file type
        match language {
            "rust" => importance += 0.8,
            "typescript" | "javascript" => importance += 0.7,
            "python" => importance += 0.6,
            "json" | "yaml" | "toml" => importance += 0.5, // Config files
            "md" => importance += 0.3, // Documentation
            _ => importance += 0.4,
        }
        
        // Importance by file name patterns
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
        if file_name.contains("main") || file_name.contains("index") || file_name.contains("app") {
            importance += 0.3;
        }
        if file_name.contains("test") || file_name.contains("spec") {
            importance += 0.2;
        }
        if file_name.contains("config") || file_name.contains("settings") {
            importance += 0.2;
        }
        
        // Importance by content size
        let content_size = content.len();
        if content_size > 10000 {
            importance += 0.2;
        } else if content_size > 1000 {
            importance += 0.1;
        }
        
        // Importance by number of functions/classes
        let function_count = content.matches("fn ").count() + content.matches("function ").count() + content.matches("def ").count();
        let class_count = content.matches("struct ").count() + content.matches("class ").count();
        
        if function_count > 10 {
            importance += 0.2;
        } else if function_count > 5 {
            importance += 0.1;
        }
        
        if class_count > 5 {
            importance += 0.2;
        } else if class_count > 2 {
            importance += 0.1;
        }
        
        importance.min(1.0)
    }
    
    /// Generate embedding for file
    async fn generate_file_embedding(&self, file_memory: &FileMemory) -> NikCliResult<()> {
        // Simple embedding generation (in real implementation, this would use an AI model)
        let content = format!("{}: {}", file_memory.language, file_memory.summary);
        let embedding = self.generate_simple_embedding(&content);
        
        let embedding_vector = EmbeddingVector {
            id: uuid::Uuid::new_v4().to_string(),
            content: content.clone(),
            vector: embedding,
            metadata: {
                let mut metadata = HashMap::new();
                metadata.insert("file_path".to_string(), serde_json::Value::String(file_memory.path.clone()));
                metadata.insert("language".to_string(), serde_json::Value::String(file_memory.language.clone()));
                metadata.insert("importance".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(file_memory.importance as f64).unwrap()));
                metadata
            },
            timestamp: chrono::Utc::now(),
        };
        
        // Store embedding
        {
            let mut memory = self.memory.write().await;
            memory.embeddings.push(embedding_vector);
            
            // Limit embeddings count
            if memory.embeddings.len() > self.config.max_embeddings {
                memory.embeddings.remove(0);
            }
        }
        
        debug!("Generated embedding for file: {}", file_memory.path);
        Ok(())
    }
    
    /// Generate simple embedding (placeholder implementation)
    fn generate_simple_embedding(&self, text: &str) -> Vec<f32> {
        // This is a simplified embedding generation
        // In a real implementation, this would use an AI embedding model
        let mut embedding = vec![0.0; self.config.vector_dimension];
        
        // Simple hash-based embedding
        let hash = self.calculate_file_hash(text);
        let hash_bytes = hash.as_bytes();
        
        for (i, &byte) in hash_bytes.iter().enumerate() {
            if i < self.config.vector_dimension {
                embedding[i] = (byte as f32) / 255.0;
            }
        }
        
        // Normalize the vector
        let magnitude: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if magnitude > 0.0 {
            for val in &mut embedding {
                *val /= magnitude;
            }
        }
        
        embedding
    }
    
    /// Search for relevant content
    pub async fn search(&self, query: &str, limit: Option<usize>) -> NikCliResult<Vec<RagResult>> {
        let limit = limit.unwrap_or(10);
        let query_embedding = self.generate_simple_embedding(query);
        
        let memory = self.memory.read().await;
        let mut results = Vec::new();
        
        // Calculate similarities
        for embedding in &memory.embeddings {
            let similarity = self.calculate_cosine_similarity(&query_embedding, &embedding.vector);
            
            if similarity >= self.config.similarity_threshold {
                results.push(RagResult {
                    content: embedding.content.clone(),
                    score: similarity,
                    source: embedding.metadata.get("file_path")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    metadata: embedding.metadata.clone(),
                    embedding: Some(embedding.vector.clone()),
                });
            }
        }
        
        // Sort by similarity score
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        
        // Limit results
        results.truncate(limit);
        
        info!("Found {} relevant results for query: {}", results.len(), query);
        Ok(results)
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
    
    /// Record interaction
    pub async fn record_interaction(&self, user_input: String, ai_response: String, actions: Vec<ActionMemory>, successful: bool) -> NikCliResult<String> {
        let interaction_id = uuid::Uuid::new_v4().to_string();
        
        let interaction = InteractionMemory {
            id: interaction_id.clone(),
            timestamp: chrono::Utc::now(),
            user_input,
            ai_response,
            actions,
            context: "workspace".to_string(),
            successful,
        };
        
        {
            let mut memory = self.memory.write().await;
            memory.interactions.push(interaction);
            memory.last_updated = chrono::Utc::now();
        }
        
        info!("Recorded interaction: {}", interaction_id);
        Ok(interaction_id)
    }
    
    /// Get workspace context
    pub async fn get_workspace_context(&self) -> WorkspaceContext {
        let memory = self.memory.read().await;
        memory.context.clone()
    }
    
    /// Update workspace context
    pub async fn update_workspace_context(&self, context: WorkspaceContext) -> NikCliResult<()> {
        {
            let mut memory = self.memory.write().await;
            memory.context = context;
            memory.last_updated = chrono::Utc::now();
        }
        
        self.save_memory().await?;
        info!("Updated workspace context");
        Ok(())
    }
    
    /// Get file memory
    pub async fn get_file_memory(&self, file_path: &str) -> Option<FileMemory> {
        let memory = self.memory.read().await;
        memory.files.get(file_path).cloned()
    }
    
    /// Get all file memories
    pub async fn get_all_file_memories(&self) -> HashMap<String, FileMemory> {
        let memory = self.memory.read().await;
        memory.files.clone()
    }
    
    /// Get interaction history
    pub async fn get_interaction_history(&self, limit: Option<usize>) -> Vec<InteractionMemory> {
        let memory = self.memory.read().await;
        let limit = limit.unwrap_or(100);
        
        if memory.interactions.len() <= limit {
            memory.interactions.clone()
        } else {
            memory.interactions[memory.interactions.len() - limit..].to_vec()
        }
    }
    
    /// Get embeddings count
    pub async fn get_embeddings_count(&self) -> usize {
        let memory = self.memory.read().await;
        memory.embeddings.len()
    }
    
    /// Clear all memory
    pub async fn clear_memory(&self) -> NikCliResult<()> {
        {
            let mut memory = self.memory.write().await;
            memory.files.clear();
            memory.interactions.clear();
            memory.embeddings.clear();
            memory.last_updated = chrono::Utc::now();
        }
        
        self.save_memory().await?;
        info!("Cleared all workspace memory");
        Ok(())
    }
    
    /// Get memory statistics
    pub async fn get_memory_stats(&self) -> MemoryStats {
        let memory = self.memory.read().await;
        
        let total_files = memory.files.len();
        let total_interactions = memory.interactions.len();
        let total_embeddings = memory.embeddings.len();
        
        let languages: std::collections::HashMap<String, u32> = memory.files.values()
            .map(|f| f.language.clone())
            .fold(std::collections::HashMap::new(), |mut acc, lang| {
                *acc.entry(lang).or_insert(0) += 1;
                acc
            });
        
        let successful_interactions = memory.interactions.iter()
            .filter(|i| i.successful)
            .count();
        
        let success_rate = if total_interactions > 0 {
            successful_interactions as f64 / total_interactions as f64
        } else {
            0.0
        };
        
        MemoryStats {
            total_files,
            total_interactions,
            total_embeddings,
            languages,
            success_rate,
            last_updated: memory.last_updated,
            memory_size_bytes: 0, // Would be calculated in real implementation
        }
    }
}

/// Memory statistics
#[derive(Debug, Clone)]
pub struct MemoryStats {
    pub total_files: usize,
    pub total_interactions: usize,
    pub total_embeddings: usize,
    pub languages: std::collections::HashMap<String, u32>,
    pub success_rate: f64,
    pub last_updated: chrono::Utc,
    pub memory_size_bytes: u64,
}