import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AnalysisResult } from '../../types/report'
export interface ReporterContext {
  outDir: string
}
export interface Reporter {
  init(ctx: ReporterContext): Promise<void> | void
  onEvent?(event: any): Promise<void> | void // optional streaming hook
  finalize(result: AnalysisResult): Promise<void> | void
}
export class JSONReporter implements Reporter {
  private ctx!: ReporterContext
  async init(ctx: ReporterContext) {
    this.ctx = ctx
    if (!fs.existsSync(ctx.outDir)) fs.mkdirSync(ctx.outDir, { recursive: true })
  }
  async finalize(result: AnalysisResult) {
    const outPath = path.join(this.ctx.outDir, 'report.json')
    await fs.promises.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8')
    process.stdout.write(`\n📝 JSON report: ${outPath}\n`)
  }
}
export class HTMLReporter implements Reporter {
  private ctx!: ReporterContext
  async init(ctx: ReporterContext) {
    this.ctx = ctx
    if (!fs.existsSync(ctx.outDir)) fs.mkdirSync(ctx.outDir, { recursive: true })
  }
  async finalize(result: AnalysisResult) {
    const html = this.renderHTML(result)
    const outPath = path.join(this.ctx.outDir, 'report.html')
    await fs.promises.writeFile(outPath, html, 'utf8')
    process.stdout.write(`📄 HTML report: ${outPath}\n`)
  }
  private renderHTML(result: AnalysisResult): string {
    const payload = JSON.stringify(result).replace(/</g, '\\u003c')
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NikCLI Report — ${result.id}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin:0; display:flex; height:100vh; }
    #sidebar { width: 320px; border-right: 1px solid #e5e7eb; padding: 12px; overflow:auto; }
    #main { flex:1; padding: 16px; overflow:auto; }
    .item { padding: 6px 8px; border-radius: 6px; cursor: pointer; }
    .item:hover { background: #f3f4f6; }
    .sev-info{color:#2563eb}.sev-low{color:#10b981}.sev-medium{color:#f59e0b}.sev-high{color:#ef4444}.sev-critical{color:#7c3aed}
    pre { background: #0b1020; color:#e5e7eb; padding: 12px; border-radius: 8px; overflow:auto; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .meta { color:#6b7280; font-size: 12px; }
    .pill { display:inline-block; padding:2px 6px; border-radius:999px; font-size:11px; margin-left:6px; border:1px solid #e5e7eb }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
  </style>
</head>
<body>
  <div id="sidebar">
    <h3>Findings (${result.findings?.length || 0})</h3>
    <div id="findings"></div>
    <h3 style="margin-top:12px">Patches (${result.patches?.length || 0})</h3>
    <div id="patches"></div>
  </div>
  <div id="main">
    <h2>${result.repoPath}</h2>
    <div class="meta">${result.config?.model || ''} • depth ${result.config?.depth ?? ''} • ${result.startedAt} → ${result.finishedAt}</div>
    <p>${(result.summary || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
    <div id="detail"></div>
  </div>
  <script>
    (function(){
      function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
      const data = ${payload};
      const findingsEl = document.getElementById('findings');
      const patchesEl = document.getElementById('patches');
      const detail = document.getElementById('detail');
      function sevClass(s){ return 'sev-' + (s||'info'); }
      function renderFinding(f){
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = '<strong class="'+ sevClass(f.severity) +'">' + esc(f.title) + '</strong> <span class="pill">' + esc(f.severity) + '</span>';
        div.onclick = function(){
          var html = '';
          html += '<h3>' + esc(f.title) + ' <span class="pill">' + esc(f.severity) + '</span></h3>';
          html += '<p>' + (f.description ? esc(f.description) : '') + '</p>';
          if(Array.isArray(f.evidence)){
            for(var i=0;i<f.evidence.length;i++){
              var e = f.evidence[i];
              html += '<div class="meta">' + esc(e.file || '') + (e.startLine ? ':' + esc(e.startLine) : '') + '</div>';
              if(e.snippet){ html += '<pre><code>' + esc(e.snippet) + '</code></pre>'; }
            }
          }
          detail.innerHTML = html;
        };
        findingsEl.appendChild(div);
      }
      function renderPatch(p){
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = '<strong>' + esc(p.filePath) + '</strong> <span class="pill">' + esc(p.status || '') + '</span>';
        div.onclick = function(){
          var hunks = '';
          if(Array.isArray(p.hunks)){
            for(var i=0;i<p.hunks.length;i++){
              var h = p.hunks[i];
              if(Array.isArray(h.lines)) hunks += h.lines.join('\n') + '\n';
            }
          }
          var html = '';
          html += '<h3>' + esc(p.filePath) + ' <span class="pill">' + esc(p.status || '') + '</span></h3>';
          if(p.rationale) html += '<p>' + esc(p.rationale) + '</p>';
          html += '<pre><code>' + esc(hunks) + '</code></pre>';
          html += '<p class="meta">Apply with: git apply -p0</p>';
          detail.innerHTML = html;
        };
        patchesEl.appendChild(div);
      }
      (data.findings||[]).forEach(renderFinding);
      (data.patches||[]).forEach(renderPatch);
    })();
  </script>
</body>
</html>`
  }
}
