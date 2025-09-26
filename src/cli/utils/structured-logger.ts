import { advancedUI } from '../ui/advanced-cli-ui'

export type StructuredLogLevel = 'info' | 'success' | 'warning' | 'error'

export function structuredLog(level: StructuredLogLevel, source: string, message: string): void {
  switch (level) {
    case 'success':
      advancedUI.logSuccess(message, source)
      break
    case 'warning':
      advancedUI.logWarning(message, source)
      break
    case 'error':
      advancedUI.logError(message, source)
      break
    default:
      advancedUI.logInfo(message, source)
      break
  }
}

export const structuredLogger = {
  info(source: string, message: string): void {
    structuredLog('info', source, message)
  },
  success(source: string, message: string): void {
    structuredLog('success', source, message)
  },
  warning(source: string, message: string): void {
    structuredLog('warning', source, message)
  },
  error(source: string, message: string): void {
    structuredLog('error', source, message)
  },
}
