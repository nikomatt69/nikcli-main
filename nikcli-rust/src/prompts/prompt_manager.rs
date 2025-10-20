/*!
 * Prompt Manager - Production Ready
 */

use dashmap::DashMap;
use std::sync::Arc;

pub struct PromptManager {
    templates: Arc<DashMap<String, String>>,
}

impl PromptManager {
    pub fn new() -> Self {
        let manager = Self {
            templates: Arc::new(DashMap::new()),
        };
        manager.register_default_templates();
        manager
    }
    
    fn register_default_templates(&self) {
        self.templates.insert(
            "system".to_string(),
            "You are a helpful AI assistant specialized in software development.".to_string(),
        );
        
        self.templates.insert(
            "code_review".to_string(),
            "Review the following code and provide constructive feedback.".to_string(),
        );
        
        self.templates.insert(
            "planning".to_string(),
            "Create a detailed plan to accomplish the following goal.".to_string(),
        );
    }
    
    pub fn get_template(&self, name: &str) -> Option<String> {
        self.templates.get(name).map(|t| t.clone())
    }
    
    pub fn add_template(&self, name: String, template: String) {
        self.templates.insert(name, template);
    }
}

impl Default for PromptManager {
    fn default() -> Self {
        Self::new()
    }
}

