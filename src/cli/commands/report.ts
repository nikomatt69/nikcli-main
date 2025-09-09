import path from 'path';
import fs from 'fs';
import { runAnalysisWithEvents } from '../engine/events';
import { AnalysisResult } from '../../types/report';
import { HTMLReporter, JSONReporter, Reporter } from '../reporters';

export interface ReportCmdOptions {
  out?: string;
  report?: string; // comma list: json,html
  depth?: number;
  model?: string;
}

export async function generateReports(
  opts: ReportCmdOptions,
): Promise<AnalysisResult> {
  const outDir = path.resolve(
    opts.out ||
      path.join(process.cwd(), '.nikcli', 'reports', String(Date.now())),
  );
  const reportKinds = (opts.report || 'json')
    .split(',')
    .map((s) => s.trim().toLowerCase());

  const reporters: Reporter[] = [];
  if (reportKinds.includes('json')) reporters.push(new JSONReporter());
  if (reportKinds.includes('html')) reporters.push(new HTMLReporter());

  for (const r of reporters) await r.init({ outDir });

  const { result } = await runAnalysisWithEvents(
    { path: process.cwd(), depth: opts.depth, model: opts.model },
    (e) => {
      // stream hook in case we want to attach live UI later
      reporters.forEach((r) => r.onEvent?.(e));
    },
  );

  for (const r of reporters) await r.finalize(result);

  // Also persist a small latest symlink/copy for VS Code extension to pick up
  try {
    const latest = path.resolve(
      path.join(process.cwd(), '.nikcli', 'reports', 'latest'),
    );
    fs.mkdirSync(path.dirname(latest), { recursive: true });
    try {
      fs.rmSync(latest, { recursive: true, force: true });
    } catch {}
    fs.cpSync(outDir, latest, { recursive: true });
  } catch {
    /* ignore */
  }

  return result;
}
