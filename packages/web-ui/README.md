# NikCLI Web UI

Enterprise-grade web interface for managing NikCLI Background Agents and AI-powered development tasks.

## Features

- 🎯 **Background Jobs Dashboard** - Real-time monitoring and management
- 💬 **Chat Interface** - Claude-style AI interaction with streaming
- 📁 **Workspace Manager** - Project and file management
- ⚙️ **Settings & Configuration** - Model selection, API keys, preferences
- 🔔 **Slack Integration** - Notifications and webhook handling
- 🔐 **Supabase Authentication** - Secure user management
- 🌙 **Dark Mode** - Claude Code inspired design

## Tech Stack

- **Framework**: Next.js 14 (Pages Router)
- **UI Library**: shadcn/ui + Tailwind CSS
- **State Management**: Zustand + React Query
- **Authentication**: Supabase
- **Real-time**: WebSocket + Server-Sent Events
- **Language**: TypeScript

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- NikCLI backend running on port 3001
- Supabase project configured

### Installation

```bash
# Install dependencies
npm install
# or
bun install

# Copy environment variables
cp .env.local.example .env.local

# Edit .env.local with your configuration

# Run development server
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

See `.env.local.example` for required configuration.

## Project Structure

```
/src
├── pages/          # Next.js pages
├── components/     # React components
├── lib/            # Utilities and clients
├── hooks/          # Custom React hooks
├── stores/         # Zustand stores
├── types/          # TypeScript types
└── styles/         # Global styles
```

## Development

```bash
# Development server
npm run dev

# Type checking
npm run type-check

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

This application is designed to be deployed on Vercel alongside the NikCLI backend.

```bash
vercel --prod
```

## License

MIT - See main NikCLI project for details.
