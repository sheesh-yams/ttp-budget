import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export default function MobileSignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2.5rem 1.5rem 3rem',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <Link href="/" style={{
          fontSize: '15px', fontWeight: 800, letterSpacing: '0.08em',
          color: '#111827', textDecoration: 'none', marginBottom: '2.5rem', display: 'block',
        }}>
          SLATE<span style={{ color: '#5D00A4' }}>SUITE</span>
        </Link>

        <h1 style={{
          fontSize: '28px', fontWeight: 800, color: '#111827',
          letterSpacing: '-0.02em', marginBottom: '0.4rem', lineHeight: 1.15,
        }}>
          Run your business<br />like a studio.
        </h1>
        <p style={{ fontSize: '15px', color: '#6B7280', marginBottom: '2rem', lineHeight: 1.6 }}>
          Everything you need to pitch, produce, and get paid — in one place.
        </p>

        <SignUp
          routing="hash"
          appearance={{
            variables: {
              colorPrimary: '#5D00A4',
              colorBackground: '#ffffff',
              colorInputBackground: '#F9FAFB',
              colorInputText: '#111827',
              borderRadius: '8px',
              fontFamily: 'Inter, -apple-system, sans-serif',
              fontSize: '14px',
            },
            elements: {
              rootBox: { width: '100%' },
              card: {
                boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.07)',
                border: '1px solid #E5E7EB',
                borderRadius: '14px',
                background: '#fff',
                width: '100%',
              },
              headerTitle:    { display: 'none' },
              headerSubtitle: { display: 'none' },
            },
          }}
        />

        <p style={{ marginTop: '1.5rem', fontSize: '13px', color: '#9CA3AF', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link href="/m/sign-in" style={{ color: '#5D00A4', fontWeight: 500, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
