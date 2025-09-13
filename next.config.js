/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configure source directory for Next.js to find app directory
  basePath: '',

  // TypeScript configuration
  typescript: {
    // Allow production builds to successfully complete even if there are type errors
    ignoreBuildErrors: true,
  },

  // ESLint configuration
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },

  // Experimental features for Vercel deployment
  experimental: {
    // Enable serverless target for Vercel
    serverComponentsExternalPackages: ['@prisma/client'],
  },

  // Custom webpack config
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add aliases for better imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@web': './src/web',
      '@background-agents': './src/cli/background-agents',
      '@api': './app/api',
      '@lib': './lib',
    }

    // Handle node modules in serverless environment
    if (isServer) {
      config.externals.push({
        'utf-8-validate': 'commonjs utf-8-validate',
        bufferutil: 'commonjs bufferutil',
        canvas: 'commonjs canvas',
        keytar: 'commonjs keytar',
      })
    }

    return config
  },

  // Build configuration
  distDir: '.next',
  productionBrowserSourceMaps: false,

  // Ensure Next.js looks in the right place
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],

  // Environment configuration
  env: {
    CUSTOM_KEY: 'my-value',
  },

  // Headers configuration
  async headers() {
    return [
      {
        source: '/api/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
        ],
      },
    ]
  },

  // API proxy configuration - Development only
  async rewrites() {
    const rewrites = []

    // Development-only proxy for background agents API
    if (process.env.NODE_ENV === 'development') {
      rewrites.push({
        source: '/api/v1/external/:path*',
        destination: 'http://localhost:3000/api/v1/:path*',
      })
    }

    // Production: API routes handled by /api/index.ts automatically
    // No rewrites needed - Vercel handles /api/* routing natively

    return rewrites
  },

  // Output configuration for Vercel - removed standalone for microfrontends compatibility

  // Image optimization
  images: {
    unoptimized: true, // Disable for Vercel KV compatibility
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Performance optimizations
  poweredByHeader: false,
  generateEtags: false,
  compress: true,

  // Bundle analyzer (only in analyze mode)
  ...(process.env.ANALYZE === 'true' && {
    experimental: {
      ...nextConfig.experimental,
      bundlePagesRouterDependencies: true,
    },
  }),
}

module.exports = nextConfig
