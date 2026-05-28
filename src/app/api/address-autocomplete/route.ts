import { NextRequest, NextResponse } from 'next/server'

// Nominatim-backed address autocomplete.
// Runs server-side so we can set a proper User-Agent and avoid CORS.
export const runtime = 'nodejs'

interface NominatimResult {
  display_name: string
  address?: {
    house_number?: string
    road?: string
    city?: string
    town?: string
    village?: string
    state?: string
    postcode?: string
    country_code?: string
  }
}

/** Format a Nominatim result into a clean US address string. */
function formatAddress(r: NominatimResult): string {
  const a = r.address ?? {}
  const parts = [
    a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road,
    a.city ?? a.town ?? a.village,
    a.state,
    a.postcode,
  ].filter(Boolean)
  return parts.length >= 3 ? parts.join(', ') : r.display_name
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 4) return NextResponse.json([])

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&limit=6&addressdetails=1&countrycodes=us` +
      `&q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent': 'TTP-Budget/1.0 (budget.thethirdplace.co)',
          'Accept-Language': 'en',
        },
        // Cache for 60s — same query won't hammer Nominatim
        next: { revalidate: 60 },
      }
    )

    if (!res.ok) return NextResponse.json([])
    const data: NominatimResult[] = await res.json()

    const suggestions = data
      .filter(r => r.address?.country_code === 'us')
      .map(r => ({
        display: formatAddress(r),
        value:   formatAddress(r),
      }))
      // Deduplicate by display string
      .filter((s, i, arr) => arr.findIndex(x => x.display === s.display) === i)

    return NextResponse.json(suggestions)
  } catch {
    return NextResponse.json([])
  }
}
