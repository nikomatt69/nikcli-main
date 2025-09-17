// Mobile-optimized web interface for NikCLI
export default function handler(_req, res) {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>NikCLI Mobile</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: #0a0a0a;
            color: #00ff41;
            font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
            font-size: 14px;
            height: 100vh;
            overflow: hidden;
        }
        .header {
            background: #1a1a1a;
            padding: 8px 16px;
            border-bottom: 1px solid #333;
            display: flex;
            align-items: center;
            justify-content: between;
        }
        .logo { font-weight: bold; color: #00ff41; }
        .status { font-size: 12px; color: #666; margin-left: auto; }
        .shortcuts {
            background: #111;
            padding: 8px;
            border-bottom: 1px solid #333;
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
            overflow-x: auto;
        }
        .shortcut {
            background: #333;
            color: #00ff41;
            border: 1px solid #555;
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .shortcut:active { background: #555; }
        .terminal-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: calc(100vh - 120px);
        }
        .output {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-word;
            background: #0a0a0a;
        }
        .input-container {
            background: #1a1a1a;
            padding: 12px;
            border-top: 1px solid #333;
            display: flex;
            gap: 8px;
        }
        .input {
            flex: 1;
            background: #000;
            color: #00ff41;
            border: 1px solid #333;
            padding: 10px;
            font-family: inherit;
            font-size: 14px;
            border-radius: 4px;
        }
        .send-btn {
            background: #00ff41;
            color: #000;
            border: none;
            padding: 10px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        }
        .loading { color: #ffaa00; }
        .error { color: #ff4444; }
        .success { color: #00ff41; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">📱 NikCLI Mobile</div>
        <div class="status" id="status">Ready</div>
    </div>

    <div class="shortcuts">
        <button class="shortcut" onclick="sendCommand('/h')">/h</button>
        <button class="shortcut" onclick="sendCommand('/s')">/s</button>
        <button class="shortcut" onclick="sendCommand('/ls')">/ls</button>
        <button class="shortcut" onclick="sendCommand('/r')">/r</button>
        <button class="shortcut" onclick="sendCommand('/agents')">/agents</button>
        <button class="shortcut" onclick="sendCommand('/models')">/models</button>
        <button class="shortcut" onclick="sendCommand('/c')">/c</button>
        <button class="shortcut" onclick="sendCommand('1')">1</button>
        <button class="shortcut" onclick="sendCommand('2')">2</button>
        <button class="shortcut" onclick="sendCommand('3')">3</button>
    </div>

    <div class="terminal-container">
        <div class="output" id="output">🚀 NikCLI Mobile Terminal Ready
📱 Mobile optimizations enabled
💡 Use shortcuts above or type commands below

Type /h for help or ask anything...</div>
        <div class="input-container">
            <input
                type="text"
                class="input"
                id="input"
                placeholder="Type command or ask anything..."
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
            />
            <button class="send-btn" onclick="send()">Send</button>
        </div>
    </div>

    <script>
        const output = document.getElementById('output');
        const input = document.getElementById('input');
        const status = document.getElementById('status');

        let isLoading = false;

        function appendOutput(text, className = '') {
            const div = document.createElement('div');
            div.textContent = text;
            if (className) div.className = className;
            output.appendChild(div);
            output.scrollTop = output.scrollHeight;
        }

        async function sendCommand(command) {
            if (isLoading) return;

            const cmd = command || input.value.trim();
            if (!cmd) return;

            input.value = '';
            appendOutput('> ' + cmd, 'user-input');

            setLoading(true);

            try {
                const response = await fetch('/api/execute', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ command: cmd })
                });

                const result = await response.json();

                if (result.success) {
                    appendOutput(result.output, 'success');
                } else {
                    appendOutput('Error: ' + result.output, 'error');
                }
            } catch (error) {
                appendOutput('Network error: ' + error.message, 'error');
            } finally {
                setLoading(false);
            }
        }

        function setLoading(loading) {
            isLoading = loading;
            status.textContent = loading ? 'Processing...' : 'Ready';
            status.className = loading ? 'loading' : '';
        }

        function send() {
            sendCommand();
        }

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !isLoading) {
                send();
            }
        });

        // Auto-focus input on mobile
        input.addEventListener('blur', () => {
            setTimeout(() => input.focus(), 100);
        });

        // Initial focus
        setTimeout(() => input.focus(), 500);
    </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}