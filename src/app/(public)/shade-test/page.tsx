/**
 * Temporary test page — compare Shade embed heights.
 * Visit: /shade-test
 * Delete this file when done testing.
 */

const SHADE_URL = 'https://app.shade.inc/publish/3173b2d4-901d-4a50-8a8c-666c577c6763?variant=embed'

const SIZES = [
  { label: 'Shade default (600px)',  height: 600  },
  { label: 'Medium (750px)',         height: 750  },
  { label: 'Large (900px)',          height: 900  },
]

export default function ShadeTestPage() {
  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', padding: '40px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Shade embed height test</h1>
      <p style={{ color: '#666', fontSize: 13, margin: '0 0 48px' }}>
        Scroll down to compare three heights. URL:{' '}
        <code style={{ color: '#888', fontSize: 11 }}>{SHADE_URL}</code>
      </p>

      {SIZES.map(({ label, height }) => (
        <div key={height} style={{ marginBottom: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{label}</span>
            <span style={{ color: '#555', fontSize: 12, fontFamily: 'monospace' }}>height={height}px</span>
          </div>
          <div style={{ width: '100%', maxWidth: 960, borderRadius: 12, overflow: 'hidden', height, background: '#111', border: '1px solid #222' }}>
            <iframe
              src={SHADE_URL}
              width="100%"
              height={height}
              style={{ border: 'none', display: 'block' }}
              allow="autoplay; fullscreen; picture-in-picture"
              title={`Shade embed ${height}px`}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
