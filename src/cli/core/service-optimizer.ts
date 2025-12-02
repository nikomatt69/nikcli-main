export interface ServiceConfig {
  id: string;
  priority: ServicePriority;
  dependencies?: string[];
  timeout: number;
  retryCount: number;
  critical: boolean;
  init: () => Promise<any> | any;
}

export interface ServiceGroup {
  id: string;
  priority: ServicePriority;
  services: ServiceConfig[];
  maxConcurrency: number;
  dependencies: string[];
}

export interface ServiceInstance {
  id: string;
  status: ServiceStatus;
  startTime?: number;
  endTime?: number;
  error?: Error;
  result?: any;
  config: ServiceConfig;
}

export enum ServicePriority {
  CRITICAL = 1,
  HIGH = 2,
  NORMAL = 3,
  LOW = 4,
  BACKGROUND = 5,
}

export enum ServiceStatus {
  PENDING = 'pending',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  SKIPPED = 'skipped',
  DEGRADED = 'degraded',
}

export interface OptimizationResult {
  totalServices: number;
  successfulServices: number;
  failedServices: number;
  skippedServices: number;
  executionTime: number;
  degradationLevel: DegradationLevel;
  serviceInstances: Map<string, ServiceInstance>;
}

export enum DegradationLevel {
  FULL = 'full', // All services operational
  MINOR = 'minor', // Non-critical services failed
  MODERATE = 'moderate', // Some high-priority services failed
  SEVERE = 'severe', // Only critical services operational
  CRITICAL = 'critical', // Emergency fallback mode
}

export class ServiceOptimizer {
  private static instance: ServiceOptimizer;
  private serviceGroups: Map<string, ServiceGroup> = new Map();
  private serviceInstances: Map<string, ServiceInstance> = new Map();
  private isInitialized = false;
  private isInitializing = false;
  private readonly maxParallelServices = 5;
  private readonly defaultTimeout = 30000; // 30 seconds
  private readonly retryDelay = 1000; // 1 second

  private constructor() { }

  public static getInstance(): ServiceOptimizer {
    if (!ServiceOptimizer.instance) {
      ServiceOptimizer.instance = new ServiceOptimizer();
    }
    return ServiceOptimizer.instance;
  }

  /**
   * Create service groups based on priority and dependencies
   */
  public async createServiceGroups(
    services: ServiceConfig[],
  ): Promise<Map<string, ServiceGroup>> {
    console.log('🔧 Creating service groups...');

    // Sort services by priority
    const sortedServices = services.sort((a, b) => a.priority - b.priority);

    // Group services by priority level
    const priorityGroups = new Map<ServicePriority, ServiceConfig[]>();

    Object.values(ServicePriority).forEach((priority) => {
      priorityGroups.set(
        priority as ServicePriority,
        sortedServices.filter((service) => service.priority === priority),
      );
    });

    // Create service groups with appropriate concurrency limits
    for (const [priority, services] of priorityGroups.entries()) {
      if (services.length === 0) continue;

      const groupId = `group-${priority}`;
      const maxConcurrency = this.calculateConcurrencyLimit(
        priority,
        services.length,
      );

      const group: ServiceGroup = {
        id: groupId,
        priority,
        services,
        maxConcurrency,
        dependencies: this.extractDependencies(services),
      };

      this.serviceGroups.set(groupId, group);

      console.log(
        `📦 Created group ${groupId}: ${services.length} services, max concurrency: ${maxConcurrency}`,
      );
    }

    // Validate dependencies
    this.validateDependencies();

    return this.serviceGroups;
  }

