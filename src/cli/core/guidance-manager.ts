import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * GuidanceManager collects instructions from AGENTS.md, CLAUDE.md, CODEX.md
 * at various levels: home dir, repo root, current directory.
 */
export class GuidanceManager {
  private files = [
    path.join(os.homedir(), '.nikcli', 'AGENTS.md', 'CLAUDE.md', 'NIKOCLI.md', 'CODEX.md'),
    'AGENTS.md',
    path.join(process.cwd(), 'AGENTS.md'),
  ];

  /** Read and merge guidance content from files. */
  async getGuidance(): Promise<string> {
    let guidance = '';
    for (const f of this.files) {
      try {
        const content = await fs.readFile(f, 'utf-8');
        guidance += `
---
# Source: ${f}

${content}
`;
      } catch { /* ignore missing */ }
    }
    return guidance.trim();
  }
}
