/*!
 * Feature Flags - Production Ready
 */

use dashmap::DashMap;
use std::sync::Arc;

pub struct FeatureFlags {
    flags: Arc<DashMap<String, bool>>,
}

impl FeatureFlags {
    pub fn new() -> Self {
        let flags = Self {
            flags: Arc::new(DashMap::new()),
        };
        flags.initialize_defaults();
        flags
    }
    
    fn initialize_defaults(&self) {
        self.flags.insert("streaming".to_string(), true);
        self.flags.insert("advanced_planning".to_string(), true);
        self.flags.insert("experimental_features".to_string(), false);
    }
    
    pub fn is_enabled(&self, flag: &str) -> bool {
        self.flags.get(flag).map(|v| *v).unwrap_or(false)
    }
    
    pub fn enable(&self, flag: String) {
        self.flags.insert(flag, true);
    }
    
    pub fn disable(&self, flag: String) {
        self.flags.insert(flag, false);
    }
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self::new()
    }
}

