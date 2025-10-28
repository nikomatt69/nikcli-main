import { z } from 'zod'
import { getAddress } from 'viem'
import { PatternValidation } from '../patterns/arkregex-patterns'

/**
 * GOAT SDK Tool Validation Schemas
 * Ensures all parameters are valid before execution
 * Prevents "Invalid EVM address format" errors
 */

// ============================================================
// EVM ADDRESS VALIDATION & NORMALIZATION WITH CHECKSUM
// ============================================================

/**
 * Checksum an EVM address using viem's getAddress function
 * This applies EIP-55 checksum encoding which is required by viem
 *
 * @param address - Raw address input
 * @returns Checksummed address or null if invalid
 */
export function checksumAddress(address: string | null | undefined): string | null {
  if (!address) return null

  const validation = PatternValidation.validateEVMAddress(address)
  if (!validation.valid) {
    return null
  }

  const paddedAddress = validation.normalized

  try {
    // viem's getAddress applies EIP-55 checksum and validates 
    return getAddress(paddedAddress as `0x${string}`)
  } catch {
    return null
  }
}

/**
 * Normalize EVM address to 42-character format (0x + 40 hex chars)
 * This version returns lowercase for comparison purposes
 *
 * @param address - Raw address input (may be short or incomplete)
 * @returns Normalized 42-character address or null if invalid format
 */
export function normalizeEVMAddress(address: string | null | undefined): string | null {
  if (!address) return null

  const validation = PatternValidation.validateEVMAddress(address)
  if (!validation.valid) {
    return null
  }

  return validation.normalized as string | null
}

/**
 * Check if an address is the zero address (0x0000...0000)
 */
export function isZeroAddress(address: string): boolean {
  const normalized = normalizeEVMAddress(address)
  return normalized === '0x0000000000000000000000000000000000000000'
}

/**
 * Zod schema that checksums AND validates EVM addresses
 * Automatically converts 0x0 → 0x0000...0000 with proper EIP-55 checksum
 * This is required for viem contract interactions
 */
export const EVMAddressSchema = z
  .string()
  .trim()
  .transform((val) => {
    const checksummed = checksumAddress(val)
    if (!checksummed) {
      throw new Error('Invalid EVM address format. Must be 0x followed by hex characters')
    }
    return checksummed
  })
  .refine(
    (val) => PatternValidation.validateEVMAddress(val).valid,
    'Invalid EVM address format after checksumming'
  )

export const EVMAddressOptionalSchema = EVMAddressSchema.optional()

// ============================================================
// ERC20 TOKEN VALIDATION
// ============================================================

export const ERC20BalanceSchema = z.object({
  address: EVMAddressSchema.describe('Wallet address to check balance for'),
  tokenAddress: EVMAddressSchema.describe('ERC20 token contract address'),
  chainId: z.number().optional().describe('Chain ID (optional)'),
})

export type ERC20Balance = z.infer<typeof ERC20BalanceSchema>

export const ERC20TransferSchema = z.object({
  from: EVMAddressSchema.describe('Sender address'),
  to: EVMAddressSchema.describe('Recipient address'),
  tokenAddress: EVMAddressSchema.describe('ERC20 token contract address'),
  amount: z.string().describe('Amount to transfer (in wei or decimal string)'),
  chainId: z.number().optional().describe('Chain ID (optional)'),
})

export type ERC20Transfer = z.infer<typeof ERC20TransferSchema>

export const ERC20ApproveSchema = z.object({
  owner: EVMAddressSchema.describe('Token owner address'),
  spender: EVMAddressSchema.describe('Spender address to approve'),
  tokenAddress: EVMAddressSchema.describe('ERC20 token contract address'),
  amount: z.string().describe('Amount to approve (in wei or decimal string)'),
  chainId: z.number().optional().describe('Chain ID (optional)'),
})

export type ERC20Approve = z.infer<typeof ERC20ApproveSchema>

// ============================================================
// POLYMARKET VALIDATION
// ============================================================

export const PolymarketBetSchema = z.object({
  marketId: z.string().describe('Polymarket market ID'),
  outcome: z.enum(['yes', 'no']).describe('Bet outcome'),
  amount: z.string().describe('Bet amount in USDC'),
  walletAddress: EVMAddressOptionalSchema.describe('Wallet address (optional)'),
})

export type PolymarketBet = z.infer<typeof PolymarketBetSchema>

export const PolymarketMarketsSchema = z.object({
  limit: z.number().optional().default(10).describe('Number of markets to fetch'),
  offset: z.number().optional().default(0).describe('Pagination offset'),
  filter: z
    .enum(['active', 'resolved', 'all'])
    .optional()
    .default('active')
    .describe('Market filter'),
})

export type PolymarketMarkets = z.infer<typeof PolymarketMarketsSchema>

export const PolymarketSearchSchema = z.object({
  query: z.string().min(1).describe('Search query for finding markets'),
  limit: z.number().optional().default(5).describe('Number of results to return'),
})

export type PolymarketSearch = z.infer<typeof PolymarketSearchSchema>

