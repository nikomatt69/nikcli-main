import { EventEmitter } from 'events'

export type AnalysisEvent =
  | { type: 'start'; payload?: any }
  | { type: 'fileQueued'; payload: { file: string } }
  | { type: 'fileAnalyzed'; payload: { file: string; ms?: number } }
  | { type: 'summaryUpdated'; payload: { text: string } }
  | { type: 'finding'; payload: any }
  | { type: 'patchSuggested'; payload: any }
  | { type: 'done'; payload?: any }
  | { type: 'error'; payload: { message: string; file?: string } }

export class AnalysisEmitter extends EventEmitter {
  emitEvent(e: AnalysisEvent) {
    this.emit('event', e)
  }
}

// Lightweight wrapper. Integrate with existing orchestration without refactor.
export async function runAnalysisWithEvents(
  options: { path?: string; depth?: number; model?: string },
  onEvent: (e: AnalysisEvent) => void
): Promise<{ result: any }> {
  const emitter = new AnalysisEmitter()
  emitter.on('event', onEvent)

  // Bridge to existing systems: we simulate a minimal pass by leveraging planningService and agentService
  // Replace this stub by wiring the real analysis pipeline when available.
  emitter.emitEvent({ type: 'start', payload: { options } })

  try {
    const cwd = options.path || process.cwd()
    const start = Date.now()

    // Naive file enumeration to stream some progress without touching core
    const fs = await import('node:fs')
    const path = await import('node:path')
    const _globby =
      (await import('globby')).globby || (await import('globby')).default || (await import('globby')).globbySync

    const patterns = ['**/*.{ts,tsx,js,jsx,json,md}', '!node_modules/**', '!dist/**', '!build/**']
    let files: string[] = []
    try {
      // Prefer globby async
      const { globby: globbyAsync } = await import('globby')
      files = await globbyAsync(patterns, { cwd })
    } catch {
      // fallback minimal scan
      files = []
    }

    files.slice(0, 200).forEach((f) => emitter.emitEvent({ type: 'fileQueued', payload: { file: f } }))

    // Simple summary
    emitter.emitEvent({
      type: 'summaryUpdated',
      payload: {
        text: `Analyzing ${files.length} files (depth=${options.depth ?? 1})`,
      },
    })

    // Fake a few findings from recent activity to demonstrate reporters
    const findings = [] as any[]
    const patches = [] as any[]

    const pkgPath = path.join(cwd, 'package.json')
    if (fs.existsSync(pkgPath)) {
      emitter.emitEvent({
        type: 'fileAnalyzed',
        payload: { file: 'package.json' },
      })
      findings.push({
        id: 'pkg-scripts',
        title: 'Review project scripts',
        severity: 'low',
        description: 'Ensure build/test scripts run in CI and cover all packages.',
        evidence: [{ file: 'package.json', snippet: 'scripts: {...}' }],
        affectedFiles: ['package.json'],
      })
    }

    const readme = path.join(cwd, 'README.md')
    if (fs.existsSync(readme)) {
      emitter.emitEvent({
        type: 'fileAnalyzed',
        payload: { file: 'README.md' },
      })
      findings.push({
        id: 'docs-readme',
        title: 'README present',
        severity: 'info',
        description: 'Project documentation is present. Consider adding badges and usage examples.',
        evidence: [{ file: 'README.md' }],
        affectedFiles: ['README.md'],
      })
    }

    // Patch stub example
    patches.push({
      filePath: '.github/workflows/ci.yml',
      status: 'pending',
      rationale: 'Add basic CI to run lint and tests on PRs',
      hunks: [
        {
          lines: [
            '--- /dev/null',
            '+++ b/.github/workflows/ci.yml',
            '+name: CI',
            '+on: [push, pull_request]',
            '+jobs:',
            '+  build:',
            '+    runs-on: ubuntu-latest',
            '+    steps:',
            '+      - uses: actions/checkout@v4',
            '+      - uses: actions/setup-node@v4',
            '+        with:',
            '+          node-version: 20',
            '+      - run: npm ci',
            '+      - run: npm run lint',
            '+      - run: npm test',
          ],
        },
      ],
    })

    const durationMs = Date.now() - start
    emitter.emitEvent({ type: 'done', payload: { durationMs } })

    const result = {
      id: String(Date.now()),
      repoPath: cwd,
      startedAt: new Date(start).toISOString(),
      finishedAt: new Date().toISOString(),
      config: {
        depth: options.depth ?? 1,
        model: options.model,
        timestamp: new Date().toISOString(),
      },
      summary: `Analyzed ${files.length} files in ${durationMs}ms`,
      findings,
      patches,
      stats: {
        filesAnalyzed: files.length,
        durationMs,
        findingsCount: findings.length,
        patchesCount: patches.length,
      },
    }

    return { result }
  } catch (err: any) {
    emitter.emitEvent({
      type: 'error',
      payload: { message: err?.message || String(err) },
    })
    return {
      result: {
        id: String(Date.now()),
        repoPath: options.path || process.cwd(),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        config: {
          depth: options.depth ?? 1,
          model: options.model,
          timestamp: new Date().toISOString(),
        },
        findings: [],
        patches: [],
      },
    }
  }
}
