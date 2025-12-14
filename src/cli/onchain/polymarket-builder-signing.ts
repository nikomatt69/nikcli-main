/*
 * Polymarket Builder Program Signing Server
 *
 * Handles builder program order attribution
 * Generates builder authentication headers for order tracking
 * Enables gas fee coverage and revenue sharing for builders
 *
 * Flow:
 * 1. Client signs order with its private key
 * 2. Client sends to signing server
 * 3. Server adds builder authentication headers
 * 4. Server submits to CLOB with builder attribution
 */

import crypto from 'crypto'
import { EventEmitter } from 'events'

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface BuilderCredentials {
  apiKey: string
  secret: string
  passphrase: string
}

export interface SigningRequest {
  signedOrder: any
  orderType: 'FOK' | 'GTC' | 'GTD'
}

export interface SigningResponse {
  success: boolean
  orderId?: string
  orderHashes?: string[]
  status?: string
  error?: string
}

export interface BuilderMetrics {
  totalOrdersSubmitted: number
  totalOrdersSuccess: number
  totalOrdersFailed: number
  totalVolume: number
  totalGasFeesSpared: number
  attributedOrders: number
  revenueShareEligible: boolean
}

export interface OrderAttributionRecord {
  timestamp: number
  orderId: string
  orderType: string
  size: number
  price: number
  success: boolean
  gasFeeCovered?: boolean
  attribution: {
    apiKey: string
    timestamp: number
    signature: string
  }
}

// ============================================================
// BUILDER SIGNING SERVICE
// ============================================================

export class PolymarketBuilderSigningService extends EventEmitter {
  private credentials: BuilderCredentials
  private clobUrl: string
  private metrics: BuilderMetrics = {
    totalOrdersSubmitted: 0,
    totalOrdersSuccess: 0,
    totalOrdersFailed: 0,
    totalVolume: 0,
    totalGasFeesSpared: 0,
    attributedOrders: 0,
    revenueShareEligible: false,
  }
  private attributionLog: Map<string, OrderAttributionRecord> = new Map()
  private enableMetrics: boolean = true
  private maxLogSize: number = 10000

  constructor(credentials: BuilderCredentials, clobUrl: string = 'https://clob.polymarket.com') {
    super()
    this.credentials = credentials
    this.clobUrl = clobUrl
    this.validateCredentials()
  }

  /**
   * Validate builder credentials format
   */
  private validateCredentials(): void {
    if (!this.credentials.apiKey || !this.credentials.secret || !this.credentials.passphrase) {
      throw new Error('Invalid builder credentials: all fields are required')
    }

    if (!this.credentials.apiKey.startsWith('builder_')) {
      console.warn('⚠︎ Builder API key should start with "builder_"')
    }
  }

  /**
   * Generate builder authentication headers
   */
  generateBuilderHeaders(method: string, path: string, body?: any): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const bodyStr = body ? JSON.stringify(body) : ''
    const message = timestamp + method + path + bodyStr

    // HMAC-SHA256 signature
    const signature = crypto.createHmac('sha256', this.credentials.secret).update(message).digest('base64')

