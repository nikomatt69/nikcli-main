use crate::context::types::*;
use crate::error::NikCliResult;
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, info, warn, error};

/// Workspace context manager for intelligent project analysis
pub struct WorkspaceContextManager {
    context: Arc<RwLock<EnhancedWorkspaceContext>>,
    file_content_cache: Arc<RwLock<HashMap<String, CachedFileContent>>>,
    semantic_search_cache: Arc<RwLock<HashMap<String, Vec<ContextSearchResult>>>>,
    embeddings_cache: Arc<RwLock<HashMap<String, Vec<f32>>>>,
    watchers: Arc<RwLock<HashMap<String, tokio::task::JoinHandle<()>>>>,
    config: WorkspaceContextConfig,
}

/// Cached file content
#[derive(Debug, Clone)]
struct CachedFileContent {
    content: String,
    mtime: u64,
    hash: String,
    cached_at: chrono::DateTime<chrono::Utc>,
}

/// Workspace context configuration
#[derive(Debug, Clone)]
pub struct WorkspaceContextConfig {
    pub cache_ttl_seconds: u64,
    pub max_cache_size: usize,
    pub enable_file_watching: bool,
    pub auto_index_interval_seconds: u64,
    pub max_file_size_bytes: u64,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub enable_semantic_search: bool,
    pub embedding_model: String,
    pub vector_dimension: usize,
}

impl Default for WorkspaceContextConfig {
    fn default() -> Self {
        Self {
            cache_ttl_seconds: 300, // 5 minutes
            max_cache_size: 1000,
            enable_file_watching: true,
            auto_index_interval_seconds: 60, // 1 minute
            max_file_size_bytes: 10 * 1024 * 1024, // 10MB
            include_patterns: vec![
                "*.rs".to_string(),
                "*.ts".to_string(),
                "*.tsx".to_string(),
                "*.js".to_string(),
                "*.jsx".to_string(),
                "*.py".to_string(),
                "*.java".to_string(),
                "*.go".to_string(),
                "*.cpp".to_string(),
                "*.c".to_string(),
                "*.cs".to_string(),
                "*.php".to_string(),
                "*.rb".to_string(),
                "*.swift".to_string(),
                "*.kt".to_string(),
                "*.scala".to_string(),
                "*.html".to_string(),
                "*.css".to_string(),
                "*.json".to_string(),
                "*.yaml".to_string(),
                "*.yml".to_string(),
                "*.toml".to_string(),
                "*.md".to_string(),
                "*.txt".to_string(),
            ],
            exclude_patterns: vec![
                "node_modules".to_string(),
                ".git".to_string(),
                "target".to_string(),
                "build".to_string(),
                "dist".to_string(),
                ".next".to_string(),
                ".nuxt".to_string(),
                "coverage".to_string(),
                ".nyc_output".to_string(),
                "*.log".to_string(),
                "*.tmp".to_string(),
                ".DS_Store".to_string(),
                "Thumbs.db".to_string(),
            ],
            enable_semantic_search: true,
            embedding_model: "text-embedding-ada-002".to_string(),
            vector_dimension: 1536,
        }
    }
}

