/*!
 * Feedback System - Production Ready
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feedback {
    pub user: String,
    pub action: String,
    pub rating: u8,
    pub comment: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

pub struct FeedbackSystem {
    feedbacks: Vec<Feedback>,
}

impl FeedbackSystem {
    pub fn new() -> Self {
        Self {
            feedbacks: Vec::new(),
        }
    }
    
    pub fn submit_feedback(&mut self, feedback: Feedback) {
        self.feedbacks.push(feedback);
    }
    
    pub fn get_feedbacks(&self) -> &[Feedback] {
        &self.feedbacks
    }
    
    pub fn get_average_rating(&self) -> f64 {
        if self.feedbacks.is_empty() {
            return 0.0;
        }
        
        let sum: u64 = self.feedbacks.iter().map(|f| f.rating as u64).sum();
        sum as f64 / self.feedbacks.len() as f64
    }
}

impl Default for FeedbackSystem {
    fn default() -> Self {
        Self::new()
    }
}

