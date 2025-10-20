//! Paste Handler - PRODUCTION READY
pub struct PasteHandler;
pub struct PasteResult {
    pub should_truncate: bool,
    pub display_text: String,
    pub original_text: String,
}
impl PasteHandler {
    pub fn new() -> Self { Self }
    pub fn get_instance() -> Self { Self }
    pub fn process_pasted_text(&self, text: String) -> PasteResult {
        PasteResult {
            should_truncate: text.len() > 500,
            display_text: if text.len() > 500 {
                format!("[Pasted {} chars]", text.len())
            } else {
                text.clone()
            },
            original_text: text,
        }
    }
}
