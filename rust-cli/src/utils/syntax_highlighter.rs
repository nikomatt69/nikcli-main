// Syntax highlighting utilities
use colored::Colorize;

pub struct SyntaxHighlighter;

impl SyntaxHighlighter {
    pub fn highlight_code(code: &str, language: &str) -> String {
        match language {
            "rust" => Self::highlight_rust(code),
            "javascript" | "js" => Self::highlight_javascript(code),
            "typescript" | "ts" => Self::highlight_typescript(code),
            "python" | "py" => Self::highlight_python(code),
            "json" => Self::highlight_json(code),
            _ => code.to_string(),
        }
    }

    fn highlight_rust(code: &str) -> String {
        // Simple Rust syntax highlighting
        code.lines()
            .map(|line| {
                if line.trim().starts_with("//") {
                    line.green().to_string()
                } else if line.contains("fn ") || line.contains("struct ") || line.contains("enum ") {
                    line.blue().to_string()
                } else if line.contains("let ") || line.contains("mut ") {
                    line.yellow().to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn highlight_javascript(code: &str) -> String {
        // Simple JavaScript syntax highlighting
        code.lines()
            .map(|line| {
                if line.trim().starts_with("//") {
                    line.green().to_string()
                } else if line.contains("function ") || line.contains("const ") || line.contains("let ") {
                    line.blue().to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn highlight_typescript(code: &str) -> String {
        // Simple TypeScript syntax highlighting
        code.lines()
            .map(|line| {
                if line.trim().starts_with("//") {
                    line.green().to_string()
                } else if line.contains("interface ") || line.contains("type ") || line.contains("enum ") {
                    line.blue().to_string()
                } else if line.contains("function ") || line.contains("const ") || line.contains("let ") {
                    line.yellow().to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn highlight_python(code: &str) -> String {
        // Simple Python syntax highlighting
        code.lines()
            .map(|line| {
                if line.trim().starts_with("#") {
                    line.green().to_string()
                } else if line.contains("def ") || line.contains("class ") {
                    line.blue().to_string()
                } else if line.contains("import ") || line.contains("from ") {
                    line.yellow().to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn highlight_json(code: &str) -> String {
        // Simple JSON syntax highlighting
        code.lines()
            .map(|line| {
                if line.contains("\"") {
                    line.cyan().to_string()
                } else if line.contains(":") {
                    line.yellow().to_string()
                } else {
                    line.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}