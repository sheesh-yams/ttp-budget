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
// package.json is included in the Railway deployment alongside the
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

// ─── Content Security Policy ──────────────────────────────────────────────────
// Shipped in Report-Only mode first: browsers report violations to
// /api/csp-report but nothing is blocked, so we can watch real traffic and
// tighten the allow-list before switching the header to enforcing.
//
// Third parties that must be allow-listed: Clerk (auth), Stripe (payments),
// Helcim (payments iframe), Google Fonts (signature font), Cloudflare R2
// (assets), and the delivery-page embed providers (Vimeo/YouTube/Frame.io/
// Shade/Drive). 'unsafe-inline'/'unsafe-eval' are required by Next.js hydration
// + Clerk today; a later pass can move to nonces to drop them.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.services https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.clerk.services https://clerk-telemetry.com https://*.helcim.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://player.vimeo.com https://www.youtube-nocookie.com https://www.youtube.com https://*.frame.io https://*.shade.inc https://drive.google.com https://*.helcim.com https://secure.helcim.app https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "report-uri /api/csp-report",
].join('; ')

// Safe headers — enforced immediately on every route.
const BASE_SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_DIRECTIVES },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Every route gets the baseline security headers.
        source: '/:path*',
        headers: BASE_SECURITY_HEADERS,
      },
      {
        // Public shareable documents also get no-index + no-store (they carry
        // financial data behind a secret token — never cache or index them).
        // Keys here are additive; they don't collide with the baseline above.
        source: '/:prefix(p|i|cs|d|m)/:rest*',
        headers: [
          { key: 'X-Robots-Tag',  value: 'noindex, nofollow, noarchive, nosnippet' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ]
  },
  // Do NOT externalise @react-pdf/renderer. When it's external, Node's require()
  // loads its internal React separately from webpack's bundled React, creating two
  // React instances whose Symbol.for("react.element") values don't match in the
  // reconciler's context — causing minified React error #31.
  //
  // Instead, let webpack bundle react-pdf.cjs (the patched exports map above
  // ensures webpack picks up the CJS build, not the ESM bundle). Inside the
  // webpack bundle all require('react') calls resolve to the same module instance,
  // so the reconciler and our createElement calls share one React → no error #31.
  //
  // 'canvas' is an optional native dep of react-pdf that must stay external to
  // avoid a webpack build error on platforms where it isn't installed.
  serverExternalPackages: [],
  webpack(config, { isServer }) {
    if (isServer) {
      // canvas is an optional native dep inside react-pdf; not installed on Railway,
      // so it must stay external or webpack will error trying to bundle a missing native module.
      config.externals = [...(config.externals ?? []), 'canvas']

      // yoga-layout ships a .wasm file; enable async WASM so webpack can handle it.
      config.experiments = { ...config.experiments, asyncWebAssembly: true }
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
        hostname: 'assets.slatesuite.io',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
  },
}

module.exports = nextConfig
