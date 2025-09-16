// File diff utilities
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum DiffType {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Unmerged,
}

#[derive(Debug, Clone)]
pub struct FileDiff {
    pub file_path: String,
    pub diff_type: DiffType,
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub changes: Vec<Change>,
    pub stats: DiffStats,
}

#[derive(Debug, Clone)]
pub struct Change {
    pub line_number: usize,
    pub content: String,
    pub change_type: ChangeType,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Copy)]
pub enum ChangeType {
    Added,
    Removed,
    Modified,
    Context,
}

#[derive(Debug, Clone)]
pub struct DiffStats {
    pub lines_added: usize,
    pub lines_removed: usize,
    pub lines_modified: usize,
    pub files_changed: usize,
}

impl FileDiff {
    pub fn new(file_path: String, diff_type: DiffType) -> Self {
        Self {
            file_path,
            diff_type,
            old_path: None,
            new_path: None,
            changes: Vec::new(),
            stats: DiffStats {
                lines_added: 0,
                lines_removed: 0,
                lines_modified: 0,
                files_changed: 1,
            },
        }
    }

    pub fn add_change(&mut self, line_number: usize, content: String, change_type: ChangeType) {
        self.changes.push(Change {
            line_number,
            content,
            change_type,
        });

        match change_type {
            ChangeType::Added => self.stats.lines_added += 1,
            ChangeType::Removed => self.stats.lines_removed += 1,
            ChangeType::Modified => self.stats.lines_modified += 1,
            ChangeType::Context => {}
        }
    }

    pub fn get_summary(&self) -> String {
        match self.diff_type {
            DiffType::Added => format!("A {}", self.file_path),
            DiffType::Modified => format!("M {}", self.file_path),
            DiffType::Deleted => format!("D {}", self.file_path),
            DiffType::Renamed => {
                if let (Some(old), Some(new)) = (&self.old_path, &self.new_path) {
                    format!("R {} -> {}", old, new)
                } else {
                    format!("R {}", self.file_path)
                }
            }
            DiffType::Copied => format!("C {}", self.file_path),
            DiffType::Unmerged => format!("U {}", self.file_path),
        }
    }
}

pub struct DiffAnalyzer;

impl DiffAnalyzer {
    pub fn analyze_changes(diffs: &[FileDiff]) -> DiffStats {
        let mut total_stats = DiffStats {
            lines_added: 0,
            lines_removed: 0,
            lines_modified: 0,
            files_changed: diffs.len(),
        };

        for diff in diffs {
            total_stats.lines_added += diff.stats.lines_added;
            total_stats.lines_removed += diff.stats.lines_removed;
            total_stats.lines_modified += diff.stats.lines_modified;
        }

        total_stats
    }

    pub fn group_by_type(diffs: &[FileDiff]) -> HashMap<DiffType, Vec<&FileDiff>> {
        let mut grouped = HashMap::new();
        
        for diff in diffs {
            grouped.entry(diff.diff_type.clone()).or_insert_with(Vec::new).push(diff);
        }
        
        grouped
    }

    pub fn get_file_extensions(diffs: &[FileDiff]) -> HashMap<String, usize> {
        let mut extensions = HashMap::new();
        
        for diff in diffs {
            if let Some(ext) = Path::new(&diff.file_path)
                .extension()
                .and_then(|e| e.to_str())
            {
                *extensions.entry(ext.to_string()).or_insert(0) += 1;
            }
        }
        
        extensions
    }

    pub fn filter_by_extension<'a>(diffs: &'a [FileDiff], extension: &str) -> Vec<&'a FileDiff> {
        diffs
            .iter()
            .filter(|diff| {
                Path::new(&diff.file_path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e == extension)
                    .unwrap_or(false)
            })
            .collect()
    }

    pub fn get_largest_changes(diffs: &[FileDiff], limit: usize) -> Vec<&FileDiff> {
        let mut sorted_diffs: Vec<&FileDiff> = diffs.iter().collect();
        sorted_diffs.sort_by(|a, b| {
            let a_total = a.stats.lines_added + a.stats.lines_removed + a.stats.lines_modified;
            let b_total = b.stats.lines_added + b.stats.lines_removed + b.stats.lines_modified;
            b_total.cmp(&a_total)
        });
        
        sorted_diffs.into_iter().take(limit).collect()
    }
}

impl std::fmt::Display for DiffType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DiffType::Added => write!(f, "Added"),
            DiffType::Modified => write!(f, "Modified"),
            DiffType::Deleted => write!(f, "Deleted"),
            DiffType::Renamed => write!(f, "Renamed"),
            DiffType::Copied => write!(f, "Copied"),
            DiffType::Unmerged => write!(f, "Unmerged"),
        }
    }
}

impl std::fmt::Display for ChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChangeType::Added => write!(f, "+"),
            ChangeType::Removed => write!(f, "-"),
            ChangeType::Modified => write!(f, "~"),
            ChangeType::Context => write!(f, " "),
        }
    }
}