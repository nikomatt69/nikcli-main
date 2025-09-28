/**
 * Zed Integration for NikCLI ACP
 * Based on the approach used in Google Gemini CLI
 * Handles proper stream conversion and ACP protocol implementation
 */

import { Readable, Writable } from 'node:stream'
import { type Agent, AgentSideConnection } from '@zed-industries/agent-client-protocol'

/**
 * Creates a proper ReadableStream from Node.js Readable stream
 * This is the key to making the ACP package work with Node.js streams
 */
export function createReadableStream(readable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const onData = (chunk: Buffer | string) => {
        try {
          const uint8Array =
            chunk instanceof Buffer
              ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
              : new TextEncoder().encode(chunk as string)
          controller.enqueue(uint8Array)
        } catch (error) {
          controller.error(error)
        }
      }

      const onEnd = () => {
        controller.close()
      }

      const onError = (error: Error) => {
        controller.error(error)
      }

      readable.on('data', onData)
      readable.on('end', onEnd)
      readable.on('error', onError)

      // Cleanup function
      return () => {
        readable.off('data', onData)
        readable.off('end', onEnd)
        readable.off('error', onError)
      }
    },
  })
}

/**
 * Creates a proper WritableStream from Node.js Writable stream
 * This handles the conversion from Web Streams back to Node.js streams
 */
export function createWritableStream(writable: Writable): WritableStream<Uint8Array> {
  return new WritableStream({
    write(chunk) {
      return new Promise<void>((resolve, reject) => {
        try {
          const buffer = Buffer.from(chunk)
          writable.write(buffer, (error) => {
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          })
        } catch (error) {
          reject(error)
        }
      })
    },
    close() {
      return new Promise<void>((resolve) => {
        writable.end(resolve)
      })
    },
  })
}

/**
 * Creates an ACP agent connection with proper stream handling
 * This is the main integration point between NikCLI and ACP
 */
export function createAcpConnection(
  agent: Agent,
  input: Readable = process.stdin,
  output: Writable = process.stdout
): AgentSideConnection {
  const inputStream = createReadableStream(input)
  const outputStream = createWritableStream(output)

  return new AgentSideConnection(() => agent, outputStream, inputStream as any)
}

/**
 * Stream adapter that handles the conversion between Node.js and Web Streams
 * This ensures compatibility with the ACP package requirements
 */
export class StreamAdapter {
  private readable: Readable
  private writable: Writable

  constructor(readable: Readable, writable: Writable) {
    this.readable = readable
    this.writable = writable
  }

  /**
   * Creates the ACP-compatible streams
   */
  createStreams() {
    return {
      input: createReadableStream(this.readable),
      output: createWritableStream(this.writable),
    }
  }

  /**
   * Sets up proper error handling for the streams
   */
  setupErrorHandling() {
    this.readable.on('error', (error) => {
      console.error('Input stream error:', error)
    })

    this.writable.on('error', (error) => {
      console.error('Output stream error:', error)
    })

    // Handle process termination
    process.on('SIGINT', () => {
      this.cleanup()
    })

    process.on('SIGTERM', () => {
      this.cleanup()
    })
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.readable.destroyed === false) {
      this.readable.destroy()
    }
    if (this.writable.destroyed === false) {
      this.writable.destroy()
    }
  }
}

/**
 * Utility to check if streams are properly configured
 */
export function validateStreams(input: Readable, output: Writable): boolean {
  return input.readable !== false && output.writable !== false && !input.destroyed && !output.destroyed
}

/**
 * Creates a buffered stream adapter for testing purposes
 */
export function createBufferedStreamAdapter(): {
  input: Readable
  output: Writable
  adapter: StreamAdapter
} {
  const input = new Readable({
    read() {
      // Buffered input for testing
    },
  })

  const output = new Writable({
    write(_chunk, _encoding, callback) {
      // Buffered output for testing
      callback()
    },
  })

  const adapter = new StreamAdapter(input, output)

  return { input, output, adapter }
}
