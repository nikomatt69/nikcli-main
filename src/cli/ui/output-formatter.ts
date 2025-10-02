import boxen from 'boxen'
import chalk from 'chalk'

export interface StructuredReport {
    title: string
    summary?: string
    metrics?: Record<string, number | string>
    critical?: string[]
    high?: string[]
    medium?: string[]
    low?: string[]
    recommendations?: string[]
}

export class OutputFormatter {
    static formatFinalOutput(content: string): string {
        const lines = content.split('\n')
        const formatted: string[] = []

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const trimmed = line.trim()

            if (!trimmed) {
                formatted.push('')
                continue
            }

            if (trimmed.startsWith('##')) {
                formatted.push(OutputFormatter.formatHeader(trimmed.replace(/^#+\s*/, '')))
                continue
            }

            if (trimmed.match(/^\*\*(.+)\*\*$/)) {
                const text = trimmed.replace(/\*\*/g, '')
                formatted.push(chalk.cyan.bold(`\n${text}`))
                continue
            }

            if (trimmed.match(/^[-*•]\s+/)) {
                formatted.push(OutputFormatter.formatListItem(trimmed))
                continue
            }

            if (trimmed.match(/^\d+\.\s+/)) {
                formatted.push(OutputFormatter.formatNumberedItem(trimmed))
                continue
            }

            if (trimmed.startsWith('```')) {
                const codeLines: string[] = []
                i++
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i])
                    i++
                }
                formatted.push(OutputFormatter.formatCodeBlock(codeLines.join('\n')))
                continue
            }

            if (trimmed.includes('`')) {
                formatted.push(OutputFormatter.formatInlineCode(line))
                continue
            }

            if (trimmed.match(/^(File|Path|Location|src\/|api\/|\.\/)/i)) {
                formatted.push(OutputFormatter.formatFilePath(trimmed))
                continue
            }

            if (trimmed.match(/^[✓✅❌⚠️🔴🟡🟢]/)) {
                formatted.push(OutputFormatter.formatStatusLine(trimmed))
                continue
            }

            if (trimmed.match(/^(P\d+|Critical|High|Medium|Low):/i)) {
                formatted.push(OutputFormatter.formatPriorityLine(trimmed))
                continue
            }

            if (trimmed.match(/^[A-Z][^:]+:\s+/)) {
                formatted.push(OutputFormatter.formatKeyValue(trimmed))
                continue
            }

            formatted.push(OutputFormatter.formatPlainText(line))
        }