  /**
   * Initialize all services with parallel execution and graceful degradation
   */
  public async initializeServices(
    services?: ServiceConfig[],
    options: {
      enableParallel?: boolean;
      timeoutMultiplier?: number;
      skipNonCritical?: boolean;
      forceDegradation?: boolean;
    } = {},
  ): Promise<OptimizationResult> {
    const startTime = Date.now();

    if (this.isInitializing) {
      throw new Error('Service initialization already in progress');
    }

    this.isInitializing = true;

    try {
      // Create service groups if not already done
      if (services && services.length > 0) {
        await this.createServiceGroups(services);
      }

      if (this.serviceGroups.size === 0) {
        throw new Error('No service groups available for initialization');
      }

      const result: OptimizationResult = {
        totalServices: 0,
        successfulServices: 0,
        failedServices: 0,
        skippedServices: 0,
        executionTime: 0,
        degradationLevel: DegradationLevel.FULL,
        serviceInstances: new Map(),
      };

      // Initialize service groups in priority order
      for (const [groupId, group] of Array.from(
        this.serviceGroups.entries(),
      ).sort(([, a], [, b]) => a.priority - b.priority)) {
        console.log(`🚀 Initializing group: ${groupId} (${group.priority})`);

        const groupResult = await this.initializeGroup(group, options);

        // Update overall result
        result.totalServices += groupResult.totalServices;
        result.successfulServices += groupResult.successfulServices;
        result.failedServices += groupResult.failedServices;
        result.skippedServices += groupResult.skippedServices;
        result.serviceInstances = new Map([
          ...result.serviceInstances,
          ...groupResult.serviceInstances,
        ]);
      }

      result.executionTime = Date.now() - startTime;
      result.degradationLevel = this.calculateDegradationLevel(result);

      this.isInitialized = true;

      console.log(`✅ Service initialization complete:`);
      console.log(`   • Total: ${result.totalServices}`);
      console.log(`   • Successful: ${result.successfulServices}`);
      console.log(`   • Failed: ${result.failedServices}`);
      console.log(`   • Skipped: ${result.skippedServices}`);
      console.log(`   • Degradation: ${result.degradationLevel}`);
      console.log(`   • Time: ${result.executionTime}ms`);

      return result;
    } catch (error) {
      console.error('❌ Service initialization failed:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Initialize a single service group with parallel execution
   */
  private async initializeGroup(
    group: ServiceGroup,
    options: {
      enableParallel?: boolean;
      timeoutMultiplier?: number;
      skipNonCritical?: boolean;
      forceDegradation?: boolean;
    },
  ): Promise<OptimizationResult> {
    const groupResult: OptimizationResult = {
      totalServices: group.services.length,
      successfulServices: 0,
      failedServices: 0,
      skippedServices: 0,
      executionTime: 0,
      degradationLevel: DegradationLevel.FULL,
      serviceInstances: new Map(),
    };

    const timeout = this.defaultTimeout * (options.timeoutMultiplier || 1);

    if (options.enableParallel && group.services.length > 1) {
      // Parallel execution
      const batches = this.createExecutionBatches(
        group.services,
        group.maxConcurrency,
      );

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(
          `⚡ Executing batch ${batchIndex + 1}/${batches.length} (${batch.length} services)`,
        );

        const batchPromises = batch.map((service) =>
          this.initializeService(service, timeout, options),
        );

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          const service = batch[index];
          if (result.status === 'fulfilled') {
            groupResult.successfulServices++;
            groupResult.serviceInstances.set(service.id, result.value);
          } else {
            groupResult.failedServices++;
            console.warn(`⚠️  Service ${service.id} failed:`, result.reason);
          }
        });
      }
    } else {
      // Sequential execution
      for (const service of group.services) {
        const instance = await this.initializeService(
          service,
          timeout,
          options,
        );
        if (instance.status === ServiceStatus.ACTIVE) {
          groupResult.successfulServices++;
        } else {
          groupResult.failedServices++;
        }
        groupResult.serviceInstances.set(service.id, instance);
      }
    }

    return groupResult;
  }

