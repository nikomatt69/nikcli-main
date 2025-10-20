/*!
 * IDE Detector - Production Ready
 */

pub struct IDEDetector;

impl IDEDetector {
    pub fn new() -> Self {
        Self
    }
    
    pub fn detect_ide(&self) -> Option<String> {
        if std::env::var("TERM_PROGRAM").as_deref() == Ok("vscode") {
            Some("vscode".to_string())
        } else if std::env::var("TERM_PROGRAM").as_deref() == Ok("Apple_Terminal") {
            Some("terminal".to_string())
        } else if std::env::var("TERM_PROGRAM").as_deref() == Ok("iTerm.app") {
            Some("iterm".to_string())
        } else {
            None
        }
    }
    
    pub fn has_gui(&self) -> bool {
        self.detect_ide().is_some()
    }
}

impl Default for IDEDetector {
    fn default() -> Self {
        Self::new()
    }
}