        return formatted.join('\n')
    }

    static formatHeader(text: string): string {
        const cleaned = text.trim()
        return `\n${chalk.blue.bold('═'.repeat(60))}\n${chalk.cyan.bold(`  ${cleaned}`)}\n${chalk.blue.bold('═'.repeat(60))}`
    }

    static formatListItem(text: string): string {
        const match = text.match(/^[-*•]\s+(.+)$/)
        if (!match) return text
        const content = match[1]

        if (content.match(/^(Fix|Resolve|Implement|Add|Create)/i)) {
            return `  ${chalk.green('+')} ${chalk.white(content)}`
        }
        if (content.match(/^(Critical|Error|Fail|Bug)/i)) {
            return `  ${chalk.red('x')} ${chalk.white(content)}`
        }
        if (content.match(/^(Warning|Caution|Note)/i)) {
            return `  ${chalk.yellow('!')} ${chalk.white(content)}`
        }
        return `  ${chalk.cyan('*')} ${chalk.white(content)}`
    }

    static formatNumberedItem(text: string): string {
        const match = text.match(/^(\d+)\.\s+(.+)$/)
        if (!match) return text
        const num = match[1]
        const content = match[2]
        return `  ${chalk.yellow(num + '.')} ${chalk.white(content)}`
    }

    static formatCodeBlock(code: string): string {
        return boxen(chalk.white(code), {
            padding: 1,
            margin: { top: 1, bottom: 1, left: 2, right: 2 },
            borderStyle: 'round',
            borderColor: 'gray',
            backgroundColor: '#1e1e1e',
        })
    }

    static formatInlineCode(text: string): string {
        return text.replace(/`([^`]+)`/g, (_match, code) => {
            return chalk.bgGray.white(` ${code} `)
        })
    }

    static formatFilePath(text: string): string {
        return text.replace(/([a-zA-Z0-9_\-\.\/]+\.[a-z]{2,4})/gi, (match) => {
            return chalk.cyan.underline(match)
        })
    }

    static formatStatusLine(text: string): string {
        if (text.match(/^(✓|✅|\[OK\]|\[DONE\])/)) {
            return chalk.green(text)
        }
        if (text.match(/^(❌|x|\[ERR\]|\[FAIL\])/)) {
            return chalk.red(text)
        }
        if (text.match(/^(⚠️|!|\[WARN\])/)) {
            return chalk.yellow(text)
        }
        return text
    }

    static formatPriorityLine(text: string): string {
        const match = text.match(/^(P\d+|Critical|High|Medium|Low):\s*(.+)$/i)
        if (!match) return text
        const priority = match[1].toUpperCase()
        const content = match[2]

        let badge = ''
        if (priority.includes('CRITICAL') || priority === 'P0') {
            badge = chalk.bgRed.white.bold(` ${priority} `)
        } else if (priority.includes('HIGH') || priority === 'P1') {
            badge = chalk.bgYellow.black.bold(` ${priority} `)
        } else if (priority.includes('MEDIUM') || priority === 'P2') {
            badge = chalk.bgBlue.white(` ${priority} `)
        } else {
            badge = chalk.bgGray.white(` ${priority} `)
        }

        return `${badge} ${chalk.white(content)}`
    }

    static formatKeyValue(text: string): string {
        const match = text.match(/^([^:]+):\s*(.+)$/)
        if (!match) return text
        const key = match[1]
        const value = match[2]
        return `${chalk.blue.bold(key + ':')} ${chalk.white(value)}`
    }

    static formatPlainText(text: string): string {
        let formatted = text
        formatted = formatted.replace(/\.(ts|js|tsx|jsx|json|md|yml|yaml|toml|env)(\s|$)/gi, (match) => {
            return chalk.cyan(match)
        })
        formatted = formatted.replace(/\b\d+(\.\d+)?%?\b/g, (match) => {
            return chalk.yellow(match)
        })
        formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, (match) => {
            return chalk.blue.underline(match)
        })
        return formatted
    }

    static createSummaryBox(title: string, items: string[]): string {
        const content = items.map((item) => `  ${chalk.cyan('•')} ${item}`).join('\n')
        return boxen(content, {
            title: chalk.bold(title),
            titleAlignment: 'left',
            padding: 1,
            margin: { top: 1, bottom: 1, left: 0, right: 0 },
            borderStyle: 'round',
            borderColor: 'cyan',
        })
    }

    static createFindingsBox(
        severity: 'critical' | 'high' | 'medium' | 'low',
        title: string,
        findings: string[]
    ): string {
        const colors: Record<'critical' | 'high' | 'medium' | 'low', string> = {
            critical: 'red',
            high: 'yellow',
            medium: 'blue',
            low: 'gray',
        }
        const icons: Record<'critical' | 'high' | 'medium' | 'low', string> = {
            critical: '[!]',
            high: '[!]',
            medium: '[i]',
            low: '[-]',
        }

        const content = findings.map((finding) => `  ${icons[severity]} ${finding}`).join('\n')
        return boxen(content, {
            title: `${icons[severity]} ${title}`,
            titleAlignment: 'left',
            padding: 1,
            margin: { top: 1, bottom: 1, left: 0, right: 0 },
            borderStyle: 'round',
            borderColor: colors[severity],
        })
    }

    static createMetricsDashboard(metrics: Record<string, number | string>): string {
        const lines: string[] = []
        for (const [key, value] of Object.entries(metrics)) {
            const formattedKey = chalk.blue.bold(key.padEnd(25))
            if (typeof value === 'number') {
                if (value >= 0 && value <= 100) {
                    const bar = OutputFormatter.createProgressBar(value, 20)
                    lines.push(`${formattedKey} ${bar}`)
                } else {
                    lines.push(`${formattedKey} ${chalk.yellow(value.toString())}`)
                }
            } else {
                lines.push(`${formattedKey} ${chalk.white(value)}`)
            }
        }
        return boxen(lines.join('\n'), {
            title: chalk.bold('📊 Metrics Dashboard'),
            titleAlignment: 'center',
            padding: 1,
            margin: { top: 1, bottom: 1, left: 0, right: 0 },
            borderStyle: 'double',
            borderColor: 'cyan',
        })
    }

    static createProgressBar(percentage: number, width: number = 20): string {
        const filled = Math.round((percentage / 100) * width)
        const empty = width - filled
        const bar = '█'.repeat(filled) + '░'.repeat(empty)
        const color = percentage < 30 ? chalk.red : percentage < 70 ? chalk.yellow : chalk.green
        return `[${color(bar)}] ${chalk.white(percentage + '%')}`
    }

    static formatStructuredReport(report: StructuredReport): string {
        const sections: string[] = []
        sections.push(chalk.cyan.bold(`\n${'═'.repeat(80)}`))
        sections.push(chalk.cyan.bold(`  ${report.title}`))
        sections.push(chalk.cyan.bold(`${'═'.repeat(80)}\n`))

        if (report.summary) {
            sections.push(chalk.white(report.summary))
            sections.push('')
        }

        if (report.metrics) {
            sections.push(OutputFormatter.createMetricsDashboard(report.metrics))
            sections.push('')
        }

        if (report.critical && report.critical.length > 0) {
            sections.push(OutputFormatter.createFindingsBox('critical', 'Critical Issues', report.critical))
            sections.push('')
        }

        if (report.high && report.high.length > 0) {
            sections.push(OutputFormatter.createFindingsBox('high', 'High Priority', report.high))
            sections.push('')
        }

        if (report.medium && report.medium.length > 0) {
            sections.push(OutputFormatter.createFindingsBox('medium', 'Medium Priority', report.medium))
            sections.push('')
        }

        if (report.low && report.low.length > 0) {
            sections.push(OutputFormatter.createFindingsBox('low', 'Low Priority', report.low))
            sections.push('')
        }

        if (report.recommendations && report.recommendations.length > 0) {
            sections.push(OutputFormatter.createSummaryBox('💡 Recommendations', report.recommendations))
            sections.push('')
        }

        return sections.join('\n')
    }
}


