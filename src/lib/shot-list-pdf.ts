// Shot list PDF: loads the list, embeds each shot's ★ frame, renders.
// Server-only plain module; routes: /api/pdf/shot-list/[projectId] (signed in)
// and /api/pdf/shot-list-share/[token] (share link, notes left out).

import 'server-only'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { ShotListPDF, type ShotListPDFData } from '@/components/shot-list/ShotListPDF'
import { loadShotList } from '@/lib/shot-list-load'
import { shotCode, type ShotView } from '@/lib/shot-list'
import { loadPdfLogo } from '@/lib/pdf-logo'
import { safeHex } from '@/lib/color'

const MAX_IMAGES  = 200
const CONCURRENCY = 6

/** Only our own R2 copies are fetched (every reference image lives there). */
function isOurImage(url: string | null | undefined): url is string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')
  return !!url && !!base && url.startsWith(`${base}/`)
}

async function loadImages(urls: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const queue = [...new Set(urls)].slice(0, MAX_IMAGES)
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      const data = await loadPdfLogo(u, 4_500_000)   // https, no redirects, png/jpeg, ≤ the 4 MB upload cap, 4 s timeout
      if (data) out.set(u, data)
    }
  }))
  return out
}

function extras(shot: ShotView, includeNotes: boolean): string | null {
  const parts = [
    shot.camera, shot.frameRate, shot.aspect, shot.sound,
    shot.setup ? `Setup ${shot.setup}` : null,
    shot.estMinutes != null ? `${shot.estMinutes} min` : null,
    shot.cast ? `Cast: ${shot.cast}` : null,
    shot.location,
    includeNotes && shot.notes ? `Notes: ${shot.notes}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export async function renderShotListPdf(input: {
  projectId:    string
  workspaceId:  string
  projectName:  string
  clientName:   string | null
  workspace:    { name: string; logoUrl: string | null; primaryColor: string | null }
  includeNotes: boolean
}): Promise<{ filename: string; buffer: Buffer }> {
  const loaded = await loadShotList(input.projectId, input.workspaceId)

  const heroUrls = loaded.list.sections.flatMap(s => s.shots.map(sh => sh.references[0]?.imageUrl)).filter(isOurImage)
  const [images, logoSrc] = await Promise.all([loadImages(heroUrls), loadPdfLogo(input.workspace.logoUrl)])

  const sections = loaded.list.sections
    .map((sec, si) => {
      const scene = sec.sceneId ? loaded.scenes[sec.sceneId] ?? null : null
      return {
        label: scene ? `${scene.sceneNumber ? `Sc. ${scene.sceneNumber} · ` : ''}${scene.heading}` : sec.title,
        color: scene?.color ?? '#CFCBC5',
        dayLabel: scene?.dayLabel ?? null,
        rows: sec.shots.map((shot, i) => {
          const hero = shot.references[0]?.imageUrl
          return {
            code: shotCode(sec, scene, si, i),
            status: shot.status,
            imageSrc: hero ? images.get(hero) : undefined,
            description: shot.description,
            subject: shot.subject,
            specs: [shot.size, shot.angle, shot.movement, shot.lens, shot.equipment].filter(Boolean).join(' · '),
            extra: extras(shot, input.includeNotes),
          }
        }),
      }
    })
    .filter(s => s.rows.length > 0)

  const total = sections.reduce((n, s) => n + s.rows.length, 0)
  const done  = sections.reduce((n, s) => n + s.rows.filter(r => r.status === 'DONE').length, 0)
  const data: ShotListPDFData = {
    workspaceName: input.workspace.name,
    logoSrc,
    brand: safeHex(input.workspace.primaryColor),
    projectName: input.projectName,
    subtitle: [input.clientName, `${total} ${total === 1 ? 'shot' : 'shots'}`, done ? `${done} done` : null].filter(Boolean).join(' · '),
    generatedLabel: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    sections,
  }

  const buffer = await renderToBuffer(
    React.createElement(ShotListPDF, { d: data }) as unknown as Parameters<typeof renderToBuffer>[0],
  )
  return { filename: `${input.projectName} — Shot list.pdf`, buffer }
}
