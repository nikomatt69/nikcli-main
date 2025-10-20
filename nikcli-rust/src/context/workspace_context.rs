/*!
 * Workspace Context
 * Production-ready workspace analysis and context management
 */

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use walkdir::WalkDir;

/// Workspace analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceAnalysis {
    pub root_path: PathBuf,
    pub file_count: usize,
    pub total_size: u64,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
    pub has_tests: bool,
    pub has_documentation: bool,
    pub git_repository: bool,
}

/// Workspace Context Manager
pub struct WorkspaceContext {
    root_path: Arc<RwLock<PathBuf>>,
    analysis: Arc<RwLock<Option<WorkspaceAnalysis>>>,
}

impl WorkspaceContext {
    pub fn new(root_path: PathBuf) -> Self {
        Self {
            root_path: Arc::new(RwLock::new(root_path)),
            analysis: Arc::new(RwLock::new(None)),
        }
    }
    
    /// Analyze the workspace
    pub async fn analyze(&self) -> Result<WorkspaceAnalysis> {
        let root = self.root_path.read().await;
        
        let mut file_count = 0;
        let mut total_size = 0u64;
        let mut languages = Vec::new();
        let mut frameworks = Vec::new();
        
        // Walk directory tree
        for entry in WalkDir::new(root.as_path())
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                file_count += 1;
                
                if let Ok(metadata) = entry.metadata() {
                    total_size += metadata.len();
                }
                
                // Detect language from extension
                if let Some(ext) = entry.path().extension() {
                    let ext_str = ext.to_string_lossy().to_string();
                    if !languages.contains(&ext_str) {
                        languages.push(ext_str);
                    }
                }
            }
        }
        
        // Detect frameworks
        if root.join("package.json").exists() {
            frameworks.push("Node.js".to_string());
        }
        if root.join("Cargo.toml").exists() {
            frameworks.push("Rust".to_string());
        }
        if root.join("go.mod").exists() {
            frameworks.push("Go".to_string());
        }
        if root.join("requirements.txt").exists() || root.join("pyproject.toml").exists() {
            frameworks.push("Python".to_string());
        }
        
        // Check for tests
        let has_tests = root.join("tests").exists() 
            || root.join("test").exists()
            || root.join("__tests__").exists();
        
        // Check for documentation
        let has_documentation = root.join("README.md").exists()
            || root.join("docs").exists();
        
        // Check for git
        let git_repository = root.join(".git").exists();
        
        let analysis = WorkspaceAnalysis {
            root_path: root.clone(),
            file_count,
            total_size,
            languages,
            frameworks,
            has_tests,
            has_documentation,
            git_repository,
        };
        
        *self.analysis.write().await = Some(analysis.clone());
        
        Ok(analysis)
    }
    
    /// Get current analysis
    pub async fn get_analysis(&self) -> Option<WorkspaceAnalysis> {
        self.analysis.read().await.clone()
    }
    
    /// Get root path
    pub async fn get_root_path(&self) -> PathBuf {
        self.root_path.read().await.clone()
    }
    
    /// Set root path
    pub async fn set_root_path(&self, path: PathBuf) {
        *self.root_path.write().await = path;
        *self.analysis.write().await = None;
    }
}

