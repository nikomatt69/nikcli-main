/**
 * Simple Agent Queue
 * Coordinamento leggero per evitare race conditions sui file
 */

import { advancedUI } from '../ui/advanced-cli-ui';

export interface QueuedOperation {
  id: string;
  type: 'write' | 'read' | 'validate';
  filePath?: string;
  agentId: string;
  promise: Promise<any>;
  startTime: number;
}

export class SimpleAgentQueue {
  private static instance: SimpleAgentQueue;
  private fileOperations = new Map<string, QueuedOperation>();
  private operationHistory: QueuedOperation[] = [];
  private readonly MAX_HISTORY = 50;

  static getInstance(): SimpleAgentQueue {
    if (!SimpleAgentQueue.instance) {
      SimpleAgentQueue.instance = new SimpleAgentQueue();
    }
    return SimpleAgentQueue.instance;
  }

  /**
   * Esegui operazione con lock su file (se necessario)
   */
  async executeWithLock<T>(
    operation: {
      type: 'write' | 'read' | 'validate';
      filePath?: string;
      agentId: string;
    },
    fn: () => Promise<T>
  ): Promise<T> {
    const operationId = `${operation.agentId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    
    // Se è un'operazione di scrittura, verifica lock
    if (operation.type === 'write' && operation.filePath) {
      await this.waitForFileLock(operation.filePath);
    }

    const queuedOp: QueuedOperation = {
      id: operationId,
      type: operation.type,
      filePath: operation.filePath,
      agentId: operation.agentId,
      promise: fn(),
      startTime: Date.now()
    };

    // Aggiungi lock se necessario
    if (operation.filePath && operation.type === 'write') {
      this.fileOperations.set(operation.filePath, queuedOp);
      advancedUI.logInfo(`🔒 File locked for writing: ${operation.filePath} by ${operation.agentId}`);
    }

    try {
      const result = await queuedOp.promise;
      
      // Rimuovi lock
      if (operation.filePath && operation.type === 'write') {
        this.fileOperations.delete(operation.filePath);
        advancedUI.logInfo(`🔓 File unlocked: ${operation.filePath}`);
      }

      // Aggiungi alla storia
      this.addToHistory(queuedOp);
      
      return result;
    } catch (error) {
      // Rimuovi lock anche in caso di errore
      if (operation.filePath && operation.type === 'write') {
        this.fileOperations.delete(operation.filePath);
      }
      throw error;
    }
  }

  /**
   * Aspetta che un file sia libero per scrittura
   */
  private async waitForFileLock(filePath: string): Promise<void> {
    const existingOp = this.fileOperations.get(filePath);
    if (existingOp) {
      advancedUI.logInfo(`⏳ Waiting for file lock: ${filePath} (locked by ${existingOp.agentId})`);
      
      try {
        await Promise.race([
          existingOp.promise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Lock timeout')), 15000)
          )
        ]);
      } catch (error: any) {
        advancedUI.logWarning(`⚠️ Lock wait failed: ${error.message}`);
        // Forza rimozione del lock stale
        this.fileOperations.delete(filePath);
      }
    }
  }

  /**
   * Aggiungi operazione alla storia
   */
  private addToHistory(operation: QueuedOperation): void {
    this.operationHistory.push({
      ...operation,
      promise: Promise.resolve() // Non tenere promise nella storia
    });

    // Mantieni solo le ultime N operazioni
    if (this.operationHistory.length > this.MAX_HISTORY) {
      this.operationHistory.shift();
    }
  }

  /**
   * Ottieni stato della queue
   */
  getStatus() {
    return {
      activeFileLocks: this.fileOperations.size,
      lockedFiles: Array.from(this.fileOperations.keys()),
      recentOperations: this.operationHistory.slice(-10).map(op => ({
        id: op.id,
        type: op.type,
        filePath: op.filePath,
        agentId: op.agentId,
        duration: Date.now() - op.startTime
      }))
    };
  }

  /**
   * Pulisci lock scaduti (safety)
   */
  cleanupStaleLocks(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minuto

    for (const [filePath, operation] of this.fileOperations) {
      if (now - operation.startTime > staleThreshold) {
        advancedUI.logWarning(`🧹 Removing stale lock: ${filePath}`);
        this.fileOperations.delete(filePath);
      }
    }
  }

  /**
   * Forza unlock di un file (per debug)
   */
  forceUnlock(filePath: string): boolean {
    return this.fileOperations.delete(filePath);
  }
}

// Export singleton
export const agentQueue = SimpleAgentQueue.getInstance();