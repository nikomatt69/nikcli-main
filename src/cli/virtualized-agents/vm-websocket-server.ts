import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import {
  VMMessage,
  VMWebSocketConfig,
  VMConnectionEvent,
  VMCommunicationError,
  validateVMMessage,
  DEFAULT_VM_WEBSOCKET_CONFIG,
  VMHeartbeat,
  VMSessionInit,
  VMEventEmitter
} from './vm-message-types';
import chalk from 'chalk';

/**
 * VMWebSocketServer - Server WebSocket per comunicazione con agenti VM
 * 
 * Gestisce connessioni WebSocket multiple con containers VM,
 * routing dei messaggi, heartbeat e reconnessioni automatiche.
 */
export class VMWebSocketServer extends EventEmitter implements VMEventEmitter {
  private wss?: WebSocketServer;
  private config: VMWebSocketConfig;
  private connections: Map<string, VMConnection> = new Map();
  private isRunning: boolean = false;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(config?: Partial<VMWebSocketConfig>) {
    super();
    this.config = { ...DEFAULT_VM_WEBSOCKET_CONFIG, ...config };
  }

  /**
   * Avvia il server WebSocket
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('WebSocket server already running');
    }

    try {
      this.wss = new WebSocketServer({
        port: this.config.port,
        host: this.config.host,
        path: this.config.path,
        // Note: maxBackpressure, maxCompressedSize, maxPayloadLength are ws-specific options
        // They may not be supported in all WebSocket implementations
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleServerError.bind(this));

      // Setup heartbeat system
      this.setupHeartbeat();

      this.isRunning = true;
      console.log(chalk.green(`🌐 VM WebSocket Server started on ${this.config.host}:${this.config.port}${this.config.path}`));

    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to start VM WebSocket Server: ${error.message}`));
      throw error;
    }
  }

  /**
   * Ferma il server WebSocket
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Clear heartbeat
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = undefined;
      }

      // Close all connections
      for (const [containerId, connection] of this.connections) {
        await this.closeConnection(containerId, 'server_shutdown');
      }

      // Close server
      if (this.wss) {
        await new Promise<void>((resolve, reject) => {
          this.wss!.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      this.isRunning = false;
      console.log(chalk.yellow('🌐 VM WebSocket Server stopped'));

    } catch (error: any) {
      console.error(chalk.red(`❌ Error stopping VM WebSocket Server: ${error.message}`));
      throw error;
    }
  }

  /**
   * Invia messaggio a container specifico
   */
  async sendMessage(containerId: string, message: VMMessage): Promise<boolean> {
    const connection = this.connections.get(containerId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      throw new VMCommunicationError(
        `Container ${containerId} not connected`,
        containerId,
        'NOT_CONNECTED'
      );
    }

    try {
      const serialized = JSON.stringify(message);
      connection.ws.send(serialized);
      connection.lastActivity = new Date();
      connection.messagesSent++;
      
      console.log(chalk.blue(`📤 Sent message to ${containerId}: ${message.type}`));
      return true;

    } catch (error: any) {
      const vmError = new VMCommunicationError(
        `Failed to send message to ${containerId}: ${error.message}`,
        containerId,
        'SEND_FAILED',
        true
      );
      this.emit('error', vmError);
      throw vmError;
    }
  }

  /**
   * Broadcast messaggio a tutti i containers connessi
   */
  async broadcast(message: VMMessage): Promise<number> {
    let sentCount = 0;
    const promises: Promise<boolean>[] = [];

    for (const containerId of this.connections.keys()) {
      promises.push(
        this.sendMessage(containerId, message).catch(() => false)
      );
    }

    const results = await Promise.allSettled(promises);
    sentCount = results.filter(result => result.status === 'fulfilled' && result.value).length;

    console.log(chalk.cyan(`📡 Broadcast sent to ${sentCount}/${this.connections.size} containers`));
    return sentCount;
  }

  /**
   * Ottieni informazioni su tutte le connessioni
   */
  getConnections(): Map<string, VMConnectionInfo> {
    const info = new Map<string, VMConnectionInfo>();
    
    for (const [containerId, connection] of this.connections) {
      info.set(containerId, {
        containerId,
        sessionId: connection.sessionId,
        status: this.getConnectionStatus(connection.ws),
        connectedAt: connection.connectedAt,
        lastActivity: connection.lastActivity,
        messagesSent: connection.messagesSent,
        messagesReceived: connection.messagesReceived
      });
    }

    return info;
  }

