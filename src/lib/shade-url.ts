// Shade asset links. Plain module (jest-tested) — the server parses a stored
// version URL itself; the browser never chooses which Shade asset we fetch.

/**
 * The asset (and drive) a Shade canonical URL points at:
 *   /drive/{driveId}/assets/{assetId}   — drive asset link
 *   /publish/{assetId} or /assets/{id}  — public link (no drive)
 */
export function parseShadeUrl(url: string): { assetId: string; driveId: string } | null {
  try {
    const u = new URL(url)
    const driveMatch = u.pathname.match(/\/drive\/([^/]+)\/assets\/([^/?]+)/)
    if (driveMatch) return { driveId: driveMatch[1], assetId: driveMatch[2] }
    const publishMatch = u.pathname.match(/\/(?:publish|assets)\/([^/?]+)/)
    if (publishMatch) return { assetId: publishMatch[1], driveId: '' }
    return null
  } catch {
    return null
  }
}
