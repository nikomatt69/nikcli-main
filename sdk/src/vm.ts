/**
 * NikCLI Enterprise SDK - VM Module
 * Programmatic VM and container management
 */

import type {
  SDKResponse,
  VMConfig,
  VMInstance,
} from './types';

export class VMSDK {
  private vmService: any;
  private config: any;

  constructor(vmService: any, config: any) {
    this.vmService = vmService;
    this.config = config;
  }

  // ============================================================================
  // VM Management
  // ============================================================================

  /**
   * Create VM
   */
  async create(config: VMConfig): Promise<SDKResponse<VMInstance>> {
    try {
      const vm = await this.vmService.create(config);
      return { success: true, data: vm };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List VMs
   */
  async list(): Promise<SDKResponse<VMInstance[]>> {
    try {
      const vms = await this.vmService.list();
      return { success: true, data: vms };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get VM by ID
   */
  async get(vmId: string): Promise<SDKResponse<VMInstance>> {
    try {
      const vm = await this.vmService.get(vmId);
      return { success: true, data: vm };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Start VM
   */
  async start(vmId: string): Promise<SDKResponse<VMInstance>> {
    try {
      const vm = await this.vmService.start(vmId);
      return { success: true, data: vm };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Stop VM
   */
  async stop(vmId: string): Promise<SDKResponse<void>> {
    try {
      await this.vmService.stop(vmId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete VM
   */
  async delete(vmId: string): Promise<SDKResponse<void>> {
    try {
      await this.vmService.delete(vmId);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get VM status
   */
  async getStatus(vmId: string): Promise<SDKResponse<any>> {
    try {
      const status = await this.vmService.getStatus(vmId);
      return { success: true, data: status };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // VM Connection
  // ============================================================================

  /**
   * Connect to VM
   */
  async connect(vmId: string): Promise<SDKResponse<any>> {
    try {
      const connection = await this.vmService.connect(vmId);
      return { success: true, data: connection };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Execute command in VM
   */
  async exec(vmId: string, command: string): Promise<SDKResponse<any>> {
    try {
      const result = await this.vmService.exec(vmId, command);
      return { success: true, data: result };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Copy file to VM
   */
  async copyTo(vmId: string, localPath: string, remotePath: string): Promise<SDKResponse<void>> {
    try {
      await this.vmService.copyTo(vmId, localPath, remotePath);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Copy file from VM
   */
  async copyFrom(vmId: string, remotePath: string, localPath: string): Promise<SDKResponse<void>> {
    try {
      await this.vmService.copyFrom(vmId, remotePath, localPath);
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // ============================================================================
  // Repository VMs
  // ============================================================================

  /**
   * Create VM from repository
   */
  async createFromRepo(repository: string): Promise<SDKResponse<VMInstance>> {
    try {
      const vm = await this.vmService.createFromRepo(repository);
      return { success: true, data: vm };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Clone repository in VM
   */
  async cloneRepo(vmId: string, repository: string): Promise<SDKResponse<void>> {
    try {
      await this.vmService.cloneRepo(vmId, repository);
      return { success: true };
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
        code: error.code || 'VM_ERROR',
        message: error.message || 'VM operation failed',
        details: error,
        stack: error.stack,
      },
    };
  }
}
