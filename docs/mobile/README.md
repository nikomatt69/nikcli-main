# NikCLI Mobile - Development on the Go 📱

Use the full power of NikCLI from your mobile device via the Claude app.

## 🎯 Overview

NikCLI Mobile provides a complete mobile interface to access all NikCLI functionality from your phone or tablet. Built as a Progressive Web App (PWA), it offers:

- ✅ **Full CLI Access** - All commands, agents, and tools available
- ✅ **Real-time Streaming** - Live responses via WebSocket
- ✅ **Workspace Bridge** - Secure connection to your local development environment
- ✅ **Offline Support** - Queue commands when offline, sync when back online
- ✅ **Touch-Optimized UI** - Mobile-first design with gestures
- ✅ **Background Jobs** - Run long tasks and get notified on completion

## 🏗️ Architecture

```
┌─────────────────┐
│  Mobile Device  │  ← Progressive Web App
│   (Claude App)  │
└────────┬────────┘
         │ HTTPS + WebSocket
         ↓
┌─────────────────┐
│   Cloud API     │  ← NikCLI Headless Server
│   (Railway)     │
└────────┬────────┘
         │ Bridge Connection
         ↓
┌─────────────────┐
│ Local Workspace │  ← Your Development Machine
│  (Bridge Agent) │
└─────────────────┘
```

## 🚀 Quick Start

### 1. Start Local Workspace Bridge

On your development machine:

```bash
# Start the bridge (generates credentials automatically)
nikcli bridge start

# Or with custom settings
nikcli bridge start \
  --cloud-url=https://api.nikcli.com \
  --workspace=/path/to/project \
  --workspace-id=my-workspace
```

You'll see:

```
🔗 NikCLI Workspace Bridge

Generated workspace ID: workspace_abc123xyz

✓ Bridge Connected!

Workspace Details:
  Path:         /Users/you/projects/myapp
  ID:           workspace_abc123xyz
  Cloud URL:    https://api.nikcli.com

📱 Your workspace is now accessible from mobile!
Use this Workspace ID in the mobile app to connect.

Press Ctrl+C to stop the bridge
```

### 2. Access from Mobile

1. Open Claude app on your mobile device
2. Navigate to `mobile.nikcli.com`
3. Tap "Add to Home Screen" to install as app
4. Login (or continue as guest)
5. Enter your workspace ID: `workspace_abc123xyz`
6. Start coding! 🎉

## 📱 Mobile Interface Features

### Chat Interface

The main interface is a mobile-optimized chat similar to Claude Code Web:

```
┌──────────────────────────┐
│  ⚙️  NikCLI    🔗 workspace │
├──────────────────────────┤
│                          │
│  You:                    │
│  Fix the TypeScript      │
│  error in auth.ts        │
│                          │
│  ──────────────────      │
│                          │
│  🤖 NikCLI:              │
│  Found 1 error in        │
│  src/auth.ts:42          │
│                          │
│  📄 [View Diff]          │
│  ✅ [Approve]            │
│                          │
├──────────────────────────┤
│  💬 Message or /command  │
│  🎤  📎  ⚡              │
└──────────────────────────┘
```

**Features:**
- Pull to refresh message history
- Swipe left to show sidebar with agents/tools
- Long press message to copy/share
- Tap code blocks to expand/copy
- Voice input (coming soon)

### Command Palette

Swipe up from bottom or tap ⚡ to open command palette:

```
┌──────────────────────────┐
│  🔍 Search commands...   │
├──────────────────────────┤
│  Recent                  │
│  /agents                 │
│  /plan                   │
│  /git status             │
├──────────────────────────┤
│  Agents                  │
│  /agent universal        │
│  /agent frontend         │
│  /auto                   │
├──────────────────────────┤
│  Files                   │
│  /read                   │
│  /write                  │
│  /search                 │
└──────────────────────────┘
```

### File Diff Viewer

When NikCLI proposes file changes:

