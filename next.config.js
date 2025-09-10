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
  
  // Custom webpack config
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add aliases for better imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@web': './src/web',
      '@background-agents': './src/cli/background-agents',
    };
    return config;
  },
  
  // Build configuration
  distDir: '.next',
  productionBrowserSourceMaps: false,
  
  // Ensure Next.js looks in the right place
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
}

module.exports = nextConfig