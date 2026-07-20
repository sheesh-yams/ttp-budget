import { notFound }        from 'next/navigation'
import { headers }         from 'next/headers'
import Link                from 'next/link'
import { db }              from '@/lib/db'
import { checkRateLimit }  from '@/lib/rate-limit'
import { trustedClientIp } from '@/lib/client-ip'
import { safeHex, lighten, darken } from '@/lib/color'
import { RateLimitedPage } from '@/components/public/RateLimitedPage'
import { ShadeThumbImg }   from '@/components/delivery/ShadeThumbImg'
import { renderSmartText } from '@/lib/smart-text'
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_HEX, type DeliverableReviewStatus } from '@/lib/deliverable-status'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props) {
  const { token } = await params
  const page = await db.deliveryPage.findUnique({
    where:  { publicToken: token },
    select: { title: true, project: { select: { name: true } } },
  })
  if (!page) return { title: 'Delivery page not found' }
  return {
    title:   { absolute: `${page.title ?? page.project.name} | Deliverables` },
    robots:  { index: false, follow: false, nocache: true },
    referrer:'no-referrer' as const,
  }
}

export default async function MobileDeliveryPage({ params }: Props) {
  const { token } = await params

  const reqHeaders = await headers()
  const ip = trustedClientIp(name => reqHeaders.get(name))
  const { success } = await checkRateLimit('publicDoc', ip)
  if (!success) return <RateLimitedPage />

  const page = await db.deliveryPage.findUnique({
    where:  { publicToken: token },
    select: {
      id:            true,
      publicToken:   true,
      status:        true,
      title:         true,
      subtitle:      true,
      customMessage: true,
      overview:      true,
      coverImageUrl: true,
      project: {
        select: {
          name:   true,
          client: { select: { name: true, logoUrl: true } },
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
      sections: {
        orderBy: { orderIndex: 'asc' },
        select: {
          id:          true,
          title:       true,
          description: true,
          deliverables: {
            where:   { status: 'SHARED' },
            orderBy: { orderIndex: 'asc' },
            select: {
              id:          true,
              publicToken: true,
              title:       true,
              description: true,
              type:        true,
              reviewStatus: true,
              currentVersion: {
                select: {
                  url:               true,
                  provider:          true,
                  thumbnailUrl:      true,
                  firstClientViewAt: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!page || page.status !== 'PUBLISHED') notFound()

  const ws           = page.project.workspace
  const brandPrimary = safeHex(ws.primaryColor)
  const brandAccent  = safeHex(ws.accentColor)
  const pageTitle    = page.title ?? page.project.name
  const visibleSections = page.sections.filter(s => s.deliverables.length > 0)

  return (
    <div style={{
      fontFamily: 'var(--font-sans, -apple-system, system-ui, sans-serif)',
      color: '#1a1a1a',
      background: '#f8f8f8',
      minHeight: '100vh',
    }}>

      {/* ── Compact header ──────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(160deg, ${darken(brandPrimary, 0.85)} 0%, ${darken(brandPrimary, 0.7)} 100%)`,
        padding: '20px 16px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {page.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.coverImageUrl}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.15, pointerEvents: 'none' }}
          />
        )}
        <div style={{ position: 'relative' }}>
          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {ws.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ws.logoDarkUrl ?? ws.logoUrl} alt={ws.name} style={{ height: 22, width: 'auto', objectFit: 'contain' }} />
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{ws.name}</span>
            )}
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>×</span>
            {page.project.client.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.project.client.logoUrl} alt={page.project.client.name} style={{ height: 20, width: 'auto', maxWidth: 120, objectFit: 'contain' }} />
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{page.project.client.name}</span>
            )}
          </div>

          <p style={{ color: brandAccent, fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Deliverables
          </p>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em', margin: '0 0 6px' }}>
            {pageTitle}
          </h1>
          {page.subtitle && (
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 4px' }}>{page.subtitle}</p>
          )}
          {page.customMessage && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{page.customMessage}</p>
          )}
        </div>
      </div>

      {/* ── Delivery Notes ──────────────────────────────────────────────── */}
      {page.overview && (
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ borderLeft: `3px solid ${brandPrimary}`, paddingLeft: 12, background: '#fff', borderRadius: '0 8px 8px 0', padding: '12px 14px', borderTop: '1px solid #eee', borderRight: '1px solid #eee', borderBottom: '1px solid #eee' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#888', margin: '0 0 6px' }}>
              Delivery Notes
            </p>
            <div
              style={{ fontSize: 13, color: '#333', lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: renderSmartText(page.overview) }}
            />
          </div>
        </div>
      )}

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 16px 60px' }}>
        {visibleSections.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', paddingTop: 32 }}>
            No deliverables have been shared yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {visibleSections.map(section => (
              <div key={section.id}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#888', margin: '0 0 2px' }}>
                  Section
                </p>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                  {section.title}
                </h2>
                {section.description && (
                  <div
                    style={{ fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 1.55 }}
                    dangerouslySetInnerHTML={{ __html: renderSmartText(section.description) }}
                  />
                )}
                {!section.description && <div style={{ marginBottom: 12 }} />}

                {/* Single-column asset list on mobile */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {section.deliverables.map(asset => (
                    <Link
                      key={asset.id}
                      href={`/m/d/${token}/${asset.publicToken}`}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                    >
                      <MobileAssetCard asset={asset} brandPrimary={brandPrimary} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid #e5e5e5' }}>
          <p style={{ fontSize: 11, color: '#bbb', margin: 0, textAlign: 'center' }}>
            Delivered by {ws.name}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Mobile asset card ────────────────────────────────────────────────────────

const PROVIDER_SHORT: Record<string, string> = {
  FRAME_IO:      'Frame.io',
  SHADE:         'Shade',
  GDRIVE_FILE:   'Google Drive',
  GDRIVE_FOLDER: 'Google Drive',
  DROPBOX_FILE:  'Dropbox',
  DROPBOX_FOLDER:'Dropbox',
  DIRECT_IMAGE:  'Image',
  DIRECT_VIDEO:  'Video',
  YOUTUBE:       'YouTube',
  VIMEO:         'Vimeo',
  GENERIC_LINK:  'Link',
}

const TYPE_SHORT: Record<string, string> = {
  DELIVERABLE: 'Deliverable',
  SERVICE:     'Service',
  RAW_FOOTAGE: 'Raw Footage',
  OTHER:       'Asset',
}

type MobileAssetCardProps = {
  asset: {
    title:       string
    description: string | null
    type:        string
    reviewStatus: string
    currentVersion: {
      url:               string
      provider:          string
      thumbnailUrl:      string | null
      firstClientViewAt: Date | null
    } | null
  }
  brandPrimary: string
}

function MobileAssetCard({ asset, brandPrimary }: MobileAssetCardProps) {
  const isUnseen    = asset.currentVersion && !asset.currentVersion.firstClientViewAt
  const provider    = asset.currentVersion?.provider ?? null
  const providerLabel = provider ? PROVIDER_SHORT[provider] ?? provider : null

  return (
    <div style={{
      background:   '#fff',
      borderRadius: 10,
      border:       '1px solid #e8e8e8',
      overflow:     'hidden',
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      padding:      '10px 14px 10px 0',
    }}>
      {/* Thumbnail — 16:9, fixed width */}
      <div style={{ width: 96, flexShrink: 0, aspectRatio: '16/9', background: '#f0f0f0', position: 'relative', overflow: 'hidden', borderRadius: '10px 0 0 10px' }}>
        {asset.currentVersion?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.currentVersion.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : asset.currentVersion?.provider === 'SHADE' ? (
          <ShadeThumbImg
            canonicalUrl={asset.currentVersion.url}
            fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                <span style={{ fontSize: 9, color: '#aaa', fontWeight: 600 }}>Shade</span>
              </div>
            }
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <span style={{ fontSize: 9, color: '#aaa', fontWeight: 600 }}>
              {providerLabel ?? TYPE_SHORT[asset.type] ?? 'Asset'}
            </span>
          </div>
        )}
        {isUnseen && (
          <div style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', boxShadow: '0 0 0 2px #fff' }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.title}
        </p>
        {asset.description && (
          <p style={{ fontSize: 12, color: '#777', margin: '0 0 4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {asset.description}
          </p>
        )}
        <span style={{
          display: 'inline-block', marginTop: 6, marginBottom: 4,
          padding: '2px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700,
          letterSpacing: '0.02em',
          background: REVIEW_STATUS_HEX[(asset.reviewStatus ?? 'NEEDS_REVIEW') as DeliverableReviewStatus].bg,
          color:      REVIEW_STATUS_HEX[(asset.reviewStatus ?? 'NEEDS_REVIEW') as DeliverableReviewStatus].fg,
        }}>
          {REVIEW_STATUS_LABELS[(asset.reviewStatus ?? 'NEEDS_REVIEW') as DeliverableReviewStatus]}
        </span>
        <p style={{ fontSize: 11, color: brandPrimary, fontWeight: 600, margin: 0 }}>
          View →
        </p>
      </div>
    </div>
  )
}
