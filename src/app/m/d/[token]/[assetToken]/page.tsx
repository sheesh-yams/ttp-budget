import { notFound }                from 'next/navigation'
import { headers }                from 'next/headers'
import Link                       from 'next/link'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { auth }                   from '@clerk/nextjs/server'
import { db }                     from '@/lib/db'
import { checkRateLimit }         from '@/lib/rate-limit'
import { safeHex, darken }        from '@/lib/color'
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

export default async function MobileAssetPage({ params }: Props) {
  const { token, assetToken } = await params

  const reqHeaders = await headers()
  const ip        = reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const userAgent = reqHeaders.get('user-agent') ?? null
  const { success } = await checkRateLimit('publicDoc', ip)
  if (!success) return <RateLimitedPage />

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
          id:            true,
          versionNumber: true,
          url:           true,
          provider:      true,
          renderMode:    true,
          embedHtml:     true,
          thumbnailUrl:  true,
          note:          true,
          isVertical:    true,
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

  if (
    !asset ||
    asset.status !== 'SHARED' ||
    !asset.deliveryPage ||
    asset.deliveryPage.publicToken !== token ||
    asset.deliveryPage.status !== 'PUBLISHED'
  ) {
    notFound()
  }

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
  const v            = asset.currentVersion
  const back         = `/m/d/${token}`

  const REVIEW_PROVIDER_NAMES: Record<string, string> = { SHADE: 'Shade', FRAME_IO: 'Frame.io' }
  const providerName = v ? REVIEW_PROVIDER_NAMES[v.provider] : null

  return (
    <div style={{
      fontFamily: 'var(--font-sans, -apple-system, system-ui, sans-serif)',
      background: '#0a0a0a',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Force embed wrappers (e.g. Shade's padding-bottom responsive trick) to fill the container */}
      <style>{`
        .m-embed-wrap { position: relative !important; overflow: hidden !important; }
        .m-embed-wrap > div { position: absolute !important; top: 0 !important; left: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
        .m-embed-wrap iframe { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; border: none !important; }
      `}</style>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        background: darken(brandPrimary, 0.92),
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <Link
            href={back}
            style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: 13, fontWeight: 500, flexShrink: 0 }}
          >
            <ChevronLeft size={15} />
            Back
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>|</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.title}
          </span>
        </div>
        {ws.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ws.logoDarkUrl ?? ws.logoUrl}
            alt={ws.name}
            style={{ height: 20, width: 'auto', objectFit: 'contain', opacity: 0.6, flexShrink: 0, marginLeft: 8 }}
          />
        )}
      </div>

      {/* ── Viewer ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!v ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#555', fontSize: 14 }}>No version available yet.</p>
          </div>
        ) : v.renderMode === 'IFRAME' ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Iframe — edge to edge, no padding.
                Vertical: 75vh. Horizontal: max(56.25vw, 45vh) so it never collapses
                to the tiny 16:9 height at narrow widths. */}
            <div
              className="m-embed-wrap"
              style={v.isVertical
                ? { width: '100%', height: '75vh', minHeight: 400, background: '#111' }
                : { width: '100%', height: 'max(56.25vw, 45vh)', minHeight: 260, background: '#111' }
              }
            >
              {v.embedHtml ? (
                <div dangerouslySetInnerHTML={{ __html: v.embedHtml }} />
              ) : (
                <iframe
                  src={v.url}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                  allowFullScreen
                  allow="autoplay; fullscreen; picture-in-picture"
                  title="Deliverable"
                />
              )}
            </div>
            {/* Open in provider link */}
            {providerName && (
              <div style={{ padding: '10px 16px', textAlign: 'right' }}>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}
                >
                  <ExternalLink size={12} />
                  Open in {providerName}
                </a>
              </div>
            )}
          </div>
        ) : v.renderMode === 'NATIVE_MEDIA' ? (
          <div style={{ padding: '16px' }}>
            {v.provider === 'DIRECT_IMAGE' ? (
              <div style={{ background: '#111', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.url} alt="" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 6 }} />
              </div>
            ) : (
              <div style={{ background: '#111', borderRadius: 10, overflow: 'hidden' }}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={v.url}
                  controls
                  poster={v.thumbnailUrl ?? undefined}
                  style={{ width: '100%', display: 'block', maxHeight: '70vh', background: '#000' }}
                />
              </div>
            )}
          </div>
        ) : (
          /* EXTERNAL_ONLY */
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <p style={{ color: '#888', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>
              External link
            </p>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: '0 0 20px', wordBreak: 'break-word' }}>{v.url}</p>
            <a
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: brandPrimary, color: '#fff', textDecoration: 'none',
                borderRadius: 8, padding: '12px 24px', fontSize: 14, fontWeight: 700,
              }}
            >
              <ExternalLink size={14} />
              Open link
            </a>
          </div>
        )}

        {/* ── Asset info ──────────────────────────────────────────────── */}
        {v && (
          <div style={{ padding: '16px 16px 40px' }}>
            <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
              {asset.title}
            </h1>
            {asset.description && (
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 1.55, margin: '0 0 6px', maxWidth: 560 }}>
                {asset.description}
              </p>
            )}
            {v.note && (
              <p style={{ color: brandAccent, fontSize: 12, fontWeight: 600, margin: 0 }}>
                Note: {v.note}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
