// Vercel Function for web terminal access
export default function handler(req, res) {
  if (req.method === 'GET') {
    // Serve terminal web interface
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NikCLI Mobile Terminal</title>
    <style>
        body {
            margin: 0;
            padding: 10px;
            background: #000;
            color: #0f0;
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        #terminal {
            width: 100%;
            height: 90vh;
            background: #000;
            color: #0f0;
            border: none;
            outline: none;
            font-family: inherit;
            font-size: inherit;
            resize: none;
        }
        #input {
            width: 100%;
            background: #000;
            color: #0f0;
            border: 1px solid #333;
            padding: 8px;
            font-family: inherit;
        }
        .mobile-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin: 10px 0;
        }
        .btn {
            background: #333;
            color: #0f0;
            border: 1px solid #555;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
        }
        .btn:active { background: #555; }
    </style>
</head>
<body>
    <div class="mobile-buttons">
        <button class="btn" onclick="sendCommand('/h')">/h Help</button>
        <button class="btn" onclick="sendCommand('/s')">/s Status</button>
        <button class="btn" onclick="sendCommand('/ls')">/ls List</button>
        <button class="btn" onclick="sendCommand('/c')">/c Clear</button>
        <button class="btn" onclick="sendCommand('/q')">/q Quit</button>
    </div>
    <textarea id="terminal" readonly placeholder="NikCLI Terminal Loading..."></textarea>
    <input id="input" type="text" placeholder="Type command or message..." />

    <script>
        const terminal = document.getElementById('terminal');
        const input = document.getElementById('input');
        let ws;

        function connect() {
            const wsUrl = location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(wsUrl + '//' + location.host + '/api/ws');

            ws.onopen = () => {
                terminal.value += '🟢 Connected to NikCLI\\n';
                terminal.scrollTop = terminal.scrollHeight;
            };

            ws.onmessage = (event) => {
                terminal.value += event.data;
                terminal.scrollTop = terminal.scrollHeight;
            };

            ws.onclose = () => {
                terminal.value += '🔴 Disconnected. Reconnecting...\\n';
                setTimeout(connect, 2000);
            };
        }

        function sendCommand(cmd) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(cmd);
                input.value = '';
            }
        }

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendCommand(input.value);
            }
        });

        // Mobile-friendly touch events
        input.addEventListener('touchstart', () => {
            input.focus();
        });

        connect();
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  }
}