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
  const title = page.title ?? page.project.name
  return {
    title:   { absolute: `${title} | Deliverables` },
    robots:  { index: false, follow: false, nocache: true },
    referrer:'no-referrer' as const,
  }
}

export default async function PublicDeliveryPage({ params }: Props) {
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
                  id:                true,
                  versionNumber:     true,
                  url:               true,
                  provider:          true,
                  renderMode:        true,
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
  const client       = page.project.client
  const brandPrimary = safeHex(ws.primaryColor)
  const brandAccent  = safeHex(ws.accentColor)
  const heroBg       =
    `radial-gradient(ellipse 80% 60% at 78% 20%, ${lighten(brandPrimary, 0.18)} 0%, transparent 70%),` +
    `radial-gradient(ellipse 60% 50% at 18% 75%, ${darken(brandPrimary, 0.45)} 0%, transparent 74%),` +
    darken(brandPrimary, 0.9)
  const brandVars = {
    '--brand-v':      brandPrimary,
    '--brand-v-tint': lighten(brandPrimary, 0.92),
    '--brand-mint':   brandAccent,
    '--brand-mint-dk': darken(brandAccent, 0.55),
  } as React.CSSProperties

  const pageTitle = page.title ?? page.project.name
  const visibleSections = page.sections.filter(s => s.deliverables.length > 0)

  return (
    <div style={{ ...brandVars, fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: '#1a1a1a', background: '#f8f8f8', minHeight: '100vh' }}>
      <style>{`.dl-asset-card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.10)}`}</style>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', background: heroBg, padding: '48px 24px 52px', overflow: 'hidden' }}>
        {/* Cover image overlay */}
        {page.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.coverImageUrl}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, pointerEvents: 'none' }}
          />
        )}
        {/* Workspace logo */}
        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
            {ws.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ws.logoDarkUrl ?? ws.logoUrl}
                alt={ws.name}
                style={{ height: 32, width: 'auto', objectFit: 'contain' }}
              />
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                {ws.name}
              </p>
            )}

            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 18, fontWeight: 300 }}>×</span>

            {client.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.logoUrl}
                alt={client.name}
                style={{ height: 28, width: 'auto', maxWidth: 160, objectFit: 'contain' }}
              />
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                {client.name}
              </p>
            )}
          </div>

          {/* Eyebrow */}
          <p style={{ color: brandAccent, fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Deliverables
          </p>

          <h1 style={{ color: '#fff', fontSize: 'clamp(22px, 3vw, 38px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
            {pageTitle}
          </h1>

          {page.subtitle && (
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, margin: '0 0 10px' }}>
              {page.subtitle}
            </p>
          )}

          {page.customMessage && (
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.6, maxWidth: 520, margin: 0 }}>
              {page.customMessage}
            </p>
          )}
        </div>
      </div>

      {/* ── Overview block ────────────────────────────────────────────────── */}
      {page.overview && (
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '36px 24px 0' }}>
          <div style={{ borderLeft: `3px solid ${brandPrimary}`, paddingLeft: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#888', margin: '0 0 8px' }}>
              Delivery Notes
            </p>
            <div
              style={{ fontSize: 15, color: '#333', lineHeight: 1.65 }}
              dangerouslySetInnerHTML={{ __html: renderSmartText(page.overview) }}
            />
          </div>
        </div>
      )}

      {/* ── Sections ──────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: page.overview ? '28px 24px 80px' : '40px 24px 80px' }}>
        {visibleSections.length === 0 ? (
          <p style={{ color: '#888', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>
            No deliverables have been shared yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
            {visibleSections.map(section => (
              <div key={section.id}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#888', margin: '0 0 4px' }}>
                  Section
                </p>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                  {section.title}
                </h2>
                {section.description && (
                  <div
                    style={{ fontSize: 13, color: '#666', margin: '0 0 16px', lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: renderSmartText(section.description) }}
                  />
                )}
                {!section.description && <div style={{ marginBottom: 16 }} />}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                  {section.deliverables.map(asset => (
                    <Link
                      key={asset.id}
                      href={`/d/${token}/${asset.publicToken}`}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                    >
                      <AssetCard asset={asset} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 64, paddingTop: 24, borderTop: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>
            Delivered by {ws.name}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Asset card ───────────────────────────────────────────────────────────────

type AssetCardProps = {
  asset: {
    title:       string
    description: string | null
    type:        string
    reviewStatus: string
    currentVersion: {
      url:          string
      provider:     string
      renderMode:   string
      thumbnailUrl: string | null
      firstClientViewAt: Date | null
    } | null
  }
}

function AssetCard({ asset }: AssetCardProps) {
  const isUnseen = asset.currentVersion && !asset.currentVersion.firstClientViewAt
  const provider = asset.currentVersion?.provider ?? null
  const providerLabel = provider ? PROVIDER_SHORT[provider] ?? provider : null

  return (
    <div
      className="dl-asset-card"
      style={{
        background:   '#fff',
        borderRadius: 12,
        border:       '1px solid #e8e8e8',
        overflow:     'hidden',
        transition:   'box-shadow 0.15s',
        cursor:       'pointer',
      }}
    >
      {/* Thumbnail */}
      <div style={{ aspectRatio: '16/9', background: '#f0f0f0', position: 'relative', overflow: 'hidden' }}>
        {asset.currentVersion?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.currentVersion.thumbnailUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : asset.currentVersion?.provider === 'SHADE' ? (
          <ShadeThumbImg
            canonicalUrl={asset.currentVersion.url}
            fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                <span style={{ fontSize: 11, color: '#aaa', fontWeight: 600 }}>Shade</span>
              </div>
            }
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <span style={{ fontSize: 11, color: '#aaa', fontWeight: 600 }}>
              {providerLabel ?? TYPE_SHORT[asset.type] ?? 'Asset'}
            </span>
          </div>
        )}
        {isUnseen && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            width: 8, height: 8, borderRadius: '50%',
            background: '#7c3aed',
            boxShadow: '0 0 0 2px #fff',
          }} title="New" />
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.title}
        </p>
        {asset.description && (
          <p style={{ fontSize: 12, color: '#777', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
            {asset.description}
          </p>
        )}
        <span style={{
          display: 'inline-block', marginTop: 8,
          padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.02em',
          background: REVIEW_STATUS_HEX[(asset.reviewStatus ?? 'NEEDS_REVIEW') as DeliverableReviewStatus].bg,
          color:      REVIEW_STATUS_HEX[(asset.reviewStatus ?? 'NEEDS_REVIEW') as DeliverableReviewStatus].fg,
        }}>
          {REVIEW_STATUS_LABELS[(asset.reviewStatus ?? 'NEEDS_REVIEW') as DeliverableReviewStatus]}
        </span>
      </div>
    </div>
  )
}

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
