import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import chalk from 'chalk'

export interface FileFilterConfig {
  respectGitignore: boolean
  maxFileSize: number // in bytes
  maxTotalFiles: number
  includeExtensions: string[]
  excludeExtensions: string[]
  excludeDirectories: string[]
  excludePatterns: RegExp[]
  customRules: FilterRule[]
}

export interface FilterRule {
  name: string
  pattern: string | RegExp
  type: 'include' | 'exclude'
  priority: number
  reason: string
}

export interface FilterResult {
  allowed: boolean
  reason: string
  rule?: string
  fileSize?: number
  isGitIgnored?: boolean
}

export interface IndexingStats {
  totalScanned: number
  allowed: number
  excluded: number
  gitIgnored: number
  tooLarge: number
  binaryFiles: number
  totalSizeAllowed: number
  totalSizeExcluded: number
  excludedByRule: Map<string, number>
}

/**
 * Production-ready File Filter System for NikCLI RAG Indexing
 *
 * Intelligently filters files to avoid indexing unnecessary content:
 * - Respects .gitignore rules
 * - Excludes node_modules and build artifacts
 * - Filters by file size and type
 * - Language-specific artifact detection
 * - Performance optimized with caching
 */
export class FileFilterSystem {
  private config: FileFilterConfig
  private gitignoreRules: string[] = []
  private gitignoreCache: Map<string, boolean> = new Map()
  private filterCache: Map<string, FilterResult> = new Map()
  private stats: IndexingStats

