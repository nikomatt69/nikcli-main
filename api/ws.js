// WebSocket handler for terminal communication
import { spawn } from 'child_process'
import path from 'path'

export default function handler(req, res) {
  // Vercel doesn't support WebSockets natively
  // Alternative: Server-Sent Events for mobile terminal

  if (req.method === 'POST') {
    const { command } = req.body;

    try {
      // Execute NikCLI command
      const nikcli = spawn('node', [
        path.join(process.cwd(), 'dist/cli/index.js'),
        '--api-mode',
        command
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MOBILE_MODE: 'true',
          API_MODE: 'true'
        }
      });

      let output = '';

      nikcli.stdout.on('data', (data) => {
        output += data.toString();
      });

      nikcli.stderr.on('data', (data) => {
        output += data.toString();
      });

      nikcli.on('close', (code) => {
        res.json({
          success: code === 0,
          output,
          code
        });
      });

      // Timeout dopo 30 secondi
      setTimeout(() => {
        nikcli.kill();
        res.json({
          success: false,
          output: output || 'Command timeout',
          code: 124
        });
      }, 30000);

    } catch (error) {
      res.status(500).json({
        success: false,
        output: error.message,
        code: 1
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}