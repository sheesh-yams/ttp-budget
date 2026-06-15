import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'

export default function SignInPage() {
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
          padding: '3rem 4rem', overflowY: 'auto',
        }}>
          <Link href="/" style={{
            fontSize: '15px', fontWeight: 800, letterSpacing: '0.08em',
            color: '#111827', textDecoration: 'none', marginBottom: '3rem', display: 'block',
          }}>
            SLATE<span style={{ color: '#5D00A4' }}>SUITE</span>
          </Link>

          <h1 style={{
            fontSize: '28px', fontWeight: 800, color: '#111827',
            letterSpacing: '-0.02em', marginBottom: '0.4rem', lineHeight: 1.15,
          }}>
            Welcome back.
          </h1>
          <p style={{ fontSize: '15px', color: '#6B7280', marginBottom: '2rem', lineHeight: 1.6 }}>
            Get back to your creative business suite.
          </p>

          <div style={{ maxWidth: '420px', width: '100%' }}>
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
          </div>

          <p style={{ marginTop: '2rem', fontSize: '13px', color: '#9CA3AF', textAlign: 'center', maxWidth: '420px', width: '100%' }}>
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" style={{ color: '#5D00A4', fontWeight: 500, textDecoration: 'none' }}>
              Get early access
            </Link>
          </p>
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
                slatesuite.io/projects
              </div>
            </div>

            {/* App shell */}
            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', height: '300px' }}>
              {/* Sidebar */}
              <div style={{ background: '#111827', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '14px', gap: '6px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#5D00A4', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="white" strokeWidth="1.4"/><path d="M1 6h12M5 6v6" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                </div>
                {[
                  { active: true,  icon: <><rect x="2" y="2" width="4" height="4" rx="0.8"/><rect x="8" y="2" width="4" height="4" rx="0.8"/><rect x="2" y="8" width="4" height="4" rx="0.8"/><rect x="8" y="8" width="4" height="4" rx="0.8"/></> },
                  { active: false, icon: <><path d="M11 11H3a1 1 0 01-1-1V5l3-3h6a1 1 0 011 1v8a1 1 0 01-1 1z"/></> },
                  { active: false, icon: <><rect x="2" y="2" width="10" height="10" rx="1.5"/><path d="M5 7h4M5 5h2M5 9h3" strokeLinecap="round"/></> },
                  { active: false, icon: <><circle cx="7" cy="5.5" r="2.5"/><path d="M2.5 12c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4" strokeLinecap="round"/></> },
                  { active: false, icon: <><path d="M11 3H3a1 1 0 00-1 1v6a1 1 0 001 1h8a1 1 0 001-1V4a1 1 0 00-1-1z"/><path d="M9 3V2a1 1 0 00-1-1H6a1 1 0 00-1 1v1" strokeLinecap="round"/></> },
                ].map((item, i) => (
                  <div key={i} style={{ width: '34px', height: '34px', borderRadius: '7px', background: item.active ? 'rgba(93,0,164,0.35)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke={item.active ? '#C98EE8' : '#6B7280'} strokeWidth="1.4">{item.icon}</svg>
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div style={{ background: '#fff', padding: '14px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>Projects</div>
                  <div style={{ background: '#5D00A4', color: '#fff', fontSize: '10px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px' }}>+ New</div>
                </div>
                {[
                  { name: 'Meridian — Campaign S/S 25', client: 'Meridian Creative · Brand Campaign', amount: '$82,000', status: 'ACTIVE', sc: '#065F46', sb: '#ECFDF5', tags: ['Proposal SIGNED', 'Invoice SENT'] },
                  { name: 'Ridgeline — Brand Film',     client: 'Ridgeline Foods · Music Video',    amount: '$47,500', status: 'ACTIVE', sc: '#065F46', sb: '#ECFDF5', tags: ['Proposal SENT', 'Invoice PAID'] },
                  { name: 'Strider — Anthem Spot',      client: 'Strider Global · Commercial',     amount: '$130,000', status: 'LEAD',  sc: '#92400E', sb: '#FEF3C7', tags: ['Budget draft'] },
                ].map((p, i) => (
                  <div key={i} style={{ border: '1px solid #E5E7EB', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{p.name}</div>
                        <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '1px' }}>{p.client}</div>
                      </div>
                      <div style={{ fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', background: p.sb, color: p.sc, flexShrink: 0, marginLeft: '8px' }}>{p.status}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{p.amount}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {p.tags.map((t, j) => <span key={j} style={{ fontSize: '9px', color: '#6B7280', background: '#F3F4F6', padding: '2px 6px', borderRadius: '4px' }}>{t}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Value props */}
          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', position: 'relative', zIndex: 1, width: '100%', maxWidth: '460px' }}>
            {[
              'Budgets, proposals, and invoices — all connected',
              'Built for film and video production companies',
              'Get paid online, no third-party platform needed',
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
