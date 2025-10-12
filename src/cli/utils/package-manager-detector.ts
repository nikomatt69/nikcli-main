import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkingDirectory } from './working-dir'

export interface PackageManagerInfo {
  name: 'pnpm' | 'yarn' | 'bun' | 'npm'
  lockfile: string
  installCmd: string
  addCmd: string
  removeCmd: string
  runCmd: string
  execCmd: string
}

const PACKAGE_MANAGERS: Record<'pnpm' | 'yarn' | 'bun' | 'npm', PackageManagerInfo> = {
  pnpm: {
    name: 'pnpm',
    lockfile: 'pnpm-lock.yaml',
    installCmd: 'pnpm install',
    addCmd: 'pnpm add',
    removeCmd: 'pnpm remove',
    runCmd: 'pnpm run',
    execCmd: 'pnpm exec',
  },
  yarn: {
    name: 'yarn',
    lockfile: 'yarn.lock',
    installCmd: 'yarn install',
    addCmd: 'yarn add',
    removeCmd: 'yarn remove',
    runCmd: 'yarn run',
    execCmd: 'yarn exec',
  },
  bun: {
    name: 'bun',
    lockfile: 'bun.lockb',
    installCmd: 'bun install',
    addCmd: 'bun add',
    removeCmd: 'bun remove',
    runCmd: 'bun run',
    execCmd: 'bun exec',
  },
  npm: {
    name: 'npm',
    lockfile: 'package-lock.json',
    installCmd: 'npm install',
    addCmd: 'npm install',
    removeCmd: 'npm uninstall',
    runCmd: 'npm run',
    execCmd: 'npx',
  },
}

export class PackageManagerDetector {
  private cachedDetection: PackageManagerInfo | null
  private workingDirectory: string

  constructor(workingDirectory: string = getWorkingDirectory()) {
    this.cachedDetection = null
    this.workingDirectory = workingDirectory
  }

  detect(): PackageManagerInfo {
    if (this.cachedDetection) {
      return this.cachedDetection
    }

    const detectionOrder = ['pnpm', 'yarn', 'bun', 'npm'] as const
    for (const pm of detectionOrder) {
      const info = PACKAGE_MANAGERS[pm]
      const lockfilePath = join(this.workingDirectory, info.lockfile)
      if (existsSync(lockfilePath)) {
        this.cachedDetection = info
        return info
      }
    }

    const packageJsonPath = join(this.workingDirectory, 'package.json')
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        if (packageJson.packageManager) {
          const pmName = String(packageJson.packageManager).split('@')[0]
          if ((PACKAGE_MANAGERS as any)[pmName]) {
            const detected: PackageManagerInfo = (PACKAGE_MANAGERS as any)[pmName]
            this.cachedDetection = detected
            return detected
          }
        }
      } catch (_error) {
        // ignore
      }
    }

    const fallback: PackageManagerInfo = PACKAGE_MANAGERS.npm
    this.cachedDetection = fallback
    return fallback
  }

  getInstallCommand(packages?: string[], dev: boolean = false): string {
    const pm = this.detect()
    if (!packages || packages.length === 0) {
      return pm.installCmd
    }
    const devFlag = dev ? (pm.name === 'npm' ? ' --save-dev' : ' -D') : ''
    return `${pm.addCmd}${devFlag} ${packages.join(' ')}`
  }

  getRemoveCommand(packages: string[]): string {
    const pm = this.detect()
    return `${pm.removeCmd} ${packages.join(' ')}`
  }

  getRunCommand(script: string): string {
    const pm = this.detect()
    return `${pm.runCmd} ${script}`
  }

  getExecCommand(command: string): string {
    const pm = this.detect()
    return `${pm.execCmd} ${command}`
  }

  getPackageManagerName(): PackageManagerInfo['name'] {
    return this.detect().name
  }

  getPackageManagerInfo(): PackageManagerInfo {
    return this.detect()
  }

  clearCache(): void {
    this.cachedDetection = null
  }

  getContextString(): string {
    const pm = this.detect()
    return `Package Manager: ${pm.name}
Commands:
- Install dependencies: ${pm.installCmd}
- Add package: ${pm.addCmd} <package>
- Add dev package: ${pm.addCmd} -D <package>
- Remove package: ${pm.removeCmd} <package>
- Run script: ${pm.runCmd} <script>
- Execute binary: ${pm.execCmd} <command>

IMPORTANT: Always use ${pm.name} commands in this project. Do not use other package managers.`
  }
}

export const packageManagerDetector = new PackageManagerDetector()
