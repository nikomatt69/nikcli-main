import fs from 'node:fs'
import path from 'node:path'
import { runAnalysisWithEvents } from '../engine/events'
import { HTMLReporter, JSONReporter, type Reporter } from '../reporters'
import type { AnalysisResult } from '../types/report'

export interface ReportCmdOptions {
  out?: string
  report?: string // comma list: json,html
  depth?: number
  model?: string
}

export async function generateReports(opts: ReportCmdOptions): Promise<AnalysisResult> {
  const outDir = path.resolve(opts.out || path.join(require('../utils/working-dir').getWorkingDirectory(), '.nikcli', 'reports', String(Date.now())))
  const reportKinds = (opts.report || 'json').split(',').map((s) => s.trim().toLowerCase())

  const reporters: Reporter[] = []
  if (reportKinds.includes('json')) reporters.push(new JSONReporter())
  if (reportKinds.includes('html')) reporters.push(new HTMLReporter())

  for (const r of reporters) await r.init({ outDir })

  const { result } = await runAnalysisWithEvents({ path: require('../utils/working-dir').getWorkingDirectory(), depth: opts.depth, model: opts.model }, (e) => {
    // stream hook in case we want to attach live UI later
    reporters.forEach((r) => r.onEvent?.(e))
  })

  for (const r of reporters) await r.finalize(result)

  // Also persist a small latest symlink/copy for VS Code extension to pick up
  try {
    const latest = path.resolve(path.join(require('../utils/working-dir').getWorkingDirectory(), '.nikcli', 'reports', 'latest'))
    fs.mkdirSync(path.dirname(latest), { recursive: true })
    try {
      fs.rmSync(latest, { recursive: true, force: true })
    } catch {}
    fs.cpSync(outDir, latest, { recursive: true })
  } catch {
    /* ignore */
  }

  return result
}
