// IDE diagnostic integration module
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdeDiagnosticIntegration {
    pub name: String,
    pub enabled: bool,
    pub supported_ides: Vec<String>,
    pub diagnostic_types: Vec<DiagnosticType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiagnosticType {
    Error,
    Warning,
    Info,
    Hint,
    Suggestion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub id: String,
    pub message: String,
    pub diagnostic_type: DiagnosticType,
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub end_line: Option<u32>,
    pub end_column: Option<u32>,
    pub source: Option<String>,
    pub code: Option<String>,
    pub related_information: Vec<RelatedInformation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedInformation {
    pub location: Location,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub end_line: Option<u32>,
    pub end_column: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticRequest {
    pub file_path: String,
    pub content: Option<String>,
    pub language: Option<String>,
    pub include_warnings: bool,
    pub include_hints: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticResponse {
    pub diagnostics: Vec<Diagnostic>,
    pub success: bool,
    pub error: Option<String>,
}

impl IdeDiagnosticIntegration {
    pub fn new(name: String) -> Self {
        Self {
            name,
            enabled: true,
            supported_ides: vec![
                "vscode".to_string(),
                "vim".to_string(),
                "emacs".to_string(),
                "sublime".to_string(),
                "atom".to_string(),
                "intellij".to_string(),
            ],
            diagnostic_types: vec![
                DiagnosticType::Error,
                DiagnosticType::Warning,
                DiagnosticType::Info,
                DiagnosticType::Hint,
                DiagnosticType::Suggestion,
            ],
        }
    }

    pub fn with_ides(mut self, ides: Vec<String>) -> Self {
        self.supported_ides = ides;
        self
    }

    pub fn with_diagnostic_types(mut self, types: Vec<DiagnosticType>) -> Self {
        self.diagnostic_types = types;
        self
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}