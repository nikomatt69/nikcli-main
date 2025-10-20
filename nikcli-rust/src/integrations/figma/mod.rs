/*!
 * Figma Integration Module
 * Complete interface for Figma API integration
 */

pub mod figma_client;
pub mod figma_tool;

pub use figma_client::{FigmaClient, FigmaFileInfo, ExportParams, FileStyles};
pub use figma_tool::{FigmaTool, FigmaCommand, FigmaToolResult, extract_file_id_from_url, is_figma_configured};