  // Built-in exclusion patterns for common artifacts
  private readonly BUILTIN_EXCLUDE_DIRS = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    'dist',
    'build',
    'out',
    'target',
    'bin',
    'obj',
    '.next',
    '.nuxt',
    '.cache',
    '.temp',
    '.tmp',
    'coverage',
    '.nyc_output',
    '__pycache__',
    '.pytest_cache',
    'venv',
    'env',
    '.env',
    '.venv',
    'vendor',
    'Pods',
    'DerivedData',
    '.gradle',
    '.idea',
    '.vscode',
    '.vs',
    'logs',
    '*.log',
    '.DS_Store',
    'Thumbs.db',
  ]

  private readonly BUILTIN_EXCLUDE_EXTENSIONS = [
    // Binary files
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.a',
    '.lib',
    // Images
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.tiff',
    '.webp',
    '.ico',
    '.svg',
    // Videos
    '.mp4',
    '.avi',
    '.mov',
    '.mkv',
    '.wmv',
    '.flv',
    '.webm',
    // Audio
    '.mp3',
    '.wav',
    '.flac',
    '.aac',
    '.ogg',
    '.wma',
    // Archives
    '.zip',
    '.tar',
    '.gz',
    '.rar',
    '.7z',
    '.bz2',
    '.xz',
    // Documents
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    // Fonts
    '.ttf',
    '.otf',
    '.woff',
    '.woff2',
    '.eot',
    // Lock files
    '.lock',
    // Database files
    '.db',
    '.sqlite',
    '.sqlite3',
    // Cache files
    '.cache',
    '.temp',
    '.tmp',
  ]

  private readonly BUILTIN_EXCLUDE_PATTERNS = [
    // Log files
    /\.log$/i,
    /\.log\.\d+$/i,
    // Backup files
    /~$/,
    /\.bak$/i,
    /\.backup$/i,
    /\.old$/i,
    // Temporary files
    /\.tmp$/i,
    /\.temp$/i,
    /^#.*#$/,
    /\.#.*$/,
    // OS files
    /^\.DS_Store$/,
    /^Thumbs\.db$/i,
    /^desktop\.ini$/i,
    // Editor files
    /\.swp$/,
    /\.swo$/,
    /\.orig$/,
    // Build artifacts by pattern
    /\.(min|bundle|chunk)\.(js|css)$/i,
    /\.(d\.ts\.map|js\.map|css\.map)$/i,
    // Test coverage
    /lcov\.info$/,
    /coverage\.xml$/,
    // Package manager files
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /Cargo\.lock$/,
    /Pipfile\.lock$/,
    /poetry\.lock$/,
    /Gemfile\.lock$/,
    // Generated files
    /\.generated\./,
    /\.auto\./,
    /^generated_/,
    // Large data files
    /\.csv$/i,
    /\.json$/i, // Only large JSON files should be excluded by size
    /\.xml$/i, // Only large XML files should be excluded by size
  ]

  private readonly INCLUDE_EXTENSIONS = [
    // Source code
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.py',
    '.pyw',
    '.py3',
    '.java',
    '.kt',
    '.scala',
    '.cpp',
    '.cxx',
    '.cc',
    '.c',
    '.h',
    '.hpp',
    '.hxx',
    '.rs',
    '.go',
    '.rb',
    '.php',
    '.swift',
    '.m',
    '.mm',
    '.cs',
    '.fs',
    '.vb',
    '.dart',
    '.elm',
    '.ex',
    '.exs',
    '.clj',
    '.cljs',
    '.hs',
    '.ml',
    '.mli',
    '.f90',
    '.f95',
    // Web technologies
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.vue',
    '.svelte',
    '.astro',
    // Configuration
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.conf',
    '.config',
    '.env',
    '.env.example',
    '.env.local',
    '.env.production',
    // Documentation
    '.md',
    '.mdx',
    '.rst',
    '.txt',
    '.adoc',
    // Scripts
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.bat',
    '.cmd',
    // Data formats (small files only)
    '.graphql',
    '.gql',
    '.proto',
    // Build configs
    '.dockerfile',
    '.dockerignore',
    '.gitignore',
    '.gitattributes',
    'Makefile',
    'CMakeLists.txt',
    'build.gradle',
    'pom.xml',
    'package.json',
    'tsconfig.json',
    'webpack.config.js',
    'vite.config.js',
  ]

  constructor(projectRoot: string, config?: Partial<FileFilterConfig>) {
    this.config = {
      respectGitignore: true,
      maxFileSize: 1024 * 1024, // 1MB
      maxTotalFiles: 10000,
      includeExtensions: this.INCLUDE_EXTENSIONS,
      excludeExtensions: this.BUILTIN_EXCLUDE_EXTENSIONS,
      excludeDirectories: this.BUILTIN_EXCLUDE_DIRS,
      excludePatterns: this.BUILTIN_EXCLUDE_PATTERNS,
      customRules: [],
      ...config,
    }

    this.stats = this.initializeStats()
    this.loadGitignoreRules(projectRoot)
  }

  /**
   * Check if a file should be included in indexing
   */
  shouldIncludeFile(filePath: string, projectRoot: string): FilterResult {
    const cacheKey = relative(projectRoot, filePath)
    const cached = this.filterCache.get(cacheKey)
    if (cached) {
      return cached
    }

    this.stats.totalScanned++

    const result = this.evaluateFile(filePath, projectRoot)
    this.filterCache.set(cacheKey, result)

    // Update stats
    if (result.allowed) {
      this.stats.allowed++
      if (result.fileSize) {
        this.stats.totalSizeAllowed += result.fileSize
      }
    } else {
      this.stats.excluded++
      if (result.fileSize) {
        this.stats.totalSizeExcluded += result.fileSize
      }

      // Track exclusion reasons
      const reason = result.rule || result.reason
      this.stats.excludedByRule.set(reason, (this.stats.excludedByRule.get(reason) || 0) + 1)

      if (result.isGitIgnored) this.stats.gitIgnored++
      if (result.reason.includes('too large')) this.stats.tooLarge++
      if (result.reason.includes('binary')) this.stats.binaryFiles++
    }

    return result
  }

  /**
   * Get list of files to index from a directory
   */
  getFilesToIndex(projectRoot: string): string[] {
    const filesToIndex: string[] = []
    const visited = new Set<string>()

    const scanDirectory = (dirPath: string, depth: number = 0): void => {
      // Prevent infinite recursion and excessive depth
      if (depth > 10 || visited.has(dirPath)) return
      visited.add(dirPath)

      // Check if directory should be excluded
      const dirName = basename(dirPath)
      if (this.isDirectoryExcluded(dirName, dirPath, projectRoot)) {
        return
      }

      try {
        const items = require('node:fs').readdirSync(dirPath, { withFileTypes: true })

        for (const item of items) {
          if (filesToIndex.length >= this.config.maxTotalFiles) {
            console.log(chalk.yellow(`⚠️ Reached maximum file limit (${this.config.maxTotalFiles})`))
            return
          }

          const fullPath = join(dirPath, item.name)

          if (item.isDirectory()) {
            scanDirectory(fullPath, depth + 1)
          } else if (item.isFile()) {
            const filterResult = this.shouldIncludeFile(fullPath, projectRoot)
            if (filterResult.allowed) {
              filesToIndex.push(fullPath)
            }
          }
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Cannot read directory ${dirPath}: ${error}`))
      }
    }

    console.log(chalk.blue('📁 Scanning project for indexable files...'))
    const startTime = Date.now()

    scanDirectory(projectRoot)

    const duration = Date.now() - startTime
    console.log(chalk.green(`✅ Scanned ${this.stats.totalScanned} files in ${duration}ms`))
    console.log(chalk.gray(`   Included: ${this.stats.allowed}, Excluded: ${this.stats.excluded}`))
    console.log(chalk.gray(`   Total size to index: ${this.formatFileSize(this.stats.totalSizeAllowed)}`))

    return filesToIndex
  }

  /**
   * Evaluate a single file against all filter rules
   */
  private evaluateFile(filePath: string, projectRoot: string): FilterResult {
    const fileName = basename(filePath)
    const fileExt = extname(filePath).toLowerCase()
    const relativePath = relative(projectRoot, filePath)

    try {
      const stats = statSync(filePath)
      const fileSize = stats.size

      // 1. Check file size
      if (fileSize > this.config.maxFileSize) {
        return {
          allowed: false,
          reason: `File too large (${this.formatFileSize(fileSize)})`,
          rule: 'size_limit',
          fileSize,
        }
      }

      // 2. Check if binary file
      if (this.isBinaryFile(filePath, fileSize)) {
        return {
          allowed: false,
          reason: 'Binary file detected',
          rule: 'binary_detection',
          fileSize,
        }
      }

      // 3. Check custom rules (highest priority)
      for (const rule of this.config.customRules.sort((a, b) => b.priority - a.priority)) {
        const matches =
          typeof rule.pattern === 'string' ? relativePath.includes(rule.pattern) : rule.pattern.test(relativePath)

        if (matches) {
          return {
            allowed: rule.type === 'include',
            reason: rule.reason,
            rule: rule.name,
            fileSize,
          }
        }
      }

      // 4. Check gitignore rules
      if (this.config.respectGitignore && this.isGitIgnored(relativePath)) {
        return {
          allowed: false,
          reason: 'Excluded by .gitignore',
          rule: 'gitignore',
          fileSize,
          isGitIgnored: true,
        }
      }

      // 5. Check built-in exclude patterns
      for (const pattern of this.config.excludePatterns) {
        if (pattern.test(fileName) || pattern.test(relativePath)) {
          return {
            allowed: false,
            reason: `Matches exclude pattern: ${pattern.source}`,
            rule: 'exclude_pattern',
            fileSize,
          }
        }
      }

      // 6. Check file extension exclusions
      if (this.config.excludeExtensions.includes(fileExt)) {
        return {
          allowed: false,
          reason: `Excluded extension: ${fileExt}`,
          rule: 'exclude_extension',
          fileSize,
        }
      }

      // 7. Check file extension inclusions
      if (this.config.includeExtensions.length > 0 && !this.config.includeExtensions.includes(fileExt)) {
        // Special handling for extensionless files that might be important
        if (fileExt === '' && this.isImportantExtensionlessFile(fileName)) {
          return {
            allowed: true,
            reason: 'Important extensionless file',
            rule: 'important_file',
            fileSize,
          }
        }

        return {
          allowed: false,
          reason: `Extension not in include list: ${fileExt || 'no extension'}`,
          rule: 'extension_not_included',
          fileSize,
        }
      }

      // 8. Final content-based checks for specific file types
      if (fileExt === '.json' || fileExt === '.xml') {
        if (fileSize > 100000) {
          // 100KB for data files
          return {
            allowed: false,
            reason: `Large data file (${this.formatFileSize(fileSize)})`,
            rule: 'large_data_file',
            fileSize,
          }
        }
      }

      // File passes all checks
      return {
        allowed: true,
        reason: 'Passed all filter checks',
        fileSize,
      }
    } catch (error) {
      return {
        allowed: false,
        reason: `Cannot access file: ${error}`,
        rule: 'access_error',
      }
    }
  }

  /**
   * Check if directory should be excluded
   */
  private isDirectoryExcluded(dirName: string, dirPath: string, projectRoot: string): boolean {
    const relativePath = relative(projectRoot, dirPath)

    // Check built-in exclusions
    for (const excludeDir of this.config.excludeDirectories) {
      if (excludeDir.includes('*')) {
        // Pattern matching for wildcard directories
        const pattern = new RegExp(excludeDir.replace(/\*/g, '.*'))
        if (pattern.test(dirName) || pattern.test(relativePath)) {
          return true
        }
      } else if (dirName === excludeDir || relativePath.includes(excludeDir)) {
        return true
      }
    }

    // Check gitignore for directories
    if (this.config.respectGitignore && this.isGitIgnored(relativePath + '/')) {
      return true
    }

    // Check custom rules
    for (const rule of this.config.customRules) {
      if (rule.type === 'exclude') {
        const matches =
          typeof rule.pattern === 'string' ? relativePath.includes(rule.pattern) : rule.pattern.test(relativePath)

        if (matches) return true
      }
    }

    return false
  }

  /**
   * Load and parse .gitignore rules
   */
  private loadGitignoreRules(projectRoot: string): void {
    const gitignorePath = join(projectRoot, '.gitignore')

    if (!existsSync(gitignorePath)) {
      console.log(chalk.gray('No .gitignore found, using built-in exclusions only'))
      return
    }

    try {
      const content = readFileSync(gitignorePath, 'utf-8')
      this.gitignoreRules = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          // Convert gitignore patterns to match our needs
          let pattern = line
          if (pattern.startsWith('/')) pattern = pattern.slice(1)
          if (pattern.endsWith('/')) pattern = pattern.slice(0, -1)
          return pattern
        })

      if (!process.env.NIKCLI_QUIET_STARTUP) {
        console.log(chalk.gray(`📋 Loaded ${this.gitignoreRules.length} .gitignore rules`))
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to read .gitignore: ${error}`))
    }
  }

  /**
   * Check if file is ignored by .gitignore rules
   */
  private isGitIgnored(relativePath: string): boolean {
    const cacheKey = relativePath
    const cached = this.gitignoreCache.get(cacheKey)
    if (cached !== undefined) return cached

    // Simple gitignore pattern matching
    // In production, you might want to use a dedicated gitignore library
    let isIgnored = false

    for (const rule of this.gitignoreRules) {
      if (rule.includes('*')) {
        // Wildcard pattern
        const pattern = new RegExp(rule.replace(/\*/g, '.*').replace(/\./g, '\\.'))
        if (pattern.test(relativePath)) {
          isIgnored = true
          break
        }
      } else if (relativePath === rule || relativePath.startsWith(rule + '/') || relativePath.includes('/' + rule)) {
        isIgnored = true
        break
      }
    }

    this.gitignoreCache.set(cacheKey, isIgnored)
    return isIgnored
  }

  /**
   * Detect binary files using multiple heuristics
   */
  private isBinaryFile(filePath: string, fileSize: number): boolean {
    const _fileName = basename(filePath)
    const fileExt = extname(filePath).toLowerCase()

    // Known binary extensions
    if (this.BUILTIN_EXCLUDE_EXTENSIONS.includes(fileExt)) {
      return true
    }

    // File size heuristic (very large files are likely binary)
    if (fileSize > 10 * 1024 * 1024) {
      // 10MB
      return true
    }

    // Content-based detection for smaller files
    if (fileSize < 1024) {
      // Only check small files for performance
      try {
        const buffer = readFileSync(filePath, { encoding: null })
        const slice = buffer.slice(0, Math.min(512, buffer.length))

        // Check for null bytes (strong indicator of binary)
        for (let i = 0; i < slice.length; i++) {
          if (slice[i] === 0) return true
        }

        // Check for high percentage of non-printable characters
        let nonPrintable = 0
        for (let i = 0; i < slice.length; i++) {
          const byte = slice[i]
          if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            nonPrintable++
          }
        }

        return nonPrintable / slice.length > 0.3 // 30% threshold
      } catch {
        // If we can't read the file, assume it's binary
        return true
      }
    }

    return false
  }

  /**
   * Check if extensionless file is important (like Dockerfile, Makefile, etc.)
   */
  private isImportantExtensionlessFile(fileName: string): boolean {
    const importantFiles = [
      'Dockerfile',
      'Makefile',
      'Rakefile',
      'Gemfile',
      'Procfile',
      'Vagrantfile',
      'Gruntfile',
      'gulpfile',
      'webpack.config',
      'rollup.config',
      'vite.config',
      'jest.config',
      'babel.config',
      'LICENSE',
      'README',
      'CHANGELOG',
      'CONTRIBUTING',
      'AUTHORS',
    ]

    return importantFiles.some(
      (important) => fileName === important || fileName.toLowerCase() === important.toLowerCase()
    )
  }

  /**
   * Format file size for human reading
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * Initialize statistics tracking
   */
  private initializeStats(): IndexingStats {
    return {
      totalScanned: 0,
      allowed: 0,
      excluded: 0,
      gitIgnored: 0,
      tooLarge: 0,
      binaryFiles: 0,
      totalSizeAllowed: 0,
      totalSizeExcluded: 0,
      excludedByRule: new Map(),
    }
  }

  /**
   * Get current filtering statistics
   */
  getStats(): IndexingStats {
    return { ...this.stats, excludedByRule: new Map(this.stats.excludedByRule) }
  }

  /**
   * Log detailed filtering statistics
   */
  logStats(): void {
    const stats = this.getStats()

    console.log(chalk.blue.bold('\n📊 File Filtering Statistics'))
    console.log(chalk.gray('═'.repeat(50)))

    console.log(chalk.cyan('Overview:'))
    console.log(`  Total Scanned: ${stats.totalScanned.toLocaleString()}`)
    console.log(
      `  Included: ${stats.allowed.toLocaleString()} (${((stats.allowed / stats.totalScanned) * 100).toFixed(1)}%)`
    )
    console.log(
      `  Excluded: ${stats.excluded.toLocaleString()} (${((stats.excluded / stats.totalScanned) * 100).toFixed(1)}%)`
    )

    console.log(chalk.cyan('\nSize Analysis:'))
    console.log(`  Total Size Included: ${this.formatFileSize(stats.totalSizeAllowed)}`)
    console.log(`  Total Size Excluded: ${this.formatFileSize(stats.totalSizeExcluded)}`)
    console.log(
      `  Space Saved: ${this.formatFileSize(stats.totalSizeExcluded)} (${((stats.totalSizeExcluded / (stats.totalSizeAllowed + stats.totalSizeExcluded)) * 100).toFixed(1)}%)`
    )

    console.log(chalk.cyan('\nExclusion Breakdown:'))
    console.log(`  Git Ignored: ${stats.gitIgnored.toLocaleString()}`)
    console.log(`  Too Large: ${stats.tooLarge.toLocaleString()}`)
    console.log(`  Binary Files: ${stats.binaryFiles.toLocaleString()}`)

    if (stats.excludedByRule.size > 0) {
      console.log(chalk.cyan('\nTop Exclusion Rules:'))
      const sortedRules = Array.from(stats.excludedByRule.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)

      for (const [rule, count] of sortedRules) {
        console.log(`  ${rule}: ${count.toLocaleString()}`)
      }
    }
  }

  /**
   * Add custom filtering rule
   */
  addCustomRule(rule: FilterRule): void {
    this.config.customRules.push(rule)
    this.filterCache.clear() // Clear cache when rules change
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<FileFilterConfig>): void {
    this.config = { ...this.config, ...updates }
    this.filterCache.clear() // Clear cache when config changes
    console.log(chalk.blue('🔧 File filter configuration updated'))
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.filterCache.clear()
    this.gitignoreCache.clear()
    console.log(chalk.green('✅ File filter caches cleared'))
  }
}

/**
 * Create a production-ready file filter with sensible defaults
 */
export function createFileFilter(projectRoot: string, config?: Partial<FileFilterConfig>): FileFilterSystem {
  return new FileFilterSystem(projectRoot, config)
}

// Export default instance factory
export default createFileFilter
