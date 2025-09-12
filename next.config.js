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

  // Production optimizations
  compress: true,
  poweredByHeader: false,
  generateEtags: false,
  
  // Image optimization
  images: {
    domains: ['github.com', 'avatars.githubusercontent.com'],
    formats: ['image/webp', 'image/avif'],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },

  // Custom webpack config
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add aliases for better imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@web': './src/web',
      '@background-agents': './src/cli/background-agents',
    };
    
    // Production optimizations
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    
    return config;
  },

  // Build configuration
  distDir: '.next',
  productionBrowserSourceMaps: false,

  // Ensure Next.js looks in the right place
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],

  // API proxy configuration for development
  async rewrites() {
    return [
      {
        source: '/api/v1/web/:path*',
        destination: 'http://localhost:3000/api/v1/web/:path*',
      },
      {
        source: '/api/v1/auth/:path*',
        destination: 'http://localhost:3000/api/v1/auth/:path*',
      },
    ];
  },
}

module.exports = nextConfig