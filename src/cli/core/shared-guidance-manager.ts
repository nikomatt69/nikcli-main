import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * SharedGuidanceManager - Centralized guidance management for agents
 * Reduces token usage by caching and sharing guidance content between agents
 */
export class SharedGuidanceManager {
  private static instance: SharedGuidanceManager
  private guidanceCache = new Map<string, string>()
  private lastLoaded = new Map<string, Date>()
  private workingDirectory: string

  private constructor() {
    this.workingDirectory = process.cwd()
  }

  static getInstance(): SharedGuidanceManager {
    if (!SharedGuidanceManager.instance) {
      SharedGuidanceManager.instance = new SharedGuidanceManager()
    }
    return SharedGuidanceManager.instance
  }

  /**
   * Get guidance for a specific task type with intelligent caching
   */
  async getGuidanceForTask(taskType?: string): Promise<string> {
    const cacheKey = taskType || 'default'
    const lastLoad = this.lastLoaded.get(cacheKey)

    // Cache for 5 minutes
    if (lastLoad && Date.now() - lastLoad.getTime() < 300000) {
      return this.guidanceCache.get(cacheKey) || ''
    }

    let guidance = ''

    // Load only relevant guidance based on task type
    if (taskType?.includes('react') || taskType?.includes('frontend') || taskType?.includes('component')) {
      guidance += await this.loadReactGuidance()
    } else if (taskType?.includes('api') || taskType?.includes('backend') || taskType?.includes('server')) {
      guidance += await this.loadBackendGuidance()
    } else if (taskType?.includes('test') || taskType?.includes('spec')) {
      guidance += await this.loadTestingGuidance()
    } else {
      // Load minimal core guidance for general tasks
      guidance = await this.loadCoreGuidance()
    }

    this.guidanceCache.set(cacheKey, guidance)
    this.lastLoaded.set(cacheKey, new Date())

    return guidance
  }

  /**
   * Load React/Frontend specific guidance
   */
  private async loadReactGuidance(): Promise<string> {
    let guidance = await this.loadCoreGuidance()

    // Add React-specific sections from NIKOCLI.md if available
    const nikocliContent = await this.readFileIfExists('NIKOCLI.md')
    if (nikocliContent) {
      const reactSections = this.extractSections(nikocliContent, ['react', 'frontend', 'component', 'jsx'])
      if (reactSections) {
        guidance += `\n\n=== React Guidelines ===\n${reactSections}`
      }
    }

    return guidance
  }

  /**
   * Load Backend/API specific guidance
   */
  private async loadBackendGuidance(): Promise<string> {
    let guidance = await this.loadCoreGuidance()

    const nikocliContent = await this.readFileIfExists('NIKOCLI.md')
    if (nikocliContent) {
      const backendSections = this.extractSections(nikocliContent, ['api', 'backend', 'server', 'database'])
      if (backendSections) {
        guidance += `\n\n=== Backend Guidelines ===\n${backendSections}`
      }
    }

    return guidance
  }

  /**
   * Load Testing specific guidance
   */
  private async loadTestingGuidance(): Promise<string> {
    let guidance = await this.loadCoreGuidance()

    const nikocliContent = await this.readFileIfExists('NIKOCLI.md')
    if (nikocliContent) {
      const testSections = this.extractSections(nikocliContent, ['test', 'testing', 'spec'])
      if (testSections) {
        guidance += `\n\n=== Testing Guidelines ===\n${testSections}`
      }
    }

    return guidance
  }

  /**
   * Load minimal core guidance (project basics + package.json)
   */
  private async loadCoreGuidance(): Promise<string> {
    let guidance = ''

    // Load package.json for project context (always useful)
    const packageJson = await this.readFileIfExists('package.json')
    if (packageJson) {
      guidance += `=== Package Info ===\n${this.summarizePackageJson(packageJson)}\n\n`
    }

    // Load basic project info from NIKOCLI.md
    const nikocliContent = await this.readFileIfExists('NIKOCLI.md')
    if (nikocliContent) {
      const coreInfo = this.extractCoreInfo(nikocliContent)
      if (coreInfo) {
        guidance += `=== Project Context ===\n${coreInfo}\n\n`
      }
    }

    return guidance
  }

  /**
   * Extract sections from content based on keywords
   */
  private extractSections(content: string, keywords: string[]): string {
    const lines = content.split('\n')
    const relevantSections: string[] = []
    let currentSection = ''
    let sectionRelevant = false

    for (const line of lines) {
      if (line.startsWith('#')) {
        if (sectionRelevant && currentSection) {
          relevantSections.push(currentSection)
        }
        currentSection = `${line}\n`
        sectionRelevant = keywords.some((keyword) => line.toLowerCase().includes(keyword))
      } else {
        currentSection += `${line}\n`
      }
    }

    if (sectionRelevant && currentSection) {
      relevantSections.push(currentSection)
    }

    const result = relevantSections.join('\n').trim()
    return result.length > 1500 ? `${result.substring(0, 1500)}...` : result
  }

  /**
   * Extract core project information (first few sections only)
   */
  private extractCoreInfo(content: string): string {
    const lines = content.split('\n')
    const coreLines: string[] = []
    let sectionCount = 0

    for (const line of lines) {
      if (line.startsWith('# ')) {
        sectionCount++
        if (sectionCount > 3) break // Only first 3 main sections
      }
      coreLines.push(line)
    }

    const result = coreLines.join('\n').trim()
    return result.length > 800 ? `${result.substring(0, 800)}...` : result
  }

  /**
   * Summarize package.json to essential info only
   */
  private summarizePackageJson(content: string): string {
    try {
      const pkg = JSON.parse(content)
      const summary = {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        scripts: Object.keys(pkg.scripts || {}),
        dependencies: Object.keys(pkg.dependencies || {}).slice(0, 10), // Only first 10
        devDependencies: Object.keys(pkg.devDependencies || {}).slice(0, 10), // Only first 10
      }
      return JSON.stringify(summary, null, 2)
    } catch {
      return content.length > 500 ? `${content.substring(0, 500)}...` : content
    }
  }

  /**
   * Read file if it exists, return empty string if not
   */
  private async readFileIfExists(filename: string): Promise<string> {
    const filePath = path.join(this.workingDirectory, filename)
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8')
      }
    } catch (_error) {
      // Silently fail for missing files
    }
    return ''
  }

  /**
   * Clear cache (useful for testing or when files change)
   */
  clearCache(): void {
    this.guidanceCache.clear()
    this.lastLoaded.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; keys: string[] } {
    return {
      entries: this.guidanceCache.size,
      keys: Array.from(this.guidanceCache.keys()),
    }
  }
}

// Export singleton instance
export const sharedGuidanceManager = SharedGuidanceManager.getInstance()
