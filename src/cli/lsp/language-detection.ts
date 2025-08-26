export const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".abap": "abap",
  ".bat": "bat",
  ".bib": "bibtex",
  ".bibtex": "bibtex",
  ".clj": "clojure",
  ".coffee": "coffeescript",
  ".c": "c",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".cc": "cpp",
  ".c++": "cpp",
  ".cs": "csharp",
  ".css": "css",
  ".d": "d",
  ".pas": "pascal",
  ".pascal": "pascal",
  ".diff": "diff",
  ".patch": "diff",
  ".dart": "dart",
  ".dockerfile": "dockerfile",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hrl": "erlang",
  ".fs": "fsharp",
  ".fsi": "fsharp",
  ".fsx": "fsharp",
  ".fsscript": "fsharp",
  ".gitcommit": "git-commit",
  ".gitrebase": "git-rebase",
  ".go": "go",
  ".groovy": "groovy",
  ".hbs": "handlebars",
  ".handlebars": "handlebars",
  ".hs": "haskell",
  ".html": "html",
  ".htm": "html",
  ".ini": "ini",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".json": "json",
  ".tex": "latex",
  ".latex": "latex",
  ".less": "less",
  ".lua": "lua",
  ".makefile": "makefile",
  "makefile": "makefile",
  ".md": "markdown",
  ".markdown": "markdown",
  ".m": "objective-c",
  ".mm": "objective-cpp",
  ".pl": "perl",
  ".pm": "perl6",
  ".php": "php",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".pug": "jade",
  ".jade": "jade",
  ".py": "python",
  ".r": "r",
  ".cshtml": "razor",
  ".razor": "razor",
  ".rb": "ruby",
  ".rake": "ruby",
  ".gemspec": "ruby",
  ".ru": "ruby",
  ".erb": "erb",
  ".html.erb": "erb",
  ".js.erb": "erb",
  ".css.erb": "erb",
  ".json.erb": "erb",
  ".rs": "rust",
  ".scss": "scss",
  ".sass": "sass",
  ".scala": "scala",
  ".shader": "shaderlab",
  ".sh": "shellscript",
  ".bash": "shellscript",
  ".zsh": "shellscript",
  ".ksh": "shellscript",
  ".sql": "sql",
  ".swift": "swift",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".mts": "typescript",
  ".cts": "typescript",
  ".mtsx": "typescriptreact",
  ".ctsx": "typescriptreact",
  ".xml": "xml",
  ".xsl": "xsl",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".zig": "zig",
  ".zon": "zig",
} as const;

export function detectLanguageFromExtension(filePath: string): string {
  const ext = filePath.toLowerCase().match(/\.[^.]*$/)?.[0] || '';
  return LANGUAGE_EXTENSIONS[ext] || 'plaintext';
}

export function detectLanguageFromContent(content: string, filePath?: string): string {
  // First try extension-based detection
  if (filePath) {
    const langFromExt = detectLanguageFromExtension(filePath);
    if (langFromExt !== 'plaintext') return langFromExt;
  }

  // Content-based detection patterns
  const patterns = [
    { pattern: /^#!.*\/bin\/(bash|sh|zsh)/m, language: 'shellscript' },
    { pattern: /^#!.*\/usr\/bin\/env\s+(python|python3)/m, language: 'python' },
    { pattern: /^#!.*\/usr\/bin\/env\s+node/m, language: 'javascript' },
    { pattern: /^#!.*\/usr\/bin\/env\s+ruby/m, language: 'ruby' },
    { pattern: /^\s*import\s+.+\s+from\s+['"`]/m, language: 'javascript' },
    { pattern: /^\s*from\s+\w+\s+import/m, language: 'python' },
    { pattern: /^\s*package\s+\w+/m, language: 'go' },
    { pattern: /^\s*use\s+\w+;/m, language: 'rust' },
    { pattern: /^\s*using\s+\w+;/m, language: 'csharp' },
    { pattern: /^\s*import\s+\w+\.\w+/m, language: 'java' },
    { pattern: /^\s*<\?php/m, language: 'php' },
    { pattern: /^\s*defmodule\s+\w+/m, language: 'elixir' },
  ];

  for (const { pattern, language } of patterns) {
    if (pattern.test(content)) {
      return language;
    }
  }

  return 'plaintext';
}
