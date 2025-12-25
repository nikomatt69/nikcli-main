import * as fs from 'node:fs'
import * as path from 'node:path'
import chalk from 'chalk'

export interface InstallResult {
  success: boolean
  name?: string
  id?: string
  path?: string
  error?: string
}

/**
 * Plugin Install Wizard - handles plugin installation from various sources
 */
export class PluginInstallWizard {
  /**
   * Install a plugin from a source (local path or git URL)
   */
  async install(source: string): Promise<InstallResult> {
    console.log(chalk.cyan.bold('\n📦 Plugin Installation\n'))
    console.log(chalk.gray(`Source: ${source}`))

    try {
      // Determine source type
      if (this.isGitUrl(source)) {
        return await this.installFromGit(source)
      } else if (this.isLocalPath(source)) {
        return await this.installFromPath(source)
      } else {
        return { success: false, error: 'Unknown source format' }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  /**
   * Check if source is a git URL
   */
  private isGitUrl(source: string): boolean {
    return (
      source.startsWith('git@') ||
      source.startsWith('https://github.com/') ||
      source.startsWith('https://gitlab.com/') ||
      source.startsWith('https://bitbucket.org/')
    )
  }

  /**
   * Check if source is a local path
   */
  private isLocalPath(source: string): boolean {
    return fs.existsSync(source) || path.isAbsolute(source) || source.startsWith('./') || source.startsWith('../')
  }

  /**
   * Install from local path
   */
  private async installFromPath(source: string): Promise<InstallResult> {
    const resolvedPath = path.resolve(process.cwd(), source)
    console.log(chalk.gray(`Resolved path: ${resolvedPath}`))

    // Check if path exists
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Path does not exist: ${resolvedPath}` }
    }

    // Check if it's a directory
    if (!fs.statSync(resolvedPath).isDirectory()) {
      return { success: false, error: `Path is not a directory: ${resolvedPath}` }
    }

    // Check for nikcli-plugin.json
    const manifestPath = path.join(resolvedPath, 'nikcli-plugin.json')
    if (!fs.existsSync(manifestPath)) {
      return { success: false, error: 'nikcli-plugin.json not found in directory' }
    }

    // Read and parse manifest
    let manifest: { metadata: { id: string; name: string } }
    try {
      const content = await fs.promises.readFile(manifestPath, 'utf-8')
      manifest = JSON.parse(content)
    } catch (error) {
      return { success: false, error: `Failed to parse nikcli-plugin.json: ${(error as Error).message}` }
    }

    // Validate manifest
    if (!manifest.metadata?.id || !manifest.metadata?.name) {
      return { success: false, error: 'Invalid manifest: missing id or name' }
    }

    // Load the plugin
    const { pluginManager } = await import('../../core/plugin-manager')
    const plugin = await pluginManager.loadPlugin(resolvedPath, { autoActivate: true })

    if (plugin) {
      console.log(chalk.green('\n✓ Plugin installed successfully!'))
      console.log(chalk.cyan(`Name: ${manifest.metadata.name}`))
      console.log(chalk.cyan(`ID: ${manifest.metadata.id}`))
      return {
        success: true,
        name: manifest.metadata.name,
        id: manifest.metadata.id,
        path: resolvedPath,
      }
    }

    return { success: false, error: 'Failed to load plugin' }
  }

  /**
   * Install from git URL
   */
  private async installFromGit(source: string): Promise<InstallResult> {
    console.log(chalk.gray('\nCloning repository...'))

    // Create temp directory
    const tempDir = path.join(process.cwd(), '.nikcli', 'temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Generate unique directory name
    const repoName = this.getRepoNameFromGitUrl(source)
    const cloneDir = path.join(tempDir, `plugin-${Date.now()}-${repoName}`)

    try {
      // Clone the repository
      const { execSync } = await import('node:child_process')
      execSync(`git clone ${source} "${cloneDir}"`, {
        stdio: 'inherit',
      })
      console.log(chalk.gray('Repository cloned'))

      // Install npm dependencies if package.json exists
      const packageJsonPath = path.join(cloneDir, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        console.log(chalk.gray('Installing dependencies...'))
        execSync('npm install', { cwd: cloneDir, stdio: 'inherit' })
      }

      // Install the plugin
      return await this.installFromPath(cloneDir)
    } catch (error) {
      return { success: false, error: `Failed to install from git: ${(error as Error).message}` }
    } finally {
      // Clean up temp directory
      try {
        fs.rmSync(cloneDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Extract repository name from git URL
   */
  private getRepoNameFromGitUrl(url: string): string {
    // Handle git@ URLs
    if (url.startsWith('git@')) {
      const parts = url.split(':')[1].split('/')
      return parts[parts.length - 1].replace('.git', '')
    }

    // Handle HTTPS URLs
    const match = url.match(/\/([^/]+?)(?:\.git)?$/)
    return match ? match[1] : 'plugin'
  }
}
