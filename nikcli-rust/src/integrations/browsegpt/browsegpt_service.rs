/*!
 * BrowseGPT Service - Base implementation
 */

use super::browser_session::{BrowserSession, BrowserSessionInfo, PageContent, SearchResult, SearchResults};
use anyhow::Result;
use chrono::Utc;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct BrowseGPTService {
    sessions: Arc<DashMap<String, BrowserSession>>,
    pub browserbase_api_key: Option<String>,
    pub browserbase_project_id: Option<String>,
}

impl BrowseGPTService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            browserbase_api_key: std::env::var("BROWSERBASE_API_KEY").ok(),
            browserbase_project_id: std::env::var("BROWSERBASE_PROJECT_ID").ok(),
        }
    }

    pub async fn create_session(&self, session_id: Option<String>) -> Result<String> {
        let id = session_id.unwrap_or_else(|| nanoid::nanoid!());
        let now = Utc::now();
        let session = BrowserSession { id: id.clone(), created: now, last_activity: now, history: vec![], active: true };
        self.sessions.insert(id.clone(), session);
        Ok(id)
    }

    pub async fn google_search(&self, session_id: &str, query: &str) -> Result<SearchResults> {
        // Base implementation: return empty results with metadata only
        let mut out = SearchResults { query: query.to_string(), results: vec![] };
        Ok(out)
    }

    pub async fn get_page_content(&self, session_id: &str, url: &str, prompt: Option<&str>) -> Result<PageContent> {
        // Base implementation: no real browser, return URL only
        Ok(PageContent { title: url.to_string(), url: url.to_string(), text: String::new(), summary: None })
    }

    pub async fn chat_with_web(&self, session_id: &str, message: &str) -> Result<String> {
        Ok(format!("[BrowseGPT:{}] {}", session_id, message))
    }

    pub fn list_sessions(&self) -> Vec<BrowserSessionInfo> {
        self.sessions.iter().map(|e| BrowserSessionInfo { id: e.key().clone(), created: e.created, last_activity: e.last_activity, active: e.active }).collect()
    }

    pub fn get_session_info(&self, session_id: &str) -> Option<BrowserSessionInfo> {
        self.sessions.get(session_id).map(|e| BrowserSessionInfo { id: e.key().clone(), created: e.created, last_activity: e.last_activity, active: e.active })
    }

    pub async fn close_session(&self, session_id: &str) -> Result<()> {
        if let Some(mut s) = self.sessions.get_mut(session_id) {
            s.active = false;
        }
        Ok(())
    }

    pub async fn cleanup_sessions(&self) -> Result<usize> {
        let mut removed = 0usize;
        let ids: Vec<String> = self
            .sessions
            .iter()
            .filter(|e| !e.active)
            .map(|e| e.key().clone())
            .collect();
        for id in ids { self.sessions.remove(&id); removed += 1; }
        Ok(removed)
    }
}
