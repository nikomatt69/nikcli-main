# NikCLI Background Agents Web Interface

This is the web interface for NikCLI Background Agents, moved outside of the CLI structure for better separation of concerns and memory optimization.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Development

The web interface runs on port 3001 and connects to the Background Agents API server (port 3000).

## Architecture

- **Framework**: Next.js 14
- **Styling**: Tailwind CSS
- **Editor**: Monaco Editor
- **State Management**: React Context
- **API Client**: Custom API client for Background Agents

## API Integration

The web interface communicates with the Background Agents API server through:
- REST API endpoints (`/api/*`)
- WebSocket connections for real-time updates
- GitHub integration for repository management

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

## Deployment

This web application can be deployed independently of the CLI:
- Vercel (recommended)
- Netlify
- Any Node.js hosting platform