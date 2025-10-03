# NikCLI Background Agents - Web Interface

A modern, real-time web interface for managing and monitoring NikCLI background agents.

## Features

### 📊 Dashboard
- Real-time statistics and metrics
- Job status overview
- Quick actions for common tasks
- System health monitoring

### 🤖 Job Management
- **Create Jobs**: Intuitive form to create new background agent tasks
- **Job List**: View and filter all jobs by status
- **Job Details**: Real-time logs and progress monitoring
- **Follow-up Messages**: Send instructions to running agents
- **Job Cancellation**: Cancel running or queued jobs

### 🔄 Real-time Updates
- WebSocket integration for live updates
- Server-Sent Events (SSE) for log streaming
- Automatic refresh of job status and metrics

### 🎨 Modern UI/UX
- Beautiful, responsive design with Tailwind CSS
- Smooth animations with Framer Motion
- Dark mode support
- Mobile-friendly interface

## Architecture

```
src/web/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Dashboard page
│   ├── jobs/                # Jobs pages
│   │   ├── page.tsx         # Jobs list
│   │   ├── new/             # Create job
│   │   └── [id]/            # Job details
│   └── globals.css          # Global styles
├── components/
│   ├── layout/
│   │   ├── main-layout.tsx  # Main app layout
│   │   └── sidebar.tsx      # Navigation sidebar
│   └── ui/                  # Reusable UI components
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── theme-switch.tsx
├── lib/
│   ├── api-client.ts        # API client for backend
│   ├── websocket-context.tsx # WebSocket provider
│   ├── config-context.tsx   # Configuration context
│   └── theme-context.tsx    # Theme provider
├── pages/                   # Page components
│   ├── dashboard.tsx        # Dashboard page component
│   ├── jobs-list.tsx        # Jobs list component
│   ├── job-create.tsx       # Job creation form
│   └── job-details.tsx      # Job details view
└── types/
    └── index.ts             # TypeScript type definitions
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm, yarn, pnpm, or bun
- Running NikCLI Background Agents API server

### Installation

1. Install dependencies:
```bash
npm install
# or
pnpm install
# or
yarn install
```

2. Configure API endpoint (optional):

Edit `src/web/lib/api-client.ts` to point to your API server:
```typescript
private baseUrl = 'http://localhost:3000/v1'
```

3. Start the development server:
```bash
npm run dev
# or
pnpm dev
```

4. Open your browser:
```
http://localhost:3001
```

## Usage

### Creating a Background Job

1. Navigate to **Create Job** in the sidebar
2. Fill in the required fields:
   - **Repository**: GitHub repository (e.g., `owner/repo`)
   - **Base Branch**: Branch to work from (default: `main`)
   - **Task Description**: What you want the agent to do
   - **Playbook** (optional): Path to playbook file
3. Configure resource limits:
   - **Max Time**: Maximum execution time in minutes
   - **Max Tool Calls**: Maximum number of tool calls
   - **Max Memory**: Maximum memory usage in MB
4. Click **Create Job**

### Monitoring Jobs

1. Navigate to **Jobs** to see all background jobs
2. Filter by status: `all`, `running`, `queued`, `succeeded`, `failed`, `cancelled`
3. Click on any job to view detailed information and logs

### Job Details

The job details page shows:
- Real-time status updates
- Live log streaming
- Execution metrics (tokens, tool calls, execution time)
- Pull request link (when created)
- Follow-up message input for running jobs
- Job cancellation option

### Follow-up Messages

For running jobs, you can send follow-up instructions:
1. Open the job details page
2. Find the "Send Follow-up Message" section
3. Type your message and press Enter or click Send
4. The agent will receive and process your message

## API Integration

The web interface communicates with the Background Agents API server:

### REST API Endpoints
- `GET /v1/jobs` - List all jobs
- `POST /v1/jobs` - Create new job
- `GET /v1/jobs/:id` - Get job details
- `DELETE /v1/jobs/:id` - Cancel job
- `POST /v1/jobs/:id/message` - Send follow-up message
- `GET /v1/stats` - Get system statistics

### WebSocket Events
- `job:created` - New job created
- `job:started` - Job started
- `job:completed` - Job completed successfully
- `job:failed` - Job failed
- `job:log` - New log entry

### Server-Sent Events (SSE)
- `GET /v1/jobs/:id/stream` - Stream job logs in real-time

## Configuration

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# API Server URL
NEXT_PUBLIC_API_URL=http://localhost:3000

# WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws

# GitHub OAuth (optional)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

### Theme Customization

Edit `src/web/app/globals.css` to customize the theme colors:

```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  /* ... other colors */
}
```

## Building for Production

### Build the application:
```bash
npm run build
# or
pnpm build
```

### Start production server:
```bash
npm start
# or
pnpm start
```

### Deploy to Vercel:
```bash
vercel deploy
```

The web interface will automatically proxy API requests to the configured backend server.

## Development

### Project Structure

- **App Router**: Using Next.js 13+ App Router for modern React features
- **TypeScript**: Full type safety throughout the application
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Framer Motion**: Smooth animations and transitions
- **React Context**: State management for WebSocket, theme, and config

### Key Components

#### API Client (`src/web/lib/api-client.ts`)
Handles all HTTP requests to the backend API with automatic error handling and type safety.

#### WebSocket Context (`src/web/lib/websocket-context.tsx`)
Manages WebSocket connection for real-time updates across the application.

#### Main Layout (`src/web/components/layout/main-layout.tsx`)
Provides the main application shell with sidebar navigation and status bar.

### Adding New Features

1. Create page component in `src/web/pages/`
2. Add route in `src/web/app/`
3. Update navigation in `src/web/components/layout/sidebar.tsx`
4. Add API methods in `src/web/lib/api-client.ts` if needed

## Troubleshooting

### WebSocket Connection Issues

If the WebSocket connection fails:
1. Check that the API server is running
2. Verify the WebSocket URL in configuration
3. Check browser console for connection errors
4. Ensure no firewall is blocking WebSocket connections

### API Request Failures

If API requests fail:
1. Verify the API server is running on the correct port
2. Check CORS configuration on the API server
3. Review network tab in browser dev tools
4. Check API server logs for errors

### Build Errors

If you encounter build errors:
1. Clear Next.js cache: `rm -rf .next`
2. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
3. Check TypeScript errors: `npm run type-check`
4. Review build output for specific errors

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: iOS Safari, Chrome on Android

## Performance

- **Code Splitting**: Automatic route-based code splitting
- **Lazy Loading**: Components loaded on demand
- **Optimized Images**: Next.js Image optimization
- **Caching**: API responses cached with SWR patterns

## Security

- **CORS**: Proper CORS configuration for API requests
- **XSS Protection**: React's built-in XSS protection
- **CSRF**: CSRF tokens for state-changing operations
- **Input Validation**: Client and server-side validation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [nikcli/issues](https://github.com/nikomatt69/nikcli/issues)
- Documentation: [nikcli/docs](https://github.com/nikomatt69/nikcli/docs)
