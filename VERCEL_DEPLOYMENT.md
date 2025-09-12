# Vercel Deployment Guide

## 🚀 Quick Deploy

This project is configured for automatic deployment on Vercel.

### Build Configuration

- **Build Command**: `npm run build:vercel`
- **Output Directory**: `.next`
- **Framework**: Next.js 14

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
5. Check Vercel build logs for specific errors

#### Common Issues Fixed:
- **"Cannot find module 'autoprefixer'"**: Moved `autoprefixer` from devDependencies to dependencies
- **PostCSS errors**: Ensure `postcss` and `tailwindcss` are in main dependencies
- **Missing build script**: Added `build:vercel` script to package.json

### Performance

- **Bundle Size**: ~219kB first load JS
- **Static Pages**: 7 static pages pre-rendered
- **Dynamic Pages**: 1 dynamic page (jobs/[id])
- **Optimizations**: Code splitting, compression, security headers