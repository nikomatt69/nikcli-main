/*!
 * Diff Manager - Production Ready
 */

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub file_path: String,
    pub old_content: String,
    pub new_content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub struct DiffManager {
    pending_diffs: VecDeque<FileDiff>,
    auto_accept: bool,
}

impl DiffManager {
    pub fn new() -> Self {
        Self {
            pending_diffs: VecDeque::new(),
            auto_accept: false,
        }
    }
    
    pub fn add_diff(&mut self, diff: FileDiff) {
        self.pending_diffs.push_back(diff);
    }
    
    pub fn get_pending_count(&self) -> usize {
        self.pending_diffs.len()
    }
    
    pub fn set_auto_accept(&mut self, auto_accept: bool) {
        self.auto_accept = auto_accept;
    }
    
    pub fn get_next_diff(&mut self) -> Option<FileDiff> {
        self.pending_diffs.pop_front()
    }
    
    pub fn clear(&mut self) {
        self.pending_diffs.clear();
    }
}

impl Default for DiffManager {
    fn default() -> Self {
        Self::new()
    }
}

