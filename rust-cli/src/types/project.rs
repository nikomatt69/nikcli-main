use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Project type enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProjectType {
    NodeJs,
    Rust,
    Python,
    Go,
    Java,
    CSharp,
    Cpp,
    TypeScript,
    JavaScript,
    React,
    Vue,
    Angular,
    NextJs,
    NuxtJs,
    Svelte,
    Astro,
    Other(String),
}

impl std::fmt::Display for ProjectType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProjectType::NodeJs => write!(f, "nodejs"),
            ProjectType::Rust => write!(f, "rust"),
            ProjectType::Python => write!(f, "python"),
            ProjectType::Go => write!(f, "go"),
            ProjectType::Java => write!(f, "java"),
            ProjectType::CSharp => write!(f, "csharp"),
            ProjectType::Cpp => write!(f, "cpp"),
            ProjectType::TypeScript => write!(f, "typescript"),
            ProjectType::JavaScript => write!(f, "javascript"),
            ProjectType::React => write!(f, "react"),
            ProjectType::Vue => write!(f, "vue"),
            ProjectType::Angular => write!(f, "angular"),
            ProjectType::NextJs => write!(f, "nextjs"),
            ProjectType::NuxtJs => write!(f, "nuxtjs"),
            ProjectType::Svelte => write!(f, "svelte"),
            ProjectType::Astro => write!(f, "astro"),
            ProjectType::Other(name) => write!(f, "{}", name),
        }
    }
}

/// Package manager enumeration
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PackageManager {
    Npm,
    Yarn,
    Pnpm,
    Bun,
    Cargo,
    Pip,
    Poetry,
    GoMod,
    Maven,
    Gradle,
    NuGet,
    Other(String),
}

impl std::fmt::Display for PackageManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PackageManager::Npm => write!(f, "npm"),
            PackageManager::Yarn => write!(f, "yarn"),
            PackageManager::Pnpm => write!(f, "pnpm"),
            PackageManager::Bun => write!(f, "bun"),
            PackageManager::Cargo => write!(f, "cargo"),
            PackageManager::Pip => write!(f, "pip"),
            PackageManager::Poetry => write!(f, "poetry"),
            PackageManager::GoMod => write!(f, "gomod"),
            PackageManager::Maven => write!(f, "maven"),
            PackageManager::Gradle => write!(f, "gradle"),
            PackageManager::NuGet => write!(f, "nuget"),
            PackageManager::Other(name) => write!(f, "{}", name),
        }
    }
}

/// Project analysis representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAnalysis {
    // Basic project info
    pub project_type: ProjectType,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,

    // Structure
    pub file_count: u32,
    pub directory_count: u32,
    pub total_size: u64,

    // Dependencies and tools
    pub dependencies: HashMap<String, String>,
    pub dev_dependencies: HashMap<String, String>,
    pub scripts: HashMap<String, String>,

    // Analysis results
    pub complexity: ProjectComplexity,
    pub maintainability: f64,
    pub test_coverage: Option<f64>,

    // Additional metadata
    pub package_manager: Option<PackageManager>,
    pub build_tools: Vec<String>,
    pub linters: Vec<String>,
    pub formatters: Vec<String>,
    pub test_frameworks: Vec<String>,
    pub ci_cd_tools: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProjectComplexity {
    Low,
    Medium,
    High,
}

impl std::fmt::Display for ProjectComplexity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProjectComplexity::Low => write!(f, "low"),
            ProjectComplexity::Medium => write!(f, "medium"),
            ProjectComplexity::High => write!(f, "high"),
        }
    }
}

impl ProjectAnalysis {
    pub fn new(project_type: ProjectType) -> Self {
        Self {
            project_type,
            languages: Vec::new(),
            frameworks: Vec::new(),
            file_count: 0,
            directory_count: 0,
            total_size: 0,
            dependencies: HashMap::new(),
            dev_dependencies: HashMap::new(),
            scripts: HashMap::new(),
            complexity: ProjectComplexity::Low,
            maintainability: 0.0,
            test_coverage: None,
            package_manager: None,
            build_tools: Vec::new(),
            linters: Vec::new(),
            formatters: Vec::new(),
            test_frameworks: Vec::new(),
            ci_cd_tools: Vec::new(),
        }
    }
}

/// Project configuration representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub repository: Option<String>,
    pub homepage: Option<String>,
    pub keywords: Vec<String>,
    pub engines: HashMap<String, String>,
    pub os: Vec<String>,
    pub cpu: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ProjectConfig {
    pub fn new(name: String, version: String) -> Self {
        let now = Utc::now();
        Self {
            name,
            version,
            description: None,
            author: None,
            license: None,
            repository: None,
            homepage: None,
            keywords: Vec::new(),
            engines: HashMap::new(),
            os: Vec::new(),
            cpu: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }
}

/// Project file representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFile {
    pub path: String,
    pub name: String,
    pub extension: Option<String>,
    pub size: u64,
    pub language: Option<String>,
    pub is_binary: bool,
    pub is_directory: bool,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub content_hash: Option<String>,
}

impl ProjectFile {
    pub fn new(path: String, name: String, size: u64, is_directory: bool) -> Self {
        let now = Utc::now();
        Self {
            path,
            name,
            extension: None,
            size,
            language: None,
            is_binary: false,
            is_directory,
            created_at: now,
            modified_at: now,
            content_hash: None,
        }
    }
}

