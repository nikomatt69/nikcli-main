// Esempio di integrazione dell'interfaccia web con nikCLI Background Agents
// Questo file mostra come estendere il sistema esistente per supportare l'interfaccia web

// 1. Estensione del BackgroundAgentService per supportare l'interfaccia web
class WebInterfaceIntegration {
    constructor(backgroundAgentService) {
        this.backgroundAgentService = backgroundAgentService;
        this.webClients = new Map();
        this.setupWebInterfaceSupport();
    }

    setupWebInterfaceSupport() {
        // Aggiungi supporto per Server-Sent Events
        this.backgroundAgentService.on('job:created', (job) => {
            this.broadcastToWebClients('job:created', job);
        });

        this.backgroundAgentService.on('job:started', (job) => {
            this.broadcastToWebClients('job:started', job);
        });

        this.backgroundAgentService.on('job:completed', (job) => {
            this.broadcastToWebClients('job:completed', job);
        });

        this.backgroundAgentService.on('job:failed', (job) => {
            this.broadcastToWebClients('job:failed', job);
        });

        this.backgroundAgentService.on('job:log', (jobId, logEntry) => {
            this.broadcastToWebClients('job:log', { jobId, logEntry });
        });
    }

    registerWebClient(clientId, response) {
        this.webClients.set(clientId, response);
        
        // Invia stato iniziale
        this.sendToClient(clientId, {
            type: 'initial_state',
            data: {
                jobs: this.backgroundAgentService.listJobs(),
                stats: this.backgroundAgentService.getStats()
            }
        });
    }

    unregisterWebClient(clientId) {
        this.webClients.delete(clientId);
    }

    broadcastToWebClients(event, data) {
        const message = JSON.stringify({ type: event, data });
        
        for (const [clientId, response] of this.webClients.entries()) {
            try {
                response.write(`data: ${message}\n\n`);
            } catch (error) {
                // Client disconnesso
                this.webClients.delete(clientId);
            }
        }
    }

    sendToClient(clientId, message) {
        const response = this.webClients.get(clientId);
        if (response) {
            try {
                response.write(`data: ${JSON.stringify(message)}\n\n`);
            } catch (error) {
                this.webClients.delete(clientId);
            }
        }
    }
}

// 2. Estensione delle API per supportare comandi chat
class ChatCommandProcessor {
    constructor(backgroundAgentService) {
        this.backgroundAgentService = backgroundAgentService;
        this.commandPatterns = this.initializeCommandPatterns();
    }

    initializeCommandPatterns() {
        return {
            // Pattern per avviare job
            startJob: [
                /avvia\s+(?:un\s+)?(?:background\s+)?agent\s+(?:per\s+)?(.+)/i,
                /start\s+(?:a\s+)?(?:background\s+)?agent\s+(?:to\s+)?(.+)/i,
                /crea\s+(?:un\s+)?job\s+(?:per\s+)?(.+)/i
            ],
            
            // Pattern per listare job
            listJobs: [
                /lista\s+(?:tutti\s+)?(?:i\s+)?job/i,
                /list\s+(?:all\s+)?jobs/i,
                /mostra\s+(?:tutti\s+)?(?:i\s+)?job/i,
                /show\s+(?:all\s+)?jobs/i
            ],
            
            // Pattern per status
            getStatus: [
                /status\s+(?:del\s+)?sistema/i,
                /system\s+status/i,
                /stato\s+(?:del\s+)?sistema/i
            ],
            
            // Pattern per logs
            getLogs: [
                /log\s+(?:recenti\s+)?/i,
                /recent\s+logs/i,
                /visualizza\s+(?:i\s+)?log/i
            ]
        };
    }

    processChatMessage(message) {
        const lowerMessage = message.toLowerCase();
        
        // Controlla pattern per avviare job
        for (const pattern of this.commandPatterns.startJob) {
            const match = message.match(pattern);
            if (match) {
                return this.handleStartJob(match[1], message);
            }
        }
        
        // Controlla pattern per listare job
        for (const pattern of this.commandPatterns.listJobs) {
            if (pattern.test(lowerMessage)) {
                return this.handleListJobs();
            }
        }
        
        // Controlla pattern per status
        for (const pattern of this.commandPatterns.getStatus) {
            if (pattern.test(lowerMessage)) {
                return this.handleGetStatus();
            }
        }
        
        // Controlla pattern per logs
        for (const pattern of this.commandPatterns.getLogs) {
            if (pattern.test(lowerMessage)) {
                return this.handleGetLogs();
            }
        }
        
        // Comando non riconosciuto
        return this.handleUnknownCommand(message);
    }

