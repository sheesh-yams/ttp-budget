import type { Metadata } from 'next'
import { ForceLight } from '@/components/theme/ForceLight'

// Applied to all public routes: /p/[token], /i/[token], /cs/[token]
export const metadata: Metadata = {
  robots: {
    index:   false,
    follow:  false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  referrer: 'no-referrer',
}

// Client-facing pages are always light, whatever the producer's theme.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <><ForceLight />{children}</>
}
