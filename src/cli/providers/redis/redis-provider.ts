import { Redis } from '@upstash/redis';
import chalk from 'chalk';
import { EventEmitter } from 'events';
import { simpleConfigManager, ConfigType } from '../../core/config-manager';

export interface RedisProviderOptions {
  url?: string;
  token?: string;
  keyPrefix?: string;
  ttl?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  // Legacy support for ioredis migration
  host?: string;
  port?: number;
  password?: string;
  database?: number;
}

export interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  ttl?: number;
  metadata?: Record<string, any>;
}

export interface RedisHealth {
  connected: boolean;
  latency: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  // Optional extended metrics (may not be available with all providers)
  uptime?: number;
  memory?: {
    used: number;
    peak?: number;
  };
  keyspace?: {
    keys: number;
    expires?: number;
  };
}

export class RedisProvider extends EventEmitter {
  private client: Redis | null = null;
  private config: ConfigType['redis'] & { url?: string; token?: string };
  private isConnected = false;
  private connectionAttempts = 0;
  private healthCheckInterval?: NodeJS.Timeout;
  private lastHealthCheck?: RedisHealth;

  constructor(options?: RedisProviderOptions) {
    super();
    this.config = { ...simpleConfigManager.getRedisConfig(), ...options };

    if (this.config.enabled) {
      this.connect();
      this.startHealthChecks();
    }
  }