```
┌──────────────────────────┐
│  src/auth.ts             │
│  ← Swipe to compare →    │
├──────────────────────────┤
│  - const user = any      │
│  + const user: User      │
│                          │
│  - return null           │
│  + return user           │
├──────────────────────────┤
│  ✅ Approve              │
│  ❌ Reject               │
│  ✏️  Edit                │
└──────────────────────────┘
```

**Gestures:**
- Swipe horizontally: Toggle before/after
- Pinch to zoom: Enlarge code
- Tap file name: View full file
- Swipe up: Approve/Reject actions

### Background Jobs

Run long tasks in background with notifications:

```
┌──────────────────────────┐
│  Background Jobs         │
├──────────────────────────┤
│  🔄 Running (2)          │
│                          │
│  🧪 Full test suite      │
│  Started 2 min ago       │
│  [View Logs]             │
│                          │
│  🏗️ Production build     │
│  Started 5 min ago       │
│  [View Logs]             │
├──────────────────────────┤
│  ✅ Completed (5)        │
│  ❌ Failed (1)           │
└──────────────────────────┘
```

You'll get push notifications when jobs complete!

## 🔧 API Reference

### REST API Endpoints

All endpoints are prefixed with `/api/mobile`

#### Authentication

```bash
# Login (creates anonymous session if no credentials)
POST /auth/login
{
  "deviceInfo": {
    "platform": "ios",
    "model": "iPhone 14",
    "appVersion": "1.0.0"
  }
}

Response:
{
  "success": true,
  "userId": "anonymous_abc123",
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 900
}

# Refresh token
POST /auth/refresh
{
  "refreshToken": "eyJhbGc..."
}

# Logout
POST /auth/logout
{
  "refreshToken": "eyJhbGc..."
}
```

#### Chat & Commands

```bash
# Send message
POST /chat/send
Headers: Authorization: Bearer {accessToken}
{
  "message": "Fix the bug in auth.ts",
  "sessionId": "session_123",
  "workspaceId": "workspace_abc",
  "options": {
    "streaming": false
  }
}

# Execute slash command
POST /chat/command
{
  "command": "/agents",
  "sessionId": "session_123"
}

# Stream responses (Server-Sent Events)
GET /chat/stream?sessionId=session_123
```

#### Sessions

```bash
# Create session
POST /sessions/create
{
  "workspaceId": "workspace_abc"
}

# List sessions
GET /sessions

# Get session messages
GET /sessions/:sessionId/messages

# Close session
DELETE /sessions/:sessionId
```

#### Approvals

```bash
# Get pending approvals
GET /approvals?sessionId=session_123

# Respond to approval
POST /approvals/respond
{
  "id": "approval_xyz",
  "approved": true,
  "reason": "Looks good"
}
```

### WebSocket Protocol

Connect to: `wss://api.nikcli.com/mobile/ws`

**Message Format:**

```typescript
{
  id: string
  type: 'ping' | 'pong' | 'subscribe' | 'message' | 'stream' | 'approval' | 'error'
  sessionId?: string
  payload?: any
  compressed?: boolean  // Gzip compressed if true
  timestamp: string
}
```

**Client → Server:**

```javascript
// Subscribe to session updates
ws.send(JSON.stringify({
  id: 'msg_123',
  type: 'subscribe',
  sessionId: 'session_abc',
  timestamp: new Date().toISOString()
}))

// Respond to approval
ws.send(JSON.stringify({
  id: 'msg_124',
  type: 'approval',
  payload: {
    id: 'approval_xyz',
    approved: true
  },
  timestamp: new Date().toISOString()
}))

// Heartbeat
ws.send(JSON.stringify({
  id: 'msg_125',
  type: 'ping',
  timestamp: new Date().toISOString()
}))
```

**Server → Client:**

```javascript
// Stream chunk
{
  type: 'stream',
  sessionId: 'session_abc',
  payload: {
    chunk: 'Here is the response...',
    metadata: { ... }
  }
}

// Message received
{
  type: 'message',
  sessionId: 'session_abc',
  payload: {
    type: 'assistant',
    content: 'I found the issue...',
    timestamp: '2024-01-15T10:30:00Z'
  }
}

// Approval required
{
  type: 'approval',
  sessionId: 'session_abc',
  payload: {
    id: 'approval_xyz',
    type: 'file_change',
    title: 'Modify auth.ts',
    files: [...]
  }
}
```

