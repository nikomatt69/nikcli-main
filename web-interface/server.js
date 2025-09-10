#!/usr/bin/env node

// nikCLI Background Agents Web Interface Server
// Un server Express che serve l'interfaccia web e gestisce le API

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Configurazione
const config = {
    port: process.env.PORT || 8080,
    apiPort: process.env.API_PORT || 3000,
    cors: {
        origin: [
            'http://localhost:8080',
            'http://127.0.0.1:8080',
            'http://localhost:3001',
            'http://127.0.0.1:3001'
        ],
        credentials: true
    },
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000 // 1000 requests per window
    }
};

// Inizializza Express app
const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", `http://localhost:${config.apiPort}`, `http://127.0.0.1:${config.apiPort}`]
        }
    }
}));

app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit(config.rateLimit);
app.use('/api/', limiter);

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// API Routes
app.get('/api/config', (req, res) => {
    try {
        const configData = {
            apiUrl: `http://localhost:${config.apiPort}`,
            maxConcurrentJobs: 3,
            defaultTimeLimit: 30,
            defaultMemoryLimit: 2048,
            supportedPlaybooks: ['default', 'add-feature', 'fix-tests', 'upgrade-deps', 'security-audit'],
            supportedRepositories: ['default/repo'],
            features: {
                chat: true,
                dashboard: true,
                realTimeUpdates: true,
                notifications: true
            }
        };
        
        res.json(configData);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get configuration',
            message: error.message
        });
    }
});

// Proxy per le API del background agents service
app.use('/api/v1', (req, res) => {
    const apiUrl = `http://localhost:${config.apiPort}/v1${req.path}`;
    
    // Forward request to background agents API
    const fetch = require('node-fetch');
    
    fetch(apiUrl, {
        method: req.method,
        headers: {
            'Content-Type': 'application/json',
            ...req.headers
        },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    })
    .then(response => response.json())
    .then(data => res.json(data))
    .catch(error => {
        console.error('API Proxy Error:', error);
        res.status(500).json({
            error: 'API Proxy Error',
            message: error.message
        });
    });
});

// Chat message processing
app.post('/api/chat/message', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({
                error: 'Message is required'
            });
        }

        // Processa il messaggio chat
        const result = await processChatMessage(message);
        
        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        console.error('Chat processing error:', error);
        res.status(500).json({
            error: 'Failed to process chat message',
            message: error.message
        });
    }
});

// Funzione per processare messaggi chat
async function processChatMessage(message) {
    const lowerMessage = message.toLowerCase();
    
    // Pattern per riconoscere comandi
    if (lowerMessage.includes('start') && (lowerMessage.includes('agent') || lowerMessage.includes('job'))) {
        return {
            type: 'start_job',
            message: `🚀 Comando riconosciuto: Avvio background agent\n\nPer avviare un job, usa l'API del background agents service.`,
            data: { command: 'start_job', originalMessage: message }
        };
    }
    
    if (lowerMessage.includes('list') && (lowerMessage.includes('job') || lowerMessage.includes('agent'))) {
        return {
            type: 'list_jobs',
            message: `📋 Comando riconosciuto: Lista job\n\nPer vedere i job, usa l'API del background agents service.`,
            data: { command: 'list_jobs', originalMessage: message }
        };
    }
    
    if (lowerMessage.includes('status') || lowerMessage.includes('dashboard')) {
        return {
            type: 'get_status',
            message: `📊 Comando riconosciuto: Status sistema\n\nPer vedere lo status, usa l'API del background agents service.`,
            data: { command: 'get_status', originalMessage: message }
        };
    }
    
    if (lowerMessage.includes('help') || lowerMessage.includes('aiuto')) {
        return {
            type: 'help',
            message: `🤖 **nikCLI Background Agents Help**\n\nComandi supportati:\n\n**Gestione Job:**\n• "Avvia un background agent per [task]"\n• "Lista tutti i job"\n• "Mostra lo status del sistema"\n\n**Esempi:**\n• "Avvia un agent per fixare i test falliti"\n• "Lista tutti i job in esecuzione"\n• "Qual è lo status attuale?"\n\n**Note:**\nQuesta è un'interfaccia demo. Per funzionalità complete, assicurati che il background agents service sia in esecuzione.`
        };
    }
    
    // Comando non riconosciuto
    return {
        type: 'unknown',
        message: `🤔 Non ho capito il comando "${message}".\n\nProva a chiedermi:\n• "Avvia un background agent per [tua attività]"\n• "Lista tutti i job"\n• "Mostra lo status del sistema"\n• "Aiuto" per vedere tutti i comandi`
    };
}

// Server-Sent Events per aggiornamenti real-time
app.get('/api/events', (req, res) => {
    // Setup SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`New SSE client connected: ${clientId}`);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', data: { clientId, timestamp: Date.now() } })}\n\n`);

    // Send periodic heartbeat
    const heartbeat = setInterval(() => {
        try {
            res.write(`data: ${JSON.stringify({ type: 'heartbeat', data: { timestamp: Date.now() } })}\n\n`);
        } catch (error) {
            clearInterval(heartbeat);
            console.log(`SSE client disconnected: ${clientId}`);
        }
    }, 30000);

    // Handle client disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        console.log(`SSE client disconnected: ${clientId}`);
    });
});

// Catch-all handler per SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Start server
const server = app.listen(config.port, () => {
    console.log('🚀 nikCLI Background Agents Web Interface');
    console.log(`📱 Web Interface: http://localhost:${config.port}`);
    console.log(`🔗 API Proxy: http://localhost:${config.port}/api/v1`);
    console.log(`💬 Chat API: http://localhost:${config.port}/api/chat`);
    console.log(`📡 Events: http://localhost:${config.port}/api/events`);
    console.log('');
    console.log('📋 Note:');
    console.log(`   • Assicurati che il background agents service sia in esecuzione su porta ${config.apiPort}`);
    console.log('   • L\'interfaccia web funziona come proxy per le API del background agents service');
    console.log('   • Usa Ctrl+C per fermare il server');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down web interface server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down web interface server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

module.exports = app;