/// Project structure representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStructure {
    pub root_path: String,
    pub files: Vec<ProjectFile>,
    pub directories: Vec<String>,
    pub total_files: u32,
    pub total_directories: u32,
    pub total_size: u64,
    pub max_depth: u32,
    pub analyzed_at: DateTime<Utc>,
}

impl ProjectStructure {
    pub fn new(root_path: String) -> Self {
        Self {
            root_path,
            files: Vec::new(),
            directories: Vec::new(),
            total_files: 0,
            total_directories: 0,
            total_size: 0,
            max_depth: 0,
            analyzed_at: Utc::now(),
        }
    }
}

/// Project dependency representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDependency {
    pub name: String,
    pub version: String,
    pub version_range: Option<String>,
    pub is_dev: bool,
    pub is_peer: bool,
    pub is_optional: bool,
    pub description: Option<String>,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: Option<String>,
    pub vulnerabilities: Vec<DependencyVulnerability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyVulnerability {
    pub id: String,
    pub severity: VulnerabilitySeverity,
    pub title: String,
    pub description: String,
    pub cwe: Option<String>,
    pub cve: Option<String>,
    pub cvss_score: Option<f64>,
    pub published_at: Option<DateTime<Utc>>,
    pub patched_versions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum VulnerabilitySeverity {
    Low,
    Moderate,
    High,
    Critical,
}

impl std::fmt::Display for VulnerabilitySeverity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VulnerabilitySeverity::Low => write!(f, "low"),
            VulnerabilitySeverity::Moderate => write!(f, "moderate"),
            VulnerabilitySeverity::High => write!(f, "high"),
            VulnerabilitySeverity::Critical => write!(f, "critical"),
        }
    }
}

impl ProjectDependency {
    pub fn new(name: String, version: String) -> Self {
        Self {
            name,
            version,
            version_range: None,
            is_dev: false,
            is_peer: false,
            is_optional: false,
            description: None,
            homepage: None,
            repository: None,
            license: None,
            vulnerabilities: Vec::new(),
        }
    }
}

/// Project build configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectBuildConfig {
    pub build_command: Option<String>,
    pub dev_command: Option<String>,
    pub test_command: Option<String>,
    pub lint_command: Option<String>,
    pub format_command: Option<String>,
    pub output_directory: Option<String>,
    pub source_directory: Option<String>,
    pub build_tool: Option<String>,
    pub build_targets: Vec<String>,
    pub environment_variables: HashMap<String, String>,
}

impl ProjectBuildConfig {
    pub fn new() -> Self {
        Self {
            build_command: None,
            dev_command: None,
            test_command: None,
            lint_command: None,
            format_command: None,
            output_directory: None,
            source_directory: None,
            build_tool: None,
            build_targets: Vec::new(),
            environment_variables: HashMap::new(),
        }
    }
}

/// Project workspace information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectWorkspace {
    pub path: String,
    pub name: String,
    pub workspace_type: WorkspaceType,
    pub projects: Vec<ProjectInfo>,
    pub shared_dependencies: HashMap<String, String>,
    pub workspace_config: Option<WorkspaceConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkspaceType {
    Monorepo,
    MultiProject,
    SingleProject,
}

impl std::fmt::Display for WorkspaceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WorkspaceType::Monorepo => write!(f, "monorepo"),
            WorkspaceType::MultiProject => write!(f, "multi-project"),
            WorkspaceType::SingleProject => write!(f, "single-project"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub project_type: ProjectType,
    pub package_manager: Option<PackageManager>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    pub package_manager: PackageManager,
    pub hoist: bool,
    pub strict_peer_dependencies: bool,
    pub save_exact: bool,
    pub workspaces: Vec<String>,
}

impl ProjectWorkspace {
    pub fn new(path: String, name: String, workspace_type: WorkspaceType) -> Self {
        Self {
            path,
            name,
            workspace_type,
            projects: Vec::new(),
            shared_dependencies: HashMap::new(),
            workspace_config: None,
        }
    }
}

/// Project analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAnalysisResult {
    pub project_config: ProjectConfig,
    pub project_analysis: ProjectAnalysis,
    pub project_structure: ProjectStructure,
    pub dependencies: Vec<ProjectDependency>,
    pub build_config: ProjectBuildConfig,
    pub workspace: Option<ProjectWorkspace>,
    pub analysis_metadata: AnalysisMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisMetadata {
    pub analyzed_at: DateTime<Utc>,
    pub analyzer_version: String,
    pub analysis_duration: u64,
    pub tools_used: Vec<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl ProjectAnalysisResult {
    pub fn new(project_config: ProjectConfig, project_analysis: ProjectAnalysis) -> Self {
        let name = project_config.name.clone();
        Self {
            project_config,
            project_analysis,
            project_structure: ProjectStructure::new(name),
            dependencies: Vec::new(),
            build_config: ProjectBuildConfig::new(),
            workspace: None,
            analysis_metadata: AnalysisMetadata {
                analyzed_at: Utc::now(),
                analyzer_version: "1.0.0".to_string(),
                analysis_duration: 0,
                tools_used: Vec::new(),
                errors: Vec::new(),
                warnings: Vec::new(),
            },
        }
    }
}