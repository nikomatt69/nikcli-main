# GitHub Bot Integration for NikCLI

This module enables @nikcli mentions in GitHub comments to trigger autonomous code fixing and PR creation.

## Features

✅ **Webhook Handler** - Processes GitHub webhook events for @nikcli mentions
✅ **Comment Processor** - Parses @nikcli commands and extracts context
✅ **Task Executor** - Executes requested tasks autonomously using NikCLI
✅ **GitHub Integration** - Creates PRs with fixes and posts status comments

## Usage

### Setting up GitHub App

1. Create a GitHub App with these permissions:
   - Repository: Contents (write)
   - Repository: Issues (write)
   - Repository: Pull requests (write)
   - Repository: Metadata (read)

2. Configure webhook URL to point to your NikCLI API server:
   ```
   https://your-domain.com/v1/github/webhook
   ```

3. Set environment variables:
   ```bash
   export GITHUB_APP_ID="your_app_id"
   export GITHUB_PRIVATE_KEY="your_private_key"
   export GITHUB_INSTALLATION_ID="your_installation_id"
   export GITHUB_WEBHOOK_SECRET="your_webhook_secret"
   export GITHUB_TOKEN="your_github_token"
   ```

### Supported Commands

Use @nikcli in GitHub comments with these commands:

| Command | Description | Example |
|---------|-------------|---------|
| `fix` | Fix issues/errors | `@nikcli fix src/components/Button.tsx` |
| `add` | Add new functionality | `@nikcli add user authentication with JWT` |
| `optimize` | Improve performance | `@nikcli optimize database queries` |
| `refactor` | Restructure code | `@nikcli refactor src/utils/helpers.ts` |
| `test` | Add/fix tests | `@nikcli test --coverage` |
| `doc` | Add/update docs | `@nikcli doc API endpoints` |
| `security` | Security improvements | `@nikcli security sanitize user inputs` |
| `accessibility` | A11y improvements | `@nikcli accessibility keyboard navigation` |
| `analyze` | Code analysis | `@nikcli analyze performance bottlenecks` |
| `review` | Code review with automated fixes | `@nikcli review` |

### Options

- `--tests` - Include test creation
- `--docs` - Update documentation
- `--preserve-format` - Keep code formatting

### Context Detection

NikCLI automatically detects:
- File paths in `backticks`
- Line numbers (line 42, L42)
- Code blocks in comments

### Example Usage

```markdown
@nikcli fix src/auth/login.ts

There's a bug on line 25 where the JWT validation fails.

\`\`\`typescript
// This code is throwing an error
const token = jwt.verify(authToken, secret)
\`\`\`
```

This will:
1. Create a new branch `nikcli/fix-timestamp`
2. Clone the repository
3. Run NikCLI to fix the identified issues
4. Commit changes
5. Create a pull request with the fix
6. Post a comment with the PR link

## Architecture

```
GitHub Comment → Webhook → NikCLI API Server
                    ↓
              GitHubIntegration
                    ↓
           GitHubWebhookHandler
                    ↓
              CommentProcessor → TaskExecutor
                    ↓               ↓
              Parse @nikcli → Execute NikCLI
                    ↓               ↓
              Extract Context → Create PR
```

## Integration Status

✅ All core components implemented
✅ Webhook processing integrated with existing API server
✅ Compatible with current NikCLI background agents system
✅ Advanced PR review with automated fixes
✅ TypeScript type checking and ESLint integration
✅ AI-powered code fixing capabilities
✅ Minimal changes to existing codebase
✅ Production-ready error handling and logging
✅ Full type safety with TypeScript

## New Features (Latest Update)

### Advanced PR Review & Automated Fixes

The bot now includes sophisticated PR review capabilities:

- **Automated Issue Detection**: Scans PRs for TypeScript errors, ESLint issues, and code quality problems
- **Smart Fixes**: Applies automated fixes using ESLint auto-fix and AI-powered code correction
- **Type Safety**: Runs TypeScript compiler checks to ensure type correctness
- **Targeted Commits**: Creates focused commits with detailed descriptions of fixes applied
- **New PR Creation**: Automatically creates a new PR with fixes targeting the correct base branch
- **Comprehensive Analysis**: Provides detailed analysis of issues found and fixes applied

### Usage Example for PR Review

```markdown
@nikcli review

Please review this PR and fix any TypeScript errors or linting issues.
```

The bot will:
1. Fetch the PR diff and changed files
2. Clone the PR branch
3. Run TypeScript compiler and ESLint
4. Apply automated fixes
5. Create a new branch with fixes
6. Create a new PR targeting the same base branch
7. Post a detailed comment with analysis

### Components

- **webhook-handler.ts**: Enhanced to pass PR context to task executor
- **task-executor.ts**: Integrated with PRReviewExecutor for advanced reviews
- **pr-review-executor.ts**: New component for comprehensive PR analysis and fixing
- **comment-processor.ts**: Parses @nikcli commands from comments
- **types.ts**: Type-safe interfaces for all components
- **index.ts**: Clean exports for external usage

Ready for deployment and testing with GitHub App configuration!