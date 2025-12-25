import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { advancedUI } from '../ui/advanced-cli-ui'

export class AutoUpdateService {
  static latestVersion = ''

  static async checkAndUpdate(): Promise<boolean> {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        return false
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const currentVersion = packageJson.version
      const packageName = packageJson.name

      if (!packageName) {
        return false
      }

      const latest = execSync(`npm view ${packageName} version`, { encoding: 'utf-8' }).trim()
      AutoUpdateService.latestVersion = latest

      if (latest && latest !== currentVersion) {
        advancedUI.logInfo(`Update available: v${currentVersion} -> v${latest}`)
        execSync(`npm install ${packageName}@latest`, { stdio: 'inherit' })
        return true
      }
      return false
    } catch (error: any) {
      return false
    }
  }
}

export const autoUpdateService = new AutoUpdateService()
