import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export class AutoUpdateService {
  static latestVersion = ''
  static updateAvailable = false
  static installCommand = ''

  static async checkAndUpdate(): Promise<string> {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        return ''
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const currentVersion = packageJson.version
      const packageName = packageJson.name

      if (!packageName) {
        return ''
      }

      const latest = execSync(`npm view ${packageName} version`, { encoding: 'utf-8' }).trim()
      AutoUpdateService.latestVersion = latest

      if (latest && latest !== currentVersion) {
        AutoUpdateService.updateAvailable = true
        const pkgManager = AutoUpdateService.detectPackageManager()
        AutoUpdateService.installCommand = pkgManager === 'bun'
          ? `bun add -g ${packageName}@latest`
          : `npm install -g ${packageName}@latest`
        return `v${currentVersion} → v${latest} | Run: ${AutoUpdateService.installCommand}`
      }
      return ''
    } catch {
      return ''
    }
  }

  private static detectPackageManager(): 'bun' | 'npm' | null {
    try {
      execSync('bun --version', { encoding: 'utf-8' })
      return 'bun'
    } catch {
      try {
        execSync('npm --version', { encoding: 'utf-8' })
        return 'npm'
      } catch {
        return null
      }
    }
  }
}

export const autoUpdateService = new AutoUpdateService()
