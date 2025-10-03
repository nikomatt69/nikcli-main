/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true,
  },
  // Configure the app to work with the web directory structure
  pageExtensions: ['tsx', 'ts', 'jsx', js'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': './src/web',
    }
    return config
  },
  // API proxy configuration for development
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: 'http://localhost:3000/v1/:path*', // Proxy to API server
      },
      {
        source: '/health',
        destination: 'http://localhost:3000/health',
      },
    ]
  },
}

module.exports = nextConfig