  /**
   * Chiudi connessione container specifico
   */
  async closeConnection(containerId: string, reason: string = 'manual'): Promise<void> {
    const connection = this.connections.get(containerId);
    if (!connection) return;

    try {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close(1000, reason);
      }
      
      this.connections.delete(containerId);
      
      const event: VMConnectionEvent = {
        type: 'disconnected',
        containerId,
        sessionId: connection.sessionId,
        timestamp: new Date(),
        details: { reason }
      };
      
      this.emit('disconnected', containerId);
      console.log(chalk.yellow(`🔌 Container ${containerId} disconnected: ${reason}`));

    } catch (error: any) {
      console.error(chalk.red(`❌ Error closing connection for ${containerId}: ${error.message}`));
    }
  }

  /**
   * Controlla se container è connesso
   */
  isConnected(containerId: string): boolean {
    const connection = this.connections.get(containerId);
    return connection !== undefined && connection.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Ottieni statistiche server
   */
  getServerStats(): VMServerStats {
    const connections = Array.from(this.connections.values());
    const totalMessagesSent = connections.reduce((sum, conn) => sum + conn.messagesSent, 0);
    const totalMessagesReceived = connections.reduce((sum, conn) => sum + conn.messagesReceived, 0);

    return {
      isRunning: this.isRunning,
      activeConnections: this.connections.size,
      totalMessagesSent,
      totalMessagesReceived,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      config: this.config
    };
  }

  // Private methods
  private startTime: number = Date.now();

  private handleConnection(ws: WebSocket, request: any): void {
    console.log(chalk.green('🔌 New WebSocket connection received'));

    // Setup connection handlers
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('close', (code, reason) => this.handleClose(ws, code, reason.toString()));
    ws.on('error', (error) => this.handleConnectionError(ws, error));
    ws.on('pong', () => this.handlePong(ws));

    // Wait for session initialization
    const initTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(4000, 'Session initialization timeout');
      }
    }, 10000); // 10 second timeout

    // Store temporary connection until initialized
    (ws as any)._initTimeout = initTimeout;
  }

  private async handleMessage(ws: WebSocket, data: any): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as VMMessage;

      if (!validateVMMessage(message)) {
        throw new Error('Invalid message format');
      }

      // Handle session initialization
      if (message.type === 'session_init') {
        await this.handleSessionInit(ws, message as VMSessionInit);
        return;
      }

      // Find connection for this websocket
      const connection = this.findConnectionByWebSocket(ws);
      if (!connection) {
        throw new Error('Connection not initialized');
      }

      connection.lastActivity = new Date();
      connection.messagesReceived++;

      // Emit message to handlers
      this.emit('message', message);

      console.log(chalk.blue(`📥 Received message from ${connection.containerId}: ${message.type}`));

    } catch (error: any) {
      console.error(chalk.red(`❌ Message handling error: ${error.message}`));
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(4001, `Message error: ${error.message}`);
      }
    }
  }

  private async handleSessionInit(ws: WebSocket, message: VMSessionInit): Promise<void> {
    const { containerId, sessionId } = message;
    
    // Clear initialization timeout
    if ((ws as any)._initTimeout) {
      clearTimeout((ws as any)._initTimeout);
      delete (ws as any)._initTimeout;
    }

    // Check if container already connected
    if (this.connections.has(containerId)) {
      console.log(chalk.yellow(`⚠️ Container ${containerId} already connected, closing old connection`));
      await this.closeConnection(containerId, 'duplicate_connection');
    }

    // Create new connection
    const connection: VMConnection = {
      containerId,
      sessionId,
      ws,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messagesSent: 0,
      messagesReceived: 1 // Count the init message
    };

    this.connections.set(containerId, connection);

    const event: VMConnectionEvent = {
      type: 'connected',
      containerId,
      sessionId,
      timestamp: new Date(),
      details: message.payload
    };

    this.emit('connected', containerId);
    console.log(chalk.green(`✅ Container ${containerId} session initialized`));
  }

  private handleClose(ws: WebSocket, code: number, reason: string): void {
    const connection = this.findConnectionByWebSocket(ws);
    if (connection) {
      this.connections.delete(connection.containerId);
      this.emit('disconnected', connection.containerId);
      console.log(chalk.yellow(`🔌 Container ${connection.containerId} disconnected (${code}): ${reason}`));
    }
  }

  private handleConnectionError(ws: WebSocket, error: Error): void {
    const connection = this.findConnectionByWebSocket(ws);
    const containerId = connection?.containerId || 'unknown';
    
    const vmError = new VMCommunicationError(
      `WebSocket error for ${containerId}: ${error.message}`,
      containerId,
      'WEBSOCKET_ERROR',
      true
    );

    this.emit('error', vmError);
    console.error(chalk.red(`❌ WebSocket error for ${containerId}: ${error.message}`));
  }

  private handlePong(ws: WebSocket): void {
    const connection = this.findConnectionByWebSocket(ws);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  private handleServerError(error: Error): void {
    console.error(chalk.red(`❌ VM WebSocket Server error: ${error.message}`));
    this.emit('error', new VMCommunicationError(
      `Server error: ${error.message}`,
      'server',
      'SERVER_ERROR'
    ));
  }

  private findConnectionByWebSocket(ws: WebSocket): VMConnection | undefined {
    for (const connection of this.connections.values()) {
      if (connection.ws === ws) {
        return connection;
      }
    }
    return undefined;
  }

  private getConnectionStatus(ws: WebSocket): 'connected' | 'connecting' | 'disconnected' {
    switch (ws.readyState) {
      case WebSocket.OPEN: return 'connected';
      case WebSocket.CONNECTING: return 'connecting';
      default: return 'disconnected';
    }
  }

  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date();
      
      for (const [containerId, connection] of this.connections) {
        const timeSinceActivity = now.getTime() - connection.lastActivity.getTime();
        
        if (timeSinceActivity > this.config.heartbeatInterval * 2) {
          // Connection appears dead
          console.log(chalk.yellow(`💔 Heartbeat timeout for ${containerId}, closing connection`));
          this.closeConnection(containerId, 'heartbeat_timeout');
        } else if (connection.ws.readyState === WebSocket.OPEN) {
          // Send ping
          connection.ws.ping();
        }
      }
    }, this.config.heartbeatInterval);
  }
}

// Supporting interfaces
interface VMConnection {
  containerId: string;
  sessionId: string;
  ws: WebSocket;
  connectedAt: Date;
  lastActivity: Date;
  messagesSent: number;
  messagesReceived: number;
}

export interface VMConnectionInfo {
  containerId: string;
  sessionId: string;
  status: 'connected' | 'connecting' | 'disconnected';
  connectedAt: Date;
  lastActivity: Date;
  messagesSent: number;
  messagesReceived: number;
}

export interface VMServerStats {
  isRunning: boolean;
  activeConnections: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  uptime: number;
  config: VMWebSocketConfig;
}

// Singleton instance
export const vmWebSocketServer = new VMWebSocketServer();