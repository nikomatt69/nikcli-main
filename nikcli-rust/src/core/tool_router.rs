/*!
 * Tool Router - PRODUCTION READY
 * Intelligent tool intent detection and routing
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolRecommendation {
    pub tool: String,
    pub confidence: f64,
    pub params: serde_json::Value,
}

pub struct ToolRouter;

impl ToolRouter {
    pub fn new() -> Self {
        Self
    }
    
    /// Analyze message and recommend tools
    pub fn analyze_message(&self, input: &str) -> Vec<ToolRecommendation> {
        let input_lower = input.to_lowercase();
        let mut recommendations = Vec::new();
        
        // File operations
        if input_lower.contains("read") && (input_lower.contains("file") || input_lower.contains(".")) {
            recommendations.push(ToolRecommendation {
                tool: "read_file".to_string(),
                confidence: 0.85,
                params: serde_json::json!({}),
            });
        }
        
        if input_lower.contains("write") || input_lower.contains("create file") {
            recommendations.push(ToolRecommendation {
                tool: "write_file".to_string(),
                confidence: 0.82,
                params: serde_json::json!({}),
            });
        }
        
        // Command execution
        if input_lower.starts_with("run ") || input_lower.contains("execute") || input_lower.contains("command") {
            recommendations.push(ToolRecommendation {
                tool: "run_command".to_string(),
                confidence: 0.88,
                params: serde_json::json!({}),
            });
        }
        
        // Git operations
        if input_lower.contains("git ") || input_lower.contains("commit") || input_lower.contains("push") {
            recommendations.push(ToolRecommendation {
                tool: "git_operation".to_string(),
                confidence: 0.90,
                params: serde_json::json!({}),
            });
        }
        
        // Search operations
        if input_lower.contains("search") || input_lower.contains("find") || input_lower.contains("grep") {
            recommendations.push(ToolRecommendation {
                tool: "grep".to_string(),
                confidence: 0.83,
                params: serde_json::json!({}),
            });
        }
        
        // Sort by confidence
        recommendations.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        
        recommendations
    }
    
    /// Get all available tools
    pub fn get_all_tools(&self) -> Vec<ToolInfo> {
        vec![
            ToolInfo { tool: "read_file".to_string() },
            ToolInfo { tool: "write_file".to_string() },
            ToolInfo { tool: "run_command".to_string() },
            ToolInfo { tool: "git_operation".to_string() },
            ToolInfo { tool: "grep".to_string() },
        ]
    }
}

#[derive(Debug, Clone)]
pub struct ToolInfo {
    pub tool: String,
}
