// Shown on the client's proposal / sign page in place of signing once the
// valid-through date has passed (the approve route refuses with 410 then).
// The studio reopens it from the app with a new date.

const V      = 'var(--brand-v, #5D00A4)'
const BODY   = '#2C2C2A'
const BORDER = '#E8E0F0'
const MUTED  = '#888780'

export function ExpiredProposalNotice({ title, validThrough, workspaceName, contactEmail }: {
  title: string
  validThrough: string | null
  workspaceName: string
  contactEmail: string | null
}) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${BORDER}`, borderRadius: 10, padding: '40px 36px', textAlign: 'center' }} role="status">
      <p style={{ fontSize: 20, fontWeight: 700, color: BODY, margin: '0 0 10px' }}>This proposal has expired</p>
      <p style={{ fontSize: 14, color: MUTED, margin: '0 0 24px', lineHeight: 1.6 }}>
        The valid-through date{validThrough ? <> (<strong style={{ color: BODY }}>{validThrough}</strong>)</> : null} has passed, so it can&apos;t be signed.
        Please contact {workspaceName} for an updated proposal.
      </p>
      {contactEmail && (
        <a
          href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Updated proposal: ${title}`)}`}
          style={{
            display: 'block', width: '100%', padding: '13px', boxSizing: 'border-box',
            color: V, fontSize: 14, fontWeight: 600, textDecoration: 'none',
            border: `1.5px solid ${V}`, borderRadius: 6, textAlign: 'center',
          }}
        >
          Email {contactEmail}
        </a>
      )}
    </div>
  )
}
