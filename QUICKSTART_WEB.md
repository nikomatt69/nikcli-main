# 🚀 Quick Start - NikCLI Background Agents Web Interface

This guide will help you get the Background Agents Web Interface up and running in minutes.

## Prerequisites

- Node.js 18 or higher
- npm, pnpm, yarn, or bun
- Git (for cloning repositories)

## Installation

### 1. Clone or Update Repository

```bash
# If you already have the repository
git pull origin main

# Or clone it fresh
git clone https://github.com/nikomatt69/nikcli.git
cd nikcli
```

### 2. Install Dependencies

```bash
npm install
# or
pnpm install
# or
yarn install
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your API keys:

```env
# Required for AI functionality
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional: GitHub integration
GITHUB_TOKEN=your_github_token

# Optional: Other AI providers
OPENAI_API_KEY=your_openai_api_key
```

## Running the Application

### Option 1: Run Both API Server and Web UI Together (Recommended)

```bash
npm run bg:web
# or
pnpm bg:web
```

This will start:
- Background Agents API Server on `http://localhost:3000`
- Web Interface on `http://localhost:3001`

### Option 2: Run Separately

**Terminal 1 - API Server:**
```bash
npm run bg:server
# or
pnpm bg:server
```

**Terminal 2 - Web Interface:**
```bash
npm run web:dev
# or
pnpm web:dev
```

## Accessing the Web Interface

Open your browser and navigate to:

```
http://localhost:3001
```

You should see the Background Agents Dashboard!

## Quick Tutorial

### 1. View the Dashboard

The dashboard shows:
- Total jobs count
- Running, queued, succeeded, and failed jobs
- Quick actions to create jobs or view all jobs

### 2. Create Your First Job

1. Click **"Create New Job"** or navigate to `/jobs/new`
2. Fill in the form:
   - **Repository**: e.g., `nikomatt69/nikcli`
   - **Task**: e.g., "Add a new feature to handle CSV file parsing"
   - **Base Branch**: `main` (or your preferred branch)
3. Configure resource limits (optional):
   - Max Time: 30 minutes
   - Max Tool Calls: 50
   - Max Memory: 2048 MB
4. Click **"Create Job"**

### 3. Monitor Job Progress

After creating a job:
1. You'll be redirected to the job details page
2. Watch the logs stream in real-time
3. See metrics update (tokens, tool calls, execution time)
4. When complete, a pull request link will appear

### 4. Send Follow-up Messages

If the agent needs additional instructions:
1. Open the job details page
2. Type a message in the "Send Follow-up Message" box
3. Press Enter or click Send
4. The agent will receive and process your message

## API Endpoints

The API server provides these endpoints:

- `GET /health` - Server health check
- `GET /v1/jobs` - List all jobs
- `POST /v1/jobs` - Create new job
- `GET /v1/jobs/:id` - Get job details
- `DELETE /v1/jobs/:id` - Cancel job
- `GET /v1/jobs/:id/stream` - Stream job logs (SSE)
- `POST /v1/jobs/:id/message` - Send follow-up message
- `GET /v1/stats` - Get system statistics

## WebSocket Events

Real-time updates via WebSocket on `ws://localhost:3000/ws`:

- `job:created` - New job created
- `job:started` - Job execution started
- `job:completed` - Job completed successfully
- `job:failed` - Job failed
- `job:log` - New log entry

## Directory Structure

```
src/web/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Dashboard
│   ├── jobs/              # Jobs pages
│   └── globals.css        # Global styles
├── components/
│   ├── layout/            # Layout components
│   └── ui/                # UI components
├── lib/                   # Utilities and contexts
│   ├── api-client.ts      # API client
│   ├── websocket-context.tsx
│   └── theme-context.tsx
├── pages/                 # Page components
└── types/                 # TypeScript types
```

## Troubleshooting

### Port Already in Use

If port 3000 or 3001 is already in use:

```bash
# Change API port
BG_API_PORT=3002 npm run bg:server

# Change web port
npm run web:dev -- -p 3003
```

### WebSocket Connection Failed

1. Make sure the API server is running
2. Check the WebSocket URL in `src/web/lib/api-client.ts`
3. Verify no firewall is blocking the connection

### API Requests Failing

1. Verify the API server is running on port 3000
2. Check CORS settings in `src/cli/background-agents/api/server.ts`
3. Review browser console for errors

### Missing Dependencies

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Next Steps

### Production Deployment

1. Build the application:
```bash
npm run build
npm run web:build
```

2. Start in production mode:
```bash
NODE_ENV=production npm run bg:server &
npm run web:start
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel deploy
```

### Docker Deployment

```bash
# Build Docker image
docker build -t nikcli-bg .

# Run container
docker-compose up -d
```

## Features Overview

### ✅ Implemented
- Real-time job monitoring
- Job creation and management
- Live log streaming
- WebSocket integration
- Job cancellation
- Follow-up messages
- Stats dashboard
- Dark mode support
- Responsive design

### 🚧 Coming Soon
- GitHub OAuth integration
- Slack notifications
- Email alerts
- Advanced job scheduling
- Job templates
- Batch job creation
- Analytics dashboard

## Getting Help

- **Documentation**: See `src/web/README.md` for detailed documentation
- **API Documentation**: Visit `http://localhost:3000/v1` when server is running
- **Issues**: [GitHub Issues](https://github.com/nikomatt69/nikcli/issues)

## Tips

1. **Use the Dashboard**: Keep it open to monitor all jobs at a glance
2. **Follow-up Messages**: Use them to guide running agents without canceling
3. **Resource Limits**: Set appropriate limits to prevent runaway jobs
4. **Playbooks**: Use playbook files for complex, repeatable workflows
5. **Real-time Logs**: Watch logs live to debug issues quickly

## Example Use Cases

### 1. Add a Feature
```yaml
Task: "Add user authentication using JWT tokens"
Repository: owner/repo
Branch: main
Time: 30 minutes
```

### 2. Fix Tests
```yaml
Task: "Fix failing unit tests in the auth module"
Repository: owner/repo
Branch: develop
Time: 20 minutes
```

### 3. Refactor Code
```yaml
Task: "Refactor database queries to use transactions"
Repository: owner/repo
Branch: main
Time: 45 minutes
```

## Support

Need help? Check out:
- 📖 [Full Documentation](src/web/README.md)
- 💬 [GitHub Discussions](https://github.com/nikomatt69/nikcli/discussions)
- 🐛 [Report Bug](https://github.com/nikomatt69/nikcli/issues)

Happy coding with Background Agents! 🚀
