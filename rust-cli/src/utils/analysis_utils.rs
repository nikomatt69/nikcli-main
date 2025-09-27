// Analysis utility functions
use std::collections::HashMap;
use std::path::Path;

pub struct AnalysisUtils;

impl AnalysisUtils {
    pub fn analyze_file_extension(path: &Path) -> Option<String> {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
    }

    pub fn categorize_file(path: &Path) -> FileCategory {
        if let Some(ext) = Self::analyze_file_extension(path) {
            match ext.as_str() {
                "rs" => FileCategory::Rust,
                "js" | "jsx" => FileCategory::JavaScript,
                "ts" | "tsx" => FileCategory::TypeScript,
                "py" => FileCategory::Python,
                "java" => FileCategory::Java,
                "cpp" | "cc" | "cxx" => FileCategory::Cpp,
                "c" => FileCategory::C,
                "go" => FileCategory::Go,
                "php" => FileCategory::Php,
                "rb" => FileCategory::Ruby,
                "swift" => FileCategory::Swift,
                "kt" => FileCategory::Kotlin,
                "scala" => FileCategory::Scala,
                "html" | "htm" => FileCategory::Html,
                "css" => FileCategory::Css,
                "scss" | "sass" => FileCategory::Scss,
                "json" => FileCategory::Json,
                "xml" => FileCategory::Xml,
                "yaml" | "yml" => FileCategory::Yaml,
                "toml" => FileCategory::Toml,
                "md" | "markdown" => FileCategory::Markdown,
                "txt" => FileCategory::Text,
                "sql" => FileCategory::Sql,
                "sh" | "bash" => FileCategory::Shell,
                "dockerfile" => FileCategory::Dockerfile,
                _ => FileCategory::Other,
            }
        } else {
            FileCategory::Other
        }
    }

    pub fn get_language_stats(files: &[&Path]) -> HashMap<String, usize> {
        let mut stats = HashMap::new();
        
        for file in files {
            let category = Self::categorize_file(file);
            let language = category.to_string();
            *stats.entry(language).or_insert(0) += 1;
        }
        
        stats
    }

    pub fn is_config_file(path: &Path) -> bool {
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            matches!(
                file_name.to_lowercase().as_str(),
                "package.json" | "cargo.toml" | "pom.xml" | "build.gradle" | 
                "requirements.txt" | "gemfile" | "composer.json" | "go.mod" |
                "pubspec.yaml" | "mix.exs" | "project.clj" | "build.sbt" |
                "pyproject.toml" | "setup.py" | "setup.cfg" | "poetry.lock" |
                "yarn.lock" | "package-lock.json" | "pnpm-lock.yaml" |
                "docker-compose.yml" | "docker-compose.yaml" | "dockerfile" |
                "makefile" | "cmakelists.txt" | "configure" | "autogen.sh" |
                "rakefile" | "gulpfile.js" | "gruntfile.js" | "webpack.config.js" |
                "tsconfig.json" | "jsconfig.json" | "babel.config.js" |
                ".gitignore" | ".gitattributes" | ".editorconfig" | ".eslintrc" |
                ".prettierrc" | ".stylelintrc" | ".browserslistrc" | ".nvmrc" |
                "tailwind.config.js" | "vite.config.js" | "rollup.config.js" |
                "jest.config.js" | "vitest.config.js" | "cypress.config.js" |
                "playwright.config.js" | "karma.conf.js" | "protractor.conf.js"
            )
        } else {
            false
        }
    }

    pub fn is_documentation_file(path: &Path) -> bool {
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            let name = file_name.to_lowercase();
            name.starts_with("readme") || 
            name.starts_with("changelog") || 
            name.starts_with("license") || 
            name.starts_with("contributing") ||
            name.starts_with("code_of_conduct") ||
            name.ends_with(".md") ||
            name.ends_with(".rst") ||
            name.ends_with(".txt") && (
                name.contains("readme") || 
                name.contains("changelog") || 
                name.contains("license")
            )
        } else {
            false
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum FileCategory {
    Rust,
    JavaScript,
    TypeScript,
    Python,
    Java,
    Cpp,
    C,
    Go,
    Php,
    Ruby,
    Swift,
    Kotlin,
    Scala,
    Html,
    Css,
    Scss,
    Json,
    Xml,
    Yaml,
    Toml,
    Markdown,
    Text,
    Sql,
    Shell,
    Dockerfile,
    Other,
}

impl std::fmt::Display for FileCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileCategory::Rust => write!(f, "Rust"),
            FileCategory::JavaScript => write!(f, "JavaScript"),
            FileCategory::TypeScript => write!(f, "TypeScript"),
            FileCategory::Python => write!(f, "Python"),
            FileCategory::Java => write!(f, "Java"),
            FileCategory::Cpp => write!(f, "C++"),
            FileCategory::C => write!(f, "C"),
            FileCategory::Go => write!(f, "Go"),
            FileCategory::Php => write!(f, "PHP"),
            FileCategory::Ruby => write!(f, "Ruby"),
            FileCategory::Swift => write!(f, "Swift"),
            FileCategory::Kotlin => write!(f, "Kotlin"),
            FileCategory::Scala => write!(f, "Scala"),
            FileCategory::Html => write!(f, "HTML"),
            FileCategory::Css => write!(f, "CSS"),
            FileCategory::Scss => write!(f, "SCSS"),
            FileCategory::Json => write!(f, "JSON"),
            FileCategory::Xml => write!(f, "XML"),
            FileCategory::Yaml => write!(f, "YAML"),
            FileCategory::Toml => write!(f, "TOML"),
            FileCategory::Markdown => write!(f, "Markdown"),
            FileCategory::Text => write!(f, "Text"),
            FileCategory::Sql => write!(f, "SQL"),
            FileCategory::Shell => write!(f, "Shell"),
            FileCategory::Dockerfile => write!(f, "Dockerfile"),
            FileCategory::Other => write!(f, "Other"),
        }
    }
}