/*!
 * BrowseGPT Integration Module
 */

pub mod browsegpt_service;
pub mod browser_session;

pub use browsegpt_service::BrowseGPTService;
pub use browser_session::{BrowserSession, PageContent, SearchResults, SearchResult, BrowserSessionInfo};

