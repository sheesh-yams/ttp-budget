// Emailing a call sheet — the work behind getCallSheetSendList /
// sendCallSheetEmails (src/server/actions/call-sheets.ts, which checks access
// first and passes the real email sender). Takes a scoped db and the sender
// as arguments so it can be exercised without a session or real emails.

import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { ScopedDb } from '@/lib/db-scoped'
import { toJsonSafe } from '@/lib/json-safe'
import { formatTime, type TimeFormat } from '@/lib/time-format'
import {
  peopleOnSheet, personKeyFor, sendSnapshot, changesSince, confirmationStillValid, recipientStatus, matchRecipients,
  type RecipientGroup, type RecipientStatus, type SheetPerson,
} from '@/lib/call-sheet-recipients'
import { renderCallSheetEmail } from '@/lib/call-sheet-email'
import type { CrewDept, TalentMember, OtherContact, ScheduleBlock, WeatherInfo, HospitalInfo } from '@/server/actions/call-sheets'

export interface SendListPerson {
  ref: string
  group: RecipientGroup
  name: string
  role: string | null
  email: string | null
  callTime: string | null
  status: RecipientStatus
  lastSentAt: string | null
  firstViewedAt: string | null
  confirmedAt: string | null
  /** What changed since their last email ([] if never sent or unchanged). */
  changes: string[]
  lastError: string | null
}

export interface SendResult { ref: string; name: string; email: string; ok: boolean; error?: string }

type SendBatch = (
  emails: { to: string; subject: string; html: string; text: string }[],
  sender: { actorName?: string | null; actorEmail?: string | null; workspaceName?: string | null },
) => Promise<({ id: string } | { error: string })[]>

/** The sheet, its people and their recipient rows (scoped to the workspace). */
async function loadForSending(sdb: ScopedDb, id: string) {
  const cs = await sdb.callSheet.findFirst({
    where: { id },
    include: {
      project: { select: { name: true } },
      workspace: { select: { name: true, primaryColor: true, accentColor: true, callTimeFormat: true } },
      recipients: true,
    },
  })
  if (!cs) throw new Error('Call sheet not found')
  const people = peopleOnSheet(
    (cs.crew as unknown as CrewDept[]) ?? [], (cs.talent as unknown as TalentMember[]) ?? [],
    (cs.otherContacts as unknown as OtherContact[]) ?? [],
  )
  const fmt = ((cs.workspace.callTimeFormat as TimeFormat | null) ?? '12H')
  return { cs, people, fmt }
}

/** Everyone on the saved sheet, with their email status. */
export async function buildSendList(sdb: ScopedDb, callSheetId: string): Promise<{ people: SendListPerson[]; sheetStatus: string }> {
  const { cs, people, fmt } = await loadForSending(sdb, callSheetId)
  const rows = matchRecipients(people, cs.recipients)
  return {
    sheetStatus: cs.status,
    people: people.map(p => {
      const r = rows.get(p.ref)
      return {
        ref: p.ref, group: p.group, name: p.name, role: p.role, email: p.email, callTime: p.callTime,
        status: recipientStatus(r), lastSentAt: r?.lastSentAt?.toISOString() ?? null,
        firstViewedAt: r?.firstViewedAt?.toISOString() ?? null, confirmedAt: r?.confirmedAt?.toISOString() ?? null,
        changes: r?.lastSentAt ? changesSince(r.lastSent, sendSnapshot(cs, p), fmt) : [],
        lastError: r?.lastError ?? null,
      }
    }),
  }
}

const sendInput = z.object({
  people: z.array(z.object({
    ref: z.string().min(1).max(200),
    /** Only for someone with no email on the sheet — written back to it. */
    email: z.string().trim().email('Check the email addresses.').max(320).optional(),
  })).min(1, 'Pick at least one person.').max(500),
  note: z.string().max(2000).optional(),
})

function rowRefString(p: SheetPerson): string {
  const r = p.rowRef
  return r.group === 'CREW' ? `row:CREW:${r.dept}:${r.member}` : `row:${r.group}:${r.index}`
}

/**
 * Sends one personal email per chosen person and records it.
 *  - Typed-in emails are saved to the sheet (and to a linked Rolodex contact
 *    that has none).
 *  - Each person's row keeps what they were sent, so a re-send lists what
 *    changed, and a change to their call/date/place resets their
 *    confirmation (only once that update is actually delivered).
 */
