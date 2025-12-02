# NikCLI Mobile - Progressive Web App

Mobile-first Progressive Web App for NikCLI, enabling full development capabilities from mobile devices.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun 1.3+
- NikCLI backend API running

### Installation

```bash
# Install dependencies
cd src/mobile-web
bun install  # or npm install

# Start development server
bun run dev  # or npm run dev

# Open browser
open http://localhost:3001
```

### Building for Production

```bash
# Build the app
bun run build

# Start production server
bun run start
```

## 📁 Project Structure

```
src/mobile-web/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page
│   ├── globals.css          # Global styles
│   ├── workspace/           # Workspace pages
│   ├── agents/              # Agents pages
│   └── settings/            # Settings pages
├── components/              # React components
│   ├── chat/               # Chat components
│   ├── workspace/          # Workspace components
│   ├── agents/             # Agent components
│   └── ui/                 # UI primitives
├── lib/                    # Utilities
│   ├── api-client.ts       # HTTP API client
│   ├── websocket-client.ts # WebSocket client
│   ├── store.ts            # Global state (Zustand)
│   └── utils.ts            # Utility functions
└── public/                 # Static assets
    ├── manifest.json       # PWA manifest
    ├── sw.js              # Service Worker
    └── icons/             # App icons
```

## 🔧 Configuration

### Environment Variables

Create `.env.local`:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# Optional: Analytics, etc.
```

### PWA Configuration

Edit `public/manifest.json` to customize:
- App name and description
- Theme colors
- Icons
- Start URL
- Display mode

## 🎨 Styling

- **Tailwind CSS** for styling
- **CSS Variables** for theming
- **Dark mode** by default
- **Mobile-first** responsive design

### Theme Customization

Edit `app/globals.css` to customize colors and styles:

```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --background: 0 0% 100%;
  /* ...more variables */
}
```

## 📱 Features Implemented

### Phase 2 (Current) ✅

- [x] Next.js 15 setup with App Router
- [x] PWA configuration (manifest + service worker)
- [x] API client with JWT authentication
- [x] WebSocket client with auto-reconnection
- [x] Global state management (Zustand)
- [x] Root layout with iOS/Android support
- [x] Basic homepage
- [x] Mobile-optimized styles
- [x] Offline support (service worker)

### Phase 2 (TODO) 🔄

- [ ] Chat interface with streaming
- [ ] Command palette
- [ ] File diff viewer
- [ ] Approval panel
- [ ] Workspace connection UI
- [ ] Agent selector
- [ ] Settings page
- [ ] Push notifications

## 🧪 Testing

```bash
# Run type checking
bun run type-check

# Run linting
bun run lint
```

### Testing on Mobile

1. **iOS (Safari)**:
   - Open in Safari
   - Tap Share → "Add to Home Screen"
   - Open from home screen

2. **Android (Chrome)**:
   - Open in Chrome
   - Tap Menu (⋮) → "Add to Home screen"
   - Open from home screen

3. **Desktop (for testing)**:
   - Open DevTools (F12)
   - Toggle device toolbar (Ctrl/Cmd + Shift + M)
   - Select mobile device

## 📚 API Client Usage

```typescript
import { apiClient } from '@/lib/api-client'

// Login
const tokens = await apiClient.login({ platform: 'ios' })

// Send message
const response = await apiClient.sendMessage(
  'Fix the bug in auth.ts',
  sessionId,
  { workspaceId: 'workspace_abc123' }
)

// Execute command
await apiClient.executeCommand('/agents', sessionId)
```

## 🔌 WebSocket Usage

```typescript
import { wsClient } from '@/lib/websocket-client'

// Connect
await wsClient.connect()

// Subscribe to session
await wsClient.subscribe(sessionId)

// Listen for messages
wsClient.on('message', (message, sessionId) => {
  console.log('New message:', message)
})

// Listen for stream chunks
wsClient.on('stream', (chunk, sessionId) => {
  console.log('Stream chunk:', chunk)
})
```

## 🗂️ State Management

```typescript
import { useStore } from '@/lib/store'

function MyComponent() {
  const { currentSessionId, addMessage } = useStore()

  const handleSend = () => {
    addMessage(currentSessionId, {
      id: 'msg_123',
      type: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString(),
    })
  }
}
```

## 🚀 Deployment

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd src/mobile-web
vercel
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

### Environment Variables (Production)

Set these in your hosting platform:

```env
NEXT_PUBLIC_API_URL=https://api.nikcli.com
NEXT_PUBLIC_WS_URL=wss://api.nikcli.com
```

## 🐛 Troubleshooting

### Service Worker Not Registering

- Check browser console for errors
- Ensure running on HTTPS or localhost
- Clear browser cache and reload

### WebSocket Connection Failed

- Check `NEXT_PUBLIC_WS_URL` is correct
- Ensure API server is running
- Check CORS settings on API

### Authentication Issues

- Check API URL is correct
- Verify JWT secret matches backend
- Clear localStorage and try again

### Styles Not Loading

- Check Tailwind is configured correctly
- Run `npm run build` to rebuild
- Clear Next.js cache: `rm -rf .next`

## 📖 Documentation

- [NikCLI Mobile Docs](../../docs/mobile/README.md)
- [Getting Started Guide](../../docs/mobile/GETTING_STARTED.md)
- [API Reference](../../docs/mobile/README.md#api-reference)

## 🤝 Contributing

To add new components:

1. Create component in `components/`
2. Add styles in component or `globals.css`
3. Export from component directory
4. Import in pages

## 📝 License

MIT License - see LICENSE file

---

**Status**: Phase 2 - MVP Frontend Infrastructure ✅

**Next**: Implement chat interface and command palette 🚀
