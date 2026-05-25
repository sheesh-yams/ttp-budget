// trigger deploy
/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer uses Node.js native APIs that Next.js's bundler
  // can't handle — tell it to require() them at runtime instead of bundling.
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },
}

module.exports = nextConfig
