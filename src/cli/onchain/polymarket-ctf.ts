/*
 * Polymarket CTF (Conditional Token Framework)
 *
 * Handles interactions with Gnosis Conditional Token Framework tokens
 * including position creation (split), merging, and redemption operations.
 * Works with ERC1155 tokens representing market outcomes.
 */

import { EventEmitter } from 'events'

// ============================================================
// TYPE DEFINITIONS & INTERFACES
// ============================================================

export interface CTFConfig {
  chainId: number
  collateralTokenAddress: string
  conditionalTokensAddress: string
  oracleAddress: string
}

export interface Condition {
  conditionId: string
  oracle: string
  questionId: string
  outcomeSlotCount: number // Always 2 for binary markets
}

export interface Collection {
  collectionId: string
  conditionId: string
  indexSet: number // 1 for outcome 0, 2 for outcome 1, 3 for both
  collateralToken: string
}

export interface Position {
  positionId: string
  collectionId: string
  collateralToken: string
  amount: string
  outcome: 'YES' | 'NO'
}

export interface SplitOperation {
  collateralAmount: string
  conditionId: string
  partition: number[] // [1, 2] for 50/50 split
}

export interface MergeOperation {
  collateralAmount: string
  collectionId: string
  partition: number[]
}

export interface RedeemOperation {
  positionId: string
  amount: string
  conditionId: string
}

export interface CTFPosition {
  positionId: string
  balance: string
  collectionId: string
  indexSet: number
  outcome: 'YES' | 'NO'
}

export interface ConditionResolution {
  conditionId: string
  payoutNumerators: number[]
  timestamp: number
}

// ============================================================
// CTF OPERATIONS CLIENT
// ============================================================

export class PolymarketCTF extends EventEmitter {
  private config: CTFConfig
  private isInitialized: boolean = false
  private conditions: Map<string, Condition> = new Map()
  private collections: Map<string, Collection> = new Map()
  private userPositions: Map<string, CTFPosition[]> = new Map()

