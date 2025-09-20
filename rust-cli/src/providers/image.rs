// Image provider module
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageProvider {
    pub name: String,
    pub enabled: bool,
    pub max_size: u64,
    pub supported_formats: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRequest {
    pub operation: ImageOperation,
    pub data: Option<String>, // base64 encoded image data
    pub url: Option<String>,
    pub format: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ImageOperation {
    Resize,
    Convert,
    Analyze,
    Generate,
    Process,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageResponse {
    pub success: bool,
    pub data: Option<String>, // base64 encoded result
    pub metadata: Option<ImageMetadata>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub size: u64,
    pub colors: Option<Vec<String>>,
}

impl ImageProvider {
    pub fn new(name: String) -> Self {
        Self {
            name,
            enabled: true,
            max_size: 10 * 1024 * 1024, // 10MB
            supported_formats: vec![
                "jpg".to_string(),
                "jpeg".to_string(),
                "png".to_string(),
                "gif".to_string(),
                "webp".to_string(),
                "bmp".to_string(),
            ],
        }
    }

    pub fn with_max_size(mut self, size: u64) -> Self {
        self.max_size = size;
        self
    }

    pub fn with_formats(mut self, formats: Vec<String>) -> Self {
        self.supported_formats = formats;
        self
    }

    pub fn disable(mut self) -> Self {
        self.enabled = false;
        self
    }
}