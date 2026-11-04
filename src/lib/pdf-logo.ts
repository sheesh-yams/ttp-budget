// A workspace logo as a data: URI react-pdf can embed (png/jpeg only), or
// undefined — shared by the PDFs that show the workspace's logo.

/** `maxBytes` defaults to 2 MB (logos); shot reference frames pass a larger cap. */
export async function loadPdfLogo(url: string | null | undefined, maxBytes = 2_000_000): Promise<string | undefined> {
  if (!url || !/^https:\/\//.test(url)) return undefined
  try {
    // No redirects (the stored https URL is the only host we'll call), and a
    // declared size over the cap is refused before reading the body.
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!res.ok || !['image/png', 'image/jpeg'].includes(type)) return undefined
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > maxBytes) return undefined
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}
