/*!
 * Figma Client - Production-ready base
 * Minimal Figma API wrapper using reqwest. Requires FIGMA_API_TOKEN.
 */

use anyhow::{Context, Result};
use crate::http_client_stub::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct FigmaClient {
    api_token: String,
    http: reqwest::Client,
    base_url: String,
}

impl FigmaClient {
    pub fn new(api_token: String) -> Self {
        Self {
            api_token,
            http: crate::http_client_stub::Client::new(),
            base_url: "https://api.figma.com/v1".to_string(),
        }
    }

    fn headers(&self) -> HeaderMap {
        let mut h = HeaderMap::new();
        let bearer = format!("Bearer {}", self.api_token);
        h.insert(AUTHORIZATION, HeaderValue::from_str(&bearer).unwrap());
        h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        h
    }

    pub async fn get_file_info(&self, file_id: &str) -> Result<FigmaFileInfo> {
        let url = format!("{}/files/{}", self.base_url, file_id);
        let res = self
            .http
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .context("Figma get_file_info request failed")?;
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("Figma API error {}: {}", status, text);
        }
        let info: FigmaFileInfo = serde_json::from_str(&text)
            .context("Failed to parse Figma file info")?;
        Ok(info)
    }

    pub async fn export_image(&self, file_id: &str, params: &ExportParams) -> Result<Vec<u8>> {
        let url = format!("{}/images/{}?format={}&scale={}", self.base_url, file_id, params.format, params.scale);
        let res = self
            .http
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .context("Figma export_image request failed")?;
        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            anyhow::bail!("Figma API error {}: {}", status, text);
        }
        let bytes = res.bytes().await.context("Failed reading image bytes")?;
        Ok(bytes.to_vec())
    }

    pub async fn get_file_styles(&self, file_id: &str) -> Result<FileStyles> {
        let url = format!("{}/files/{}/styles", self.base_url, file_id);
        let res = self
            .http
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .context("Figma get_file_styles request failed")?;
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("Figma API error {}: {}", status, text);
        }
        let styles: FileStyles = serde_json::from_str(&text).context("Failed to parse styles")?;
        Ok(styles)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FigmaFileInfo {
    pub name: String,
    pub last_modified: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportParams {
    pub format: String, // png, jpg, svg, pdf
    pub scale: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStyles {
    pub styles: serde_json::Value,
}

