## Contributing to @bamby/aisdk-polymarket

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+ (recommend using [nvm](https://github.com/nvm-sh/nvm))
- npm 9+
- Git

### Getting Started

1. **Fork the repository**

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/nikcli-main.git
   cd nikcli-main/aisdk-polymarket
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test -- --coverage
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
# Check for lint errors
npm run lint

# Auto-fix lint errors
npm run format
```

### Building

```bash
# Build the package
npm run build

# Watch mode
npm run dev
```

## Code Standards

### TypeScript

- Use TypeScript strict mode
- Always define types for function parameters and return values
- Avoid `any` types (use `unknown` if necessary)
- Use Zod for runtime validation

### Naming Conventions

- **Files**: kebab-case (`clob-client.ts`)
- **Classes**: PascalCase (`PolymarketClient`)
- **Functions**: camelCase (`createCdpWallet`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_CONFIG`)

### Code Style

We use Prettier and ESLint. Run `npm run format` before committing.

### Comments

- Use JSDoc for public APIs
- Include `@param` and `@returns` tags
- Add `@example` for complex functions
- Keep comments concise and meaningful

Example:
```typescript
/**
 * Place an order on Polymarket CLOB
 *
 * @param args - Order arguments (token, side, price, size)
 * @returns Promise resolving to placed order details
 *
 * @example
 * ```ts
 * const order = await client.placeOrder({
 *   tokenId: '0x123',
 *   side: 'BUY',
 *   price: 0.55,
 *   size: 10,
 * });
 * ```
 */
async placeOrder(args: OrderArgs): Promise<PlacedOrder> {
  // ...
}
```

## Testing Guidelines

### Unit Tests

- Write tests for all new functions
- Aim for >80% code coverage
- Use descriptive test names
- Mock external dependencies

Example:
```typescript
describe('validateTickSize', () => {
  it('should validate correct tick size', () => {
    expect(validateTickSize(0.55, 0.01)).toBe(true);
  });

  it('should reject invalid tick size', () => {
    expect(validateTickSize(0.555, 0.01)).toBe(false);
  });
});
```

### Integration Tests

- Test real API interactions (if possible)
- Use environment variables for credentials
- Clean up resources after tests

## Pull Request Process

### Before Submitting

1. ✅ Run tests: `npm test`
2. ✅ Run type check: `npm run typecheck`
3. ✅ Run linter: `npm run lint`
4. ✅ Update documentation if needed
5. ✅ Add entry to CHANGELOG.md

### PR Guidelines

- **Title**: Use conventional commits format
  - `feat: add WebSocket support`
  - `fix: handle rate limit errors`
  - `docs: update README examples`
  - `test: add orderbook tests`
  - `refactor: improve error handling`

- **Description**: Include
  - What changes were made
  - Why these changes were needed
  - How to test the changes
  - Related issues (if any)

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] New tests added
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
- [ ] CHANGELOG.md updated
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:
```bash
feat(wallet): add support for Base network
fix(clob): handle order validation errors
docs: add WebSocket examples
test(schemas): improve validation coverage
```

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Creating a Release

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v0.2.0`
4. Push tag: `git push origin v0.2.0`
5. GitHub Actions will auto-publish to npm

## Security

### Reporting Vulnerabilities

**Do NOT open public issues for security vulnerabilities.**

Email security concerns to: [your-email]

Include:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Best Practices

- Never commit secrets (`.env` files)
- Always sanitize logs
- Use parameterized queries
- Validate all user inputs
- Follow OWASP guidelines

## Getting Help

- **Discord**: [Join our Discord](https://discord.gg/...)
- **Discussions**: [GitHub Discussions](https://github.com/nikomatt69/nikcli-main/discussions)
- **Issues**: [Report bugs](https://github.com/nikomatt69/nikcli-main/issues)

## Resources

- [AI SDK Docs](https://sdk.vercel.ai/docs)
- [Polymarket Docs](https://docs.polymarket.com/)
- [CDP Docs](https://docs.cdp.coinbase.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Docs](https://vitest.dev/)

## Code of Conduct

Be respectful, inclusive, and collaborative. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🙏