  /**
   * Connect to Upstash Redis
   */
  private async connect(): Promise<void> {
    try {
      // Check for Upstash configuration first
      if (this.config.url && this.config.token) {
        this.client = new Redis({
          url: this.config.url,
          token: this.config.token,
        });
        console.log(chalk.blue(`🔗 Connecting to Upstash Redis...`));
      } else if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        // Use environment variables
        this.client = Redis.fromEnv();
        console.log(chalk.blue(`🔗 Connecting to Upstash Redis via environment...`));
      } else {
        throw new Error('Upstash Redis configuration missing. Please provide url and token or set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.');
      }

      // Test connection with a simple ping
      await this.testConnection();

    } catch (error: any) {
      this.handleConnectionError(error);
    }
  }

  /**
   * Test Upstash Redis connection
   */
  private async testConnection(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      await this.client.ping();
      this.isConnected = true;
      this.connectionAttempts = 0;
      console.log(chalk.green('✅ Upstash Redis connected successfully'));
      this.emit('connected');
      this.emit('ready');
    } catch (error) {
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Handle connection errors with retry logic
   */
  private handleConnectionError(error: Error): void {
    this.isConnected = false;
    this.connectionAttempts++;

    console.log(chalk.red(`❌ Redis connection failed (attempt ${this.connectionAttempts}): ${error.message}`));

    if (this.connectionAttempts >= this.config.maxRetries) {
      console.log(chalk.red(`💀 Redis connection failed after ${this.config.maxRetries} attempts. Fallback will be used.`));
      this.emit('connection_failed', error);
      return;
    }

    // Retry connection
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, this.config.retryDelayMs * this.connectionAttempts);

    this.emit('error', error);
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this.isConnected) {
        try {
          const health = await this.getHealth();
          this.lastHealthCheck = health;
          this.emit('health_check', health);
        } catch (error) {
          console.log(chalk.yellow(`⚠️ Health check failed: ${(error as Error).message}`));
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get Upstash Redis health metrics
   */
  async getHealth(): Promise<RedisHealth> {
    if (!this.client || !this.isConnected) {
      return {
        connected: false,
        latency: -1,
        status: 'unhealthy',
        lastCheck: Date.now()
      };
    }

    const start = Date.now();
    try {
      await this.client.ping();
      const latency = Date.now() - start;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (latency > 1000) {
        status = 'degraded';
      } else if (latency > 5000) {
        status = 'unhealthy';
      }

      return {
        connected: true,
        latency,
        status,
        lastCheck: Date.now()
      };
    } catch (error) {
      return {
        connected: false,
        latency: -1,
        status: 'unhealthy',
        lastCheck: Date.now()
      };
    }
  }


  /**
   * Set a value in cache
   */
  async set<T = any>(
    key: string,
    value: T,
    ttl?: number,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        ttl,
        metadata,
      };

      const serializedValue = JSON.stringify(entry);
      const expireTime = ttl || this.config.ttl;
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;

      if (expireTime > 0) {
        await this.client.setex(finalKey, expireTime, serializedValue);
      } else {
        await this.client.set(finalKey, serializedValue);
      }

      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Upstash Redis SET failed for key ${key}: ${(error as Error).message}`));
      throw error;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
      const serializedValue = await this.client.get(finalKey);

      if (!serializedValue) {
        return null;
      }

      const entry: CacheEntry<T> = JSON.parse(serializedValue as string);

      // Check TTL if specified in entry
      if (entry.ttl && entry.timestamp) {
        const age = Date.now() - entry.timestamp;
        if (age > entry.ttl * 1000) {
          await this.del(key); // Clean up expired entry
          return null;
        }
      }

      return entry;
    } catch (error) {
      console.log(chalk.red(`❌ Upstash Redis GET failed for key ${key}: ${(error as Error).message}`));
      throw error;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
      const result = await this.client.del(finalKey);
      return result > 0;
    } catch (error) {
      console.log(chalk.red(`❌ Upstash Redis DEL failed for key ${key}: ${(error as Error).message}`));
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      const finalKey = this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
      const result = await this.client.exists(finalKey);
      return result > 0;
    } catch (error) {
      console.log(chalk.red(`❌ Upstash Redis EXISTS failed for key ${key}: ${(error as Error).message}`));
      throw error;
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      const finalPattern = this.config.keyPrefix ? `${this.config.keyPrefix}${pattern}` : pattern;
      const result = await this.client.keys(finalPattern);
      // Remove prefix from returned keys if it exists
      if (this.config.keyPrefix) {
        return result.map(key => key.replace(this.config.keyPrefix!, ''));
      }
      return result;
    } catch (error) {
      console.log(chalk.red(`❌ Upstash Redis KEYS failed for pattern ${pattern}: ${(error as Error).message}`));
      throw error;
    }
  }

  /**
   * Flush all keys with prefix
   */
  async flushAll(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not available');
    }

    try {
      // Upstash Redis doesn't support FLUSHALL, so we'll delete keys with our prefix
      const pattern = this.config.keyPrefix ? `${this.config.keyPrefix}*` : '*';
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        await this.client.del(...keys);
      }

      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Upstash Redis FLUSH failed: ${(error as Error).message}`));
      throw error;
    }
  }

  /**
   * Get current connection status
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get last health check results
   */
  getLastHealthCheck(): RedisHealth | null {
    return this.lastHealthCheck || null;
  }

  /**
   * Disconnect from Upstash Redis
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }

    // Upstash Redis is HTTP-based, so no persistent connection to close
    this.client = null;
    this.isConnected = false;

    console.log(chalk.yellow('🔌 Upstash Redis disconnected'));
    this.emit('disconnected');
  }

  /**
   * Reconnect to Upstash Redis
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Get Redis configuration
   */
  getConfig(): ConfigType['redis'] {
    return { ...this.config };
  }

  /**
   * Update Upstash Redis configuration
   */
  async updateConfig(newConfig: Partial<ConfigType['redis'] & { url?: string; token?: string }>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // If connection settings changed, reconnect
    const connectionChanged = (
      oldConfig.url !== this.config.url ||
      oldConfig.token !== this.config.token
    );

    if (connectionChanged && this.config.enabled) {
      await this.reconnect();
    }

    // Update config manager
    simpleConfigManager.setRedisConfig(newConfig);
  }
}

// Singleton instance
export const redisProvider = new RedisProvider();