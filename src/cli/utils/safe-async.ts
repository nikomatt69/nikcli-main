/**
 * Safe Async Utilities - Wrapper per operazioni async con gestione errori strutturata
 * Risolve il problema di 5440+ operazioni async senza try-catch
 */

import { structuredLogger } from './structured-logger'

/**
 * Esegue una funzione async in modo sicuro con logging strutturato
 * @param fn Funzione async da eseguire
 * @param fallback Valore di fallback in caso di errore
 * @param context Contesto per il logging (nome componente/classe)
 * @returns Risultato dell'operazione o fallback
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback?: T,
  context?: string
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (error: any) {
    structuredLogger.error(context || 'Unknown', `Async operation failed: ${error.message}`)
    return fallback
  }
}

/**
 * Esegue una funzione async in modo sicuro, lancio sempre l'errore
 * @param fn Funzione async da eseguire
 * @param context Contesto per il logging
 * @returns Risultato dell'operazione
 * @throws L'errore originale se fallisce
 */
export async function safeAsyncThrow<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    structuredLogger.error(context || 'Unknown', `Async operation failed: ${error.message}`)
    throw error
  }
}

/**
 * Decorator per metodi async che cattura automaticamente gli errori
 * @param fallback Valore di fallback in caso di errore
 * @param context Contesto per il logging
 */
export function SafeAsync(fallback?: any, context?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args)
      } catch (error: any) {
        const className = target.constructor?.name || 'Unknown'
        const methodName = propertyKey
        const fullContext = context || `${className}.${methodName}`

        structuredLogger.error(fullContext, `${methodName} failed: ${error.message}`)

        return fallback
      }
    }

    return descriptor
  }
}

/**
 * Decorator per metodi async che logga ma rilancia l'errore
 * @param context Contesto per il logging
 */
export function SafeAsyncThrow(context?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args)
      } catch (error: any) {
        const className = target.constructor?.name || 'Unknown'
        const methodName = propertyKey
        const fullContext = context || `${className}.${methodName}`

        structuredLogger.error(fullContext, `${methodName} failed: ${error.message}`)

        throw error
      }
    }

    return descriptor
  }
}

/**
 * Wrapper per Promise.all con gestione errori individuale
 * @param promises Array di Promise da eseguire
 * @param fallback Valore di fallback per promesse fallite
 * @param context Contesto per il logging
 * @returns Array di risultati con fallback per errori
 */
export async function safePromiseAll<T>(
  promises: Array<() => Promise<T>>,
  fallback?: T,
  context?: string
): Promise<(T | undefined)[]> {
  try {
    const results = await Promise.all(
      promises.map(async (promise, index) => {
        try {
          return await promise()
        } catch (error: any) {
          structuredLogger.error(context || 'PromiseAll', `Promise ${index} failed: ${error.message}`)
          return fallback
        }
      })
    )
    return results
  } catch (error: any) {
    structuredLogger.error(context || 'PromiseAll', `Promise.all failed: ${error.message}`)
    return promises.map(() => fallback)
  }
}

/**
 * Esegue una funzione con timeout e gestione errori
 * @param fn Funzione da eseguire
 * @param timeout Timeout in millisecondi
 * @param fallback Valore di fallback in caso di timeout/errore
 * @param context Contesto per il logging
 */
export async function safeAsyncWithTimeout<T>(
  fn: () => Promise<T>,
  timeout: number = 30000,
  fallback?: T,
  context?: string
): Promise<T | undefined> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
    })

    return await Promise.race([fn(), timeoutPromise])
  } catch (error: any) {
    structuredLogger.error(context || 'Unknown', `Async operation with timeout failed: ${error.message}`)
    return fallback
  }
}

/**
 * Retry automatico con backoff esponenziale
 * @param fn Funzione da ritentare
 * @param maxAttempts Numero massimo di tentativi
 * @param baseDelay Delay base in millisecondi
 * @param fallback Valore di fallback finale
 * @param context Contesto per il logging
 */
export async function safeAsyncWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
  fallback?: T,
  context?: string
): Promise<T | undefined> {
  let lastError: any

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        structuredLogger.warning(context || 'RetryWrapper', `Attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  structuredLogger.error(context || 'RetryWrapper', `All retry attempts failed after ${maxAttempts} attempts: ${lastError?.message}`)

  return fallback
}
