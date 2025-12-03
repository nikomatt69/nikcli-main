import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { bunSpawn } from '../utils/bun-compat'

export interface MenubarStatus {
  running: boolean
  pid?: number
  binary?: string
  message?: string
  startedAt?: number
}

interface BinaryTarget {
  command: string
  args: string[]
  displayName: string
}

interface PidRecord {
  pid: number
  binary: string
  startedAt: number
}

// Define a minimal interface for the Bun subprocess
interface BunSubprocess {
  pid: number
  kill: () => void
  exited: Promise<number>
  unref: () => void
}

const PID_FILE = path.join(os.homedir(), '.nikcli', 'menubar.pid')

function ensureConfigDir(): void {
  const dir = path.dirname(PID_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readPidRecord(): PidRecord | null {
  try {
    if (!fs.existsSync(PID_FILE)) return null
    const raw = fs.readFileSync(PID_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.pid === 'number') {
      return parsed as PidRecord
    }
  } catch (_error) {
    return null
  }
  return null
}

function writePidRecord(record: PidRecord): void {
  ensureConfigDir()
  fs.writeFileSync(PID_FILE, JSON.stringify(record), 'utf8')
}

function clearPidRecord(): void {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE)
    }
  } catch (_error) {
    // ignore
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (_error) {
    return false
  }
}

function resolveProjectRoot(): string {
  let current = import.meta.dir
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return process.cwd()
}

function resolveBinary(): BinaryTarget | null {
  const root = resolveProjectRoot()

  const envPath = process.env.NIKCLI_MENUBAR_BIN
  if (envPath && fs.existsSync(envPath)) {
    return { command: envPath, args: [], displayName: envPath }
  }

  const bundlePath = path.join(
    root,
    'src-tauri',
    'target',
    'release',
    'bundle',
    'macos',
    'NikCLI Menubar.app',
    'Contents',
    'MacOS',
    'nikcli-menubar'
  )
  if (fs.existsSync(bundlePath)) {
    return { command: bundlePath, args: [], displayName: bundlePath }
  }

  const releaseBinary = path.join(root, 'src-tauri', 'target', 'release', 'nikcli-menubar')
  if (fs.existsSync(releaseBinary)) {
    return { command: releaseBinary, args: [], displayName: releaseBinary }
  }

  const manifest = path.join(root, 'src-tauri', 'Cargo.toml')
  if (fs.existsSync(manifest)) {
    return {
      command: 'cargo',
      args: ['run', '--manifest-path', manifest],
      displayName: 'cargo run --manifest-path src-tauri/Cargo.toml',
    }
  }

  return null
}

export class TauriMenubarLauncher {
  private child: BunSubprocess | null = null

  isSupported(): boolean {
    return process.platform === 'darwin'
  }

  async isRunning(): Promise<MenubarStatus> {
    const record = readPidRecord()
    if (record && processAlive(record.pid)) {
      return { running: true, pid: record.pid, binary: record.binary, startedAt: record.startedAt }
    }

    if (record && !processAlive(record.pid)) {
      clearPidRecord()
    }

    if (this.child?.pid && processAlive(this.child.pid)) {
      return { running: true, pid: this.child.pid }
    }

    return { running: false }
  }

  async start(): Promise<MenubarStatus> {
    if (!this.isSupported()) {
      return { running: false, message: 'Menubar is only available on macOS' }
    }

    const current = await this.isRunning()
    if (current.running) {
      return { ...current, message: 'Menubar is already running' }
    }

    const binary = resolveBinary()
    if (!binary) {
      return {
        running: false,
        message:
          'Menubar binary not found. Build it with "bun run menubar:build" or set NIKCLI_MENUBAR_BIN to the compiled app.',
      }
    }

    let child: BunSubprocess

    try {
      child = bunSpawn([binary.command, ...binary.args], {
        stdout: 'ignore',
        stderr: 'ignore',
        stdin: 'ignore',
        env: { ...process.env, NIKCLI_MENUBAR: '1' },
      })
    } catch (error: any) {
      return { running: false, message: `Unable to start menubar: ${error?.message || error}` }
    }

    if (!child.pid) {
      return { running: false, message: 'Menubar process did not start' }
    }

    // Unref the process so it can run independently
    if (child.unref) {
      child.unref()
    }
    this.child = child

    if (child.pid) {
      writePidRecord({ pid: child.pid, binary: binary.displayName, startedAt: Date.now() })
    }

    return { running: true, pid: child.pid, binary: binary.displayName, message: 'Menubar started' }
  }

  async stop(): Promise<MenubarStatus> {
    const record = readPidRecord()
    const pid = record?.pid || this.child?.pid

    if (!pid) {
      clearPidRecord()
      return { running: false, message: 'Menubar is not running' }
    }

    if (!processAlive(pid)) {
      clearPidRecord()
      this.child = null
      return { running: false, pid, message: 'Menubar was not running' }
    }

    try {
      process.kill(pid, 'SIGTERM')
      clearPidRecord()
      this.child = null
      return { running: false, pid, message: 'Menubar stopped' }
    } catch (error: any) {
      return { running: true, pid, message: `Unable to stop menubar: ${error?.message || error}` }
    }
  }

  async status(): Promise<MenubarStatus> {
    return this.isRunning()
  }
}

export const menubarLauncher = new TauriMenubarLauncher()
