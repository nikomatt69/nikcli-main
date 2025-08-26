import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { CliUI } from '../../utils/cli-ui';

/**
 * TokenManager - Secure JWT token management for VM agents
 * 
 * Features:
 * - Temporary JWT tokens with limited scope
 * - Token budget and capability restrictions
 * - Automatic token expiration and refresh
 * - Secure token generation and validation
 * - Audit logging for security compliance
 */
export class TokenManager extends EventEmitter {
  private static instance: TokenManager;
  private jwtSecret: string;
  private activeTokens: Map<string, TokenInfo> = new Map();
  private revokedTokens: Set<string> = new Set();

  // Security settings
  private readonly DEFAULT_TTL = 3600; // 1 hour
  private readonly MAX_TTL = 86400; // 24 hours
  private readonly TOKEN_CLEANUP_INTERVAL = 300000; // 5 minutes

  private constructor() {
    super();

    // Generate or use existing JWT secret
    this.jwtSecret = process.env.NIKCLI_JWT_SECRET || this.generateSecretKey();

    // Setup automatic cleanup of expired tokens
    this.setupTokenCleanup();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  /**
   * Generate session token for VM agent
   */
  async generateSessionToken(agentId: string, options: TokenOptions = {}): Promise<string> {
    try {
      const tokenId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const ttl = Math.min(options.ttl || this.DEFAULT_TTL, this.MAX_TTL);

      // Token payload with security constraints
      const payload: TokenPayload = {
        jti: tokenId, // JWT ID
        sub: agentId, // Subject (agent ID)
        iat: now, // Issued at
        exp: now + ttl, // Expiration
        aud: 'nikcli-vm-agent', // Audience
        iss: 'nikcli-proxy', // Issuer

        // Agent-specific data
        agentId,
        tokenBudget: options.tokenBudget || 50000,
        capabilities: options.capabilities || [],
        sessionId: crypto.randomUUID(),

        // Security constraints
        maxRequestsPerMinute: options.maxRequestsPerMinute || 30,
        allowedModels: options.allowedModels || ['claude-4-sonnet-20250514', 'gpt-5-mini-2025-08-07', 'gemini-2.5-pro'],
        maxTokensPerRequest: options.maxTokensPerRequest || 4000
      };

      // Sign token
      const token = jwt.sign(payload, this.jwtSecret, {
        algorithm: 'HS256',
        header: {
          typ: 'JWT',
          alg: 'HS256',
          kid: tokenId // Key ID for tracking
        }
      });

      // Store token info for tracking
      const tokenInfo: TokenInfo = {
        tokenId,
        agentId,
        issuedAt: new Date(now * 1000),
        expiresAt: new Date((now + ttl) * 1000),
        tokenBudget: payload.tokenBudget,
        capabilities: payload.capabilities,
        sessionId: payload.sessionId,
        revoked: false,
        usageStats: {
          requestCount: 0,
          tokenUsage: 0,
          lastUsed: null
        }
      };

      this.activeTokens.set(tokenId, tokenInfo);

      CliUI.logSuccess(`🔑 Session token generated for agent ${agentId} (TTL: ${ttl}s)`);
      this.emit('token:generated', { agentId, tokenId, ttl });

      return token;

    } catch (error: any) {
      CliUI.logError(`❌ Failed to generate session token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      // Decode without verification first to get token ID
      const decoded = jwt.decode(token, { complete: true }) as any;

      if (!decoded || !decoded.header || !decoded.header.kid) {
        throw new Error('Invalid token format');
      }

      const tokenId = decoded.header.kid;

      // Check if token is revoked
      if (this.revokedTokens.has(tokenId)) {
        throw new Error('Token has been revoked');
      }

      // Verify token signature and expiration
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        audience: 'nikcli-vm-agent',
        issuer: 'nikcli-proxy'
      }) as TokenPayload;

      // Update token usage stats
      const tokenInfo = this.activeTokens.get(tokenId);
      if (tokenInfo && !tokenInfo.revoked) {
        tokenInfo.usageStats.lastUsed = new Date();
      }

      return payload;

    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        CliUI.logWarning(`⚠️ Token expired: ${error.message}`);
      } else if (error.name === 'JsonWebTokenError') {
        CliUI.logError(`❌ Invalid token: ${error.message}`);
      } else {
        CliUI.logError(`❌ Token verification failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Revoke token immediately
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token, { complete: true }) as any;

      if (!decoded || !decoded.header || !decoded.header.kid) {
        throw new Error('Invalid token format');
      }

      const tokenId = decoded.header.kid;
      const agentId = decoded.payload.agentId;

      // Add to revoked tokens set
      this.revokedTokens.add(tokenId);

      // Mark token as revoked in active tokens
      const tokenInfo = this.activeTokens.get(tokenId);
      if (tokenInfo) {
        tokenInfo.revoked = true;
        this.activeTokens.set(tokenId, tokenInfo);
      }

      CliUI.logInfo(`🚫 Token revoked for agent ${agentId}`);
      this.emit('token:revoked', { agentId, tokenId });

    } catch (error: any) {
      CliUI.logError(`❌ Failed to revoke token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refresh token with new expiration
   */
  async refreshToken(token: string, newTtl?: number): Promise<string> {
    try {
      // Verify current token
      const payload = await this.verifyToken(token);

      // Revoke old token
      await this.revokeToken(token);

      // Generate new token with same permissions but fresh expiration
      const newToken = await this.generateSessionToken(payload.agentId, {
        tokenBudget: payload.tokenBudget,
        capabilities: payload.capabilities,
        ttl: newTtl || this.DEFAULT_TTL,
        maxRequestsPerMinute: payload.maxRequestsPerMinute,
        allowedModels: payload.allowedModels,
        maxTokensPerRequest: payload.maxTokensPerRequest
      });

      CliUI.logInfo(`🔄 Token refreshed for agent ${payload.agentId}`);
      this.emit('token:refreshed', { agentId: payload.agentId });

      return newToken;

    } catch (error: any) {
      CliUI.logError(`❌ Failed to refresh token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update token usage statistics
   */
  updateTokenUsage(tokenId: string, requestCount: number, tokenUsage: number): void {
    const tokenInfo = this.activeTokens.get(tokenId);

    if (tokenInfo && !tokenInfo.revoked) {
      tokenInfo.usageStats.requestCount += requestCount;
      tokenInfo.usageStats.tokenUsage += tokenUsage;
      tokenInfo.usageStats.lastUsed = new Date();

      this.activeTokens.set(tokenId, tokenInfo);

      this.emit('token:usage_updated', {
        tokenId,
        agentId: tokenInfo.agentId,
        usage: tokenInfo.usageStats
      });
    }
  }

  /**
   * Get active tokens for an agent
   */
  getAgentTokens(agentId: string): TokenInfo[] {
    return Array.from(this.activeTokens.values())
      .filter(token => token.agentId === agentId && !token.revoked);
  }

  /**
   * Get all active tokens
   */
  getAllActiveTokens(): TokenInfo[] {
    return Array.from(this.activeTokens.values())
      .filter(token => !token.revoked);
  }

  /**
   * Get token statistics
   */
  getTokenStatistics(): TokenStatistics {
    const activeTokens = this.getAllActiveTokens();
    const totalTokens = this.activeTokens.size;
    const revokedCount = this.revokedTokens.size;

    const totalRequests = activeTokens.reduce((sum, token) => sum + token.usageStats.requestCount, 0);
    const totalTokenUsage = activeTokens.reduce((sum, token) => sum + token.usageStats.tokenUsage, 0);

    return {
      totalTokens,
      activeTokens: activeTokens.length,
      revokedTokens: revokedCount,
      totalRequests,
      totalTokenUsage,
      averageTokensPerRequest: totalRequests > 0 ? totalTokenUsage / totalRequests : 0,
      oldestToken: activeTokens.length > 0
        ? Math.min(...activeTokens.map(t => t.issuedAt.getTime()))
        : null,
      newestToken: activeTokens.length > 0
        ? Math.max(...activeTokens.map(t => t.issuedAt.getTime()))
        : null
    };
  }

  /**
   * Cleanup expired tokens
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    let cleanedCount = 0;

    for (const [tokenId, tokenInfo] of this.activeTokens.entries()) {
      if (tokenInfo.expiresAt < now || tokenInfo.revoked) {
        this.activeTokens.delete(tokenId);
        this.revokedTokens.delete(tokenId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      CliUI.logDebug(`🧹 Cleaned up ${cleanedCount} expired tokens`);
      this.emit('tokens:cleanup', { cleanedCount });
    }
  }

  /**
   * Generate secure secret key
   */
  private generateSecretKey(): string {
    const secret = crypto.randomBytes(64).toString('hex');
    CliUI.logWarning('⚠️ Using generated JWT secret. Set NIKCLI_JWT_SECRET environment variable for production');
    return secret;
  }

  /**
   * Setup automatic token cleanup
   */
  private setupTokenCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, this.TOKEN_CLEANUP_INTERVAL);

    CliUI.logDebug(`🔧 Token cleanup scheduled every ${this.TOKEN_CLEANUP_INTERVAL / 1000}s`);
  }
}

// Type definitions
export interface TokenOptions {
  ttl?: number; // Time to live in seconds
  tokenBudget?: number;
  capabilities?: string[];
  maxRequestsPerMinute?: number;
  allowedModels?: string[];
  maxTokensPerRequest?: number;
}

export interface TokenPayload {
  jti: string; // JWT ID
  sub: string; // Subject (agent ID)
  iat: number; // Issued at
  exp: number; // Expiration
  aud: string; // Audience
  iss: string; // Issuer

  // Agent-specific data
  agentId: string;
  tokenBudget: number;
  capabilities: string[];
  sessionId: string;

  // Security constraints
  maxRequestsPerMinute: number;
  allowedModels: string[];
  maxTokensPerRequest: number;
}

export interface TokenInfo {
  tokenId: string;
  agentId: string;
  issuedAt: Date;
  expiresAt: Date;
  tokenBudget: number;
  capabilities: string[];
  sessionId: string;
  revoked: boolean;
  usageStats: {
    requestCount: number;
    tokenUsage: number;
    lastUsed: Date | null;
  };
}

export interface TokenStatistics {
  totalTokens: number;
  activeTokens: number;
  revokedTokens: number;
  totalRequests: number;
  totalTokenUsage: number;
  averageTokensPerRequest: number;
  oldestToken: number | null;
  newestToken: number | null;
}