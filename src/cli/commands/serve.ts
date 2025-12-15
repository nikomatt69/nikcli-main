/**
 * NikCLI Serve Command
 * 
 * Starts NikCLI in server mode for desktop application integration.
 * Provides HTTP API and WebSocket terminal connection.
 */

import { Command } from "commander"
import express, { type Request, type Response, type Express } from "express"
import { WebSocketServer, WebSocket } from "ws"
import { createServer, type Server as HttpServer } from "http"
import chalk from "chalk"

interface ServeOptions {
    port: string
    host: string
}

interface TerminalMessage {
    type: "input" | "resize" | "ping"
    data?: string
    cols?: number
    rows?: number
}

/**
 * Creates the serve command for running NikCLI in server mode
 */
export function createServeCommand(): Command {
    return new Command("serve")
        .description("Start NikCLI in server mode for desktop integration")
        .option("-p, --port <port>", "Port to listen on", "3456")
        .option("--host <host>", "Host to bind to", "127.0.0.1")
        .action(async (options: ServeOptions) => {
            const port = parseInt(options.port, 10)
            const host = options.host

            console.log(chalk.cyan("⚡ NikCLI Server Mode"))
            console.log(chalk.gray(`   Starting server on ${host}:${port}...`))

            const app: Express = express()
            const server: HttpServer = createServer(app)
            const wss = new WebSocketServer({ server, path: "/terminal" })

            // Middleware
            app.use(express.json())

            // CORS for development
            app.use((req, res, next) => {
                res.header("Access-Control-Allow-Origin", "*")
                res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                res.header("Access-Control-Allow-Headers", "Content-Type")
                if (req.method === "OPTIONS") {
                    res.sendStatus(200)
                    return
                }
                next()
            })

            // Health check endpoint
            app.get("/health", (req: Request, res: Response) => {
                res.json({
                    status: "ok",
                    version: process.env.npm_package_version || "1.5.0",
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString()
                })
            })

            // API info endpoint
            app.get("/api/info", (req: Request, res: Response) => {
                res.json({
                    name: "NikCLI",
                    version: process.env.npm_package_version || "1.5.0",
                    mode: "desktop",
                    features: [
                        "ai-chat",
                        "code-generation",
                        "file-editing",
                        "web-search",
                        "tool-execution"
                    ]
                })
            })

            // Config endpoint
            app.get("/api/config", (req: Request, res: Response) => {
                res.json({
                    model: process.env.NIKCLI_MODEL || "claude-3.5-sonnet",
                    provider: process.env.NIKCLI_PROVIDER || "anthropic",
                    maxTokens: parseInt(process.env.NIKCLI_MAX_TOKENS || "8192", 10),
                    temperature: parseFloat(process.env.NIKCLI_TEMPERATURE || "0.7")
                })
            })

            // Track connected clients
            const clients = new Set<WebSocket>()

            // WebSocket for terminal PTY
            wss.on("connection", (ws: WebSocket) => {
                console.log(chalk.green("✓ Desktop client connected"))
                clients.add(ws)

                // Send welcome message
                ws.send(JSON.stringify({
                    type: "output",
                    data: `\x1b[36m⚡ NikCLI Desktop Connected\x1b[0m\n`
                }))

                // Handle terminal messages
                ws.on("message", (rawData: Buffer) => {
                    try {
                        const message: TerminalMessage = JSON.parse(rawData.toString())

                        switch (message.type) {
                            case "input":
                                if (message.data) {
                                    handleTerminalInput(ws, message.data)
                                }
                                break
                            case "resize":
                                if (message.cols && message.rows) {
                                    console.log(chalk.gray(`Terminal resized to ${message.cols}x${message.rows}`))
                                }
                                break
                            case "ping":
                                ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }))
                                break
                        }
                    } catch (err) {
                        console.error("Failed to parse WebSocket message:", err)
                    }
                })

                ws.on("close", () => {
                    console.log(chalk.yellow("○ Desktop client disconnected"))
                    clients.delete(ws)
                })

                ws.on("error", (err) => {
                    console.error("WebSocket error:", err)
                })
            })

            // Simple input handler (to be expanded)
            function handleTerminalInput(ws: WebSocket, input: string) {
                // Echo input for now - this will be connected to AI processing
                ws.send(JSON.stringify({
                    type: "output",
                    data: input
                }))
            }

            // Broadcast to all connected clients
            function broadcast(message: object) {
                const data = JSON.stringify(message)
                for (const client of clients) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(data)
                    }
                }
            }

            // Start server
            server.listen(port, host, () => {
                console.log(chalk.green("✓ NikCLI Server Ready"))
                console.log(chalk.gray(`   HTTP API: http://${host}:${port}`))
                console.log(chalk.gray(`   WebSocket: ws://${host}:${port}/terminal`))
                console.log(chalk.gray(`   Health: http://${host}:${port}/health`))
                console.log()
                console.log(chalk.dim("Press Ctrl+C to stop"))
            })

            // Graceful shutdown
            const shutdown = () => {
                console.log(chalk.yellow("\n⏹  Shutting down NikCLI Server..."))

                // Close all WebSocket connections
                for (const client of clients) {
                    client.close(1000, "Server shutting down")
                }

                server.close(() => {
                    console.log(chalk.green("✓ Server stopped"))
                    process.exit(0)
                })
            }

            process.on("SIGINT", shutdown)
            process.on("SIGTERM", shutdown)
        })
}
