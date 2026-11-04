import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { loadShotList } from '@/lib/shot-list-load'
import { shareExpiry, shotCode } from '@/lib/shot-list'
import { ExpiredLinkPage } from '@/components/public/ExpiredLinkPage'
import { PublicShotList, type PublicSection } from '@/components/shot-list/PublicShotList'

// View-only shot list share page. No session: the token row decides the
// workspace (rate-limited as publicDoc in middleware). Only while sharing is
// on and before the expiry; notes are stripped — they're crew-only.

async function findList(token: string) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 100) return null
  return db.shotList.findUnique({
    where: { publicToken: token },
    select: {
      projectId: true, workspaceId: true, shareEnabled: true, shareEnabledAt: true,
      project: { select: { name: true, client: { select: { name: true } } } },
      workspace: { select: { name: true, logoUrl: true } },
    },
  })
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await findList(token)
  if (!row?.shareEnabled) return { title: 'Shot list' }
  // Don't reveal the project name in the tab title once the link has expired.
  const lastDay = await db.shootDay.findFirst({ where: { projectId: row.projectId, workspaceId: row.workspaceId }, orderBy: { date: 'desc' }, select: { date: true } })
  const expires = shareExpiry(row.shareEnabledAt, lastDay?.date ?? null)
  if (!expires || expires < new Date()) return { title: 'Shot list' }
  return { title: { absolute: `${row.project.name} | Shot list` } }
}

export default async function PublicShotListPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const row = await findList(token)
  if (!row || !row.shareEnabled) notFound()

  const loaded = await loadShotList(row.projectId, row.workspaceId)
  if (!loaded.shareExpiresAt || loaded.shareExpiresAt < new Date()) return <ExpiredLinkPage type="shot-list" />

  const sections: PublicSection[] = loaded.list.sections
    .map((sec, si) => {
      const scene = sec.sceneId ? loaded.scenes[sec.sceneId] ?? null : null
      return {
        id: sec.id,
        label: scene ? `${scene.sceneNumber ? `Sc. ${scene.sceneNumber} · ` : ''}${scene.heading}` : sec.title,
        color: scene?.color ?? '#CFCBC5',
        dayLabel: scene?.dayLabel ?? null,
        shots: sec.shots.map((shot, i) => ({ shot: { ...shot, notes: null }, code: shotCode(sec, scene, si, i) })),
      }
    })
    .filter(s => s.shots.length > 0)

  const total = sections.reduce((n, s) => n + s.shots.length, 0)
  const dayCount = new Set(sections.map(s => s.dayLabel).filter(Boolean)).size

  return (
    <main className="min-h-screen bg-[#F1F0ED] py-0 md:py-10">
      <div className="mx-auto max-w-6xl bg-white text-[#1A1A1A] md:rounded-[4px] md:border md:border-[#E2E0DC]">
        <header className="px-5 pb-6 pt-8 md:px-10 md:pt-10">
          <div className="flex items-center gap-3 text-[13px] text-[#6B6B6B]">
            {row.workspace.logoUrl
              ? <img src={row.workspace.logoUrl} alt={row.workspace.name} className="h-6 w-auto max-w-[140px] object-contain" />
              : <span className="font-medium text-[#1A1A1A]">{row.workspace.name}</span>}
            <span>· Shot list</span>
          </div>
          <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em] md:text-4xl">{row.project.name}</h1>
          <p className="mt-1 text-[15px] text-[#6B6B6B]">
            {row.project.client?.name ? `${row.project.client.name} · ` : ''}
            {dayCount ? `${dayCount} shoot ${dayCount === 1 ? 'day' : 'days'} · ` : ''}{total} {total === 1 ? 'shot' : 'shots'}
          </p>
        </header>
        {sections.length
          ? <PublicShotList sections={sections} pdfHref={`/api/pdf/shot-list-share/${token}`} />
          : <p className="border-t border-[#EEEDEA] px-5 py-16 text-center text-sm text-[#6B6B6B] md:px-10">No shots yet.</p>}
      </div>
    </main>
  )
}
