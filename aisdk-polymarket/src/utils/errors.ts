/**
 * Custom error classes with recovery suggestions
 */

export class PolymarketError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly recovery?: string
  ) {
    super(message);
    this.name = 'PolymarketError';
  }
}

export class OrderValidationError extends PolymarketError {
  constructor(message: string, recovery?: string) {
    super(message, 'ORDER_VALIDATION_ERROR', false, recovery);
    this.name = 'OrderValidationError';
  }
}

export class InsufficientBalanceError extends PolymarketError {
  constructor(required: number, available: number) {
    super(
      `Insufficient balance: required ${required}, available ${available}`,
      'INSUFFICIENT_BALANCE',
      false,
      'Fund your wallet with USDC on Polygon. Visit https://app.uniswap.org to swap tokens.'
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class InvalidTickSizeError extends PolymarketError {
  constructor(price: number, tickSize: number, suggested: number) {
    super(
      `Invalid tick size: price ${price} must be multiple of ${tickSize}`,
      'INVALID_TICK_SIZE',
      true,
      `Use price ${suggested} instead (rounded to nearest tick size)`
    );
    this.name = 'InvalidTickSizeError';
  }
}

export class OrderSizeError extends PolymarketError {
  constructor(size: number, minSize: number) {
    super(
      `Order size ${size} below minimum ${minSize}`,
      'ORDER_SIZE_TOO_SMALL',
      true,
      `Increase order size to at least ${minSize} shares`
    );
    this.name = 'OrderSizeError';
  }
}

export class RateLimitError extends PolymarketError {
  constructor(retryAfter?: number) {
    const recovery = retryAfter
      ? `Wait ${Math.ceil(retryAfter / 1000)} seconds before retrying`
      : 'Reduce request frequency or implement exponential backoff';

    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', true, recovery);
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends PolymarketError {
  constructor(message: string) {
    super(
      `Network error: ${message}`,
      'NETWORK_ERROR',
      true,
      'Check your internet connection and retry. If the problem persists, the service may be down.'
    );
    this.name = 'NetworkError';
  }
}

export class SignatureError extends PolymarketError {
  constructor(message: string) {
    super(
      `Signature error: ${message}`,
      'SIGNATURE_ERROR',
      false,
      'Verify your wallet configuration and ensure CDP credentials are correct'
    );
    this.name = 'SignatureError';
  }
}

export class MarketNotFoundError extends PolymarketError {
  constructor(marketId: string) {
    super(
      `Market not found: ${marketId}`,
      'MARKET_NOT_FOUND',
      false,
      'Check the market ID or search for the market using the Gamma API'
    );
    this.name = 'MarketNotFoundError';
  }
}

/**
 * Parse CLOB API error and convert to typed error
 */
export function parsePolymarketError(error: any): PolymarketError {
  const message = error.message || error.toString();

  if (message.includes('INVALID_ORDER_MIN_TICK_SIZE')) {
    // Extract price and tick size from error if available
    return new PolymarketError(
      message,
      'INVALID_TICK_SIZE',
      true,
      'Round your price to the nearest valid tick size (usually 0.01)'
    );
  }

  if (message.includes('INVALID_ORDER_MIN_SIZE')) {
    return new PolymarketError(
      message,
      'ORDER_SIZE_TOO_SMALL',
      true,
      'Increase order size to meet minimum (usually 1 share)'
    );
  }

  if (message.includes('NOT_ENOUGH_BALANCE')) {
    return new InsufficientBalanceError(0, 0);
  }

  if (message.includes('FOK_ORDER_NOT_FILLED')) {
    return new PolymarketError(
      message,
      'FOK_NOT_FILLED',
      true,
      'Use GTC order type or adjust price to match available liquidity'
    );
  }

  if (message.includes('INVALID_SIGNATURE')) {
    return new SignatureError(message);
  }

  if (message.includes('rate limit') || error.status === 429) {
    return new RateLimitError(error.retryAfter);
  }

  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return new NetworkError(message);
  }

  // Default error
  return new PolymarketError(message, 'UNKNOWN_ERROR', false);
}

/**
 * Format error with recovery suggestion
 */
export function formatErrorMessage(error: PolymarketError): string {
  let message = `❌ ${error.name}: ${error.message}`;

  if (error.recovery) {
    message += `\n\n💡 Recovery: ${error.recovery}`;
  }

  if (error.recoverable) {
    message += '\n\n♻️  This error is recoverable. Please try again.';
  }

  return message;
}
