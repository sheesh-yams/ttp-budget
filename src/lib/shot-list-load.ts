// Loads a project's shot list in the shape the editor, the public share page
// and the PDF all read. Server-only. Callers have already checked access (or,
// for public routes, verified the token) — this takes the workspace id from
// that verified row, never from the request.

import 'server-only'
import { db } from '@/lib/db'
import {
  readColumnPrefs, sceneDayMap, sceneHeading, sceneSwatch, shareExpiry, dayLabel,
  type ShotListView, type ShotSceneInfo, type ShotView,
} from '@/lib/shot-list'

export interface ShotDayTab { key: string; label: string }

export interface LoadedShotList {
  list:   ShotListView
  scenes: Record<string, ShotSceneInfo>  // every project scene, for the "link a scene" picker
  days:   ShotDayTab[]                   // shoot days in project order
  shareExpiresAt: Date | null
}

/** The fields every shot read returns (ShotView). */
export const SHOT_SELECT = {
  id: true, sectionId: true, status: true, description: true, subject: true,
  size: true, angle: true, movement: true, lens: true, equipment: true,
  camera: true, frameRate: true, aspect: true, sound: true, setup: true,
  estMinutes: true, cast: true, location: true, notes: true,
  references: {
    orderBy: [{ orderIndex: 'asc' as const }, { createdAt: 'asc' as const }],
    select: { id: true, kind: true, imageUrl: true, sourceUrl: true, sourceHost: true },
  },
}

export async function loadShotList(projectId: string, workspaceId: string): Promise<LoadedShotList> {
  const ws = { workspaceId }
  const [list, scenes, shootDays, primary] = await Promise.all([
    db.shotList.findFirst({
      where: { projectId, ...ws },
      include: {
        sections: {
          orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
          include: { shots: { orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }], select: SHOT_SELECT } },
        },
      },
    }),
    db.scene.findMany({
      where: { projectId, ...ws, archived: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true, sceneNumber: true, setting: true, intExt: true, timeOfDay: true, colorOverride: true },
    }),
    db.shootDay.findMany({ where: { projectId, ...ws }, orderBy: [{ orderIndex: 'asc' }, { date: 'asc' }], select: { id: true, date: true } }),
    db.schedule.findFirst({ where: { projectId, ...ws }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { id: true } }),
  ])

  const entries = primary
    ? await db.scheduleEntry.findMany({ where: { scheduleId: primary.id, ...ws, kind: 'SCENE' }, select: { sceneId: true, shootDayId: true } })
    : []
  const dayOf = sceneDayMap(entries, shootDays)

  // Linked scenes that are archived still need their info for the heading.
  const linkedIds = (list?.sections ?? []).map(s => s.sceneId).filter((id): id is string => !!id)
  const missing = linkedIds.filter(id => !scenes.some(s => s.id === id))
  const extra = missing.length
    ? await db.scene.findMany({ where: { id: { in: missing }, ...ws }, select: { id: true, sceneNumber: true, setting: true, intExt: true, timeOfDay: true, colorOverride: true } })
    : []

  const sceneInfo: Record<string, ShotSceneInfo> = {}
  for (const s of [...scenes, ...extra]) {
    const d = dayOf.get(s.id)
    sceneInfo[s.id] = {
      id: s.id, sceneNumber: s.sceneNumber, heading: sceneHeading(s), color: sceneSwatch(s),
      dayKey: d?.dayKey ?? null, dayLabel: d?.dayLabel ?? null,
    }
  }

  const lastShoot = shootDays.length ? shootDays.reduce((a, d) => (d.date > a ? d.date : a), shootDays[0].date) : null
  const expires = list?.shareEnabled ? shareExpiry(list.shareEnabledAt, lastShoot) : null

  return {
    list: {
      id:             list?.id ?? null,
      publicToken:    list?.publicToken ?? null,
      shareEnabled:   list?.shareEnabled ?? false,
      shareExpiresAt: expires?.toISOString() ?? null,
      columnPrefs:    readColumnPrefs(list?.columnPrefs),
      sections: (list?.sections ?? []).map(sec => ({
        id: sec.id, title: sec.title, code: sec.code, sceneId: sec.sceneId,
        shots: sec.shots as ShotView[],
      })),
    },
    scenes: sceneInfo,
    days:   shootDays.map((d, i) => ({ key: d.id, label: dayLabel(i, d.date) })),
    shareExpiresAt: expires,
  }
}
