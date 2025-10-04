import { execSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import chalk from 'chalk'
import terminalImage from 'terminal-image'
import {
    TerminalCapabilityDetector,
    getRecommendedRenderingStrategy,
} from '../utils/terminal-capabilities'

export interface MermaidRenderOptions {
    /** Force specific rendering strategy */
    forceStrategy?: 'inline-image' | 'ascii-art' | 'fallback'
    /** Width in characters for rendering */
    width?: number
    /** Enable caching of rendered diagrams */
    enableCache?: boolean
    /** Diagram theme (default, dark, neutral, forest) */
    theme?: 'default' | 'dark' | 'neutral' | 'forest'
    /** Horizontal spacing between nodes in ASCII rendering */
    asciiPaddingX?: number
    /** Vertical spacing between nodes in ASCII rendering */
    asciiPaddingY?: number
    /** Padding between text and border in ASCII rendering */
    asciiBorderPadding?: number
}

export class MermaidRenderer {
    private static cache = new Map<string, string>()
    private static tempDir: string

    /**
     * Initialize temp directory for diagram files
     */
    private static initTempDir(): void {
        if (!this.tempDir) {
            this.tempDir = join(tmpdir(), 'nikcli-mermaid')
            if (!existsSync(this.tempDir)) {
                mkdirSync(this.tempDir, { recursive: true })
            }
        }
    }

    /**
     * Render Mermaid diagram using best available strategy
     */
    static async render(mermaidCode: string, options: MermaidRenderOptions = {}): Promise<string> {
        this.initTempDir()

        // Check cache first
        const cacheKey = this.getCacheKey(mermaidCode, options)
        if (options.enableCache && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!
        }

        // Determine strategy
        const strategy = options.forceStrategy || getRecommendedRenderingStrategy()

        let result: string
        try {
            switch (strategy) {
                case 'inline-image':
                    result = await this.renderInlineImage(mermaidCode, options)
                    break
                case 'ascii-art':
                    result = await this.renderAsciiArt(mermaidCode, options)
                    break
                case 'fallback':
                default:
                    result = this.renderFallback(mermaidCode, options)
                    break
            }

            // Cache result
            if (options.enableCache) {
                this.cache.set(cacheKey, result)
            }

            return result
        } catch (error) {
            // Fallback on error
            console.error(chalk.yellow('⚠️ Mermaid rendering failed, using fallback:'), error)
            return this.renderFallback(mermaidCode, options)
        }
    }

    /**
     * Render as inline image (iTerm2/Kitty)
     */
    private static async renderInlineImage(
        mermaidCode: string,
        options: MermaidRenderOptions
    ): Promise<string> {
        const caps = TerminalCapabilityDetector.getCapabilities()

        if (!caps.supportsInlineImages || caps.imageProtocol === 'ansi-fallback') {
            throw new Error('Terminal does not support high-quality inline images')
        }

        // Generate unique filename
        const timestamp = Date.now()
        const inputFile = join(this.tempDir, `diagram-${timestamp}.mmd`)
        const outputFile = join(this.tempDir, `diagram-${timestamp}.png`)

        try {
            // Write Mermaid code to temp file
            writeFileSync(inputFile, mermaidCode, 'utf8')

            // Generate PNG using mermaid-cli (mmdc)
            execSync(
                `pnpm exec mmdc -i "${inputFile}" -o "${outputFile}" -t ${options.theme || 'dark'} -b transparent -q`,
                {
                    encoding: 'utf8',
                    stdio: 'pipe',
                }
            )

            // Read PNG and convert to terminal image
            const imageBuffer = readFileSync(outputFile)
            const image = await terminalImage.buffer(imageBuffer, {
                width: options.width ? `${options.width}%` : '80%',
                preserveAspectRatio: true,
            })

            // Add header and footer
            const width = options.width || caps.width * 0.8
            const header = chalk.cyanBright(`┌─ Mermaid Diagram ${'─'.repeat(Math.max(0, width - 20))}┐`)
            const footer = chalk.cyanBright(`└${'─'.repeat(Math.max(0, width - 2))}┘`)

            return `${header}\n${image}\n${footer}`
        } finally {
            // Cleanup temp files
            this.cleanupFile(inputFile)
            this.cleanupFile(outputFile)
        }
    }

    /**
     * Render as ASCII art using mermaid-ascii binary
     */
    private static async renderAsciiArt(
        mermaidCode: string,
        options: MermaidRenderOptions
    ): Promise<string> {
        const caps = TerminalCapabilityDetector.getCapabilities()

        if (!caps.hasMermaidAsciiBinary) {
            throw new Error('mermaid-ascii binary not found in PATH')
        }

        // Generate unique filename
        const timestamp = Date.now()
        const inputFile = join(this.tempDir, `diagram-${timestamp}.mmd`)

        try {
            // Write Mermaid code to temp file
            writeFileSync(inputFile, mermaidCode, 'utf8')

            // Build command with padding options
            const paddingFlags: string[] = []
            if (options.asciiPaddingX !== undefined) {
                paddingFlags.push(`-x ${options.asciiPaddingX}`)
            }
            if (options.asciiPaddingY !== undefined) {
                paddingFlags.push(`-y ${options.asciiPaddingY}`)
            }
            if (options.asciiBorderPadding !== undefined) {
                paddingFlags.push(`-p ${options.asciiBorderPadding}`)
            }

            const paddingArg = paddingFlags.length > 0 ? ' ' + paddingFlags.join(' ') : ''
            const command = `mermaid-ascii -f "${inputFile}"${paddingArg}`

            // Execute mermaid-ascii
            const asciiOutput = execSync(command, {
                encoding: 'utf8',
                stdio: 'pipe',
            })

            // Format with border
            const width = options.width || caps.width - 4
            const header = chalk.cyanBright(`┌─ Mermaid Diagram (ASCII) ${'─'.repeat(Math.max(0, width - 30))}┐`)
            const lines = asciiOutput.trim().split('\n')
            const formattedLines = lines.map((line) => chalk.white(`│ ${line}`))
            const footer = chalk.cyanBright(`└${'─'.repeat(Math.max(0, width))}┘`)

            return [header, ...formattedLines, footer].join('\n')
        } catch (error) {
            // Provide helpful error message
            const errorMsg = error instanceof Error ? error.message : String(error)
            throw new Error(`mermaid-ascii rendering failed: ${errorMsg}\nHint: Check diagram syntax or try 'mermaid-ascii -f <file>' manually`)
        } finally {
            // Cleanup temp file
            this.cleanupFile(inputFile)
        }
    }

    /**
     * Fallback rendering: show code in box with link to visualize online
     */
    private static renderFallback(mermaidCode: string, options: MermaidRenderOptions): string {
        const caps = TerminalCapabilityDetector.getCapabilities()
        const width = options.width || caps.width - 4

        // Encode Mermaid for mermaid.live
        const encoded = this.encodeMermaidForUrl(mermaidCode)
        const viewUrl = `https://mermaid.live/edit#pako:${encoded}`

        // Format code block
        const header = chalk.cyanBright(`┌─ Mermaid Diagram ${'─'.repeat(Math.max(0, width - 20))}┐`)
        const codeLines = mermaidCode.trim().split('\n')
        const formattedCode = codeLines.map((line) => {
            const truncated = line.length > width ? line.substring(0, width - 3) + '...' : line
            return chalk.gray(`│ ${truncated}`)
        })

        const separator = chalk.cyanBright(`├${'─'.repeat(Math.max(0, width))}┤`)
        const viewHint = chalk.yellow(`│ 💡 View diagram: ${chalk.blueBright.underline(viewUrl)}`)
        const installHint = chalk.gray(
            `│ 💡 For better rendering, install mermaid-ascii or use iTerm2/Kitty`
        )
        const footer = chalk.cyanBright(`└${'─'.repeat(Math.max(0, width))}┘`)

        return [
            header,
            ...formattedCode,
            separator,
            viewHint,
            installHint,
            footer,
        ].join('\n')
    }

    /**
     * Encode Mermaid code for mermaid.live URL
     */
    private static encodeMermaidForUrl(mermaidCode: string): string {
        const json = JSON.stringify({
            code: mermaidCode,
            mermaid: { theme: 'dark' },
        })
        return Buffer.from(json).toString('base64url')
    }

    /**
     * Generate cache key from code and options
     */
    private static getCacheKey(code: string, options: MermaidRenderOptions): string {
        const strategy = options.forceStrategy || 'auto'
        const theme = options.theme || 'dark'
        const width = options.width || 'auto'
        return `${strategy}-${theme}-${width}-${code}`
    }

    /**
     * Cleanup temporary file
     */
    private static cleanupFile(filepath: string): void {
        try {
            if (existsSync(filepath)) {
                unlinkSync(filepath)
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Clear rendering cache
     */
    static clearCache(): void {
        this.cache.clear()
    }

    /**
     * Get cache statistics
     */
    static getCacheStats(): { size: number; keys: string[] } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
        }
    }

    /**
     * Render capabilities info for debugging
     */
    static getCapabilitiesInfo(): string {
        return TerminalCapabilityDetector.getCapabilitiesDescription()
    }
}

/**
 * Convenience export for rendering Mermaid diagrams
 */
export const renderMermaidDiagram = (code: string, options?: MermaidRenderOptions) =>
    MermaidRenderer.render(code, options)
