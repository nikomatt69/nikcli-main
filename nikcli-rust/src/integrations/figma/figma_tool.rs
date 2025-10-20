/*!
 * Figma Tool - Production-ready base
 */

use super::figma_client::{FigmaClient, FigmaFileInfo, ExportParams, FileStyles};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub struct FigmaTool {
    client: Arc<FigmaClient>,
}

impl FigmaTool {
    pub fn new(client: Arc<FigmaClient>) -> Self { Self { client } }

    pub async fn execute(&self, command: FigmaCommand) -> Result<FigmaToolResult> {
        match command {
            FigmaCommand::GetInfo { file_id } => {
                let info = self.client.get_file_info(&file_id).await?;
                Ok(FigmaToolResult::Info(info))
            }
            FigmaCommand::Export { file_id, format, scale } => {
                let params = ExportParams { format, scale };
                let bytes = self.client.export_image(&file_id, &params).await?;
                Ok(FigmaToolResult::Bytes(bytes))
            }
            FigmaCommand::Styles { file_id } => {
                let styles = self.client.get_file_styles(&file_id).await?;
                Ok(FigmaToolResult::Styles(styles))
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FigmaCommand {
    GetInfo { file_id: String },
    Export { file_id: String, format: String, scale: f32 },
    Styles { file_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FigmaToolResult {
    Info(FigmaFileInfo),
    Styles(FileStyles),
    Bytes(Vec<u8>),
}

pub fn extract_file_id_from_url(url: &str) -> Option<String> {
    // Basic: https://www.figma.com/file/<FILE_ID>/...
    let parts: Vec<&str> = url.split('/').collect();
    let idx = parts.iter().position(|s| *s == "file")?;
    parts.get(idx + 1).map(|s| s.to_string())
}

pub fn is_figma_configured() -> bool {
    std::env::var("FIGMA_API_TOKEN").is_ok()
}