    return {
      POLY_BUILDER_API_KEY: this.credentials.apiKey,
      POLY_BUILDER_TIMESTAMP: timestamp,
      POLY_BUILDER_PASSPHRASE: this.credentials.passphrase,
      POLY_BUILDER_SIGNATURE: signature,
    }
  }

  /**
   * Sign an order with builder attribution
   */
  async signOrder(request: SigningRequest): Promise<SigningResponse> {
    try {
      this.metrics.totalOrdersSubmitted++

      const path = '/order'
      const body = {
        order: request.signedOrder,
        orderType: request.orderType,
      }

      const builderHeaders = this.generateBuilderHeaders('POST', path, body)

      console.log(`📝 Signing order with builder attribution: ${request.orderType}`)

      // Submit order to CLOB with builder headers
      const response = await fetch(`${this.clobUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...builderHeaders,
        },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('✖ Order submission failed:', result.errorMsg)
        this.metrics.totalOrdersFailed++
        this.emit('orderFailed', { request, error: result.errorMsg })

        return {
          success: false,
          error: result.errorMsg,
        }
      }

      // Record attribution
      this.recordAttribution(result, builderHeaders)

      // Update metrics
      this.metrics.totalOrdersSuccess++
      this.metrics.attributedOrders++
      if (request.signedOrder.size && request.signedOrder.price) {
        this.metrics.totalVolume += request.signedOrder.size * request.signedOrder.price
      }

      console.log(`✓ Order signed and submitted: ${result.orderId}`)
      this.emit('orderSigned', result)

      return {
        success: true,
        orderId: result.orderId,
        orderHashes: result.orderHashes,
        status: result.status,
      }
    } catch (error: any) {
      console.error('✖ Order signing failed:', error.message)
      this.metrics.totalOrdersFailed++
      this.emit('signingError', error)

      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Record attribution metadata for tracking
   */
  private recordAttribution(orderResult: any, headers: Record<string, string>): void {
    const record: OrderAttributionRecord = {
      timestamp: Date.now(),
      orderId: orderResult.orderId || 'unknown',
      orderType: orderResult.orderType || 'unknown',
      size: orderResult.size || 0,
      price: orderResult.price || 0,
      success: orderResult.success,
      gasFeeCovered: true, // Polymarket covers gas for builders
      attribution: {
        apiKey: this.credentials.apiKey,
        timestamp: parseInt(headers['POLY_BUILDER_TIMESTAMP']),
        signature: headers['POLY_BUILDER_SIGNATURE'],
      },
    }

    this.attributionLog.set(orderResult.orderId, record)

    // Maintain log size
    if (this.attributionLog.size > this.maxLogSize) {
      const firstKey = this.attributionLog.keys().next().value
      if (firstKey !== undefined) {
        this.attributionLog.delete(firstKey)
      }
    }
  }

  /**
   * Get builder metrics
   */
  getMetrics(): BuilderMetrics {
    // Calculate success rate
    const successRate =
      this.metrics.totalOrdersSubmitted > 0 ? this.metrics.totalOrdersSuccess / this.metrics.totalOrdersSubmitted : 0

    // Revenue share eligibility (20+ orders, 95%+ success rate)
    this.metrics.revenueShareEligible = this.metrics.totalOrdersSuccess >= 20 && successRate >= 0.95

    // Estimate gas fees spared (average ~50 gwei per transaction)
    this.metrics.totalGasFeesSpared = this.metrics.attributedOrders * 0.001 // Rough estimate in MATIC

    return { ...this.metrics }
  }

  /**
   * Get attribution records
   */
  getAttributionLog(limit: number = 100): OrderAttributionRecord[] {
    return Array.from(this.attributionLog.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Export metrics for reporting
   */
  exportMetricsReport(): {
    metrics: BuilderMetrics
    period: { start: number; end: number }
    recommendations: string[]
  } {
    const metrics = this.getMetrics()

    const recommendations: string[] = []

    // Generate recommendations based on metrics
    if (metrics.totalOrdersSuccess < 20) {
      recommendations.push('Submit at least 20 successful orders to become eligible for revenue sharing')
    }

    if (metrics.totalOrdersSubmitted > 0) {
      const failureRate = 1 - metrics.totalOrdersSuccess / metrics.totalOrdersSubmitted
      if (failureRate > 0.05) {
        recommendations.push(
          `Consider improving order parameters (current failure rate: ${(failureRate * 100).toFixed(2)}%)`
        )
      }
    }

    if (metrics.totalVolume < 1000) {
      recommendations.push('Increase trading volume to improve builder leaderboard ranking')
    }

    if (!metrics.revenueShareEligible) {
      recommendations.push('Focus on maintaining 95%+ success rate for revenue sharing eligibility')
    } else {
      recommendations.push('✓ Eligible for revenue sharing program')
    }

    return {
      metrics,
      period: {
        start: Math.min(...Array.from(this.attributionLog.values()).map((r) => r.timestamp)),
        end: Date.now(),
      },
      recommendations,
    }
  }

  /**
   * Clear metrics and logs (for testing)
   */
  reset(): void {
    this.metrics = {
      totalOrdersSubmitted: 0,
      totalOrdersSuccess: 0,
      totalOrdersFailed: 0,
      totalVolume: 0,
      totalGasFeesSpared: 0,
      attributedOrders: 0,
      revenueShareEligible: false,
    }
    this.attributionLog.clear()
  }

  /**
   * Get summary stats
   */
  getSummary(): string {
    const metrics = this.getMetrics()
    const successRate =
      metrics.totalOrdersSubmitted > 0 ? (metrics.totalOrdersSuccess / metrics.totalOrdersSubmitted) * 100 : 0

    return `
=== POLYMARKET BUILDER STATS ===
📊 Orders: ${metrics.totalOrdersSuccess}/${metrics.totalOrdersSubmitted} successful (${successRate.toFixed(1)}%)
💰 Volume: ${metrics.totalVolume.toFixed(2)} USDC
⛽ Gas Fees Spared: ~${metrics.totalGasFeesSpared.toFixed(4)} MATIC
🏆 Revenue Share: ${metrics.revenueShareEligible ? '✓ Eligible' : '⏳︎ Not Yet'}
📈 Attributed Orders: ${metrics.attributedOrders}
    `.trim()
  }
}

// ============================================================
// EXPRESS MIDDLEWARE HELPER (Optional)
// ============================================================

/**
 * Express middleware for signing orders
 * Usage: app.post('/api/sign-order', polymarketSigningMiddleware(signingService))
 */
export function createSigningMiddleware(signingService: PolymarketBuilderSigningService) {
  return async (req: any, res: any) => {
    try {
      const { signedOrder, orderType } = req.body

      if (!signedOrder || !orderType) {
        return res.status(400).json({
          success: false,
          error: 'Missing signedOrder or orderType',
        })
      }

      const result = await signingService.signOrder({
        signedOrder,
        orderType,
      })

      res.json(result)
    } catch (error: any) {
      console.error('Signing middleware error:', error)
      res.status(500).json({
        success: false,
        error: error.message,
      })
    }
  }
}

export default PolymarketBuilderSigningService
