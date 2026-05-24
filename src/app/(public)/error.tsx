'use client'

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0A0612',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#04FFCC', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16 }}>
        Something went wrong
      </p>
      <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        This page couldn't be loaded
      </p>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 32, maxWidth: 400 }}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '12px 24px',
          background: '#04FFCC',
          color: '#003D31',
          border: 'none',
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
