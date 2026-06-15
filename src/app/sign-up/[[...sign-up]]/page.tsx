import { SignUp } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignUpPage() {
  return (
    <>
      <style>{`
        .ss-auth-right { display: flex !important; }
        @media (max-width: 900px) { .ss-auth-right { display: none !important; } }
      `}</style>
      <div style={{
        display: 'flex', minHeight: '100vh',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}>

        {/* ── LEFT PANEL — 50% ───────────────────────────────────── */}
        <div style={{
          width: '50%', flexShrink: 0, background: '#fff',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '3rem 2rem', overflowY: 'auto',
        }}>
          {/* Inner container — constrains all content to clean width */}
          <div style={{ width: '100%', maxWidth: '400px' }}>
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

            <p style={{ marginTop: '1.5rem', fontSize: '13px', color: '#9CA3AF', textAlign: 'center' }}>
              Already have an account?{' '}
              <Link href="/sign-in" style={{ color: '#5D00A4', fontWeight: 500, textDecoration: 'none' }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* ── RIGHT PANEL — 50% ──────────────────────────────────── */}
        <div className="ss-auth-right" style={{
          width: '50%',
          background: 'linear-gradient(155deg, #100024 0%, #2A005A 40%, #4E009A 75%, #6B00C4 100%)',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '3rem', position: 'relative', overflow: 'hidden',
        }}>
          {/* Glow orbs */}
          <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(107,0,196,0.5) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(93,0,164,0.45) 0%, transparent 65%)', pointerEvents: 'none' }} />

          {/* Right-side headline */}
          <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '460px', marginBottom: '1.75rem' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,140,255,0.7)', marginBottom: '0.6rem' }}>Early access</div>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: '0.6rem' }}>
              Your studio OS<br />starts here.
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.65 }}>
              Join production companies replacing spreadsheets and scattered tools with one purpose-built platform.
            </p>
          </div>

          {/* Floating product mockup — real light-mode UI */}
          <div style={{
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '16px', overflow: 'hidden',
            width: '100%', maxWidth: '460px',
            boxShadow: '0 0 0 1px rgba(200,130,255,0.15), 0 32px 80px rgba(0,0,0,0.5), 0 0 100px rgba(93,0,164,0.5)',
            position: 'relative', zIndex: 1,
          }}>
            {/* Browser bar */}
            <div style={{
              background: '#fff', borderBottom: '1px solid #E5E7EB',
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <div style={{ display: 'flex', gap: '5px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FF5F57' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FFBD2E' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#28C840' }} />
              </div>
              <div style={{ flex: 1, background: '#F3F4F6', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace' }}>
                slatesuite.io/budgets
              </div>
            </div>

            {/* App shell */}
            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', height: '260px' }}>
              {/* Sidebar */}
              <div style={{ background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '14px', gap: '6px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#5D00A4', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="white" strokeWidth="1.4"/><path d="M1 6h12M5 6v6" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </div>
                {[false, true, false, false, false].map((active, i) => (
                  <div key={i} style={{ width: '34px', height: '34px', borderRadius: '7px', background: active ? 'rgba(93,0,164,0.35)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '2px', border: '1.5px solid', borderColor: active ? '#C98EE8' : '#374151' }} />
                  </div>
                ))}
              </div>

              {/* Budget panel */}
              <div style={{ background: '#fff', padding: '14px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>Meridian Campaign S/S 25</div>
                    <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '1px' }}>Budget · 5-day shoot</div>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#5D00A4' }}>$73,025</div>
                </div>

                {/* Budget table */}
                <div style={{ borderTop: '1px solid #F3F4F6' }}>
                  {[
                    { cat: 'Above-the-Line' },
                    { label: 'Director',              days: '5d', rate: '$3,500/d', total: '$17,500' },
                    { label: 'Executive Producer',    days: '5d', rate: '$2,000/d', total: '$10,000' },
                    { cat: 'Crew' },
                    { label: 'Director of Photography', days: '5d', rate: '$1,800/d', total: '$9,000' },
                    { label: 'Gaffer',                days: '5d', rate: '$850/d',   total: '$4,250' },
                    { label: 'Camera Package',        days: '5d', rate: '$2,400/d', total: '$12,000' },
                  ].map((row, i) => 'cat' in row ? (
                    <div key={i} style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF', padding: '6px 0 2px' }}>{row.cat}</div>
                  ) : (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 28px 52px 44px', gap: '4px', padding: '4px 0', borderBottom: '1px solid #F9FAFB', alignItems: 'center' }}>
                      <div style={{ fontSize: '10px', color: '#374151', fontWeight: 500 }}>{row.label}</div>
                      <div style={{ fontSize: '9px', color: '#9CA3AF', textAlign: 'center' }}>{row.days}</div>
                      <div style={{ fontSize: '9px', color: '#9CA3AF', textAlign: 'right' }}>{row.rate}</div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: '#111827', textAlign: 'right' }}>{row.total}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '2px solid #E5E7EB' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151' }}>Grand Total</div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#5D00A4' }}>$73,025</div>
                </div>
              </div>
            </div>
          </div>

          {/* Value props */}
          <div style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', position: 'relative', zIndex: 1, width: '100%', maxWidth: '460px' }}>
            {[
              'No credit card required to get started',
              'Proposals, invoices, and call sheets included',
              'Built exclusively for film & video production',
            ].map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(93,0,164,0.5)', border: '1px solid rgba(200,140,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3.5" stroke="rgba(210,160,255,0.9)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </>
  )
}
