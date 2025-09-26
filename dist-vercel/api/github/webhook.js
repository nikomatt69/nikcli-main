"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const webhook_handler_1 = require("../../src/cli/github-bot/webhook-handler");
// Initialize GitHub Bot configuration
const config = {
    githubToken: process.env.GITHUB_TOKEN,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_PRIVATE_KEY,
    installationId: process.env.GITHUB_INSTALLATION_ID
};
// Initialize webhook handler
let webhookHandler;
function getWebhookHandler() {
    if (!webhookHandler) {
        webhookHandler = new webhook_handler_1.GitHubWebhookHandler(config);
    }
    return webhookHandler;
}
async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-GitHub-Event, X-Hub-Signature-256');
        return res.status(200).end();
    }
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method not allowed',
            message: 'Only POST requests are supported'
        });
    }
    try {
        console.log('🤖 GitHub webhook received:', {
            method: req.method,
            headers: {
                'x-github-event': req.headers['x-github-event'],
                'x-hub-signature-256': req.headers['x-hub-signature-256'] ? 'present' : 'missing'
            }
        });
        // Validate required environment variables
        const requiredEnvVars = [
            'GITHUB_TOKEN',
            'GITHUB_WEBHOOK_SECRET',
            'GITHUB_APP_ID',
            'GITHUB_PRIVATE_KEY',
            'GITHUB_INSTALLATION_ID'
        ];
        const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
        if (missingVars.length > 0) {
            console.error('❌ Missing environment variables:', missingVars);
            return res.status(500).json({
                error: 'Configuration error',
                message: `Missing required environment variables: ${missingVars.join(', ')}`
            });
        }
        // Create mock Express request/response objects for compatibility
        const mockReq = {
            headers: req.headers,
            body: req.body,
            method: req.method,
            url: req.url
        };
        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    console.log(`📤 Response: ${code}`, data);
                    return res.status(code).json(data);
                },
                end: () => res.status(code).end()
            }),
            json: (data) => res.json(data),
            end: () => res.end()
        };
        // Handle webhook using existing handler
        const handler = getWebhookHandler();
        await handler.handleWebhook(mockReq, mockRes);
    }
    catch (error) {
        console.error('❌ Webhook handler error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development'
                ? (error instanceof Error ? error.message : 'Unknown error')
                : 'Something went wrong processing the webhook'
        });
    }
}
