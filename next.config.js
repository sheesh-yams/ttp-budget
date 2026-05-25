const path = require('path')

// trigger deploy
/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer has "type":"module" which causes import() to always
  // load the ESM build (react-pdf.js). That ESM build has a self-contained
  // reconciler that fails on Vercel Lambda. Force webpack to resolve the
  // package to its explicit CJS build so the reconciler uses the same
  // React instance as the rest of the app.
  serverExternalPackages: ['@react-pdf/renderer'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        '@react-pdf/renderer': path.resolve(
          __dirname,
          'node_modules/@react-pdf/renderer/lib/react-pdf.cjs'
        ),
      }
    }
    return config
  },
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
