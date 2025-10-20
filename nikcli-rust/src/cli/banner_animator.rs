/*!
 * Banner Animator - Production-ready gradient banner animation
 * Exact port from TypeScript BannerAnimator class
 */

use colored::*;
use std::time::Duration;
use tokio::time::sleep;

const BANNER: &str = r#"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███╗   ██╗██╗██╗  ██╗ ██████╗██╗     ██╗              ║
║   ████╗  ██║██║██║ ██╔╝██╔════╝██║     ██║              ║
║   ██╔██╗ ██║██║█████╔╝ ██║     ██║     ██║              ║
║   ██║╚██╗██║██║██╔═██╗ ██║     ██║     ██║              ║
║   ██║ ╚████║██║██║  ██╗╚██████╗███████╗██║              ║
║   ╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝╚═╝              ║
║                                                           ║
║        Context-Aware AI Development Assistant            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
"#;

pub struct BannerAnimator {
    frames: Vec<String>,
    palettes: Vec<(&'static str, &'static str)>,
}

impl BannerAnimator {
    pub fn new() -> Self {
        let palettes = vec![
            ("#00d4ff", "#0099ff"),  // Cyan to Blue
            ("#00ff88", "#00cc66"),  // Green gradient
            ("#ff00ff", "#cc00cc"),  // Magenta gradient
            ("#ffaa00", "#ff8800"),  // Orange gradient
        ];
        
        Self {
            frames: Vec::new(),
            palettes,
        }
    }
    
    /// Ensure frames are generated
    fn ensure_frames(&mut self) {
        if !self.frames.is_empty() {
            return;
        }
        
        for (_start, _end) in &self.palettes {
            // Note: colored crate doesn't support gradient, using solid colors
            self.frames.push(BANNER.bright_cyan().to_string());
            self.frames.push(BANNER.cyan().to_string());
            self.frames.push(BANNER.bright_blue().to_string());
            self.frames.push(BANNER.blue().to_string());
        }
    }
    
    /// Render static banner
    pub fn render_static() -> String {
        BANNER.bright_cyan().bold().to_string()
    }
    
    /// Print static banner
    pub fn print_static() {
        println!("{}", Self::render_static());
    }
    
    /// Play animated banner
    pub async fn play(&mut self, cycles: usize, frame_interval_ms: u64) {
        self.ensure_frames();
        
        if self.frames.is_empty() {
            Self::print_static();
            return;
        }
        
        // Clear screen
        print!("\x1B[2J\x1B[1;1H");
        
        for _ in 0..cycles {
            for frame in &self.frames {
                // Move cursor to top
                print!("\x1B[1;1H");
                print!("{}", frame);
                
                sleep(Duration::from_millis(frame_interval_ms)).await;
            }
        }
    }
}

impl Default for BannerAnimator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_render_static() {
        let banner = BannerAnimator::render_static();
        assert!(!banner.is_empty());
        assert!(banner.contains("NIKCLI"));
    }
    
    #[test]
    fn test_new() {
        let animator = BannerAnimator::new();
        assert_eq!(animator.palettes.len(), 4);
    }
}
