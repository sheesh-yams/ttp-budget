/**
 * scripts/backfill-callsheet-contacts.ts
 *
 * Best-effort backlink of existing call sheet rows to Rolodex contacts by
 * matching on name (case-insensitive) and optionally email.
 *
 * For each crew member / talent member in every call sheet that has:
 *   - a non-empty name
 *   - no contactId already set
 *
 * We attempt to find exactly one matching contact where:
 *   1. name matches (case-insensitive, trimmed), AND
 *   2. email matches (if both have an email set)
 *
 * If the email comparison would result in multiple candidates we fall back to
 * name-only. If there are still multiple candidates (e.g. two "John Smith"
 * entries) the row is skipped to avoid mis-linking.
 *
 * Usage:
 *   npx tsx scripts/backfill-callsheet-contacts.ts          # dry-run (no writes)
 *   npx tsx scripts/backfill-callsheet-contacts.ts --apply  # apply changes
 */

import { PrismaClient } from '@prisma/client'

const db    = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function log(msg: string) { process.stdout.write(msg + '\n') }
function banner(title: string) {
  log(`\n─── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`)
}

// ── Types (mirrors call-sheets.ts interfaces) ─────────────────────────────────

interface CrewMember {
  name:       string
  role:       string
  callTime:   string
  phone?:     string
  email?:     string
  contactId?: string
}

interface CrewDept {
  dept:    string
  members: CrewMember[]
}

interface TalentMember {
  name:       string
  role?:      string
  callTime:   string
  phone?:     string
  email?:     string
  contactId?: string
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`\n${'='.repeat(60)}`)
  log(APPLY ? '  APPLY MODE — changes WILL be written' : '  DRY-RUN MODE — no writes (pass --apply to commit)')
  log('='.repeat(60))

  // 1. Load all workspaces
  const workspaces = await db.workspace.findMany({
    select: { id: true, name: true },
  })
  log(`\nFound ${workspaces.length} workspace(s)`)

  let totalMatched   = 0
  let totalSkipped   = 0
  let totalAlready   = 0
  let totalUpdated   = 0

  for (const ws of workspaces) {
    banner(`Workspace: ${ws.name}`)

    // 2. Load all contacts in this workspace (not archived)
    const contacts = await db.contact.findMany({
      where: { workspaceId: ws.id, archivedAt: null },
      select: { id: true, name: true, email: true },
    })

    if (contacts.length === 0) {
      log('  No contacts — skipping')
      continue
    }

    // Build lookup: lowercase name → array of contacts (handles duplicates)
    const byName = new Map<string, typeof contacts>()
    for (const c of contacts) {
      const key = c.name.toLowerCase().trim()
      const arr = byName.get(key) ?? []
      arr.push(c)
      byName.set(key, arr)
    }

    // 3. Load all call sheets in this workspace
    const callSheets = await db.callSheet.findMany({
      where:  { workspaceId: ws.id },
      select: { id: true, title: true, crew: true, talent: true },
    })

    log(`  ${contacts.length} contacts, ${callSheets.length} call sheets`)

    for (const cs of callSheets) {
      let crewDirty   = false
      let talentDirty = false

      // ── Crew ────────────────────────────────────────────────────────────────
      const crewGroups = (cs.crew as CrewDept[]) ?? []
      for (const group of crewGroups) {
        for (const member of group.members ?? []) {
          if (!member.name?.trim()) continue
          if (member.contactId) { totalAlready++; continue }

          const key        = member.name.toLowerCase().trim()
          const candidates = byName.get(key) ?? []

          if (candidates.length === 0) {
            totalSkipped++
            continue
          }

          // Narrow by email if both have one
          let matched: typeof contacts[number] | null = null
          if (candidates.length > 1 && member.email?.trim()) {
            const byEmail = candidates.filter(
              c => c.email?.toLowerCase().trim() === member.email!.toLowerCase().trim()
            )
            if (byEmail.length === 1) matched = byEmail[0]
          } else if (candidates.length === 1) {
            matched = candidates[0]
          }

          if (!matched) {
            log(`  [SKIP] "${member.name}" in "${cs.title}" — ${candidates.length} name matches, cannot disambiguate`)
            totalSkipped++
            continue
          }

          log(`  [MATCH] crew "${member.name}" → contact ${matched.id} (${matched.name}) in "${cs.title}"`)
          member.contactId = matched.id
          crewDirty = true
          totalMatched++
        }
      }

      // ── Talent ──────────────────────────────────────────────────────────────
      const talent = (cs.talent as TalentMember[]) ?? []
      for (const member of talent) {
        if (!member.name?.trim()) continue
        if (member.contactId) { totalAlready++; continue }

        const key        = member.name.toLowerCase().trim()
        const candidates = byName.get(key) ?? []

        if (candidates.length === 0) {
          totalSkipped++
          continue
        }

        let matched: typeof contacts[number] | null = null
        if (candidates.length > 1 && member.email?.trim()) {
          const byEmail = candidates.filter(
            c => c.email?.toLowerCase().trim() === member.email!.toLowerCase().trim()
          )
          if (byEmail.length === 1) matched = byEmail[0]
        } else if (candidates.length === 1) {
          matched = candidates[0]
        }

        if (!matched) {
          log(`  [SKIP] "${member.name}" in "${cs.title}" — ${candidates.length} name matches, cannot disambiguate`)
          totalSkipped++
          continue
        }

        log(`  [MATCH] talent "${member.name}" → contact ${matched.id} (${matched.name}) in "${cs.title}"`)
        member.contactId = matched.id
        talentDirty = true
        totalMatched++
      }

      // ── Persist if dirty ────────────────────────────────────────────────────
      if ((crewDirty || talentDirty) && APPLY) {
        await db.callSheet.update({
          where: { id: cs.id },
          data:  {
            ...(crewDirty   && { crew:   JSON.parse(JSON.stringify(crewGroups)) }),
            ...(talentDirty && { talent: JSON.parse(JSON.stringify(talent))     }),
          },
        })
        totalUpdated++
      }
    }
  }

  banner('Summary')
  log(`  Already linked : ${totalAlready}`)
  log(`  Matched        : ${totalMatched}`)
  log(`  Skipped        : ${totalSkipped}`)
  if (APPLY) {
    log(`  Call sheets updated : ${totalUpdated}`)
    log('\n✓ Done — changes written.')
  } else {
    log('\n  DRY-RUN complete. Run with --apply to write changes.')
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