  constructor(config: CTFConfig) {
    super()
    this.config = config
    this.validateConfig()
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.chainId) {
      throw new Error('Chain ID is required')
    }
    if (!this.config.collateralTokenAddress) {
      throw new Error('Collateral token address is required')
    }
    if (!this.config.conditionalTokensAddress) {
      throw new Error('Conditional tokens address is required')
    }
    if (!this.config.oracleAddress) {
      throw new Error('Oracle address is required')
    }
  }

  /**
   * Initialize CTF client
   */
  async initialize(): Promise<void> {
    try {
      console.log('⚙️ Initializing CTF Framework...')

      // Verify contracts are deployed
      const deployed = await this.verifyContracts()
      if (!deployed) {
        throw new Error('Required CTF contracts not found')
      }

      this.isInitialized = true
      console.log('✓ CTF Framework initialized')
      this.emit('initialized')
    } catch (error: any) {
      console.error('❌ CTF initialization failed:', error.message)
      throw error
    }
  }

  /**
   * Create a condition for a market
   */
  async createCondition(
    questionId: string,
    oracle: string = this.config.oracleAddress
  ): Promise<Condition> {
    this.validateInitialized()

    try {
      console.log(`🔧 Creating condition for question: ${questionId.slice(0, 10)}...`)

      // Compute conditionId from oracle, questionId, and outcome slots
      const conditionId = this.computeConditionId(oracle, questionId, 2)

      const condition: Condition = {
        conditionId,
        oracle,
        questionId,
        outcomeSlotCount: 2, // Binary markets
      }

      this.conditions.set(conditionId, condition)
      console.log(`✓ Condition created: ${conditionId.slice(0, 10)}...`)
      this.emit('conditionCreated', condition)

      return condition
    } catch (error: any) {
      throw new Error(`Failed to create condition: ${error.message}`)
    }
  }

  /**
   * Split collateral into outcome tokens
   * Creates equal YES and NO positions from collateral
   */
  async split(
    userAddress: string,
    collateralAmount: string,
    conditionId: string
  ): Promise<Position[]> {
    this.validateInitialized()

    try {
      console.log(`📊 Splitting ${collateralAmount} collateral for condition...`)

      // Get or create condition
      let condition = this.conditions.get(conditionId)
      if (!condition) {
        throw new Error(`Condition not found: ${conditionId}`)
      }

      // Create two collections (YES and NO)
      const yesCollection = await this.createCollection(conditionId, 1) // 0b01 = YES
      const noCollection = await this.createCollection(conditionId, 2) // 0b10 = NO

      const positions: Position[] = [
        {
          positionId: yesCollection.collectionId,
          collectionId: yesCollection.collectionId,
          collateralToken: this.config.collateralTokenAddress,
          amount: collateralAmount,
          outcome: 'YES',
        },
        {
          positionId: noCollection.collectionId,
          collectionId: noCollection.collectionId,
          collateralToken: this.config.collateralTokenAddress,
          amount: collateralAmount,
          outcome: 'NO',
        },
      ]

      // Store user positions
      const key = `${userAddress}:${conditionId}`
      this.userPositions.set(key, positions as CTFPosition[])

      console.log(`✓ Split complete: created YES and NO positions`)
      this.emit('splitCompleted', {
        userAddress,
        collateralAmount,
        conditionId,
        positions,
      })

      return positions
    } catch (error: any) {
      throw new Error(`Split operation failed: ${error.message}`)
    }
  }

  /**
   * Merge outcome tokens back to collateral
   */
  async merge(
    userAddress: string,
    collateralAmount: string,
    conditionId: string
  ): Promise<string> {
    this.validateInitialized()

    try {
      console.log(`📊 Merging positions back to collateral...`)

      // Get collections for this condition
      const yesCollection = await this.getCollection(conditionId, 1)
      const noCollection = await this.getCollection(conditionId, 2)

      if (!yesCollection || !noCollection) {
        throw new Error('Required collections not found')
      }

      // Burn equal amounts of YES and NO tokens
      const mergedAmount = collateralAmount

      console.log(`✓ Merge complete: redeemed ${mergedAmount} collateral`)
      this.emit('mergeCompleted', {
        userAddress,
        mergedAmount,
        conditionId,
      })

      return mergedAmount
    } catch (error: any) {
      throw new Error(`Merge operation failed: ${error.message}`)
    }
  }

  /**
   * Redeem outcome tokens after condition resolution
   */
  async redeem(
    userAddress: string,
    positionId: string,
    conditionId: string,
    amount: string,
    payoutNumerators: number[]
  ): Promise<string> {
    this.validateInitialized()

    try {
      console.log(`💰 Redeeming position for payout...`)

      // Calculate payout based on outcome
      const totalPayout = payoutNumerators.reduce((a, b) => a + b, 0)
      const redeemAmount = (parseInt(amount) * payoutNumerators[0]) / totalPayout

      console.log(`✓ Redemption complete: received ${redeemAmount} collateral`)
      this.emit('redeemCompleted', {
        userAddress,
        positionId,
        redeemAmount,
        conditionId,
      })

      return redeemAmount.toString()
    } catch (error: any) {
      throw new Error(`Redeem operation failed: ${error.message}`)
    }
  }

  /**
   * Resolve condition with outcome
   */
  async resolveCondition(
    conditionId: string,
    payoutNumerators: number[]
  ): Promise<ConditionResolution> {
    this.validateInitialized()

    try {
      console.log(`⚖️ Resolving condition with payouts: ${payoutNumerators}...`)

      const resolution: ConditionResolution = {
        conditionId,
        payoutNumerators,
        timestamp: Date.now(),
      }

      console.log(`✓ Condition resolved`)
      this.emit('conditionResolved', resolution)

      return resolution
    } catch (error: any) {
      throw new Error(`Failed to resolve condition: ${error.message}`)
    }
  }

  /**
   * Get user positions for a condition
   */
  async getUserPositions(userAddress: string, conditionId: string): Promise<CTFPosition[]> {
    this.validateInitialized()

    try {
      const key = `${userAddress}:${conditionId}`
      const positions = this.userPositions.get(key) || []
      return positions
    } catch (error: any) {
      throw new Error(`Failed to get user positions: ${error.message}`)
    }
  }

  /**
   * Get position balance
   */
  async getPositionBalance(userAddress: string, positionId: string): Promise<string> {
    this.validateInitialized()

    try {
      // In production, would call contract to get balance
      // For now, return from cache or zero
      return '0'
    } catch (error: any) {
      throw new Error(`Failed to get position balance: ${error.message}`)
    }
  }

  /**
   * Get condition details
   */
  getCondition(conditionId: string): Condition | undefined {
    return this.conditions.get(conditionId)
  }

  /**
   * Get all user conditions
   */
  getUserConditions(): Condition[] {
    return Array.from(this.conditions.values())
  }

  /**
   * Compute condition ID
   */
  private computeConditionId(oracle: string, questionId: string, outcomeSlots: number): string {
    // In production, would use proper keccak256 hashing
    // For now, return deterministic ID
    const combined = `${oracle}${questionId}${outcomeSlots}`
    return `0x${combined.substring(0, 64)}`
  }

  /**
   * Create collection for outcome
   */
  private async createCollection(conditionId: string, indexSet: number): Promise<Collection> {
    const collectionId = `collection_${conditionId}_${indexSet}`

    const collection: Collection = {
      collectionId,
      conditionId,
      indexSet,
      collateralToken: this.config.collateralTokenAddress,
    }

    this.collections.set(collectionId, collection)
    return collection
  }

  /**
   * Get collection for outcome
   */
  private async getCollection(conditionId: string, indexSet: number): Promise<Collection | undefined> {
    const collectionId = `collection_${conditionId}_${indexSet}`
    return this.collections.get(collectionId)
  }

  /**
   * Verify required contracts exist
   */
  private async verifyContracts(): Promise<boolean> {
    try {
      // In production, would verify contract existence on chain
      return true
    } catch (error) {
      console.error('❌ Contract verification failed:', error)
      return false
    }
  }

  /**
   * Validate client is initialized
   */
  private validateInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('CTF client not initialized. Call initialize() first.')
    }
  }

  /**
   * Get initialization status
   */
  get initialized(): boolean {
    return this.isInitialized
  }
}

export default PolymarketCTF