  /**
   * Initialize a single service with timeout and retry logic
   */
  private async initializeService(
    service: ServiceConfig,
    timeout: number,
    options: {
      skipNonCritical?: boolean;
      forceDegradation?: boolean;
    },
  ): Promise<ServiceInstance> {
    const instance: ServiceInstance = {
      id: service.id,
      status: ServiceStatus.PENDING,
      config: service,
      startTime: Date.now(),
    };

    // Check if non-critical services should be skipped
    if (
      options.skipNonCritical &&
      !service.critical &&
      service.priority >= ServicePriority.NORMAL
    ) {
      instance.status = ServiceStatus.SKIPPED;
      return instance;
    }

    // Check if service dependencies are satisfied
    if (!this.areDependenciesSatisfied(service)) {
      instance.status = ServiceStatus.SKIPPED;
      instance.error = new Error(
        `Dependencies not satisfied: ${service.dependencies?.join(', ')}`,
      );
      return instance;
    }

    for (let attempt = 0; attempt <= service.retryCount; attempt++) {
      try {
        instance.status = ServiceStatus.INITIALIZING;

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(`Service ${service.id} timed out after ${timeout}ms`),
            );
          }, timeout);
        });

        // Race between service initialization and timeout
        const result = await Promise.race([
          Promise.resolve(service.init()),
          timeoutPromise,
        ]);

        instance.result = result;
        instance.status = ServiceStatus.ACTIVE;
        instance.endTime = Date.now();

        console.log(`✅ Service ${service.id} initialized successfully`);
        return instance;
      } catch (error) {
        console.warn(
          `⚠️  Attempt ${attempt + 1}/${service.retryCount + 1} failed for service ${service.id}:`,
          error,
        );

        instance.error = error as Error;
        instance.endTime = Date.now();

        // If this was the last attempt, determine final status
        if (attempt === service.retryCount) {
          if (service.critical) {
            instance.status = ServiceStatus.FAILED;
            throw new Error(
              `Critical service ${service.id} failed after ${service.retryCount + 1} attempts: ${error}`,
            );
          } else {
            instance.status = ServiceStatus.DEGRADED;
            console.warn(
              `🔶 Service ${service.id} degraded - non-critical, continuing with fallback`,
            );
          }
        } else {
          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * (attempt + 1)),
          );
        }
      }
    }

    return instance;
  }

  /**
   * Create execution batches for parallel processing
   */
  private createExecutionBatches(
    services: ServiceConfig[],
    maxConcurrency: number,
  ): ServiceConfig[][] {
    const batches: ServiceConfig[][] = [];

    for (let i = 0; i < services.length; i += maxConcurrency) {
      batches.push(services.slice(i, i + maxConcurrency));
    }

    return batches;
  }

  /**
   * Calculate appropriate concurrency limit based on priority and service count
   */
  private calculateConcurrencyLimit(
    priority: ServicePriority,
    serviceCount: number,
  ): number {
    // Critical services get full parallelism
    if (priority === ServicePriority.CRITICAL) {
      return Math.min(serviceCount, this.maxParallelServices);
    }

    // High priority services get moderate parallelism
    if (priority === ServicePriority.HIGH) {
      return Math.min(serviceCount, Math.ceil(this.maxParallelServices * 0.8));
    }

    // Normal priority services get reduced parallelism
    if (priority === ServicePriority.NORMAL) {
      return Math.min(serviceCount, Math.ceil(this.maxParallelServices * 0.6));
    }

    // Low and background services get minimal parallelism
    return Math.min(serviceCount, Math.ceil(this.maxParallelServices * 0.4));
  }

  /**
   * Extract unique dependencies from service array
   */
  private extractDependencies(services: ServiceConfig[]): string[] {
    const dependencies = new Set<string>();
    services.forEach((service) => {
      service.dependencies?.forEach((dep) => dependencies.add(dep));
    });
    return Array.from(dependencies);
  }

  /**
   * Validate that all dependencies are resolvable
   */
  private validateDependencies(): void {
    const allServiceIds = new Set<string>();
    this.serviceGroups.forEach((group) => {
      group.services.forEach((service) => {
        allServiceIds.add(service.id);
      });
    });

    this.serviceGroups.forEach((group) => {
      group.services.forEach((service) => {
        const missingDependencies =
          service.dependencies?.filter((dep) => !allServiceIds.has(dep)) || [];
        if (missingDependencies.length > 0) {
          throw new Error(
            `Service ${service.id} has unresolved dependencies: ${missingDependencies.join(', ')}`,
          );
        }
      });
    });
  }

  /**
   * Check if all dependencies for a service are satisfied
   */
  private areDependenciesSatisfied(service: ServiceConfig): boolean {
    if (!service.dependencies || service.dependencies.length === 0) {
      return true;
    }

    return service.dependencies.every((depId) => {
      const depInstance = this.serviceInstances.get(depId);
      return depInstance && depInstance.status === ServiceStatus.ACTIVE;
    });
  }

  /**
   * Calculate degradation level based on service status
   */
  private calculateDegradationLevel(
    result: OptimizationResult,
  ): DegradationLevel {
    const { totalServices, failedServices, successfulServices } = result;
    const failureRate = failedServices / totalServices;
    const successRate = successfulServices / totalServices;

    if (failureRate === 0) {
      return DegradationLevel.FULL;
    } else if (failureRate <= 0.1 && successRate >= 0.9) {
      return DegradationLevel.MINOR;
    } else if (failureRate <= 0.3 && successRate >= 0.7) {
      return DegradationLevel.MODERATE;
    } else if (failureRate <= 0.6 && successRate >= 0.4) {
      return DegradationLevel.SEVERE;
    } else {
      return DegradationLevel.CRITICAL;
    }
  }

  /**
   * Get service instance by ID
   */
  public getServiceInstance(id: string): ServiceInstance | undefined {
    return this.serviceInstances.get(id);
  }

  /**
   * Get all service instances
   */
  public getAllServiceInstances(): Map<string, ServiceInstance> {
    return new Map(this.serviceInstances);
  }

  /**
   * Get service group by ID
   */
  public getServiceGroup(id: string): ServiceGroup | undefined {
    return this.serviceGroups.get(id);
  }

  /**
   * Get all service groups
   */
  public getAllServiceGroups(): Map<string, ServiceGroup> {
    return new Map(this.serviceGroups);
  }

  /**
   * Check if the optimizer is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Reset the optimizer state
   */
  public reset(): void {
    this.serviceGroups.clear();
    this.serviceInstances.clear();
    this.isInitialized = false;
    this.isInitializing = false;
    console.log('🔄 Service optimizer reset');
  }

  /**
   * Get optimization statistics
   */
  public getStatistics(): {
    totalGroups: number;
    totalServices: number;
    activeServices: number;
    failedServices: number;
    isInitialized: boolean;
    isInitializing: boolean;
  } {
    return {
      totalGroups: this.serviceGroups.size,
      totalServices: this.serviceInstances.size,
      activeServices: Array.from(this.serviceInstances.values()).filter(
        (instance) => instance.status === ServiceStatus.ACTIVE,
      ).length,
      failedServices: Array.from(this.serviceInstances.values()).filter(
        (instance) => instance.status === ServiceStatus.FAILED,
      ).length,
      isInitialized: this.isInitialized,
      isInitializing: this.isInitializing,
    };
  }
}

// Export singleton instance
export const serviceOptimizer = ServiceOptimizer.getInstance();
