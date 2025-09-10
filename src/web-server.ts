#!/usr/bin/env ts-node
// Web interface server launcher for Background Agents
import { BackgroundAgentsAPIServer, defaultAPIConfig } from './cli/background-agents/api/server';

async function startWebInterface() {
  console.log('🚀 Starting NikCLI Background Agents Web Interface...');
  
  // Enhanced config for web interface
  const webConfig = {
    ...defaultAPIConfig,
    port: 3000,
    cors: {
      origin: ['http://localhost:3001', 'http://localhost:3000', '*'], // Allow web interface
      credentials: true,
    },
  };

  const server = new BackgroundAgentsAPIServer(webConfig);
  
  try {
    await server.start();
    console.log('✅ Background Agents Web Interface is ready!');
    console.log('📱 Web Interface: http://localhost:3001 (Next.js dev server)');
    console.log('🔌 API Server: http://localhost:3000');
    console.log('📡 WebSocket: ws://localhost:3000/ws');
    console.log('\n🎯 Quick Start:');
    console.log('1. Run: npm run web:dev (in another terminal)');
    console.log('2. Open: http://localhost:3001');
    console.log('3. Configure GitHub integration');
    console.log('4. Create your first Background Agent!');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start web interface:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startWebInterface();
}