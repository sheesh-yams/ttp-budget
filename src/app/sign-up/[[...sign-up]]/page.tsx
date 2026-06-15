import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignUpPage() {
  return (
    <>
      <style>{`
        .ss-auth-right { display: flex !important; }
        @media (max-width: 768px) { .ss-auth-right { display: none !important; } }
      `}</style>
      <div style={{
        display: 'flex', minHeight: '100vh',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────── */}
        <div style={{
          width: '480px', flexShrink: 0, background: '#fff',
          display: 'flex', flexDirection: 'column',
          padding: '2.5rem 3rem', overflowY: 'auto',
        }}>
          <Link href="/" style={{
            fontSize: '15px', fontWeight: 800, letterSpacing: '0.08em',
            color: '#111827', textDecoration: 'none', marginBottom: '3rem', display: 'block',
          }}>
            SLATE<span style={{ color: '#5D00A4' }}>SUITE</span>
          </Link>

          <h1 style={{
            fontSize: '26px', fontWeight: 800, color: '#111827',
            letterSpacing: '-0.02em', marginBottom: '0.4rem', lineHeight: 1.15,
          }}>
            Run your business<br />like a studio.
          </h1>
          <p style={{ fontSize: '15px', color: '#6B7280', marginBottom: '2rem', lineHeight: 1.6 }}>
            Everything you need to pitch, produce, and get paid — in one place.
          </p>

          <SignUp appearance={{
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
                boxShadow: 'none', border: 'none',
                borderRadius: '0', padding: '0',
                background: 'transparent', width: '100%',
              },
              headerTitle: { display: 'none' },
              headerSubtitle: { display: 'none' },
            },
          }} />

          <p style={{ marginTop: '2rem', fontSize: '13px', color: '#9CA3AF', textAlign: 'center' }}>
            Already have an account?{' '}
            <Link href="/sign-in" style={{ color: '#5D00A4', fontWeight: 500, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────── */}
        <div className="ss-auth-right" style={{
          flex: 1,
          background: 'linear-gradient(155deg, #100024 0%, #2A005A 40%, #4E009A 75%, #6B00C4 100%)',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '3rem', position: 'relative', overflow: 'hidden',
        }}>
          {/* Glow orbs */}
          <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(107,0,196,0.5) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(93,0,164,0.45) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '40%', left: '30%', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(124,58,237,0.2) 0%, transparent 65%)', pointerEvents: 'none' }} />

          {/* Headline copy on the right */}
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '440px', marginBottom: '2rem' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,140,255,0.7)', marginBottom: '0.75rem' }}>
              Early access
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '0.75rem' }}>
              Your studio OS<br />starts here.
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.65 }}>
              Join production companies that are replacing spreadsheets and scattered tools with one purpose-built platform.
            </p>
          </div>

          {/* Floating mockup */}
          <div style={{
            background: 'rgba(255,255,255,0.055)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px', overflow: 'hidden',
            width: '100%', maxWidth: '440px',
            boxShadow: '0 0 0 1px rgba(200,130,255,0.08), 0 32px 80px rgba(0,0,0,0.45), 0 0 140px rgba(93,0,164,0.42)',
            position: 'relative', zIndex: 1,
          }}>
            {/* Browser bar */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)',
              padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <div style={{ display: 'flex', gap: '5px' }}>
                {[0,1,2].map(i => <div key={i} style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(255,255,255,0.13)' }} />)}
              </div>
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '5px', padding: '3px 10px', fontSize: '10px', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace' }}>
                slatesuite.io/budgets
              </div>
            </div>

            {/* Budget mockup */}
            <div style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Meridian Campaign S/S 25</div>
                  <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>Budget · 5-day shoot</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(195,145,255,0.95)' }}>$73,025</div>
              </div>

              {/* Budget rows */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '8px' }}>
                {[
                  { label: 'Above-the-Line', isHeader: true },
                  { label: 'Director', days: '5d', rate: '$3,500/d', total: '$17,500' },
                  { label: 'Executive Producer', days: '5d', rate: '$2,000/d', total: '$10,000' },
                  { label: 'Crew', isHeader: true },
                  { label: 'Director of Photography', days: '5d', rate: '$1,800/d', total: '$9,000' },
                  { label: 'Gaffer', days: '5d', rate: '$850/d', total: '$4,250' },
                  { label: 'Camera Package', days: '5d', rate: '$2,400/d', total: '$12,000' },
                ].map((row, i) => row.isHeader ? (
                  <div key={i} style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(200,140,255,0.5)', padding: '6px 0 2px' }}>{row.label}</div>
                ) : (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)' }}>{row.label}</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{row.days}</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>{row.rate}</div>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', textAlign: 'right' }}>{row.total}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Grand Total</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'rgba(200,145,255,1)' }}>$73,025</div>
              </div>
            </div>
          </div>

          {/* Value props */}
          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', position: 'relative', zIndex: 1, width: '100%', maxWidth: '440px' }}>
            {[
              'No credit card required to get started',
              'Proposals, invoices, and call sheets included',
              'Built exclusively for film & video production',
            ].map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(93,0,164,0.5)', border: '1px solid rgba(200,140,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3.5" stroke="rgba(210,160,255,0.9)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.42)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
