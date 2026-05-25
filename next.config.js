const path = require('path')
const fs   = require('fs')

// ---------------------------------------------------------------------------
// Patch @react-pdf/renderer's package.json so the ESM `import` condition
// also resolves to the CJS build (react-pdf.cjs).
//
// Why: the package exports map points `import` → react-pdf.js, which is an
// ESM bundle with its own self-contained React reconciler.  Whenever Node's
// ESM loader handles the package — whether because the route is compiled as
// ESM or because webpack falls back to externalising it — that bundled
// reconciler mismatches the CJS React instance and throws error #31.
//
// react-pdf.cjs uses external require('react'), so it shares one React
// instance with the rest of the app and the error never occurs.
//
// This patch runs at every `next build` (before webpack) and the patched
// package.json is included in Vercel's Lambda deployment alongside the
// package, so it also applies at runtime.
// ---------------------------------------------------------------------------
const reactPdfPkgPath = path.join(
  __dirname,
  'node_modules/@react-pdf/renderer/package.json'
)
try {
  const pkg = JSON.parse(fs.readFileSync(reactPdfPkgPath, 'utf8'))
  const exp = pkg.exports?.['.'] ?? {}
  if (exp.import !== './lib/react-pdf.cjs' || exp.default !== './lib/react-pdf.cjs') {
    exp.import  = './lib/react-pdf.cjs'
    exp.default = './lib/react-pdf.cjs'
    if (pkg.exports) pkg.exports['.'] = exp
    fs.writeFileSync(reactPdfPkgPath, JSON.stringify(pkg, null, 2))
    console.log('» Patched @react-pdf/renderer exports → CJS build')
  }
} catch (e) {
  console.error('» Failed to patch @react-pdf/renderer:', e.message)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep as external so the patched package.json is used at runtime by Node's
  // module loader (both require and import conditions now point to react-pdf.cjs).
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