## 🔐 Security

### Authentication

- JWT tokens with 15-minute expiry
- Refresh tokens valid for 7 days
- Device fingerprinting for security
- Anonymous sessions supported (no signup required)

### Workspace Bridge

- End-to-end encryption for sensitive operations
- Whitelist of allowed commands
- Path validation (cannot access outside workspace)
- File size limits (10MB default)
- Command timeout protection

### API Security

- CORS protection
- Rate limiting
- Helmet security headers
- Request size limits
- XSS protection

## 🛠️ Development

### Running Locally

```bash
# Start cloud API server
cd nikcli
bun run bg:api

# In another terminal, start bridge
bun run src/cli/bridge/bridge-cli.ts start

# In another terminal, start mobile web app
cd src/mobile-web
bun run dev
```

Access at: `http://localhost:3000`

### Building for Production

```bash
# Build PWA
cd src/mobile-web
bun run build

# Deploy to Vercel/Railway
vercel deploy
```

### Environment Variables

**Cloud API Server:**
```env
# Server
PORT=3000
NODE_ENV=production

# CORS
ALLOWED_ORIGINS=https://mobile.nikcli.com,https://*.vercel.app

# Auth
JWT_SECRET=your-secret-key-here

# Redis (optional)
REDIS_URL=redis://localhost:6379
UPSTASH_REDIS_URL=...
UPSTASH_REDIS_TOKEN=...
```

**Bridge:**
```env
NIKCLI_CLOUD_URL=https://api.nikcli.com
NIKCLI_BRIDGE_TOKEN=eyJhbGc...
NIKCLI_WORKSPACE_ID=workspace_abc123
```

## 📊 Performance

### Optimizations

- **Compression**: Gzip compression for messages > 1KB
- **Caching**: LRU cache with 2-5s TTL
- **Lazy Loading**: Components loaded on demand
- **Virtual Scrolling**: For long message lists
- **Service Worker**: Offline support and caching
- **Code Splitting**: Separate bundles per route

### Metrics

- First Paint: < 1.5s
- Time to Interactive: < 3s
- WebSocket Latency: < 200ms
- Command Feedback: < 100ms

## 🐛 Troubleshooting

### Bridge won't connect

```bash
# Check if cloud API is reachable
curl https://api.nikcli.com/api/mobile/health

# Check bridge status
nikcli bridge status

# Restart bridge with verbose logging
DEBUG=* nikcli bridge start
```

### Mobile app won't load

1. Check if JavaScript is enabled
2. Clear browser cache
3. Check network connection
4. Try adding to home screen
5. Check console for errors (Safari DevTools)

### Commands not executing

1. Check workspace bridge is running
2. Verify workspace ID is correct
3. Check bridge logs for errors
4. Ensure command is allowed (see whitelist)

## 📝 Roadmap

### v1.0 (Current)
- ✅ Core API infrastructure
- ✅ WebSocket streaming
- ✅ Workspace bridge
- ✅ Authentication
- ✅ Basic PWA

### v1.1 (Next)
- [ ] Complete PWA implementation
- [ ] All slash commands supported
- [ ] Push notifications
- [ ] Advanced gestures
- [ ] Voice input/output

### v2.0 (Future)
- [ ] Native iOS/Android apps
- [ ] Collaborative editing
- [ ] Team workspaces
- [ ] Advanced analytics
- [ ] Plugin system

## 🤝 Contributing

We welcome contributions! Areas where help is needed:

- Mobile UI/UX improvements
- Additional slash commands
- Performance optimizations
- Documentation
- Testing on different devices

## 📄 License

MIT License - see LICENSE file for details

---

**Made with ❤️ by the NikCLI team**

For support: [GitHub Issues](https://github.com/nikomatt69/nikcli/issues)
