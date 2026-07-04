// Jest mock for the 'server-only' package.
// In production Next.js builds, 'server-only' throws when imported in client
// bundles. In Node.js test environments it is safe to import — this mock
// replaces it with a no-op so Jest doesn't error.
module.exports = {}
