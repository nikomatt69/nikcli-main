/**
 * NikCLI Enterprise SDK - Services Module
 * Programmatic access to all core services
 */

import type {
  SDKResponse,
  MemoryEntry,
  MemorySearchOptions,
  RAGSearchOptions,
  RAGDocument,
  ProjectSnapshot,
  DashboardMetrics,
  NotificationOptions,
  SubscriptionInfo,
  ServiceStatus,
} from './types';

export class ServicesSDK {
  private services: any;
  private config: any;

  constructor(services: any, config: any) {
    this.services = services;
    this.config = config;
  }

  // ============================================================================
  // Memory Service
  // ============================================================================

  /**
   * Remember information
   */
  async remember(
    content: string,
    metadata?: Record<string, any>,
    tags?: string[]
  ): Promise<SDKResponse<MemoryEntry>> {
    try {
      const entry = await this.services.memory.remember(content, metadata, tags);
      return { success: true, data: entry };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Recall memories
   */
  async recall(options: MemorySearchOptions): Promise<SDKResponse<MemoryEntry[]>> {
    try {
      const memories = await this.services.memory.recall(options);
      return { success: true, data: memories };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Forget memories
   */
  async forget(id?: string, filters?: Record<string, any>): Promise<SDKResponse<number>> {
    try {
      const count = await this.services.memory.forget(id, filters);
      return { success: true, data: count };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(): Promise<SDKResponse<any>> {
    try {
      const stats = await this.services.memory.getStats();
      return { success: true, data: stats };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // RAG (Retrieval-Augmented Generation) Service
  // ============================================================================

  /**
   * Search with RAG
   */
  async ragSearch(options: RAGSearchOptions): Promise<SDKResponse<RAGDocument[]>> {
    try {
      const results = await this.services.rag.search(options);
      return { success: true, data: results };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Index document for RAG
   */
  async ragIndex(
    content: string,
    metadata?: Record<string, any>
  ): Promise<SDKResponse<string>> {
    try {
      const docId = await this.services.rag.index(content, metadata);
      return { success: true, data: docId };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Index multiple documents
   */
  async ragIndexBatch(
    documents: Array<{ content: string; metadata?: Record<string, any> }>
  ): Promise<SDKResponse<string[]>> {
    try {
      const docIds = await this.services.rag.indexBatch(documents);
      return { success: true, data: docIds };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete document from RAG
   */
  async ragDelete(docId: string): Promise<SDKResponse<void>> {
    try {
      await this.services.rag.delete(docId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Clear RAG index
   */
  async ragClear(namespace?: string): Promise<SDKResponse<void>> {
    try {
      await this.services.rag.clear(namespace);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Cache Service
  // ============================================================================

  /**
   * Get cached value
   */
  async cacheGet(key: string): Promise<SDKResponse<any>> {
    try {
      const value = await this.services.cache.get(key);
      return { success: true, data: value };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set cached value
   */
  async cacheSet(
    key: string,
    value: any,
    ttl?: number
  ): Promise<SDKResponse<void>> {
    try {
      await this.services.cache.set(key, value, ttl);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete cached value
   */
  async cacheDelete(key: string): Promise<SDKResponse<void>> {
    try {
      await this.services.cache.delete(key);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Clear all cache
   */
  async cacheClear(): Promise<SDKResponse<void>> {
    try {
      await this.services.cache.clear();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<SDKResponse<any>> {
    try {
      const stats = await this.services.cache.getStats();
      return { success: true, data: stats };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Snapshot Service
  // ============================================================================

  /**
   * Create project snapshot
   */
  async createSnapshot(
    name?: string,
    filters?: string[]
  ): Promise<SDKResponse<ProjectSnapshot>> {
    try {
      const snapshot = await this.services.snapshot.create(name, filters);
      return { success: true, data: snapshot };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List snapshots
   */
  async listSnapshots(): Promise<SDKResponse<ProjectSnapshot[]>> {
    try {
      const snapshots = await this.services.snapshot.list();
      return { success: true, data: snapshots };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Restore snapshot
   */
  async restoreSnapshot(snapshotId: string): Promise<SDKResponse<void>> {
    try {
      await this.services.snapshot.restore(snapshotId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<SDKResponse<void>> {
    try {
      await this.services.snapshot.delete(snapshotId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Compare snapshots
   */
  async compareSnapshots(
    snapshot1: string,
    snapshot2: string
  ): Promise<SDKResponse<any>> {
    try {
      const diff = await this.services.snapshot.compare(snapshot1, snapshot2);
      return { success: true, data: diff };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Dashboard Service
  // ============================================================================

  /**
   * Get real-time metrics
   */
  async getMetrics(): Promise<SDKResponse<DashboardMetrics>> {
    try {
      const metrics = await this.services.dashboard.getMetrics();
      return { success: true, data: metrics };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Subscribe to metrics updates
   */
  async subscribeToMetrics(
    callback: (metrics: DashboardMetrics) => void
  ): Promise<SDKResponse<string>> {
    try {
      const subscriptionId = await this.services.dashboard.subscribe(callback);
      return { success: true, data: subscriptionId };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Unsubscribe from metrics
   */
  async unsubscribeFromMetrics(subscriptionId: string): Promise<SDKResponse<void>> {
    try {
      await this.services.dashboard.unsubscribe(subscriptionId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Notification Service
  // ============================================================================

  /**
   * Send notification
   */
  async notify(options: NotificationOptions): Promise<SDKResponse<void>> {
    try {
      await this.services.notification.send(options);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(limit?: number): Promise<SDKResponse<NotificationOptions[]>> {
    try {
      const history = await this.services.notification.getHistory(limit);
      return { success: true, data: history };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Subscription Service
  // ============================================================================

  /**
   * Get subscription information
   */
  async getSubscription(): Promise<SDKResponse<SubscriptionInfo>> {
    try {
      const info = await this.services.subscription.getInfo();
      return { success: true, data: info };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Upgrade subscription
   */
  async upgradeSubscription(plan: string): Promise<SDKResponse<SubscriptionInfo>> {
    try {
      const info = await this.services.subscription.upgrade(plan);
      return { success: true, data: info };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(): Promise<SDKResponse<void>> {
    try {
      await this.services.subscription.cancel();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get quota information
   */
  async getQuota(): Promise<SDKResponse<any>> {
    try {
      const quota = await this.services.subscription.getQuota();
      return { success: true, data: quota };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Planning Service
  // ============================================================================

  /**
   * Generate execution plan
   */
  async generatePlan(goal: string, context?: Record<string, any>): Promise<SDKResponse<any>> {
    try {
      const plan = await this.services.planning.generate(goal, context);
      return { success: true, data: plan };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute plan
   */
  async executePlan(planId: string): Promise<SDKResponse<any>> {
    try {
      const result = await this.services.planning.execute(planId);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get plan status
   */
  async getPlanStatus(planId: string): Promise<SDKResponse<any>> {
    try {
      const status = await this.services.planning.getStatus(planId);
      return { success: true, data: status };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // LSP (Language Server Protocol) Service
  // ============================================================================

  /**
   * Get code completions
   */
  async getCompletions(
    filePath: string,
    position: { line: number; character: number }
  ): Promise<SDKResponse<any[]>> {
    try {
      const completions = await this.services.lsp.getCompletions(filePath, position);
      return { success: true, data: completions };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get hover information
   */
  async getHover(
    filePath: string,
    position: { line: number; character: number }
  ): Promise<SDKResponse<any>> {
    try {
      const hover = await this.services.lsp.getHover(filePath, position);
      return { success: true, data: hover };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get diagnostics
   */
  async getDiagnostics(filePath: string): Promise<SDKResponse<any[]>> {
    try {
      const diagnostics = await this.services.lsp.getDiagnostics(filePath);
      return { success: true, data: diagnostics };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // BrowseGPT Service
  // ============================================================================

  /**
   * Navigate browser
   */
  async browserNavigate(url: string): Promise<SDKResponse<void>> {
    try {
      await this.services.browseGPT.navigate(url);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get browser status
   */
  async getBrowserStatus(): Promise<SDKResponse<any>> {
    try {
      const status = await this.services.browseGPT.getStatus();
      return { success: true, data: status };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Close browser
   */
  async closeBrowser(): Promise<SDKResponse<void>> {
    try {
      await this.services.browseGPT.close();
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // CAD/Gcode Service
  // ============================================================================

  /**
   * Generate CAD model
   */
  async generateCAD(description: string, format?: string): Promise<SDKResponse<any>> {
    try {
      const result = await this.services.cadGcode.generateCAD(description, format);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generate G-code
   */
  async generateGCode(description: string, params?: any): Promise<SDKResponse<any>> {
    try {
      const result = await this.services.cadGcode.generateGCode(description, params);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Figma Service
  // ============================================================================

  /**
   * Get Figma file
   */
  async getFigmaFile(fileKey: string): Promise<SDKResponse<any>> {
    try {
      const file = await this.services.figma.getFile(fileKey);
      return { success: true, data: file };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generate code from Figma
   */
  async figmaToCode(fileKey: string, nodeId?: string): Promise<SDKResponse<string>> {
    try {
      const code = await this.services.figma.toCode(fileKey, nodeId);
      return { success: true, data: code };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Task Master Service
  // ============================================================================

  /**
   * Create task
   */
  async createTask(description: string, priority?: string): Promise<SDKResponse<any>> {
    try {
      const task = await this.services.taskMaster.create(description, priority);
      return { success: true, data: task };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List tasks
   */
  async listTasks(filter?: any): Promise<SDKResponse<any[]>> {
    try {
      const tasks = await this.services.taskMaster.list(filter);
      return { success: true, data: tasks };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update task
   */
  async updateTask(taskId: string, updates: any): Promise<SDKResponse<any>> {
    try {
      const task = await this.services.taskMaster.update(taskId, updates);
      return { success: true, data: task };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete task
   */
  async deleteTask(taskId: string): Promise<SDKResponse<void>> {
    try {
      await this.services.taskMaster.delete(taskId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // NikDrive Service
  // ============================================================================

  /**
   * Upload file to NikDrive
   */
  async uploadFile(filePath: string, remotePath?: string): Promise<SDKResponse<any>> {
    try {
      const result = await this.services.nikDrive.upload(filePath, remotePath);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Download file from NikDrive
   */
  async downloadFile(remotePath: string, localPath?: string): Promise<SDKResponse<string>> {
    try {
      const path = await this.services.nikDrive.download(remotePath, localPath);
      return { success: true, data: path };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List NikDrive files
   */
  async listNikDriveFiles(remotePath?: string): Promise<SDKResponse<any[]>> {
    try {
      const files = await this.services.nikDrive.list(remotePath);
      return { success: true, data: files };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete file from NikDrive
   */
  async deleteNikDriveFile(remotePath: string): Promise<SDKResponse<void>> {
    try {
      await this.services.nikDrive.delete(remotePath);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Service Management
  // ============================================================================

  /**
   * Get all service statuses
   */
  async getAllServiceStatuses(): Promise<SDKResponse<ServiceStatus[]>> {
    try {
      const statuses = await this.services.getStatuses();
      return { success: true, data: statuses };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Restart service
   */
  async restartService(serviceName: string): Promise<SDKResponse<void>> {
    try {
      await this.services.restart(serviceName);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<SDKResponse<any>> {
    try {
      const health = await this.services.healthCheck();
      return { success: true, data: health };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private handleError(error: any): SDKResponse<any> {
    return {
      success: false,
      error: {
        code: error.code || 'SERVICE_ERROR',
        message: error.message || 'Service operation failed',
        details: error,
        stack: error.stack,
      },
    };
  }
}
