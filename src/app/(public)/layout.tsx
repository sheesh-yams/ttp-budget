import type { Metadata } from 'next'

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

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
