import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('nikcli.openChat', () => {
    ChatPanel.createOrShow(context);
  });
  context.subscriptions.push(disposable);
}

export function deactivate() {}

class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private pty?: cp.ChildProcessWithoutNullStreams;

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
    const binPath = path.join(repoRoot, 'bin', 'nikcli');

    const env = { ...process.env, FORCE_STRUCTURED_UI: 'false' } as NodeJS.ProcessEnv;
    this.pty = cp.spawn(binPath, [], { cwd: repoRoot, env });
    this.pty.stdout.on('data', (d) => this.post('output', d.toString()));
    this.pty.stderr.on('data', (d) => this.post('output', d.toString()));
    this.pty.on('close', (code) => this.post('status', `process exited with code ${code}`));
    this.pty.on('error', (err) => this.post('status', `failed to start: ${String(err.message || err)}`));
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
    return `<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/><meta http-equiv=\"Content-Security-Policy\" content=\"${csp}\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><title>NikCLI Chat</title></head><body>
      <div id=\"root\" style=\"height:100vh;display:flex;flex-direction:column;font-family:var(--vscode-font-family);background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);\">
        <div id=\"output\" style=\"flex:1;overflow:auto;white-space:pre-wrap;padding:8px;font-family:monospace;\"></div>
        <form id=\"form\" style=\"display:flex;gap:8px;border-top:1px solid var(--vscode-panel-border);padding:8px;\">
          <input id=\"input\" type=\"text\" style=\"flex:1;padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);\" placeholder=\"Type message or /command and press Enter\"/>
          <button>Send</button>
        </form>
      </div>
      <script nonce=\"abc\">
        const vscode = acquireVsCodeApi();
        const out = document.getElementById('output');
        const form = document.getElementById('form');
        const input = document.getElementById('input');
        vscode.postMessage({ type: 'init' });
        form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; if (!v) return; vscode.postMessage({ type: 'input', data: v }); input.value=''; });
        window.addEventListener('message', (e) => { const { type, data } = e.data; if (type === 'output') { append(stripAnsi(data)); } if (type === 'status') { append('\n' + stripAnsi(data) + '\n'); } });
        function append(text){ out.textContent += text; out.scrollTop = out.scrollHeight; }
        function stripAnsi(s){ return s.replace(/\u001b\[[0-9;]*m/g, ''); }
      </script>
    </body></html>`;
  }

  dispose() {
    if (this.pty) {
      try { this.pty.stdin.end(); this.pty.kill(); } catch {}
    }
    ChatPanel.currentPanel = undefined;
  }
}

