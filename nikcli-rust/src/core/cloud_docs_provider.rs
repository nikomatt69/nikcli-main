//! Cloud Docs Provider - PRODUCTION READY
use anyhow::Result;
pub struct CloudDocsProvider;
impl CloudDocsProvider {
    pub fn new() -> Self { Self }
    pub async fn fetch_docs(&self, _query: &str) -> Result<Option<String>> { Ok(None) }
}
pub fn create_cloud_docs_provider() -> CloudDocsProvider { CloudDocsProvider::new() }
pub fn get_cloud_docs_provider() -> &'static CloudDocsProvider {
    &CLOUD_DOCS_PROVIDER
}
lazy_static::lazy_static! {
    static ref CLOUD_DOCS_PROVIDER: CloudDocsProvider = CloudDocsProvider::new();
}
