# Contributing to NikCLI (Rust Implementation)

Thank you for your interest in contributing to NikCLI! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Rust 1.70 or later
- Git
- Basic knowledge of Rust programming

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/nikcli-main.git
   cd nikcli-main/rust-nikcli
   ```

2. **Install Development Tools**
   ```bash
   # Install useful development tools
   cargo install cargo-watch cargo-expand cargo-audit
   
   # Install formatting and linting tools
   rustup component add rustfmt clippy
   ```

3. **Run Tests**
   ```bash
   cargo test
   cargo test -- --nocapture  # Show output
   ```

## 📋 Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Your Changes

- Write clean, idiomatic Rust code
- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
cargo test

# Run specific tests
cargo test test_name

# Run integration tests
cargo test --test integration_tests

# Check for issues
cargo check
cargo clippy
cargo fmt --check
```

### 4. Commit Your Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

Use conventional commit messages:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `test:` for test additions
- `refactor:` for code refactoring
- `perf:` for performance improvements

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 🏗️ Code Style Guidelines

### Rust Conventions

- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Use `rustfmt` for consistent formatting
- Use `clippy` for linting
- Prefer `&str` over `String` for function parameters when possible
- Use `Result<T, E>` for error handling
- Document public APIs with `///` comments

### Naming Conventions

- Use `snake_case` for functions, variables, and modules
- Use `PascalCase` for types, traits, and enums
- Use `SCREAMING_SNAKE_CASE` for constants
- Use descriptive names that explain intent

### Error Handling

- Use `thiserror` for custom error types
- Use `anyhow` for application-level error handling
- Provide meaningful error messages
- Include context in error chains

### Example Code Style

```rust
/// Validates an API key for the given provider.
///
/// # Arguments
/// * `provider` - The AI provider name
/// * `key` - The API key to validate
///
/// # Returns
/// * `Ok(())` if the key is valid
/// * `Err(NikCliError)` if validation fails
pub fn validate_api_key(provider: &str, key: &str) -> NikCliResult<()> {
    if key.is_empty() {
        return Err(NikCliError::Validation("API key cannot be empty".to_string()));
    }
    
    // Validation logic here...
    Ok(())
}
```

## 🧪 Testing Guidelines

### Unit Tests

- Place unit tests in the same file as the code being tested
- Use `#[cfg(test)]` module for test code
- Test both success and failure cases
- Use descriptive test names

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_api_key_success() {
        let result = validate_api_key("anthropic", "sk-ant-123");
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_validate_api_key_empty() {
        let result = validate_api_key("anthropic", "");
        assert!(result.is_err());
    }
}
```

### Integration Tests

- Place integration tests in the `tests/` directory
- Test complete workflows and command-line interactions
- Use `assert_cmd` for CLI testing
- Use `tempfile` for temporary files and directories

### Test Coverage

- Aim for high test coverage on critical paths
- Test error conditions and edge cases
- Use property-based testing where appropriate
- Mock external dependencies

## 📚 Documentation

### Code Documentation

- Document all public APIs with `///` comments
- Include examples in documentation
- Use markdown formatting in doc comments
- Document error conditions

### README Updates

- Update README.md for user-facing changes
- Include usage examples
- Update installation instructions if needed
- Keep the feature list current

### API Documentation

```bash
# Generate documentation
cargo doc --open
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment Information**
   - Rust version (`rustc --version`)
   - Operating system
   - NikCLI version

2. **Steps to Reproduce**
   - Clear, numbered steps
   - Expected vs actual behavior
   - Minimal reproduction case

3. **Additional Context**
   - Error messages
   - Logs (with `RUST_LOG=debug`)
   - Configuration files (sanitized)

## 💡 Feature Requests

When requesting features:

1. **Describe the Problem**
   - What problem does this solve?
   - Why is this important?

2. **Propose a Solution**
   - How should it work?
   - What would the API look like?

3. **Consider Alternatives**
   - Are there other ways to solve this?
   - What are the trade-offs?

## 🔍 Code Review Process

### For Contributors

- Respond to review feedback promptly
- Make requested changes in new commits
- Keep PRs focused and reasonably sized
- Update documentation and tests

### For Reviewers

- Be constructive and respectful
- Focus on code quality and correctness
- Check for security issues
- Verify tests and documentation

## 🚀 Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- `MAJOR`: Breaking changes
- `MINOR`: New features (backward compatible)
- `PATCH`: Bug fixes (backward compatible)

### Release Checklist

- [ ] All tests pass
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated
- [ ] Version numbers are bumped
- [ ] Security audit passes (`cargo audit`)

## 🛡️ Security

### Reporting Security Issues

- **DO NOT** open public issues for security vulnerabilities
- Email security concerns to: security@nikcli.dev
- Include detailed reproduction steps
- Allow time for response before disclosure

### Security Guidelines

- Never commit API keys or secrets
- Use secure coding practices
- Validate all user inputs
- Keep dependencies updated
- Run `cargo audit` regularly

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Discord**: [Join our community](https://discord.gg/nikcli)
- **Email**: dev@nikcli.dev

## 🎉 Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing to NikCLI! 🚀