    async handleStartJob(task, originalMessage) {
        try {
            // Estrai dettagli dal messaggio
            const repo = this.extractRepository(originalMessage) || 'default/repo';
            const playbook = this.extractPlaybook(originalMessage) || 'default';
            
            const jobData = {
                repo: repo,
                baseBranch: 'main',
                task: task.trim(),
                playbook: playbook,
                limits: {
                    timeMin: 30,
                    maxToolCalls: 100,
                    maxMemoryMB: 2048
                }
            };
            
            const jobId = await this.backgroundAgentService.createJob(jobData);
            const job = this.backgroundAgentService.getJob(jobId);
            
            return {
                type: 'success',
                message: `✅ Background job avviato con successo!\n\n**Job ID:** ${jobId}\n**Repository:** ${repo}\n**Task:** ${task}\n**Status:** ${job.status}`,
                data: { jobId, job }
            };
        } catch (error) {
            return {
                type: 'error',
                message: `❌ Errore nell'avvio del job: ${error.message}`
            };
        }
    }

    async handleListJobs() {
        try {
            const jobs = this.backgroundAgentService.listJobs();
            
            if (jobs.length === 0) {
                return {
                    type: 'info',
                    message: '📋 Nessun background job trovato. Avvia un nuovo job chiedendomi di "avviare un agent per [tua attività]".'
                };
            }
            
            let message = `📋 **Background Jobs (${jobs.length} totali)**\n\n`;
            
            jobs.slice(0, 5).forEach(job => {
                const status = this.getStatusEmoji(job.status);
                const duration = this.formatDuration(job);
                message += `${status} **${job.id.substring(0, 8)}** - ${job.repo}\n`;
                message += `   Task: ${job.task.substring(0, 60)}${job.task.length > 60 ? '...' : ''}\n`;
                message += `   Status: ${job.status} | Creato: ${this.formatTime(job.createdAt)}\n`;
                if (duration) message += `   Durata: ${duration}\n`;
                message += '\n';
            });
            
            if (jobs.length > 5) {
                message += `... e ${jobs.length - 5} altri job. Usa il dashboard per vedere tutti i job.`;
            }
            
            return {
                type: 'success',
                message: message,
                data: { jobs }
            };
        } catch (error) {
            return {
                type: 'error',
                message: `❌ Errore nel recupero dei job: ${error.message}`
            };
        }
    }

    async handleGetStatus() {
        try {
            const stats = this.backgroundAgentService.getStats();
            
            let message = `📊 **Status del Sistema**\n\n`;
            message += `**Panoramica Job:**\n`;
            message += `• In esecuzione: ${stats.running || 0}\n`;
            message += `• In coda: ${stats.queued || 0}\n`;
            message += `• Completati: ${stats.succeeded || 0}\n`;
            message += `• Falliti: ${stats.failed || 0}\n\n`;
            message += `**Ultimo aggiornamento:** ${new Date().toLocaleTimeString()}`;
            
            return {
                type: 'success',
                message: message,
                data: { stats }
            };
        } catch (error) {
            return {
                type: 'error',
                message: `❌ Errore nel recupero dello status: ${error.message}`
            };
        }
    }

    async handleGetLogs() {
        try {
            const jobs = this.backgroundAgentService.listJobs();
            const recentLogs = [];
            
            jobs.forEach(job => {
                if (job.logs && job.logs.length > 0) {
                    job.logs.slice(-3).forEach(log => {
                        recentLogs.push({
                            jobId: job.id,
                            timestamp: log.timestamp,
                            level: log.level,
                            message: log.message
                        });
                    });
                }
            });
            
            if (recentLogs.length === 0) {
                return {
                    type: 'info',
                    message: '📝 Nessun log recente trovato.'
                };
            }
            
            let message = `📝 **Log Recenti**\n\n`;
            recentLogs.slice(0, 10).forEach(log => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                message += `[${time}] [${log.level.toUpperCase()}] ${log.message}\n`;
            });
            
            return {
                type: 'success',
                message: message,
                data: { logs: recentLogs }
            };
        } catch (error) {
            return {
                type: 'error',
                message: `❌ Errore nel recupero dei log: ${error.message}`
            };
        }
    }

    handleUnknownCommand(message) {
        return {
            type: 'help',
            message: `🤖 **nikCLI Background Agents Help**\n\nNon ho capito il comando "${message}". Ecco alcuni comandi che puoi provare:\n\n**Gestione Job:**\n• "Avvia un background agent per fixare i test falliti"\n• "Lista tutti i job in esecuzione"\n• "Mostra lo status del sistema"\n• "Visualizza i log recenti"\n\n**Esempi:**\n• "Avvia un agent per aggiornare le dipendenze"\n• "Lista tutti i job e mostra il loro progresso"\n• "Qual è lo status attuale del sistema?"`
        };
    }

    // Utility methods
    extractRepository(message) {
        const repoMatch = message.match(/(?:repo|repository)[:\s]+([a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_]+)/i);
        return repoMatch ? repoMatch[1] : null;
    }

    extractPlaybook(message) {
        const playbookMatch = message.match(/(?:playbook|template)[:\s]+([a-zA-Z0-9\-_]+)/i);
        return playbookMatch ? playbookMatch[1] : null;
    }

    getStatusEmoji(status) {
        const statusEmojis = {
            'queued': '⏳',
            'running': '🔄',
            'succeeded': '✅',
            'failed': '❌',
            'cancelled': '⏹️',
            'timeout': '⏰'
        };
        return statusEmojis[status] || '❓';
    }

    formatDuration(job) {
        if (!job.startedAt) return null;
        const endTime = job.completedAt || new Date();
        const duration = endTime - new Date(job.startedAt);
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    formatTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Ora';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m fa`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`;
        return date.toLocaleDateString();
    }
}

