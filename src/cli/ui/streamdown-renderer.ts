import chalk from 'chalk'
import * as readline from 'readline'

/**
 * Stream renderer for the CLI that attempts to use Streamdown when available.
 *
 * Notes:
 * - The `streamdown` package is primarily a React component for web UIs.
 *   There is currently no official TTY renderer export. We therefore try a
 *   dynamic import of potential node/terminal targets and gracefully fall back
 *   to a minimal terminal renderer that prints chunks progressively.
 * - This keeps the rest of the CLI untouched; only the streaming path calls
 *   through this adapter.
 */
export async function renderChatStreamToTerminal(
  stream: AsyncGenerator<string, void, unknown>,
  options: {
    isCancelled?: () => boolean
    enableMinimalRerender?: boolean
  } = {}
): Promise<string> {
  const isCancelled = options.isCancelled || (() => false)

  // Try to dynamically import any possible Streamdown terminal/SSR adapter.
  // If none is available, we use our fallback.
  let streamdownTerminal: any | null = null
  try {
    // Hypothetical future entry points; will be ignored if not present.
    // Use non-literal dynamic import targets to avoid TS module resolution errors.
    const termPath: string = 'streamdown/terminal'
    const nodePath: string = 'streamdown/node'
    streamdownTerminal =
      (await import(termPath).catch(() => null)) || (await import(nodePath).catch(() => null)) || null
  } catch {
    streamdownTerminal = null
  }

  // If a terminal adapter ever becomes available, use it.
  if (streamdownTerminal && typeof streamdownTerminal.render === 'function') {
    try {
      const out = await streamdownTerminal.render(stream, { target: process.stdout })
      return String(out ?? '')
    } catch (err: any) {
      // Fall back to safe renderer on any error
      console.log(chalk.yellow(`\n⚠️  Streamdown terminal adapter failed: ${err?.message || err}`))
    }
  }

  // Fallback: minimal progressive printing with optional light re-rendering.
  const useRerender = !!options.enableMinimalRerender && process.stdout.isTTY
  let accumulated = ''

  // Keep track of how many lines we've printed if we re-render.
  let printedLines = 0

  for await (const chunk of stream) {
    if (isCancelled()) break
    accumulated += chunk

    if (!useRerender) {
      process.stdout.write(chunk)
      continue
    }

    // Minimal re-render: clear the previous printed block and print the new one.
    // This avoids heavy flicker while allowing formatting for things like lists/headers.
    const formatted = accumulated
    const lines = formatted.split(/\r?\n/)

    // Move cursor up and clear previous lines
    if (printedLines > 0) {
      readline.moveCursor(process.stdout, 0, -printedLines)
      readline.clearScreenDown(process.stdout)
    }

    process.stdout.write(lines.join('\n'))
    printedLines = lines.length
  }

  if (useRerender && printedLines > 0) {
    // Print a final newline to finish the block cleanly
    process.stdout.write('\n')
  }

  return accumulated
}

/**
 * Create a push-driven async text stream suitable for renderChatStreamToTerminal.
 * Allows event-based producers to push chunks as they arrive.
 */
export function createStringPushStream(): {
  generator: AsyncGenerator<string, void, unknown>
  push: (chunk: string) => void
  end: () => void
} {
  const queue: string[] = []
  const waiters: Array<(value: IteratorResult<string>) => void> = []
  let ended = false

  function push(chunk: string) {
    if (ended) return
    if (waiters.length > 0) {
      const resolve = waiters.shift()!
      resolve({ value: chunk, done: false })
    } else {
      queue.push(chunk)
    }
  }

  function end() {
    if (ended) return
    ended = true
    while (waiters.length > 0) {
      const resolve = waiters.shift()!
      resolve({ value: undefined as any, done: true })
    }
  }

  async function* generator(): AsyncGenerator<string, void, unknown> {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift() as string
        continue
      }
      if (ended) return
      const nextItem: Promise<IteratorResult<string>> = new Promise((resolve) => waiters.push(resolve))
      const result = await nextItem
      if (result.done) return
      yield result.value
    }
  }

  return { generator: generator(), push, end }
}
