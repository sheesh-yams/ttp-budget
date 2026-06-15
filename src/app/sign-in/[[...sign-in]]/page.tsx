import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignInPage() {
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
            Welcome back.
          </h1>
          <p style={{ fontSize: '15px', color: '#6B7280', marginBottom: '2rem', lineHeight: 1.6 }}>
            Get back to your creative business suite.
          </p>

          <SignIn appearance={{
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
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" style={{ color: '#5D00A4', fontWeight: 500, textDecoration: 'none' }}>
              Get early access
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
                slatesuite.io/projects
              </div>
            </div>

            {/* App shell */}
            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', height: '270px' }}>
              {/* Sidebar */}
              <div style={{ background: 'rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '12px', gap: '4px' }}>
                <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: '#5D00A4', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="white" strokeWidth="1.4"/><path d="M1 6h12M5 6v6" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </div>
                {[true, false, false, false, false].map((active, i) => (
                  <div key={i} style={{ width: '30px', height: '30px', borderRadius: '6px', background: active ? 'rgba(93,0,164,0.5)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '13px', height: '13px', borderRadius: '2px', border: '1.5px solid', borderColor: active ? 'rgba(200,140,255,0.85)' : 'rgba(255,255,255,0.18)' }} />
                  </div>
                ))}
              </div>

              {/* Main */}
              <div style={{ padding: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Projects</div>
                  <div style={{ background: '#5D00A4', color: '#fff', fontSize: '9px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}>+ New</div>
                </div>
                {[
                  { name: 'Meridian — Campaign S/S 25', client: 'Meridian Creative · Brand', amount: '$82,000', status: 'ACTIVE', sc: '#10b981', sb: 'rgba(16,185,129,0.14)' },
                  { name: 'Ridgeline — Brand Film', client: 'Ridgeline Foods · Music Video', amount: '$47,500', status: 'ACTIVE', sc: '#10b981', sb: 'rgba(16,185,129,0.14)' },
                  { name: 'Strider — Anthem Spot', client: 'Strider Global · Commercial', amount: '$130,000', status: 'LEAD', sc: '#F59E0B', sb: 'rgba(245,158,11,0.14)' },
                ].map((p, i) => (
                  <div key={i} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 10px', marginBottom: '6px', background: 'rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>{p.name}</div>
                        <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>{p.client}</div>
                      </div>
                      <div style={{ fontSize: '8px', fontWeight: 700, padding: '2px 6px', borderRadius: '100px', background: p.sb, color: p.sc, flexShrink: 0, marginLeft: '6px' }}>{p.status}</div>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(195,145,255,0.9)' }}>{p.amount}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Value props */}
          <div style={{ marginTop: '2.25rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', position: 'relative', zIndex: 1, width: '100%', maxWidth: '440px' }}>
            {[
              'Budgets, proposals, and invoices — all connected',
              'Built for film and video production companies',
              'Get paid online, no third-party platform needed',
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
