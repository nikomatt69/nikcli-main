/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    async rewrites() {
        const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
        return [
            {
                source: '/api/:path*',
                destination: `${api}/v1/:path*`,
            },
        ]
    },
}

module.exports = nextConfig