// 3. Estensione del server API per supportare l'interfaccia web
function setupWebInterfaceRoutes(app, backgroundAgentService) {
    const webIntegration = new WebInterfaceIntegration(backgroundAgentService);
    const chatProcessor = new ChatCommandProcessor(backgroundAgentService);

    // Endpoint per processare messaggi chat
    app.post('/v1/chat/message', async (req, res) => {
        try {
            const { message } = req.body;
            
            if (!message) {
                return res.status(400).json({
                    error: 'Message is required'
                });
            }

            const result = await chatProcessor.processChatMessage(message);
            
            res.json({
                success: true,
                result: result
            });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to process chat message',
                message: error.message
            });
        }
    });

    // Endpoint per Server-Sent Events
    app.get('/v1/jobs/stream', (req, res) => {
        const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Setup SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Registra il client
        webIntegration.registerWebClient(clientId, res);

        // Handle client disconnect
        req.on('close', () => {
            webIntegration.unregisterWebClient(clientId);
        });

        // Send periodic heartbeat
        const heartbeat = setInterval(() => {
            try {
                res.write(`data: ${JSON.stringify({ type: 'heartbeat', data: { timestamp: Date.now() } })}\n\n`);
            } catch (error) {
                clearInterval(heartbeat);
                webIntegration.unregisterWebClient(clientId);
            }
        }, 30000);

        req.on('close', () => {
            clearInterval(heartbeat);
        });
    });

    // Endpoint per configurazioni
    app.get('/v1/config', (req, res) => {
        try {
            const config = {
                apiUrl: process.env.API_URL || 'http://localhost:3000',
                maxConcurrentJobs: backgroundAgentService.maxConcurrentJobs,
                defaultTimeLimit: 30,
                defaultMemoryLimit: 2048,
                supportedPlaybooks: ['default', 'add-feature', 'fix-tests', 'upgrade-deps', 'security-audit'],
                supportedRepositories: ['default/repo'] // In produzione, questo verrebbe da una lista dinamica
            };
            
            res.json(config);
        } catch (error) {
            res.status(500).json({
                error: 'Failed to get configuration',
                message: error.message
            });
        }
    });

    // Endpoint per salvare configurazioni
    app.post('/v1/config', (req, res) => {
        try {
            const { config } = req.body;
            
            // Qui potresti salvare le configurazioni nel config manager
            // configManager.updateConfig(config);
            
            res.json({
                success: true,
                message: 'Configuration updated successfully'
            });
        } catch (error) {
            res.status(500).json({
                error: 'Failed to update configuration',
                message: error.message
            });
        }
    });
}

// Esporta le classi per l'uso
module.exports = {
    WebInterfaceIntegration,
    ChatCommandProcessor,
    setupWebInterfaceRoutes
};

// Esempio di utilizzo:
/*
const { WebInterfaceIntegration, ChatCommandProcessor, setupWebInterfaceRoutes } = require('./integration-example');

// Nel tuo server principale
const backgroundAgentService = new BackgroundAgentService();
const app = express();

// Setup delle route per l'interfaccia web
setupWebInterfaceRoutes(app, backgroundAgentService);

// Avvia il server
app.listen(3000, () => {
    console.log('🚀 nikCLI Background Agents API server running on port 3000');
    console.log('🌐 Web interface available at http://localhost:8080');
});
*/