// Global interrupt flag for ESC key cancellation
// Used by long-running operations that don't use AbortController (like AI generateResponse)

let interruptRequested = false

export function setInterruptFlag(value: boolean = true): void {
  interruptRequested = value
}

export function isInterruptRequested(): boolean {
  return interruptRequested
}

export function clearInterruptFlag(): void {
  interruptRequested = false
}
