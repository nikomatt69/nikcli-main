/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Le API sono già servite da Vercel Functions in /api
  // Non serve rewrite perché /api/subscription/* viene gestito automaticamente

  // Configurazione per production build
  output: 'standalone',

  // Transpile Supabase per compatibilità
  transpilePackages: ['@supabase/supabase-js'],
}

module.exports = nextConfig
