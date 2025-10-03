import chalk from 'chalk'
import hljs from 'highlight.js'

export class VisualFormatter {
    private bufferState: {
        content: string
        inCodeBlock: boolean
        language: string | null
        fenceMarker: string | null
    }

    constructor() {
        this.bufferState = {
            content: '',
            inCodeBlock: false,
            language: null,
            fenceMarker: null,
        }
    }

    processStreamChunk(chunk: string): string {
        if (!chunk) return ''
        const lines = chunk.split('\n')
        const result: string[] = []

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const fenceMatch = line.match(/^```(\w+)?/)
            if (fenceMatch) {
                if (!this.bufferState.inCodeBlock) {
                    this.bufferState.inCodeBlock = true
                    this.bufferState.language = fenceMatch[1] || null
                    this.bufferState.content = ''
                    continue
                } else {
                    const highlighted = this.formatCodeBlock(
                        this.bufferState.content,
                        this.bufferState.language || undefined
                    )
                    result.push(highlighted)
                    this.bufferState.inCodeBlock = false
                    this.bufferState.language = null
                    this.bufferState.content = ''
                    continue
                }
            }

            if (this.bufferState.inCodeBlock) {
                this.bufferState.content += line + '\n'
                continue
            }

            result.push(this.formatMarkdownLine(line))
        }

        return result.join('\n')
    }

    formatMarkdownLine(line: string): string {
        let formatted = line

        formatted = formatted.replace(/^(#{1,6})\s+(.+)$/, (_: string, hashes: string, text: string) => {
            const level = hashes.length
            const color = level === 1 ? chalk.blueBright.bold : level === 2 ? chalk.white.bold : chalk.gray.bold
            return color(`${hashes} ${text}`)
        })

        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, (_: string, text: string) => chalk.white.bold(text))
        formatted = formatted.replace(/\*([^*]+)\*/g, (_: string, text: string) => chalk.gray.italic(text))
        formatted = formatted.replace(/`([^`]+)`/g, (_: string, code: string) => chalk.bgHex('#2b2b2b').white(` ${code} `))
        formatted = formatted.replace(
            /^(\s*)([-*+])\s+(.+)$/,
            (_: string, indent: string, bullet: string, text: string) => `${indent}${chalk.cyanBright(bullet)} ${text}`
        )

        return formatted
    }

    formatCodeBlock(code: string, language?: string): string {
        if (!code.trim()) return ''
        const lines: string[] = []
        const width = (process.stdout.columns || 80) - 4
        const lang = language || 'code'
        const headerPadding = '─'.repeat(Math.max(0, width - lang.length - 4))
        lines.push(chalk.cyanBright(`┌─ ${lang} ${headerPadding}┐`))

        let highlighted = code
        if (language && hljs.getLanguage(language)) {
            highlighted = this.highlightCode(code, language)
        }

        const codeLines = highlighted.split('\n')
        const filteredLines = codeLines.filter((l, i) => l.trim() || i < codeLines.length - 1)
        for (const ln of filteredLines) {
            const truncated = ln.length > width ? ln.substring(0, width - 3) + '...' : ln
            lines.push(chalk.white('│ ') + truncated)
        }
        lines.push(chalk.cyanBright(`└${'─'.repeat(width + 2)}┘`))
        return lines.join('\n')
    }

    private highlightCode(code: string, language: string): string {
        try {
            const highlighted = hljs.highlight(code, { language }).value
            return highlighted
                .replace(/<span class="hljs-keyword">/g, chalk.magenta(''))
                .replace(/<span class="hljs-string">/g, chalk.green(''))
                .replace(/<span class="hljs-comment">/g, chalk.gray(''))
                .replace(/<span class="hljs-number">/g, chalk.cyan(''))
                .replace(/<span class="hljs-function">/g, chalk.blue(''))
                .replace(/<span class="hljs-variable">/g, chalk.yellow(''))
                .replace(/<span class="hljs-type">/g, chalk.blue(''))
                .replace(/<span class="hljs-title">/g, chalk.bold(''))
                .replace(/<span class="hljs-attr">/g, chalk.cyan(''))
                .replace(/<span class="hljs-built_in">/g, chalk.magenta(''))
                .replace(/<span class="hljs-class">/g, chalk.blue.bold(''))
                .replace(/<span class="hljs-name">/g, chalk.blue.bold(''))
                .replace(/<span class="hljs-params">/g, chalk.white(''))
                .replace(/<span class="hljs-literal">/g, chalk.cyan(''))
                .replace(/<span class="hljs-property">/g, chalk.cyan(''))
                .replace(/<\/span>/g, chalk.reset(''))
                .replace(/<[^>]*>/g, '')
        } catch {
            return code
        }
    }

    formatInlineCode(text: string): string {
        return text.replace(/`([^`]+)`/g, (_: string, code: string) => chalk.bgGray.white(` ${code} `))
    }

    createProgressBar(value: number, width: number = 40): string {
        const chars = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
        const filled = (value / 100) * width
        const fullBlocks = Math.floor(filled)
        const partial = Math.floor((filled - fullBlocks) * 8)
        const bar =
            '█'.repeat(fullBlocks) + (partial > 0 ? chars[partial] : '') + '░'.repeat(width - fullBlocks - (partial ? 1 : 0))
        const colorFn = value < 30 ? chalk.red : value < 70 ? chalk.yellow : chalk.green
        return colorFn(`[${bar}] ${value}%`)
    }

    createMiniProgressBar(current: number, total: number, width: number = 20): string {
        const filled = Math.round((current / total) * width)
        return chalk.blue('▓'.repeat(filled) + '░'.repeat(width - filled))
    }

    formatInitGroup(source: string, messages: string[]): string {
        if (messages.length === 0) return ''
        if (messages.length === 1) return `${chalk.dim(source)} ${messages[0]}`
        const lines = [chalk.cyan(`┌─ 📋 ${source} ${'─'.repeat(Math.max(0, 40 - source.length))}┐`)]
        for (const msg of messages) {
            lines.push(chalk.gray(`│ ${msg}`))
        }
        lines.push(chalk.cyan(`└─ ✓ ${messages.length} operations complete ${'─'.repeat(Math.max(0, 15))}┘`))
        return lines.join('\n')
    }

    formatSearchResults(pattern: string, fileCount: number, expanded: boolean = false): string {
        const icon = expanded ? chalk.cyan('▼') : chalk.cyan('▶')
        const progressBar = this.createMiniProgressBar(fileCount, 100, 20)
        return [
            `${icon} ${chalk.blue('Search')}(pattern: "${chalk.yellow(pattern)}")`,
            chalk.gray(`  ├─ ${progressBar}`),
            chalk.gray(`  └─ Found ${chalk.cyan(fileCount.toString())} files ${chalk.dim('(ctrl+o to expand)')}`),
        ].join('\n')
    }

    formatSearchResultsExpanded(pattern: string, matches: Array<{ file: string; lineNumber: number }>): string {
        const lines: string[] = [chalk.cyan(`▼ Search(pattern: "${pattern}")`), chalk.gray(`  ├─ ${this.createMiniProgressBar(matches.length, 100)}`)]
        const displayCount = Math.min(matches.length, 10)
        for (let i = 0; i < displayCount; i++) {
            const m = matches[i]
            const prefix = i === displayCount - 1 && displayCount < matches.length ? '  └─' : '  ├─'
            lines.push(chalk.gray(`${prefix} ${chalk.blue(m.file)}:${chalk.yellow(m.lineNumber.toString())}`))
        }
        if (matches.length > displayCount) {
            lines.push(chalk.gray(`  └─ ... and ${matches.length - displayCount} more files`))
        } else {
            lines[lines.length - 1] = lines[lines.length - 1].replace('├─', '└─')
        }
        return lines.join('\n')
    }

    formatTable(headers: string[], rows: any[][]): string {
        const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] || '').length)))
        const lines = [
            '┌' + colWidths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐',
            '│ ' + headers.map((h, i) => chalk.bold(h.padEnd(colWidths[i]))).join(' │ ') + ' │',
            '├' + colWidths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤',
        ]
        rows.forEach((row) => {
            lines.push('│ ' + row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' │ ') + ' │')
        })
        lines.push('└' + colWidths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘')
        return chalk.cyan(lines.join('\n'))
    }

    reset(): void {
        this.bufferState = {
            content: '',
            inCodeBlock: false,
            language: null,
            fenceMarker: null,
        }
    }
}

export const visualFormatter = new VisualFormatter()


