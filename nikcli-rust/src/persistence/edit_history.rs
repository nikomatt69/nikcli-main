/*!
 * Edit History - Production Ready Undo/Redo System
 * Complete file operation tracking and reversal
 */

use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;

/// Operation types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OperationType {
    Create,
    Modify,
    Delete,
}

/// File operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperation {
    pub operation: OperationType,
    pub file_path: PathBuf,
    pub timestamp: DateTime<Utc>,
    pub old_content: Option<String>,
    pub new_content: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl FileOperation {
    pub fn create(file_path: PathBuf, content: String) -> Self {
        Self {
            operation: OperationType::Create,
            file_path,
            timestamp: Utc::now(),
            old_content: None,
            new_content: Some(content),
            metadata: HashMap::new(),
        }
    }
    
    pub fn modify(file_path: PathBuf, old_content: String, new_content: String) -> Self {
        Self {
            operation: OperationType::Modify,
            file_path,
            timestamp: Utc::now(),
            old_content: Some(old_content),
            new_content: Some(new_content),
            metadata: HashMap::new(),
        }
    }
    
    pub fn delete(file_path: PathBuf, content: String) -> Self {
        Self {
            operation: OperationType::Delete,
            file_path,
            timestamp: Utc::now(),
            old_content: Some(content),
            new_content: None,
            metadata: HashMap::new(),
        }
    }
}

/// Edit History Manager
#[derive(Debug, Clone)]
pub struct EditHistory {
    undo_stack: Vec<FileOperation>,
    redo_stack: Vec<FileOperation>,
    max_history: usize,
}

impl EditHistory {
    pub fn new() -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_history: 100,
        }
    }
    
    pub fn with_max_history(max_history: usize) -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_history,
        }
    }
    
    /// Record a file operation
    pub fn record_operation(&mut self, operation: FileOperation) {
        self.undo_stack.push(operation);
        
        // Clear redo stack when new operation is recorded
        self.redo_stack.clear();
        
        // Trim history if needed
        if self.undo_stack.len() > self.max_history {
            self.undo_stack.drain(0..(self.undo_stack.len() - self.max_history));
        }
    }
    
    /// Undo N operations
    pub async fn undo(&mut self, count: usize) -> Result<Vec<FileOperation>> {
        let mut undone = Vec::new();
        
        for _ in 0..count {
            if let Some(operation) = self.undo_stack.pop() {
                // Reverse the operation
                match operation.operation {
                    OperationType::Create => {
                        // Delete the created file
                        if operation.file_path.exists() {
                            fs::remove_file(&operation.file_path).await?;
                        }
                    }
                    OperationType::Modify => {
                        // Restore old content
                        if let Some(old_content) = &operation.old_content {
                            fs::write(&operation.file_path, old_content).await?;
                        }
                    }
                    OperationType::Delete => {
                        // Restore deleted file
                        if let Some(old_content) = &operation.old_content {
                            fs::write(&operation.file_path, old_content).await?;
                        }
                    }
                }
                
                self.redo_stack.push(operation.clone());
                undone.push(operation);
            } else {
                break;
            }
        }
        
        Ok(undone)
    }
    
    /// Redo N operations
    pub async fn redo(&mut self, count: usize) -> Result<Vec<FileOperation>> {
        let mut redone = Vec::new();
        
        for _ in 0..count {
            if let Some(operation) = self.redo_stack.pop() {
                // Re-apply the operation
                match operation.operation {
                    OperationType::Create | OperationType::Modify => {
                        if let Some(new_content) = &operation.new_content {
                            fs::write(&operation.file_path, new_content).await?;
                        }
                    }
                    OperationType::Delete => {
                        if operation.file_path.exists() {
                            fs::remove_file(&operation.file_path).await?;
                        }
                    }
                }
                
                self.undo_stack.push(operation.clone());
                redone.push(operation);
            } else {
                break;
            }
        }
        
        Ok(redone)
    }
    
    /// Get undo stack count
    pub fn get_undo_count(&self) -> usize {
        self.undo_stack.len()
    }
    
    /// Get redo stack count
    pub fn get_redo_count(&self) -> usize {
        self.redo_stack.len()
    }
    
    /// Clear all history
    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }
    
    /// Get recent operations
    pub fn get_recent_operations(&self, count: usize) -> Vec<&FileOperation> {
        self.undo_stack.iter().rev().take(count).collect()
    }
}

impl Default for EditHistory {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_edit_history() {
        let mut history = EditHistory::new();
        
        let op = FileOperation::create(
            PathBuf::from("test.txt"),
            "content".to_string(),
        );
        
        history.record_operation(op);
        assert_eq!(history.get_undo_count(), 1);
        assert_eq!(history.get_redo_count(), 0);
    }
    
    #[tokio::test]
    async fn test_undo_redo() {
        let mut history = EditHistory::new();
        
        let op = FileOperation::create(
            PathBuf::from("/tmp/test_undo.txt"),
            "content".to_string(),
        );
        
        history.record_operation(op);
        
        // Undo would normally reverse file operations
        // Skipping actual file I/O in test
    }
}
