# Vercel Deployment Guide

## 🚀 Quick Deploy

This project is configured for automatic deployment on Vercel.

### Build Configuration

- **Build Command**: `npm run build:vercel`
- **Output Directory**: `.next`
- **Framework**: Next.js 14
- **Runtime**: Node.js 18.x (automatic)

### Environment Variables

The following environment variables should be configured in Vercel:

```bash
NODE_ENV=production
```

### Deployment Steps

1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Configure Build Settings**: 
   - Build Command: `npm run build:vercel`
   - Output Directory: `.next`
   - Install Command: `npm install --legacy-peer-deps`
3. **Set Environment Variables**: Add `NODE_ENV=production`
4. **Deploy**: Vercel will automatically build and deploy

### Build Process

The build process:
1. Installs dependencies with `npm install --legacy-peer-deps`
2. Runs `npm run build:vercel` (which executes `next build`)
3. Generates optimized production build
4. Deploys to Vercel's CDN

### Troubleshooting

If deployment fails:
1. Check that `build:vercel` script exists in package.json
2. Verify Next.js configuration in `next.config.js`
3. Ensure all dependencies are properly listed
4. **CSS Dependencies**: Make sure `autoprefixer`, `postcss`, and `tailwindcss` are in main dependencies (not devDependencies)
5. **TypeScript Dependencies**: Ensure `typescript`, `@types/react`, and `@types/react-dom` are in main dependencies
6. Check Vercel build logs for specific errors

#### Common Issues Fixed:
- **"Cannot find module 'autoprefixer'"**: Moved `autoprefixer` from devDependencies to dependencies
- **PostCSS errors**: Ensure `postcss` and `tailwindcss` are in main dependencies
- **Missing build script**: Added `build:vercel` script to package.json
- **TypeScript errors**: Moved `typescript`, `@types/react`, and `@types/react-dom` from devDependencies to dependencies

### Backend Integration

The web interface uses API proxy routes that forward requests to the actual NikCLI backend server:
- **API Proxy Routes**: All `/api/v1/*` requests are proxied to the backend server
- **GitHub OAuth**: Redirects to backend GitHub authentication
- **WebSocket**: Direct connection to backend WebSocket server
- **Background Agents**: Live job monitoring and management
- **Project Snapshots**: Real snapshot creation and management

**Configuration**: Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` environment variables to point to your NikCLI backend server.

### API Proxy Routes

The interface includes robust proxy API routes that forward requests to your backend:
- **Authentication**: `/api/v1/web/auth/github` → Backend OAuth
- **Configuration**: `/api/v1/web/config` → Backend config management
- **Repositories**: `/api/v1/web/repositories` → Backend GitHub repos
- **Jobs**: `/api/v1/web/jobs` → Backend job management
- **Snapshots**: `/api/v1/web/snapshots` → Backend snapshot management
- **Health Check**: `/api/v1/health` → Backend health status

**Enhanced Error Handling:**
- ✅ **JSON Validation**: Checks for valid JSON responses
- ✅ **Content-Type Validation**: Ensures backend returns JSON
- ✅ **Connection Error Handling**: Graceful handling of backend unavailability
- ✅ **Detailed Error Messages**: Helpful error messages for troubleshooting

### Environment Variables

**REQUIRED**: Configure these environment variables in Vercel:

```bash
# Backend API URL (REQUIRED)
NEXT_PUBLIC_API_URL=https://your-nikcli-backend.com/api/v1

# WebSocket URL (REQUIRED)
NEXT_PUBLIC_WS_URL=wss://your-nikcli-backend.com/ws

# GitHub OAuth (optional)
NEXT_PUBLIC_GITHUB_CLIENT_ID=your_github_client_id
```

**Important**: Without these environment variables, the interface will show configuration errors and cannot connect to your backend server.

### Performance

- **Bundle Size**: ~219kB first load JS
- **Static Pages**: 7 static pages pre-rendered
- **Dynamic Pages**: 1 dynamic page (jobs/[id])
- **Backend Integration**: Real-time connection to NikCLI backend
- **Optimizations**: Code splitting, compression, security headers