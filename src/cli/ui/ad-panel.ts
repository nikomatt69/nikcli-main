import boxen from 'boxen'
import chalk from 'chalk'
import { AdCampaign } from '../types/ads'

export interface AdPanelOptions {
  maxWidth?: number
  borderColor?: string
  margin?: { top?: number; bottom?: number; left?: number; right?: number }
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''
  for (const word of words) {
    if ((currentLine + (currentLine ? ' ' : '') + word).length <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word.length > maxWidth ? word.slice(0, maxWidth - 3) + '...' : word
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

function createProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width)
  const empty = width - filled
  const bar = '='.repeat(filled) + '-'.repeat(empty)
  const colorFn = percentage < 25 ? chalk.red : percentage < 75 ? chalk.yellow : chalk.green
  return `[${colorFn(bar)}] ${percentage}%`
}

export function renderAdPanel(ad: AdCampaign, format: string = 'full', options: AdPanelOptions = {}): string {
  const { maxWidth = 60, borderColor = 'yellow', margin = { top: 1, bottom: 1, left: 0, right: 0 } } = options

  if (format === 'indicator') return renderAdIndicator(ad)
  if (format === 'compact') return formatAdForTerminal(ad)

  const lines: string[] = []
  lines.push(chalk.bold.yellow('[AD] Sponsored'))
  lines.push('')

  const contentLines = wrapText(ad.content, maxWidth - 4)
  contentLines.forEach((line: string) => {
    lines.push(`"${chalk.white(line)}"`)
  })

  lines.push('')

  if (ad.ctaText && ad.ctaUrl) {
    lines.push(chalk.cyan(`[LINK] ${ad.ctaText}`))
    lines.push(chalk.gray(`       ${ad.ctaUrl}`))
  }

  const content = lines.join('\n')
  return boxen(content, { title: 'Ad', titleAlignment: 'left', padding: 1, borderStyle: 'round', borderColor, width: maxWidth, margin, dimBorder: true })
}

export function renderAdIndicator(ad: AdCampaign): string {
  const shortened = ad.content.length > 40 ? ad.content.slice(0, 37) + '...' : ad.content
  return chalk.dim(`[AD] ${shortened}`)
}

export function renderAdListItem(ad: AdCampaign, index: number): string {
  const statusColor = { pending: chalk.yellow, active: chalk.green, paused: chalk.gray, completed: chalk.cyan }[ad.status] || chalk.white
  const progressPercent = Math.round((ad.impressionsServed / ad.budgetImpressions) * 100)
  const progressBar = createProgressBar(progressPercent, 15)
  const lines: string[] = []
  lines.push(`${index + 1}. ${statusColor(ad.status.toUpperCase())} - ${ad.content.slice(0, 45)}${ad.content.length > 45 ? '...' : ''}`)
  lines.push(`   ${progressBar} ${ad.impressionsServed}/${ad.budgetImpressions} impressions ($${ad.totalCost.toFixed(2)})`)
  if (ad.ctaText) lines.push(`   CTA: ${chalk.cyan(ad.ctaText)}`)
  return lines.join('\n')
}

export function renderAdsSummaryPanel(stats: { totalCampaigns: number; activeCampaigns: number; totalImpressions: number; totalCost: number }): string {
  const lines: string[] = []
  lines.push(chalk.bold('Ads Overview'))
  lines.push('')
  lines.push(`${chalk.cyan('[*] Campaigns')}: ${chalk.bold(stats.totalCampaigns.toString())}`)
  lines.push(`${chalk.green('[+] Active')}: ${chalk.bold(stats.activeCampaigns.toString())}`)
  lines.push(`${chalk.yellow('[~] Impressions')}: ${chalk.bold(stats.totalImpressions.toLocaleString())}`)
  lines.push(`${chalk.blue('[$] Total Spend')}: ${chalk.bold(`$${stats.totalCost.toFixed(2)}`)}`)
  return boxen(lines.join('\n'), { title: 'Analytics', titleAlignment: 'left', padding: 1, borderStyle: 'round', borderColor: 'blue', width: 50, margin: { top: 1, bottom: 1, left: 0, right: 0 } })
}

export function renderUserAdEarnings(earnings: { impressions: number }): string {
  const lines: string[] = []
  lines.push(chalk.bold('Ad Impressions'))
  lines.push('')
  lines.push(`${chalk.cyan('[o] Impressions')}: ${chalk.bold(earnings.impressions.toString())}`)
  return boxen(lines.join('\n'), { title: 'Stats', titleAlignment: 'left', padding: 1, borderStyle: 'round', borderColor: 'green', width: 45, margin: { top: 1, bottom: 1, left: 0, right: 0 } })
}

export function validateAdContent(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) return { valid: false, error: 'Ad content cannot be empty' }
  if (content.length > 280) return { valid: false, error: `Ad content too long (${content.length}/280 chars)` }
  if (content.includes('http') && !content.includes('://')) return { valid: false, error: 'Invalid URL format' }
  return { valid: true }
}

export function formatAdForTerminal(ad: AdCampaign): string {
  const parts: string[] = []
  parts.push(chalk.white(`"${ad.content}"`))
  if (ad.ctaText && ad.ctaUrl) parts.push(chalk.cyan(`[LINK] ${ad.ctaText}`))
  return parts.join(' ')
}