impl WorkspaceContextManager {
    /// Create a new workspace context manager
    pub fn new(root_path: &str, config: Option<WorkspaceContextConfig>) -> Self {
        let config = config.unwrap_or_default();
        
        let context = Arc::new(RwLock::new(EnhancedWorkspaceContext {
            root_path: root_path.to_string(),
            selected_paths: Vec::new(),
            directories: HashMap::new(),
            files: HashMap::new(),
            project_metadata: ProjectMetadata {
                name: None,
                framework: None,
                languages: Vec::new(),
                dependencies: Vec::new(),
                structure: serde_json::Value::Object(serde_json::Map::new()),
                patterns: None,
                architecture: None,
                complexity: None,
                test_coverage: None,
            },
            last_updated: chrono::Utc::now(),
            semantic_index: None,
            rag_available: Some(false),
            cache_stats: Some(CacheStats {
                hits: 0,
                misses: 0,
                last_cleanup: chrono::Utc::now(),
            }),
        }));
        
        Self {
            context,
            file_content_cache: Arc::new(RwLock::new(HashMap::new())),
            semantic_search_cache: Arc::new(RwLock::new(HashMap::new())),
            embeddings_cache: Arc::new(RwLock::new(HashMap::new())),
            watchers: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }
    
    /// Initialize workspace context
    pub async fn initialize(&self) -> NikCliResult<()> {
        info!("Initializing workspace context for: {}", self.get_root_path().await);
        
        // Analyze project structure
        self.analyze_project_structure().await?;
        
        // Index files
        self.index_workspace().await?;
        
        // Start file watching if enabled
        if self.config.enable_file_watching {
            self.start_file_watching().await?;
        }
        
        // Start auto-indexing
        self.start_auto_indexing().await?;
        
        info!("Workspace context initialized successfully");
        Ok(())
    }
    
    /// Get root path
    pub async fn get_root_path(&self) -> String {
        let context = self.context.read().await;
        context.root_path.clone()
    }
    
    /// Analyze project structure
    async fn analyze_project_structure(&self) -> NikCliResult<()> {
        let root_path = PathBuf::from(self.get_root_path().await);
        
        // Detect project type and framework
        let project_metadata = self.detect_project_metadata(&root_path).await?;
        
        // Update context
        {
            let mut context = self.context.write().await;
            context.project_metadata = project_metadata;
            context.last_updated = chrono::Utc::now();
        }
        
        debug!("Analyzed project structure");
        Ok(())
    }
    
    /// Detect project metadata
    async fn detect_project_metadata(&self, root_path: &Path) -> NikCliResult<ProjectMetadata> {
        let mut metadata = ProjectMetadata {
            name: root_path.file_name()
                .and_then(|name| name.to_str())
                .map(|s| s.to_string()),
            framework: None,
            languages: Vec::new(),
            dependencies: Vec::new(),
            structure: serde_json::Value::Object(serde_json::Map::new()),
            patterns: None,
            architecture: None,
            complexity: None,
            test_coverage: None,
        };
        
        // Check for package.json (Node.js/JavaScript)
        if root_path.join("package.json").exists() {
            metadata.framework = Some("node".to_string());
            metadata.languages.push("javascript".to_string());
            metadata.languages.push("typescript".to_string());
            
            // Read dependencies
            if let Ok(content) = tokio::fs::read_to_string(root_path.join("package.json")).await {
                if let Ok(package_json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(deps) = package_json.get("dependencies").and_then(|d| d.as_object()) {
                        for dep in deps.keys() {
                            metadata.dependencies.push(dep.clone());
                        }
                    }
                }
            }
        }
        
        // Check for Cargo.toml (Rust)
        if root_path.join("Cargo.toml").exists() {
            metadata.framework = Some("cargo".to_string());
            metadata.languages.push("rust".to_string());
        }
        
        // Check for requirements.txt or pyproject.toml (Python)
        if root_path.join("requirements.txt").exists() || root_path.join("pyproject.toml").exists() {
            metadata.framework = Some("python".to_string());
            metadata.languages.push("python".to_string());
        }
        
        // Check for go.mod (Go)
        if root_path.join("go.mod").exists() {
            metadata.framework = Some("go".to_string());
            metadata.languages.push("go".to_string());
        }
        
        // Check for pom.xml (Java/Maven)
        if root_path.join("pom.xml").exists() {
            metadata.framework = Some("maven".to_string());
            metadata.languages.push("java".to_string());
        }
        
        // Check for build.gradle (Java/Gradle)
        if root_path.join("build.gradle").exists() {
            metadata.framework = Some("gradle".to_string());
            metadata.languages.push("java".to_string());
        }
        
        // Check for composer.json (PHP)
        if root_path.join("composer.json").exists() {
            metadata.framework = Some("composer".to_string());
            metadata.languages.push("php".to_string());
        }
        
        // Check for Gemfile (Ruby)
        if root_path.join("Gemfile").exists() {
            metadata.framework = Some("bundler".to_string());
            metadata.languages.push("ruby".to_string());
        }
        
        // Check for Podfile (iOS/Swift)
        if root_path.join("Podfile").exists() {
            metadata.framework = Some("cocoapods".to_string());
            metadata.languages.push("swift".to_string());
        }
        
        // Check for pubspec.yaml (Flutter/Dart)
        if root_path.join("pubspec.yaml").exists() {
            metadata.framework = Some("flutter".to_string());
            metadata.languages.push("dart".to_string());
        }
        
        // Analyze project structure
        metadata.structure = self.analyze_directory_structure(root_path).await?;
        
        // Calculate complexity
        metadata.complexity = Some(self.calculate_project_complexity(&metadata).await);
        
        Ok(metadata)
    }
    
    /// Analyze directory structure
    async fn analyze_directory_structure(&self, path: &Path) -> NikCliResult<serde_json::Value> {
        let mut structure = serde_json::Map::new();
        
        if let Ok(entries) = tokio::fs::read_dir(path).await {
            let mut entries = entries;
            while let Some(entry) = entries.next_entry().await? {
                let entry_path = entry.path();
                let name = entry_path.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                
                if entry_path.is_dir() {
                    // Skip hidden directories and common build/cache directories
                    if !name.starts_with('.') && !self.is_excluded_directory(&name) {
                        let sub_structure = self.analyze_directory_structure(&entry_path).await?;
                        structure.insert(name, sub_structure);
                    }
                } else {
                    // Add file to structure
                    let file_info = serde_json::json!({
                        "type": "file",
                        "size": entry_path.metadata().await?.len(),
                        "extension": entry_path.extension().and_then(|ext| ext.to_str()).unwrap_or("")
                    });
                    structure.insert(name, file_info);
                }
            }
        }
        
        Ok(serde_json::Value::Object(structure))
    }
    
    /// Check if directory should be excluded
    fn is_excluded_directory(&self, name: &str) -> bool {
        self.config.exclude_patterns.iter().any(|pattern| {
            if pattern.contains('*') {
                // Simple glob matching
                let pattern = pattern.replace('*', "");
                name.contains(&pattern)
            } else {
                name == pattern
            }
        })
    }
    
    /// Calculate project complexity
    async fn calculate_project_complexity(&self, metadata: &ProjectMetadata) -> f32 {
        let mut complexity = 0.0;
        
        // Base complexity by number of languages
        complexity += metadata.languages.len() as f32 * 0.1;
        
        // Complexity by number of dependencies
        complexity += (metadata.dependencies.len() as f32 * 0.01).min(0.3);
        
        // Complexity by project structure depth
        let structure_depth = self.calculate_structure_depth(&metadata.structure);
        complexity += structure_depth * 0.05;
        
        // Complexity by file count (would need to count files)
        // This is a simplified calculation
        
        complexity.min(1.0)
    }
    
    /// Calculate structure depth
    fn calculate_structure_depth(&self, structure: &serde_json::Value) -> f32 {
        match structure {
            serde_json::Value::Object(map) => {
                let mut max_depth = 0.0;
                for value in map.values() {
                    let depth = self.calculate_structure_depth(value);
                    max_depth = max_depth.max(depth);
                }
                max_depth + 1.0
            }
            _ => 0.0,
        }
    }
    
    /// Index workspace files
    pub async fn index_workspace(&self) -> NikCliResult<ContextAnalysisResult> {
        let start_time = std::time::Instant::now();
        let root_path = PathBuf::from(self.get_root_path().await);
        
        let mut files_analyzed = 0;
        let mut total_size = 0;
        let mut languages_found = std::collections::HashSet::new();
        let mut frameworks_detected = std::collections::HashSet::new();
        
        // Walk through directory tree
        self.index_directory(&root_path, &mut files_analyzed, &mut total_size, &mut languages_found, &mut frameworks_detected).await?;
        
        let analysis_duration = start_time.elapsed().as_millis() as u64;
        
        // Update context
        {
            let mut context = self.context.write().await;
            context.last_updated = chrono::Utc::now();
        }
        
        let result = ContextAnalysisResult {
            files_analyzed,
            total_size,
            languages_found: languages_found.into_iter().collect(),
            frameworks_detected: frameworks_detected.into_iter().collect(),
            complexity_score: 0.0, // Would be calculated
            architecture_patterns: Vec::new(), // Would be detected
            recommendations: Vec::new(), // Would be generated
            analysis_duration_ms: analysis_duration,
        };
        
        info!("Indexed workspace: {} files, {} bytes in {}ms", 
              files_analyzed, total_size, analysis_duration);
        
        Ok(result)
    }
    
    /// Index directory recursively
    async fn index_directory(
        &self,
        path: &Path,
        files_analyzed: &mut u32,
        total_size: &mut u64,
        languages_found: &mut std::collections::HashSet<String>,
        frameworks_detected: &mut std::collections::HashSet<String>,
    ) -> NikCliResult<()> {
        if let Ok(entries) = tokio::fs::read_dir(path).await {
            let mut entries = entries;
            while let Some(entry) = entries.next_entry().await? {
                let entry_path = entry.path();
                let name = entry_path.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                
                // Skip hidden files and excluded patterns
                if name.starts_with('.') || self.is_excluded_file(&name) {
                    continue;
                }
                
                if entry_path.is_dir() {
                    // Recursively index subdirectory
                    self.index_directory(&entry_path, files_analyzed, total_size, languages_found, frameworks_detected).await?;
                } else {
                    // Index file
                    if let Ok(metadata) = entry.metadata().await {
                        let file_size = metadata.len();
                        
                        // Check file size limit
                        if file_size > self.config.max_file_size_bytes {
                            continue;
                        }
                        
                        // Check if file matches include patterns
                        if !self.matches_include_patterns(&name) {
                            continue;
                        }
                        
                        // Analyze file
                        if let Ok(file_context) = self.analyze_file(&entry_path).await {
                            // Store file context
                            {
                                let mut context = self.context.write().await;
                                context.files.insert(entry_path.to_string_lossy().to_string(), file_context.clone());
                            }
                            
                            *files_analyzed += 1;
                            *total_size += file_size;
                            languages_found.insert(file_context.language.clone());
                        }
                    }
                }
            }
        }
        
        Ok(())
    }
    
    /// Check if file matches include patterns
    fn matches_include_patterns(&self, filename: &str) -> bool {
        self.config.include_patterns.iter().any(|pattern| {
            if pattern.contains('*') {
                // Simple glob matching
                let pattern = pattern.replace('*', "");
                filename.ends_with(&pattern)
            } else {
                filename == pattern
            }
        })
    }
    
    /// Check if file should be excluded
    fn is_excluded_file(&self, filename: &str) -> bool {
        self.config.exclude_patterns.iter().any(|pattern| {
            if pattern.contains('*') {
                // Simple glob matching
                let pattern = pattern.replace('*', "");
                filename.contains(&pattern)
            } else {
                filename == pattern
            }
        })
    }
    
    /// Analyze individual file
    async fn analyze_file(&self, path: &Path) -> NikCliResult<FileContext> {
        let content = tokio::fs::read_to_string(path).await
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        let metadata = tokio::fs::metadata(path).await
            .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?;
        
        let language = self.detect_language(path);
        let hash = self.calculate_file_hash(&content);
        let importance = self.calculate_file_importance(path, &content, &language);
        
        let file_context = FileContext {
            path: path.to_string_lossy().to_string(),
            content,
            size: metadata.len(),
            modified: metadata.modified()
                .map_err(|e| crate::error::NikCliError::Io(e.to_string()))?
                .into(),
            language,
            importance,
            summary: None,
            dependencies: None,
            exports: None,
            hash: Some(hash),
            embedding: None,
            semantic_score: None,
            last_analyzed: Some(chrono::Utc::now()),
            cache_version: Some("1.0".to_string()),
            functions: None,
            classes: None,
            types: None,
            tags: None,
        };
        
        Ok(file_context)
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
    
    /// Calculate file hash
    fn calculate_file_hash(&self, content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Calculate file importance
    fn calculate_file_importance(&self, path: &Path, content: &str, language: &str) -> f32 {
        let mut importance = 0.0;
        
        // Base importance by file type
        match language {
            "rust" => importance += 0.8,
            "typescript" | "javascript" => importance += 0.7,
            "python" => importance += 0.6,
            "json" | "yaml" | "toml" => importance += 0.5,
            "md" => importance += 0.3,
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
        
        importance.min(1.0)
    }
    
    /// Search for files and content
    pub async fn search(&self, options: SemanticSearchOptions) -> NikCliResult<Vec<ContextSearchResult>> {
        let mut results = Vec::new();
        let context = self.context.read().await;
        
        // Check cache first
        let cache_key = format!("{}:{:?}", options.query, options);
        {
            let cache = self.semantic_search_cache.read().await;
            if let Some(cached_results) = cache.get(&cache_key) {
                return Ok(cached_results.clone());
            }
        }
        
        // Search through files
        for (path, file_context) in &context.files {
            // Apply filters
            if let Some(ref file_types) = options.file_types {
                if !file_types.contains(&file_context.language) {
                    continue;
                }
            }
            
            if let Some(ref exclude_paths) = options.exclude_paths {
                if exclude_paths.iter().any(|exclude| path.contains(exclude)) {
                    continue;
                }
            }
            
            // Search in file content
            let score = self.calculate_search_score(&options.query, file_context);
            
            if score > 0.0 {
                let match_type = if file_context.content.to_lowercase().contains(&options.query.to_lowercase()) {
                    MatchType::Exact
                } else {
                    MatchType::Content
                };
                
                let snippet = if options.include_content.unwrap_or(false) {
                    Some(self.extract_snippet(&file_context.content, &options.query))
                } else {
                    None
                };
                
                results.push(ContextSearchResult {
                    file: file_context.clone(),
                    score,
                    match_type,
                    snippet,
                    highlights: None,
                });
            }
        }
        
        // Sort by score
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        
        // Apply limit
        if let Some(limit) = options.limit {
            results.truncate(limit);
        }
        
        // Cache results
        {
            let mut cache = self.semantic_search_cache.write().await;
            cache.insert(cache_key, results.clone());
        }
        
        Ok(results)
    }
    
    /// Calculate search score
    fn calculate_search_score(&self, query: &str, file_context: &FileContext) -> f32 {
        let query_lower = query.to_lowercase();
        let content_lower = file_context.content.to_lowercase();
        let path_lower = file_context.path.to_lowercase();
        
        let mut score = 0.0;
        
        // Exact match in content
        if content_lower.contains(&query_lower) {
            score += 1.0;
        }
        
        // Exact match in path
        if path_lower.contains(&query_lower) {
            score += 0.8;
        }
        
        // Match in file name
        let file_name = PathBuf::from(&file_context.path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        
        if file_name.contains(&query_lower) {
            score += 0.6;
        }
        
        // Language match
        if file_context.language.to_lowercase().contains(&query_lower) {
            score += 0.4;
        }
        
        // Weight by importance
        score *= file_context.importance;
        
        score
    }
    
    /// Extract snippet around query
    fn extract_snippet(&self, content: &str, query: &str) -> String {
        let query_lower = query.to_lowercase();
        let content_lower = content.to_lowercase();
        
        if let Some(pos) = content_lower.find(&query_lower) {
            let start = pos.saturating_sub(100);
            let end = (pos + query.len() + 100).min(content.len());
            let snippet = &content[start..end];
            
            if start > 0 {
                format!("...{}", snippet)
            } else if end < content.len() {
                format!("{}...", snippet)
            } else {
                snippet.to_string()
            }
        } else {
            // Return first 200 characters
            content.chars().take(200).collect()
        }
    }
    
    /// Start file watching
    async fn start_file_watching(&self) -> NikCliResult<()> {
        // This would implement file system watching
        // For now, it's a placeholder
        info!("File watching started (placeholder implementation)");
        Ok(())
    }
    
    /// Start auto-indexing
    async fn start_auto_indexing(&self) -> NikCliResult<()> {
        let context = self.context.clone();
        let config = self.config.clone();
        
        let task = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(config.auto_index_interval_seconds));
            
            loop {
                interval.tick().await;
                
                // Update last updated time
                {
                    let mut ctx = context.write().await;
                    ctx.last_updated = chrono::Utc::now();
                }
            }
        });
        
        {
            let mut watchers = self.watchers.write().await;
            watchers.insert("auto_indexing".to_string(), task);
        }
        
        info!("Auto-indexing started");
        Ok(())
    }
    
    /// Get workspace context
    pub async fn get_context(&self) -> EnhancedWorkspaceContext {
        let context = self.context.read().await;
        context.clone()
    }
    
    /// Get file context
    pub async fn get_file_context(&self, path: &str) -> Option<FileContext> {
        let context = self.context.read().await;
        context.files.get(path).cloned()
    }
    
    /// Get project metadata
    pub async fn get_project_metadata(&self) -> ProjectMetadata {
        let context = self.context.read().await;
        context.project_metadata.clone()
    }
    
    /// Get cache statistics
    pub async fn get_cache_stats(&self) -> CacheStats {
        let context = self.context.read().await;
        context.cache_stats.clone().unwrap_or_else(|| CacheStats {
            hits: 0,
            misses: 0,
            last_cleanup: chrono::Utc::now(),
        })
    }
    
    /// Clear cache
    pub async fn clear_cache(&self) -> NikCliResult<()> {
        {
            let mut file_cache = self.file_content_cache.write().await;
            file_cache.clear();
        }
        
        {
            let mut search_cache = self.semantic_search_cache.write().await;
            search_cache.clear();
        }
        
        {
            let mut embeddings_cache = self.embeddings_cache.write().await;
            embeddings_cache.clear();
        }
        
        info!("Cleared all caches");
        Ok(())
    }
    
    /// Shutdown workspace context manager
    pub async fn shutdown(&self) -> NikCliResult<()> {
        // Stop all watchers
        {
            let mut watchers = self.watchers.write().await;
            for (name, task) in watchers.drain() {
                task.abort();
                debug!("Stopped watcher: {}", name);
            }
        }
        
        info!("Workspace context manager shutdown");
        Ok(())
    }
}