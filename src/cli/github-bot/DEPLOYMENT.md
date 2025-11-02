# GitHub Bot Deployment Guide

## Prerequisites

1. **GitHub App**: Create a GitHub App with the following permissions:
   - Repository: Contents (read & write)
   - Repository: Issues (read & write)
   - Repository: Pull requests (read & write)
   - Repository: Metadata (read)

2. **Environment Variables**: Set the following environment variables:
   ```bash
   export GITHUB_TOKEN="your_github_token"
   export GITHUB_WEBHOOK_SECRET="your_webhook_secret"
   export GITHUB_APP_ID="your_app_id"
   export GITHUB_PRIVATE_KEY="your_private_key"
   export GITHUB_INSTALLATION_ID="your_installation_id"
   ```

## Deployment Steps

### 1. Install Dependencies

```bash
cd /path/to/nikcli-main
npm install
# or
bun install
```

### 2. Configure Webhook

Set up your webhook URL to point to:
```
https://your-domain.com/api/github/webhook
```

Configure webhook events:
- Issue comments
- Pull request review comments
- Issues

### 3. Deploy to Vercel (Recommended)

```bash
vercel deploy
```

The webhook endpoint is already configured at `/api/github/webhook.ts`.

### 4. Test the Bot

Create a test PR and add a comment:
```
@nikcli review
```

The bot should:
1. React with 👍 to acknowledge
2. React with 👀 while processing
3. Post a status comment
4. Analyze the PR
5. Create a new PR with fixes (if issues found)
6. React with 🚀 when complete
7. Post results

## Advanced Configuration

### Execution Modes

The bot supports three execution modes:

1. **auto** (default): Automatically chooses between background agent and local execution
2. **background-agent**: Always use VM-based background agents
3. **local-execution**: Always execute locally

Configure in `task-executor.ts` constructor.

### Feature Flags

Enable/disable features in `bot-config.example.ts`:

```typescript
features: {
  enablePRReview: true,
  enableAutoFix: true,
  enableTypeScriptChecks: true,
  enableESLintFixes: true,
  enableAIPoweredFixes: true,
}
```

## Monitoring

### View Job Status

Jobs are tracked in memory. For production, consider adding:
- Redis for job queue
- Database for job history
- Monitoring dashboard

### Logs

The bot logs to console. Configure log aggregation:
- Vercel: View logs in Vercel dashboard
- Self-hosted: Use logging service (e.g., Winston, Pino)

## Security

### Webhook Signature Verification

The bot verifies GitHub webhook signatures using HMAC-SHA256. This prevents:
- Unauthorized webhook calls
- Replay attacks (5-minute timestamp window)

### Token Security

- Never commit tokens to git
- Use environment variables
- Rotate tokens regularly
- Use GitHub App installation tokens (auto-expiring)

## Troubleshooting

### Bot Not Responding

1. Check webhook delivery in GitHub App settings
2. Verify environment variables are set
3. Check Vercel/server logs for errors
4. Ensure bot has required permissions

### TypeScript Errors

1. Run `npm run build` to check for compilation errors
2. Verify all dependencies are installed
3. Check `tsconfig.json` configuration

### PR Creation Fails

1. Verify bot has write access to repository
2. Check branch protection rules
3. Ensure GitHub token has correct scopes
4. Check rate limits

## Performance Optimization

### Rate Limiting

GitHub API has rate limits:
- 5000 requests/hour for authenticated requests
- 60 requests/hour for unauthenticated

The bot uses authenticated requests to maximize limits.

### Concurrent Jobs

Configure max concurrent jobs in `bot-config.ts`:
```typescript
maxConcurrentJobs: 5
```

### Caching

Consider caching:
- Repository metadata
- File contents
- TypeScript compilation results

## Maintenance

### Updates

Keep dependencies updated:
```bash
npm update
```

### Monitoring

Monitor:
- Job success/failure rates
- Processing times
- API rate limit usage
- Error rates

## Support

For issues or questions:
- GitHub Issues: https://github.com/nikomatt69/nikcli-main/issues
- Documentation: https://github.com/nikomatt69/nikcli-main/tree/main/src/cli/github-bot

## License

Same as NikCLI project license.
