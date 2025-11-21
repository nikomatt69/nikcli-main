import chalk from 'chalk'
import boxen from 'boxen'
import path from 'path'
import { toolsManager } from '../tools/tools-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { formatFileOp, formatSearch } from '../utils/text-wrapper'

/**
 * FileOperations - Handles file operation commands
 * Extracted from lines ~6597-6900 in nik-cli.ts
 */
export class FileOperations {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleFileOperations(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'read': {
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /read <filepath> [<from-to>] [--from N --to M] [--step K] [--more]', {
                title: 'Read Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          const filePath = args[0]
          const rest = args.slice(1)

          // Helpers for flag parsing
          const hasFlag = (name: string) => rest.includes(`--${name}`)
          const getFlag = (name: string) => {
            const i = rest.indexOf(`--${name}`)
            return i !== -1 ? rest[i + 1] : undefined
          }
          const rangeToken = rest.find((v) => /^\d+-\d+$/.test(v))

          // Determine mode
          let mode: 'default' | 'range' | 'step' | 'more' = 'default'
          if (hasFlag('more')) mode = 'more'
          else if (rangeToken || hasFlag('from') || hasFlag('to')) mode = 'range'
          else if (hasFlag('step')) mode = 'step'

          const defaultStep = 200
          let step = parseInt(getFlag('step') || `${defaultStep}`, 10)
          if (!Number.isFinite(step) || step <= 0) step = defaultStep

          const fileInfo = await toolsManager.readFile(filePath)
          const lines = fileInfo.content.split(/\r?\n/)
          const total = lines.length

          const key = `read:${path.resolve(filePath)}`
          const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

          advancedUI.logFunctionCall(
            formatFileOp('File:', filePath, `${fileInfo.size} bytes, ${fileInfo.language || 'unknown'}`)
          )
          console.log(chalk.gray(`Lines: ${total}`))
          console.log(chalk.gray('─'.repeat(50)))

          const printSlice = (from: number, to: number) => {
            const f = clamp(from, 1, total)
            const t = clamp(to, 1, total)
            if (f > total) {
              console.log(chalk.yellow('End of file reached.'))
              return { printed: false, end: total }
            }
            const slice = lines.slice(f - 1, t).join('\n')
            console.log(chalk.gray(`Showing lines ${f}-${t} of ${total}`))
            console.log(slice)
            return { printed: true, end: t }
          }

          if (mode === 'range') {
            // Parse from/to
            let from: number | undefined
            let to: number | undefined
            if (rangeToken) {
              const [a, b] = rangeToken.split('-').map((s) => parseInt(s, 10))
              if (Number.isFinite(a)) from = a
              if (Number.isFinite(b)) to = b
            }
            const fromFlag = parseInt(getFlag('from') || '', 10)
            const toFlag = parseInt(getFlag('to') || '', 10)
            if (Number.isFinite(fromFlag)) from = fromFlag
            if (Number.isFinite(toFlag)) to = toFlag

            const f = clamp(from ?? 1, 1, total)
            const t = clamp(to ?? f + step - 1, 1, total)
            printSlice(f, t)
            // Prepare next cursor
            this.nikCLI.sessionContext.set(key, { nextStart: t + 1, step })
          } else if (mode === 'step') {
            const f = 1
            const t = clamp(f + step - 1, 1, total)
            printSlice(f, t)
            this.nikCLI.sessionContext.set(key, { nextStart: t + 1, step })
          } else if (mode === 'more') {
            const state = this.nikCLI.sessionContext.get(key) || { nextStart: 1, step }
            // Allow overriding step via flag in --more
            if (hasFlag('step')) state.step = step
            const f = clamp(state.nextStart || 1, 1, total)
            const t = clamp(f + (state.step || step) - 1, 1, total)
            const res = printSlice(f, t)
            if (res.printed) {
              this.nikCLI.sessionContext.set(key, { nextStart: res.end + 1, step: state.step || step })
              if (res.end < total) {
                console.log(chalk.gray('─'.repeat(50)))
                console.log(
                  chalk.cyan(`Tip: use "/read ${filePath} --more" to continue (next from line ${res.end + 1})`)
                )
              }
            }
          } else {
            // default behavior: show all, but protect against huge outputs
            if (total > 400) {
              const { approvalSystem } = await import('../ui/approval-system')
              const approved = await approvalSystem.confirm(
                `Large file: ${total} lines`,
                `Show first ${defaultStep} lines now?`,
                false
              )
              if (approved) {
                const f = 1
                const t = clamp(f + defaultStep - 1, 1, total)
                printSlice(f, t)
                this.nikCLI.sessionContext.set(key, { nextStart: t + 1, step: defaultStep })
                if (t < total) {
                  console.log(chalk.gray('─'.repeat(50)))
                  this.nikCLI.printPanel(
                    boxen(`Tip: use "/read ${filePath} --more" to continue (next from line ${t + 1})`, {
                      title: 'Read More Tip',
                      padding: 1,
                      margin: 1,
                      borderStyle: 'round',
                      borderColor: 'cyan',
                    }),
                    'general'
                  )
                }
              } else {
                console.log(chalk.yellow('Skipped large output. Specify a range, e.g.'))
                console.log(chalk.cyan(`/read ${filePath} 1-200`))
              }
            } else {
              console.log(fileInfo.content)
            }
          }

          console.log(chalk.gray('─'.repeat(50)))
          break
        }
        case 'write': {
          if (args.length < 2) {
            this.nikCLI.printPanel(
              boxen('Usage: /write <filepath> <content>', {
                title: 'Write Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          const filePath = args[0]
          const content = args.slice(1).join(' ')

          // Request approval
          const { approvalSystem } = await import('../ui/approval-system')
          const approved = await approvalSystem.confirm(
            `Write file: ${filePath}`,
            `Write ${content.length} characters to file`,
            false
          )

          if (!approved) {
            console.log(chalk.yellow('❌ File write operation cancelled'))
            break
          }

          const writeId = `write-${Date.now()}`
          this.nikCLI.createStatusIndicator(writeId, `Writing ${filePath}`)
          this.nikCLI.startAdvancedSpinner(writeId, 'Writing file...')

          await toolsManager.writeFile(filePath, content)

          this.nikCLI.stopAdvancedSpinner(writeId, true, `File written: ${filePath}`)
          this.nikCLI.printPanel(
            boxen(chalk.green(`File written: ${filePath}\n\n${content.length} characters written`), {
              title: 'Write Complete',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }),
            'general'
          )
          break
        }
        case 'edit': {
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /edit <filepath>', {
                title: 'Edit Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          const filePath = args[0]
          console.log(formatFileOp('📝 Opening', filePath, 'in system editor'))
          try {
            await toolsManager.runCommand('code', [filePath])
          } catch {
            try {
              await toolsManager.runCommand('open', [filePath])
            } catch {
              console.log(chalk.yellow(`Could not open ${filePath}. Please open it manually.`))
            }
          }
          break
        }
        case 'ls': {
          const directory = args[0] || '.'
          const files = await toolsManager.listFiles(directory)
          console.log(formatFileOp('📁 Files in', directory))
          console.log(chalk.gray('─'.repeat(40)))
          if (files.length === 0) {
            console.log(chalk.yellow('No files found'))
          } else {
            files.slice(0, 50).forEach((file) => {
              console.log(`${chalk.cyan('•')} ${file}`)
            })
            if (files.length > 50) {
              console.log(chalk.gray(`... and ${files.length - 50} more files`))
            }
          }
          break
        }
        case 'search': {
          if (args.length === 0) {
            this.nikCLI.printPanel(
              boxen('Usage: /search <query> [directory] [--limit N] [--more]', {
                title: 'Search Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          const query = args[0]
          const directory = args[1] && !args[1].startsWith('--') ? args[1] : '.'
          const rest = args.slice(1).filter((a) => a.startsWith('--'))

          const hasFlag = (name: string) => rest.includes(`--${name}`)
          const getFlag = (name: string) => {
            const i = rest.indexOf(`--${name}`)
            return i !== -1 ? rest[i + 1] : undefined
          }
          let limit = parseInt(getFlag('limit') || '30', 10)
          if (!Number.isFinite(limit) || limit <= 0) limit = 30
          const key = `search:${path.resolve(directory)}:${query}`
          const state = this.nikCLI.sessionContext.get(key) || { offset: 0, limit }
          if (hasFlag('limit')) state.limit = limit

          console.log(formatSearch(query, directory))
          const spinId = `search-${Date.now()}`
          this.nikCLI.createStatusIndicator(spinId, `Searching: ${query}`, `in ${directory}`)
          this.nikCLI.startAdvancedSpinner(spinId, `Searching files...`)

          const results = await toolsManager.searchInFiles(query, directory)

          this.nikCLI.stopAdvancedSpinner(spinId, true, `Search complete: ${results.length} matches`)

          if (results.length === 0) {
            console.log(chalk.yellow('No matches found'))
          } else {
            const start = Math.max(0, state.offset)
            const end = Math.min(results.length, start + (state.limit || limit))
            console.log(chalk.green(`Found ${results.length} matches (showing ${start + 1}-${end}):`))
            console.log(chalk.gray('─'.repeat(50)))
            results.slice(start, end).forEach((result) => {
              console.log(chalk.cyan(`${result.file}:${result.line}`))
              console.log(`  ${result.content}`)
            })
            if (end < results.length) {
              this.nikCLI.sessionContext.set(key, { offset: end, limit: state.limit || limit })
              console.log(chalk.gray('─'.repeat(50)))
              console.log(
                chalk.cyan(
                  `Tip: use "/search ${query} ${directory} --more" to see the next ${state.limit || limit} results`
                )
              )
            } else {
              this.nikCLI.sessionContext.delete(key)
            }
          }
          break
        }
      }
    } catch (error: any) {
      this.nikCLI.addLiveUpdate({ type: 'error', content: `File operation failed: ${error.message}`, source: 'file-ops' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.nikCLI.performCommandCleanup()
    }
  }
}