export async function runCallSheetSend(deps: {
  sdb: ScopedDb
  callSheetId: string
  input: unknown
  user: { id: string; name: string | null; email: string | null }
  /** Status SENT, link expiry, weather — what "sent" always meant. */
  markSent: () => Promise<void>
  sendBatch: SendBatch
  appUrl: string
}): Promise<{
  results: SendResult[]; updates: number; workspaceId: string
  /** The sheet's people lists when typed emails were saved into them — the
   *  editor adopts these so its next Save doesn't undo them. */
  sheet: { crew: CrewDept[]; talent: TalentMember[]; otherContacts: OtherContact[] } | null
} | { error: string }> {
  const { sdb, callSheetId, user } = deps
  const parsed = sendInput.safeParse(deps.input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the recipients.' }
  let { cs, people, fmt } = await loadForSending(sdb, callSheetId)
  if (cs.status === 'FINAL') return { error: 'This call sheet is final — reopen it to send updates.' }

  // ── Typed-in emails → the sheet (and a linked contact without one) ──
  const typed = parsed.data.people.filter(x => x.email)
  // Where each typed person will be found after the sheet reloads.
  const typedKey = new Map<string, string>()
  let savedSheet: { crew: CrewDept[]; talent: TalentMember[]; otherContacts: OtherContact[] } | null = null
  if (typed.length) {
    const crew = structuredClone((cs.crew as unknown as CrewDept[]) ?? [])
    const talent = structuredClone((cs.talent as unknown as TalentMember[]) ?? [])
    const others = structuredClone((cs.otherContacts as unknown as OtherContact[]) ?? [])
    for (const t of typed) {
      const p = people.find(x => x.ref === t.ref)
      if (!p || p.email) continue
      typedKey.set(t.ref, personKeyFor(p.contactId, t.email, p.name)!)
      const r = p.rowRef
      if (r.group === 'CREW') { const m = crew[r.dept]?.members?.[r.member]; if (m) m.email = t.email }
      else if (r.group === 'TALENT') { if (talent[r.index]) talent[r.index]!.email = t.email }
      else if (others[r.index]) others[r.index]!.email = t.email
      if (p.contactId) {
        await sdb.contact.updateMany({ where: { id: p.contactId, OR: [{ email: null }, { email: '' }] }, data: { email: t.email } })
      }
    }
    await sdb.callSheet.updateMany({
      where: { id: cs.id },
      data: { crew: toJsonSafe(crew), talent: toJsonSafe(talent), otherContacts: toJsonSafe(others) } as unknown as Prisma.CallSheetUpdateManyMutationInput,
    })
    savedSheet = { crew, talent, otherContacts: others }
    ;({ cs, people, fmt } = await loadForSending(sdb, callSheetId))
  }

  // Chosen people — a typed email turns a "row:…" ref into an email key (and
  // may merge them into someone already listed), so look them up by that.
  const find = (ref: string) => people.find(p => p.ref === ref)
    ?? (typedKey.has(ref) ? people.find(p => p.personKey === typedKey.get(ref)) : undefined)
    ?? people.find(p => rowRefString(p) === ref)
  const chosen: SheetPerson[] = []
  for (const sel of parsed.data.people) {
    const p = find(sel.ref)
    if (!p) return { error: 'The call sheet changed — reopen Send and try again.' }
    if (!p.email) return { error: `${p.name || 'Someone'} has no email address.` }
    if (!chosen.includes(p)) chosen.push(p)
  }

  await deps.markSent()

  // ── A row (with its own link) for each person ──
  const matched = matchRecipients(people, cs.recipients)
  type Row = (typeof cs.recipients)[number]
  const prepared: { p: SheetPerson; row: Row }[] = []
  for (const p of chosen) {
    const key = personKeyFor(p.contactId, p.email, p.name)!
    let row: Row | null | undefined = matched.get(p.ref)
    if (row && row.personKey !== key) {
      // Same person, new identity (now linked to the Rolodex, email fixed):
      // keep their row — and their link, history and confirmation.
      await sdb.callSheetRecipient.updateMany({ where: { id: row.id }, data: { personKey: key, contactId: p.contactId, email: p.email! } })
      row = { ...row, personKey: key, contactId: p.contactId, email: p.email! }
    }
    if (!row) {
      try {
        row = await sdb.callSheetRecipient.create({ data: {
          callSheetId: cs.id, personKey: key, group: p.group, name: p.name, email: p.email!, role: p.role, contactId: p.contactId,
        } as unknown as Prisma.CallSheetRecipientUncheckedCreateInput })
      } catch {
        // Someone else sending at the same moment just made it.
        row = await sdb.callSheetRecipient.findFirst({ where: { callSheetId: cs.id, personKey: key } })
        if (!row) return { error: 'Couldn’t prepare the emails — try again.' }
      }
    }
    prepared.push({ p, row })
  }

  // ── The emails ──
  const days = cs.shootDayId
    ? await sdb.shootDay.findMany({ where: { projectId: cs.projectId }, orderBy: [{ orderIndex: 'asc' }, { date: 'asc' }], select: { id: true } })
    : []
  const dayIdx = days.findIndex(d => d.id === cs.shootDayId)
  const [y, mo, d] = cs.shootDate.toISOString().slice(0, 10).split('-').map(Number)
  const dateLabel = new Date(y!, mo! - 1, d!).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const weather = cs.weather as unknown as WeatherInfo | null
  const hospital = cs.hospitalInfo as unknown as HospitalInfo | null
  const blocks = (cs.schedule as unknown as ScheduleBlock[]) ?? []
  const note = parsed.data.note?.trim() || null

  const emails = prepared.map(({ p, row }) => {
    const now = sendSnapshot(cs, p)
    const isUpdate = row.sendCount > 0
    const viewUrl = `${deps.appUrl}/cs/${cs.publicToken}?r=${row.token}`
    return renderCallSheetEmail({
      firstName: p.name.split(' ')[0] ?? '', role: p.role,
      callTime: p.callTime ? formatTime(p.callTime, fmt) : null, generalCall: formatTime(cs.generalCall, fmt),
      projectName: cs.project.name, dateLabel, dayLabel: dayIdx >= 0 ? `Day ${dayIdx + 1}` : null,
      locationName: cs.locationName, locationAddress: cs.locationAddress, parkingAddress: cs.parkingAddress,
      weather: weather ? `${weather.conditions} · ${Math.round(weather.high)}° / ${Math.round(weather.low)}° · ${weather.precipPct}% rain` : null,
      hospital: hospital ? { name: hospital.name, address: hospital.address, phone: hospital.phone } : null,
      schedule: blocks.slice(0, 6).map(b => ({ time: formatTime(b.startTime ?? b.time ?? '', fmt), label: b.label })),
      moreBlocks: Math.max(0, blocks.length - 6),
      note, changes: isUpdate ? changesSince(row.lastSent, now, fmt) : [], isUpdate,
      viewUrl, confirmUrl: `${viewUrl}&confirm=1`,
      senderName: user.name, brandName: cs.workspace.name,
      primary: cs.workspace.primaryColor || '#5D00A4', accent: cs.workspace.accentColor || '#04FFCC',
    })
  })
  const sent = await deps.sendBatch(
    emails.map((e, i) => ({ to: prepared[i]!.p.email!, ...e })),
    { actorName: user.name, actorEmail: user.email, workspaceName: cs.workspace.name },
  )

  // ── Record each result ──
  const results: SendResult[] = []
  for (const [i, { p, row }] of prepared.entries()) {
    const r = sent[i] ?? { error: 'Not sent' }
    if ('id' in r) {
      const now = sendSnapshot(cs, p)
      await sdb.callSheetRecipient.updateMany({ where: { id: row.id }, data: {
        name: p.name, email: p.email!, role: p.role, group: p.group,
        lastSent: now as unknown as Prisma.InputJsonValue, lastSentAt: new Date(), sendCount: { increment: 1 },
        lastEmailId: r.id, lastError: null,
        ...(confirmationStillValid(row.lastSent, now) ? {} : { confirmedAt: null }),
      } })
      results.push({ ref: p.ref, name: p.name, email: p.email!, ok: true })
    } else {
      await sdb.callSheetRecipient.updateMany({ where: { id: row.id }, data: { lastError: r.error } })
      results.push({ ref: p.ref, name: p.name, email: p.email!, ok: false, error: r.error })
    }
  }
  return { results, updates: prepared.filter(x => x.row.sendCount > 0).length, workspaceId: cs.workspaceId, sheet: savedSheet }
}
