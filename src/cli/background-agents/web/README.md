# NikCLI Background Agents Web Interface

Modern web interface for managing and monitoring NikCLI background agents.

## Features

- **Real-time Updates**: WebSocket integration for live job status and logs
- **Job Management**: Create, monitor, and interact with background agents
- **Floating Chat**: Send follow-up messages to running agents
- **Visual Job Flow**: Track job progress through different stages
- **GitHub Integration**: Connect with GitHub repositories
- **Responsive Design**: Modern UI with dark mode support

## Getting Started

### Prerequisites

- Node.js 18+ or compatible runtime
- Running Background Agents API Server (port 3000)

### Installation

```bash
# Install dependencies
npm install

# or
yarn install
```

### Development

```bash
# Start the development server
npm run dev

# or
yarn dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Architecture

### Layout

```
┌─────────────┬──────────────────┬─────────────┐
│   Job       │   Main Content   │   Job Flow  │
│  Dashboard  │   (Center)       │  (Right)    │
│   (Left)    │                  │             │
└─────────────┴──────────────────┴─────────────┘
                  Floating Chat
                  (Bottom Left)
```

### Components

- **JobDashboard**: List and filter background jobs
- **JobFlow**: Visual representation of job progress with live logs
- **FloatingChat**: Send follow-up messages to agents
- **NewAgentModal**: Create new background agents
- **DiffViewer**: (Planned) View file changes

### API Integration

The web interface connects to the Background Agents API Server:

- REST API: `http://localhost:3000/v1/*`
- WebSocket: `ws://localhost:3000/ws`

## Configuration

### Environment Variables

Create a `.env.local` file:

```env
# API Server URL (if different from localhost:3000)
NEXT_PUBLIC_API_URL=http://localhost:3000

# WebSocket URL (if different)
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws
```

## Development

### Project Structure

```
web/
├── app/
│   ├── components/     # React components
│   ├── hooks/          # Custom hooks
│   ├── api/            # API routes
│   ├── layout.tsx      # Root layout
│   ├── page.tsx        # Main page
│   └── globals.css     # Global styles
├── lib/                # Utility functions
├── public/             # Static assets
└── package.json        # Dependencies
```

### Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Editor**: Monaco Editor (for diffs)
- **GitHub API**: @octokit/rest

## Contributing

1. Follow the existing code style
2. Write meaningful commit messages
3. Test thoroughly before submitting PRs
4. Update documentation for new features

## License

Part of the NikCLI project.
