NikCLI VS Code Extension

Open a chat panel that talks to the repository's `bin/nikcli` CLI.

Commands

- NikCLI: Open Chat (`nikcli.openChat`)

Development

- Run `npm install`
- Press F5 to launch the extension in a new Extension Development Host

The extension looks for `bin/nikcli` at the workspace root and streams stdin/stdout to a webview chat.

