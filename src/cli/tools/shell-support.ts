import { basename } from 'node:path'

export const SUPPORTED_SHELL_NAMES = ['bash', 'zsh', 'sh', 'dash', 'ksh', 'fish'] as const

export type SupportedShellName = (typeof SUPPORTED_SHELL_NAMES)[number]

export interface ShellConfiguration {
  name: SupportedShellName
  executable: string
  args: string[]
  displayName: string
}

export const SUPPORTED_SHELLS: Record<SupportedShellName, ShellConfiguration> = {
  bash: {
    name: 'bash',
    executable: 'bash',
    args: ['-c'],
    displayName: 'Bash',
  },
  zsh: {
    name: 'zsh',
    executable: 'zsh',
    args: ['-c'],
    displayName: 'Zsh',
  },
  sh: {
    name: 'sh',
    executable: 'sh',
    args: ['-c'],
    displayName: 'POSIX sh',
  },
  dash: {
    name: 'dash',
    executable: 'dash',
    args: ['-c'],
    displayName: 'Dash',
  },
  ksh: {
    name: 'ksh',
    executable: 'ksh',
    args: ['-c'],
    displayName: 'KornShell',
  },
  fish: {
    name: 'fish',
    executable: 'fish',
    args: ['-c'],
    displayName: 'Fish shell',
  },
}

export const DEFAULT_SHELL_NAME: SupportedShellName = 'bash'

export function isShellSupported(shellName: string): shellName is SupportedShellName {
  return (SUPPORTED_SHELL_NAMES as readonly string[]).includes(shellName)
}

export function resolveShellConfig(requestedShell?: string): ShellConfiguration {
  const normalizedShell = requestedShell?.trim().toLowerCase()

  if (normalizedShell) {
    if (isShellSupported(normalizedShell)) {
      return SUPPORTED_SHELLS[normalizedShell]
    }

    throw new Error(`Unsupported shell '${requestedShell}'. Supported shells: ${SUPPORTED_SHELL_NAMES.join(', ')}`)
  }

  const envShell = process.env.SHELL ? basename(process.env.SHELL).toLowerCase() : undefined
  if (envShell && isShellSupported(envShell)) {
    return SUPPORTED_SHELLS[envShell]
  }

  return SUPPORTED_SHELLS[DEFAULT_SHELL_NAME]
}