// ============================================================
// WALLET VALIDATION
// ============================================================

export const WalletInfoSchema = z.object({
  address: EVMAddressOptionalSchema.describe('Wallet address (optional, uses GOAT_EVM_PRIVATE_KEY by default)'),
})

export type WalletInfo = z.infer<typeof WalletInfoSchema>

// ============================================================
// CHAT MESSAGE VALIDATION
// ============================================================

export const GoatChatMessageSchema = z.object({
  message: z.string().min(1).describe('Message to process with GOAT tools'),
  options: z
    .object({
      plugin: z.enum(['polymarket', 'erc20', 'all']).optional(),
      chainId: z.number().optional(),
    })
    .optional(),
})

export type GoatChatMessage = z.infer<typeof GoatChatMessageSchema>

// ============================================================
// SAFE PARAMETER VALIDATION WITH DEFAULTS
// ============================================================

/**
 * Validate and sanitize ERC20 balance parameters
 * Provides sensible defaults and error messages
 */
export function validateERC20Balance(params: any): {
  valid: boolean
  data?: ERC20Balance
  error?: string
} {
  try {
    const validated = ERC20BalanceSchema.parse(params)
    return { valid: true, data: validated }
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
    return {
      valid: false,
      error: `Invalid ERC20 balance parameters: ${errors.join('; ')}`,
    }
  }
}

/**
 * Validate and sanitize ERC20 transfer parameters
 */
export function validateERC20Transfer(params: any): {
  valid: boolean
  data?: ERC20Transfer
  error?: string
} {
  try {
    const validated = ERC20TransferSchema.parse(params)
    return { valid: true, data: validated }
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
    return {
      valid: false,
      error: `Invalid ERC20 transfer parameters: ${errors.join('; ')}`,
    }
  }
}

/**
 * Validate and sanitize ERC20 approve parameters
 */
export function validateERC20Approve(params: any): {
  valid: boolean
  data?: ERC20Approve
  error?: string
} {
  try {
    const validated = ERC20ApproveSchema.parse(params)
    return { valid: true, data: validated }
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
    return {
      valid: false,
      error: `Invalid ERC20 approve parameters: ${errors.join('; ')}`,
    }
  }
}

/**
 * Validate Polymarket bet parameters
 */
export function validatePolymarketBet(params: any): {
  valid: boolean
  data?: PolymarketBet
  error?: string
} {
  try {
    const validated = PolymarketBetSchema.parse(params)
    return { valid: true, data: validated }
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
    return {
      valid: false,
      error: `Invalid Polymarket bet parameters: ${errors.join('; ')}`,
    }
  }
}

/**
 * Validate Polymarket search parameters
 */
export function validatePolymarketSearch(params: any): {
  valid: boolean
  data?: PolymarketSearch
  error?: string
} {
  try {
    const validated = PolymarketSearchSchema.parse(params)
    return { valid: true, data: validated }
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
    return {
      valid: false,
      error: `Invalid Polymarket search parameters: ${errors.join('; ')}`,
    }
  }
}

/**
 * Validate wallet info parameters
 */
export function validateWalletInfo(params: any): {
  valid: boolean
  data?: WalletInfo
  error?: string
} {
  try {
    const validated = WalletInfoSchema.parse(params)
    return { valid: true, data: validated }
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
    return {
      valid: false,
      error: `Invalid wallet info parameters: ${errors.join('; ')}`,
    }
  }
}

/**
 * Validate chat message parameters
 */
export function validateGoatChatMessage(params: any): {
  valid: boolean
  data?: GoatChatMessage
  error?: string
} {
  try {
    const validated = GoatChatMessageSchema.parse(params)
    return { valid: true, data: validated }
  } catch (error: any) {
    const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
    return {
      valid: false,
      error: `Invalid chat message parameters: ${errors.join('; ')}`,
    }
  }
}

/**
 * Sanitize address - normalize and validate
 * Handles short addresses by padding, returns normalized 42-char address
 * If address is invalid, returns null
 */
export function sanitizeAddress(address: string | undefined): string | null {
  if (!address) return null
  return normalizeEVMAddress(address)
}

/**
 * Check if address is valid EVM format (after normalization)
 * Returns true if the address can be normalized to a valid EVM address
 */
export function isValidEVMAddress(address: string): boolean {
  const validation = PatternValidation.validateEVMAddress(address)
  return validation.valid
}

export default {
  EVMAddressSchema,
  EVMAddressOptionalSchema,
  ERC20BalanceSchema,
  ERC20TransferSchema,
  ERC20ApproveSchema,
  PolymarketBetSchema,
  PolymarketMarketsSchema,
  WalletInfoSchema,
  GoatChatMessageSchema,
  validateERC20Balance,
  validateERC20Transfer,
  validateERC20Approve,
  validatePolymarketBet,
  validateWalletInfo,
  validateGoatChatMessage,
  checksumAddress,
  normalizeEVMAddress,
  isZeroAddress,
  sanitizeAddress,
  isValidEVMAddress,
}
