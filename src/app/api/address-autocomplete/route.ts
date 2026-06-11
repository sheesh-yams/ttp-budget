import { NextRequest, NextResponse } from 'next/server'

// Nominatim-backed address autocomplete.
// Runs server-side so we can set a proper User-Agent and avoid CORS.
export const runtime = 'nodejs'

interface NominatimResult {
  display_name: string
  address?: {
    // Named places (studios, venues, hospitals) often put their name here
    amenity?:      string
    tourism?:      string
    leisure?:      string
    // Standard address fields
    house_number?: string
    road?:         string
    city?:         string
    town?:         string
    village?:      string
    suburb?:       string
    neighbourhood?: string
    state?:        string
    postcode?:     string
    country_code?: string
  }
}

/**
 * Build a clean street-level address string suitable for geocoding later.
 * e.g. "1011 N Fuller Ave, West Hollywood, CA 90046"
 */
function formatAddress(r: NominatimResult): string {
  const a = r.address ?? {}
  const street = a.house_number && a.road
    ? `${a.house_number} ${a.road}`
    : a.road ?? null
  const city   = a.city ?? a.town ?? a.village ?? a.suburb ?? a.neighbourhood ?? null
  const parts  = [street, city, a.state, a.postcode].filter(Boolean)
  // Need at least street + city + state to be useful
  return parts.length >= 3 ? parts.join(', ') : r.display_name
}

/**
 * Extract the establishment / venue name if Nominatim gave us one.
 *
 * Nominatim puts named places first in `display_name`, separated by commas:
 *   "Smashbox Studios, 1011 N Fuller Ave, West Hollywood, ..."
 *
 * We compare the first segment of `display_name` against what the address
 * would look like — if they differ (and the first segment doesn't look like
 * a street number), it's a venue name.
 */
function getVenueName(r: NominatimResult, addr: string): string | null {
  const first = r.display_name.split(',')[0].trim()
  const addrFirst = addr.split(',')[0].trim()
  // It's a venue name if: non-empty, different from the street segment, and
  // doesn't start with a digit (which would indicate it IS the house number)
  if (first && first !== addrFirst && !/^\d/.test(first)) return first
  return null
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 3) return NextResponse.json([])

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&limit=8&addressdetails=1&countrycodes=us` +
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
      .map(r => {
        const addr  = formatAddress(r)
        const venue = getVenueName(r, addr)
        return {
          // Display: "Smashbox Studios — 1011 N Fuller Ave, West Hollywood, CA 90046"
          // or just the address if no venue name
          display: venue ? `${venue} — ${addr}` : addr,
          // Value going into the field is always the clean street address
          // so geocoding + the location label field both work correctly
          value: addr,
        }
      })
      // Deduplicate by value (address)
      .filter((s, i, arr) => arr.findIndex(x => x.value === s.value) === i)
      // Drop results where we couldn't extract a usable address
      .filter(s => s.value !== '')

    return NextResponse.json(suggestions)
  } catch {
    return NextResponse.json([])
  }
}
