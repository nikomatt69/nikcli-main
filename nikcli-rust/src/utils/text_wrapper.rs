/*!
 * Text Wrapper - Production Ready
 */

pub struct TextWrapper {
    width: usize,
}

impl TextWrapper {
    pub fn new(width: usize) -> Self {
        Self { width }
    }
    
    pub fn wrap(&self, text: &str) -> String {
        let mut output = String::new();
        let mut current_line = String::new();
        
        for word in text.split_whitespace() {
            if current_line.len() + word.len() + 1 > self.width {
                if !current_line.is_empty() {
                    output.push_str(&current_line);
                    output.push('\n');
                    current_line.clear();
                }
            }
            
            if !current_line.is_empty() {
                current_line.push(' ');
            }
            current_line.push_str(word);
        }
        
        if !current_line.is_empty() {
            output.push_str(&current_line);
        }
        
        output
    }
}

impl Default for TextWrapper {
    fn default() -> Self {
        Self::new(80)
    }
}

