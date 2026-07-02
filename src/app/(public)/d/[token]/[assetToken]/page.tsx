import { notFound }                from 'next/navigation'
import { headers }                from 'next/headers'
import Link                       from 'next/link'
import { ExternalLink, ChevronLeft } from 'lucide-react'
import { auth }                   from '@clerk/nextjs/server'
import { db }                     from '@/lib/db'
import { checkRateLimit }         from '@/lib/rate-limit'
import { safeHex, lighten, darken } from '@/lib/color'
import { RateLimitedPage }        from '@/components/public/RateLimitedPage'
import { recordDeliverableView }  from '@/server/actions/delivery'

interface Props {
  params: Promise<{ token: string; assetToken: string }>
}

export async function generateMetadata({ params }: Props) {
  const { assetToken } = await params
  const asset = await db.deliverableAsset.findUnique({
    where:  { publicToken: assetToken },
    select: { title: true },
  })
  if (!asset) return { title: 'Not found' }
  return {
    title:   { absolute: `${asset.title} | Deliverable` },
    robots:  { index: false, follow: false, nocache: true },
    referrer:'no-referrer' as const,
  }
}

export default async function PublicAssetPage({ params }: Props) {
  const { token, assetToken } = await params

  const reqHeaders = await headers()
  const ip        = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const userAgent = reqHeaders.get('user-agent') ?? null
  const { success } = await checkRateLimit('publicDoc', ip)
  if (!success) return <RateLimitedPage />

  // Load the asset — verify it belongs to this delivery page token
  const asset = await db.deliverableAsset.findUnique({
    where:  { publicToken: assetToken },
    select: {
      id:          true,
      title:       true,
      description: true,
      type:        true,
      status:      true,
      currentVersion: {
        select: {
          id:           true,
          versionNumber: true,
          url:          true,
          provider:     true,
          renderMode:   true,
          embedHtml:    true,
          thumbnailUrl: true,
          note:         true,
          isVertical:   true,
        },
      },
      deliveryPage: {
        select: {
          publicToken: true,
          status:      true,
          title:       true,
          workspaceId: true,
          project: {
            select: {
              name: true,
              workspace: {
                select: {
                  name:         true,
                  logoUrl:      true,
                  logoDarkUrl:  true,
                  primaryColor: true,
                  accentColor:  true,
                },
              },
            },
          },
        },
      },
    },
  })

  // Must exist, be shared, and belong to a published delivery page with matching token
  if (
    !asset ||
    asset.status !== 'SHARED' ||
    !asset.deliveryPage ||
    asset.deliveryPage.publicToken !== token ||
    asset.deliveryPage.status !== 'PUBLISHED'
  ) {
    notFound()
  }

  // ── Record the view — skip if the viewer is a workspace member (admin preview) ──
  if (asset.currentVersion) {
    const { userId: clerkId } = await auth()
    const isWorkspaceMember = clerkId
      ? !!(await db.user.findFirst({
          where:  { clerkId, workspaceId: asset.deliveryPage.workspaceId },
          select: { id: true },
        }))
      : false

    if (!isWorkspaceMember) {
      await recordDeliverableView(
        asset.id,
        asset.currentVersion.id,
        asset.deliveryPage.workspaceId,
        ip,
        userAgent,
      )
    }
  }

  const ws           = asset.deliveryPage.project.workspace
  const brandPrimary = safeHex(ws.primaryColor)
  const brandAccent  = safeHex(ws.accentColor)
  const brandVars    = {
    '--brand-v':       brandPrimary,
    '--brand-v-tint':  lighten(brandPrimary, 0.92),
    '--brand-mint':    brandAccent,
    '--brand-mint-dk': darken(brandAccent, 0.55),
  } as React.CSSProperties

  const v    = asset.currentVersion
  const back = `/d/${token}`
  // Horizontal IFRAME embeds (Frame.io, Shade, etc.) were sized too small —
  // widen their content column ~40%. Vertical/native/external views are unaffected.
  const isHorizontalIframe = v?.renderMode === 'IFRAME' && !v.isVertical
  const contentMaxWidth = isHorizontalIframe ? 1260 : 900

  return (
    <div style={{ ...brandVars, fontFamily: 'var(--font-sans, system-ui, sans-serif)', background: '#0a0a0a', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: darken(brandPrimary, 0.92), borderBottom: `1px solid rgba(255,255,255,0.08)`, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href={back}
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}
          >
            <ChevronLeft size={15} />
            All deliverables
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 16 }}>|</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
            {asset.title}
          </span>
        </div>
        {ws.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ws.logoDarkUrl ?? ws.logoUrl}
            alt={ws.name}
            style={{ height: 24, width: 'auto', objectFit: 'contain', opacity: 0.7 }}
          />
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 60px' }}>
        <div style={{ width: '100%', maxWidth: contentMaxWidth }}>
          {/* Asset info */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              {asset.title}
            </h1>
            {asset.description && (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 620 }}>
                {asset.description}
              </p>
            )}
            {v?.note && (
              <p style={{ color: brandAccent, fontSize: 12, fontWeight: 600, margin: '8px 0 0' }}>
                Note: {v.note}
              </p>
            )}
          </div>

          {/* ── Viewer ──────────────────────────────────────────────────────── */}
          {!v ? (
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 48, textAlign: 'center' }}>
              <p style={{ color: '#555', fontSize: 14 }}>No version available yet.</p>
            </div>
          ) : v.renderMode === 'IFRAME' ? (
            <IframeViewer embedHtml={v.embedHtml} url={v.url} provider={v.provider} isVertical={v.isVertical} />
          ) : v.renderMode === 'NATIVE_MEDIA' ? (
            <NativeMediaViewer url={v.url} provider={v.provider} thumbnailUrl={v.thumbnailUrl} />
          ) : (
            /* EXTERNAL_ONLY */
            <ExternalLinkView url={v.url} provider={v.provider} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Iframe viewer ────────────────────────────────────────────────────────────

// Providers that have their own review UI — show an "Open in X" escape link
const REVIEW_PROVIDER_NAMES: Record<string, string> = {
  SHADE:    'Shade',
  FRAME_IO: 'Frame.io',
}

function IframeViewer({
  embedHtml, url, provider, isVertical,
}: {
  embedHtml:  string | null
  url:        string
  provider:   string
  isVertical: boolean
}) {
  // Any provider can be vertical — use the tall container when flagged
  const useTallContainer = isVertical

  const wrapStyle: React.CSSProperties = useTallContainer
    ? { width: '100%', borderRadius: 12, overflow: 'hidden', height: '85vh', minHeight: 560, background: '#111', position: 'relative' }
    : { width: '100%', borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9', background: '#111' }

  const content = embedHtml ? (
    <div style={wrapStyle} dangerouslySetInnerHTML={{ __html: embedHtml }} />
  ) : (
    <div style={wrapStyle}>
      <iframe
        src={url}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allowFullScreen
        allow="autoplay; fullscreen; picture-in-picture"
        title="Deliverable"
      />
    </div>
  )

  const providerName = REVIEW_PROVIDER_NAMES[provider]
  if (!providerName) return content

  // Known review-tool providers: show the iframe + an escape-hatch link
  return (
    <>
      {content}
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}
        >
          <ExternalLink size={13} />
          Open in {providerName}
        </a>
      </div>
    </>
  )
}

// ─── Native media viewer ──────────────────────────────────────────────────────

function NativeMediaViewer({ url, provider, thumbnailUrl }: { url: string; provider: string; thumbnailUrl: string | null }) {
  const isImage = provider === 'DIRECT_IMAGE'
  if (isImage) {
    return (
      <div style={{ background: '#111', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }}
        />
      </div>
    )
  }
  return (
    <div style={{ background: '#111', borderRadius: 12, overflow: 'hidden' }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        src={url}
        controls
        poster={thumbnailUrl ?? undefined}
        style={{ width: '100%', display: 'block', maxHeight: '70vh', background: '#000' }}
      />
    </div>
  )
}

// ─── External link view ───────────────────────────────────────────────────────

function ExternalLinkView({ url, provider }: { url: string; provider: string }) {
  const label = PROVIDER_FULL[provider] ?? 'External'
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 16, padding: '40px 32px', textAlign: 'center' }}>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '0 0 24px', maxWidth: 400, display: 'inline-block', wordBreak: 'break-word' }}>
        {url}
      </p>
      <br />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display:         'inline-flex',
          alignItems:      'center',
          gap:             8,
          background:      'var(--brand-v)',
          color:           '#fff',
          textDecoration:  'none',
          borderRadius:    8,
          padding:         '10px 20px',
          fontSize:        14,
          fontWeight:      700,
        }}
      >
        <ExternalLink size={15} />
        Open in {label}
      </a>
    </div>
  )
}

const PROVIDER_FULL: Record<string, string> = {
  GDRIVE_FILE:   'Google Drive',
  GDRIVE_FOLDER: 'Google Drive',
  DROPBOX_FILE:  'Dropbox',
  DROPBOX_FOLDER:'Dropbox',
  GENERIC_LINK:  'External link',
}
