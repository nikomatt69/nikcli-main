import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

let statusItem: vscode.StatusBarItem | undefined;
let output: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('NikCLI');

  if (getConfig('statusBar', true)) {
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.text = 'NikCLI: Idle';
    statusItem.command = 'nikcli.openChat';
    statusItem.show();
    context.subscriptions.push(statusItem);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('nikcli.openChat', () => ChatPanel.createOrShow(context)),
    vscode.commands.registerCommand('nikcli.restart', () => ChatPanel.currentPanel?.restart()),
    vscode.commands.registerCommand('nikcli.stop', () => ChatPanel.currentPanel?.dispose()),
    vscode.commands.registerCommand('nikcli.healthCheck', () => healthCheck(context)),
    vscode.commands.registerCommand('nikcli.setApiKey', () => setApiKey(context))
  );

  if (getConfig('autoStart', false)) {
    ChatPanel.createOrShow(context);
  }
}

export function deactivate() {}

class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private pty?: cp.ChildProcessWithoutNullStreams;
  private disposed = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.options = { enableScripts: true };
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, []);
    this.setupMessageHandlers();
  }

  static createOrShow(context: vscode.ExtensionContext) {
    const column = vscode.window.activeTextEditor?.viewColumn;
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'nikcliChat',
      'NikCLI Chat',
      column ?? vscode.ViewColumn.Two,
      { enableScripts: true }
    );
    ChatPanel.currentPanel = new ChatPanel(panel, context.extensionUri);
  }

  private setupMessageHandlers() {
    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'init':
          this.spawnCli();
          break;
        case 'input':
          this.write(msg.data);
          break;
      }
    });
  }

  private spawnCli() {
    const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const cfgPath = getConfig<string>('cli.path', path.join(repoRoot, 'bin', 'nikcli'));
    const cfgArgs = getConfig<string[]>('cli.args', []);
    const forceStructured = getConfig<boolean>('forceStructuredUI', false);
    const extraEnv = getConfig<Record<string, string>>('env', {});

    const env = { ...process.env, ...(forceStructured ? { FORCE_STRUCTURED_UI: 'true' } : {}), ...extraEnv } as NodeJS.ProcessEnv;
    const args = Array.isArray(cfgArgs) ? cfgArgs : [];

    try {
      output?.appendLine(`[NikCLI] Spawning: ${cfgPath} ${args.join(' ')}`);
      this.pty = cp.spawn(cfgPath, args, { cwd: repoRoot, env });
    } catch (e: any) {
      const msg = `Failed to spawn NikCLI: ${e?.message || e}`;
      vscode.window.showErrorMessage(msg);
      output?.appendLine(msg);
      return;
    }

    statusItem && (statusItem.text = 'NikCLI: Running');
    this.pty.stdout.on('data', (d) => {
      const text = d.toString();
      this.post('output', text);
      output?.append(text);
    });
    this.pty.stderr.on('data', (d) => {
      const text = d.toString();
      this.post('output', text);
      output?.append(text);
    });
    this.pty.on('close', (code) => {
      const text = `process exited with code ${code}`;
      this.post('status', text);
      output?.appendLine(`[NikCLI] ${text}`);
      statusItem && (statusItem.text = 'NikCLI: Stopped');
    });
    this.pty.on('error', (err) => {
      const text = `failed to start: ${String(err?.message || err)}`;
      this.post('status', text);
      output?.appendLine(`[NikCLI] ${text}`);
      statusItem && (statusItem.text = 'NikCLI: Error');
    });
  }

  private write(data: string) {
    if (!this.pty) return;
    try {
      this.pty.stdin.write(data + '\n');
    } catch {}
  }

  private post(type: string, data: string) {
    this.panel.webview.postMessage({ type, data });
  }

  private getHtml(): string {
    const csp = "default-src 'none'; img-src https: data:; script-src 'nonce-abc'; style-src 'unsafe-inline'";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="${csp}"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>NikCLI Chat</title></head><body>
      <div id="root" style="height:100vh;display:flex;flex-direction:column;font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);">
        <div id="chat" style="flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px;"></div>
        <form id="form" style="display:flex;gap:8px;border-top:1px solid var(--vscode-panel-border);padding:8px;">
          <textarea id="input" rows="1" style="flex:1;padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);resize:vertical;" placeholder="Type message or /command. Shift+Enter for newline. Enter to send."></textarea>
          <button title="Send">Send</button>
        </form>
      </div>
      <script nonce="abc">
        const vscode = acquireVsCodeApi();
        const chat = document.getElementById('chat');
        const form = document.getElementById('form');
        const input = document.getElementById('input');
        vscode.postMessage({ type: 'init' });
        let currentAssistantBubble = null;
        let buffer = '';
        form.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); form.dispatchEvent(new Event('submit')); }});
        form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value.trim(); if (!v) return; addBubble('user', v); vscode.postMessage({ type: 'input', data: v }); input.value=''; input.focus(); });
        window.addEventListener('message', (e) => { const { type, data } = e.data; if (type === 'output') { onChunk(data); } if (type === 'status') { addSystem(stripAnsi(data)); } });
        function onChunk(chunk){ chunk = stripAnsi(chunk); buffer += chunk; ensureAssistant(); currentAssistantBubble.textContent += chunk; chat.scrollTop = chat.scrollHeight; if (looksLikePrompt(buffer)) { finalizeAssistant(); buffer=''; } }
        function ensureAssistant(){ if(!currentAssistantBubble){ currentAssistantBubble = addBubble('assistant',''); } }
        function finalizeAssistant(){ currentAssistantBubble = null; }
        function addBubble(role, text){ const div = document.createElement('div'); const bg = role==='user'? 'var(--vscode-button-background)':'var(--vscode-editor-inactiveSelectionBackground)'; const align = role==='user'? 'flex-end':'flex-start'; div.style.cssText = 'max-width:80%;padding:8px;border-radius:8px;white-space:pre-wrap;'; div.style.background = bg; div.style.color = 'inherit'; const row = document.createElement('div'); row.style.cssText = 'display:flex;width:100%;'; row.style.justifyContent = align; div.textContent = text; row.appendChild(div); chat.appendChild(row); chat.scrollTop = chat.scrollHeight; return div; }
        function addSystem(text){ const row = document.createElement('div'); row.style.cssText = 'font-size:12px;color:var(--vscode-descriptionForeground);padding:4px 8px;'; row.textContent = text; chat.appendChild(row); chat.scrollTop = chat.scrollHeight; }
        function looksLikePrompt(t){ return /(└─❯\s*$|\n\s*└─❯\s*$)/m.test(t); }
        function stripAnsi(s){ return s.replace(/\u001b\[[0-9;]*m/g, ''); }
      </script>
    </body></html>`;
  }

  dispose() {
    if (this.disposed) return;
    if (this.pty) {
      try { this.pty.stdin.end(); this.pty.kill(); } catch {}
      this.pty = undefined;
    }
    ChatPanel.currentPanel = undefined;
    this.disposed = true;
    statusItem && (statusItem.text = 'NikCLI: Idle');
  }

  restart() {
    try { this.dispose(); } catch {}
    ChatPanel.currentPanel = this;
    this.disposed = false;
    this.panel.webview.html = this.getHtml();
    this.setupMessageHandlers();
  }
}

function getConfig<T>(key: string, fallback: T): T {
  const config = vscode.workspace.getConfiguration('nikcli');
  const value = config.get<T>(key);
  return (value === undefined ? fallback : value) as T;
}

async function setApiKey(context: vscode.ExtensionContext) {
  const selection = await vscode.window.showQuickPick([
    { label: 'ANTHROPIC_API_KEY' },
    { label: 'OPENAI_API_KEY' },
    { label: 'GOOGLE_GENERATIVE_AI_API_KEY' },
    { label: 'AI_GATEWAY_API_KEY' }
  ], { placeHolder: 'Select API key to set' });
  if (!selection) return;
  const secret = await vscode.window.showInputBox({ prompt: `Enter value for ${selection.label}`, ignoreFocusOut: true, password: true });
  if (!secret) return;
  await context.secrets.store(selection.label, secret);
  vscode.window.showInformationMessage(`Stored ${selection.label} in VS Code secret storage.`);
}

async function healthCheck(context: vscode.ExtensionContext) {
  const repoRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const cfgPath = getConfig<string>('cli.path', path.join(repoRoot, 'bin', 'nikcli'));
  const exists = await fileExists(cfgPath);
  const results: string[] = [];
  results.push(`CLI path: ${cfgPath} ${exists ? '✅' : '❌ not found'}`);
  const keys = ['ANTHROPIC_API_KEY','OPENAI_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY','AI_GATEWAY_API_KEY'];
  for (const k of keys) {
    const secret = await context.secrets.get(k);
    results.push(`${k}: ${secret ? '🔒 stored' : '—'}`);
  }
  output?.appendLine(results.join('\n'));
  vscode.window.showInformationMessage('NikCLI Health Check completed. See Output: NikCLI');
}

async function fileExists(p: string): Promise<boolean> {
  try { await vscode.workspace.fs.stat(vscode.Uri.file(p)); return true; } catch { return false; }
}

