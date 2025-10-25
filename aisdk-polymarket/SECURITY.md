# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: [your-security-email@example.com]

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information (as much as you can provide):

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

## Preferred Languages

We prefer all communications to be in English.

## Security Best Practices

When using this SDK:

### 1. Environment Variables

**Never commit secrets to version control**

```bash
# ❌ BAD - Don't do this
CDP_API_KEY=your-key-here

# ✅ GOOD - Use .env file (add to .gitignore)
# In .env file:
CDP_API_KEY=your-key-here
```

### 2. Wallet Security

**Use Coinbase CDP Server Wallets (recommended)**

```typescript
// ✅ GOOD - CDP wallet (no private key exposure)
const wallet = await createCdpWallet({ network: 'polygon' });

// ❌ AVOID - Direct private key usage
// Only use for testing, never in production
```

### 3. API Key Rotation

- Rotate CDP API keys regularly
- Use separate keys for development and production
- Revoke compromised keys immediately

### 4. Input Validation

The SDK includes built-in validation, but always validate user inputs:

```typescript
// ✅ GOOD - Use Zod schemas
const validatedOrder = OrderArgsSchema.parse(userInput);

// ❌ BAD - Direct user input
await client.placeOrder(userInput);
```

### 5. Error Handling

**Don't expose sensitive information in error messages**

```typescript
// ✅ GOOD - Generic error messages to users
try {
  await client.placeOrder(order);
} catch (error) {
  logger.error('Order failed', error); // Internal logging
  throw new Error('Failed to place order'); // User-facing message
}

// ❌ BAD - Exposing internal details
catch (error) {
  throw new Error(`Order failed: ${JSON.stringify(error)}`);
}
```

### 6. Rate Limiting

**Implement rate limiting to prevent abuse**

```typescript
import { RateLimiters } from '@bamby/aisdk-polymarket';

// Built-in rate limiters
const limiter = RateLimiters.polymarketCLOB;
await limiter.acquire();
await client.placeOrder(order);
```

### 7. Logging

**Never log sensitive data**

```typescript
// ✅ GOOD - Sanitized logging
logger.info('Order placed', { orderId: order.id });

// ❌ BAD - Logging secrets
logger.info('API call', { apiKey: config.apiKey });
```

The SDK automatically sanitizes logs, but be cautious with custom logging.

### 8. Network Security

**Use HTTPS for all API calls**

```typescript
// ✅ GOOD - HTTPS (default)
const client = createPolymarketClient({
  host: 'https://clob.polymarket.com',
});

// ❌ BAD - HTTP
const client = createPolymarketClient({
  host: 'http://clob.polymarket.com',
});
```

### 9. Dependency Management

**Keep dependencies up to date**

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Fix vulnerabilities
npm audit fix
```

### 10. Access Control

**Limit wallet permissions**

- Use separate wallets for different purposes
- Set appropriate risk limits
- Monitor wallet activity

```typescript
const client = createPolymarketClient({
  signer,
  riskConfig: {
    maxNotional: 1000,        // Limit max order size
    maxSizePerMarket: 100,
    allowedMarkets: ['0x...'], // Whitelist markets
  },
});
```

## Known Security Considerations

### 1. EIP-712 Signature Replay

The SDK implements nonces to prevent signature replay attacks. However, always verify:
- Signatures are used only once
- Orders have appropriate expiration times

### 2. Front-Running

Prediction markets are susceptible to front-running. Consider:
- Using private transaction pools (Flashbots, etc.)
- Implementing slippage protection
- Monitoring mempool activity

### 3. Smart Contract Risk

Polymarket uses audited smart contracts, but:
- Understand the risks of on-chain trading
- Only trade amounts you can afford to lose
- Monitor contract upgrades

### 4. API Security

- All API calls use HTTPS
- EIP-712 signatures for order authentication
- Rate limiting to prevent abuse

## Incident Response

If a security incident is confirmed:

1. We will patch the vulnerability ASAP
2. Release a security advisory
3. Notify affected users
4. Update documentation with mitigation steps

## Security Updates

Subscribe to security advisories:
- Watch the GitHub repository
- Enable notifications for security updates
- Follow [@nikomatt69](https://github.com/nikomatt69) for announcements

## Bug Bounty

We currently do not have a formal bug bounty program. However, we appreciate responsible disclosure and will acknowledge security researchers in our release notes.

## Compliance

This SDK is designed for:
- Educational purposes
- Research
- Development

**This SDK is NOT**:
- Financial advice
- Investment recommendation
- Regulated financial product

Users are responsible for:
- Compliance with local laws
- Tax reporting
- Risk management

## Questions?

For security-related questions:
- Email: [your-security-email@example.com]
- Discord: [Join our Discord](https://discord.gg/...)

---

**Last Updated**: 2024-10-25
