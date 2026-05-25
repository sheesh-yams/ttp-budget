const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do NOT add @react-pdf/renderer to serverExternalPackages.
  // serverExternalPackages causes webpack to skip the package so Node's ESM
  // loader handles it natively — which always loads react-pdf.js (the ESM
  // build with its own bundled reconciler) regardless of the alias below,
  // producing error #31 on Vercel Lambda.
  //
  // Instead, let webpack bundle the package. The alias below then redirects
  // every import of @react-pdf/renderer to react-pdf.cjs, which uses
  // external require('react') and shares one React instance with the app.
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
