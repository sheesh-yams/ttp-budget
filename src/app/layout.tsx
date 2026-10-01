import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'SlateSuite',
    template: '%s | SlateSuite',
  },
  description: 'Production budgeting and invoicing for creative studios.',
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // A new account with no organization gets Clerk's choose-organization
    // step; route it through /join so a pending invitation wins over
    // "create your own org".
    <ClerkProvider taskUrls={{ 'choose-organization': '/join' }}>
      <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <body className="min-h-screen bg-background antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
