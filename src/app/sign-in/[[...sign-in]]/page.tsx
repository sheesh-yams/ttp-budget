import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F9FAFB',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      padding: '2rem',
    }}>
      {/* Logo */}
      <Link href="/" style={{
        fontSize: '16px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        color: '#111827',
        textDecoration: 'none',
        marginBottom: '0.5rem',
        display: 'block',
      }}>
        SLATE<span style={{ color: '#5D00A4' }}>SUITE</span>
      </Link>
      <p style={{
        fontSize: '14px',
        color: '#6B7280',
        marginBottom: '1.75rem',
        textAlign: 'center',
      }}>
        Sign in to your workspace
      </p>

      {/* Clerk form — styled to match SLATESUITE purple */}
      <SignIn
        appearance={{
          variables: {
            colorPrimary: '#5D00A4',
            colorBackground: '#ffffff',
            colorInputBackground: '#ffffff',
            colorInputText: '#111827',
            borderRadius: '10px',
            fontFamily: 'Inter, -apple-system, sans-serif',
            fontSize: '14px',
          },
          elements: {
            card: {
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.07)',
              border: '1px solid #E5E7EB',
              borderRadius: '14px',
            },
            headerTitle: { display: 'none' },
            headerSubtitle: { display: 'none' },
          },
        }}
      />

      <p style={{
        marginTop: '1.5rem',
        fontSize: '13px',
        color: '#9CA3AF',
        textAlign: 'center',
      }}>
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" style={{ color: '#5D00A4', fontWeight: 500, textDecoration: 'none' }}>
          Get early access
        </Link>
      </p>
    </div>
  )
}
