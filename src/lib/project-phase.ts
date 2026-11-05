// Project phase: the detailed lifecycle stage shown on /projects.
//
// Project.status stays the coarse bucket the rest of the app reads
// (dashboard, clients page, proposals, archive permissions):
//   LEAD     = phase LEAD
//   ACTIVE   = any later phase
//   WRAPPED / ARCHIVED keep whatever phase the project was last in.
// Every write that touches one goes through the helpers here so the two
// never disagree. Plain module (no server-only imports) — used by server
// actions, the projects page, the data backfill and jest.

export const PHASES = [
  { key: 'LEAD',        label: 'Lead' },
  { key: 'PRE_PROD',    label: 'Pre-prod' },
  { key: 'PRODUCTION',  label: 'Production' },
  { key: 'POST',        label: 'Post' },
  { key: 'INVOICING',   label: 'Invoicing' },
  { key: 'OFFBOARDING', label: 'Offboarding' },
] as const

export type PhaseKey = typeof PHASES[number]['key']
export type ProjectStatusKey = 'LEAD' | 'ACTIVE' | 'WRAPPED' | 'ARCHIVED'
/** What the Edit modal's "Stage" select sets: a phase, or wrapped / archived. */
export type StageKey = PhaseKey | 'WRAPPED' | 'ARCHIVED'

export const PHASE_KEYS = PHASES.map(p => p.key) as PhaseKey[]

export function isPhase(v: unknown): v is PhaseKey {
  return typeof v === 'string' && (PHASE_KEYS as string[]).includes(v)
}

export function phaseIndex(phase: string): number {
  const i = PHASE_KEYS.indexOf(phase as PhaseKey)
  return i < 0 ? 0 : i
}

export function phaseLabel(phase: string): string {
  return PHASES.find(p => p.key === phase)?.label ?? 'Lead'
}

/** The phase to show and edit from. An ACTIVE project still at LEAD (written
 *  by status-only code before phases existed) reads as Pre-prod, so saving it
 *  never demotes a won project back to a lead. */
export function effectivePhase(status: string, phase: string): PhaseKey {
  const p = isPhase(phase) ? phase : 'LEAD'
  return status === 'ACTIVE' && p === 'LEAD' ? 'PRE_PROD' : p
}

/** The label a project shows wherever it used to show its status. */
export function stageLabel(status: string, phase: string): string {
  if (status === 'WRAPPED')  return 'Wrapped'
  if (status === 'ARCHIVED') return 'Archived'
  return phaseLabel(effectivePhase(status, phase))
}

/** Coarse status for a project moved to `phase`. Archived stays archived;
 *  setting a phase on a wrapped project reopens it. */
export function statusForPhase(phase: PhaseKey, currentStatus: string): ProjectStatusKey {
  if (currentStatus === 'ARCHIVED') return 'ARCHIVED'
  return phase === 'LEAD' ? 'LEAD' : 'ACTIVE'
}

/** Phase for a project whose status is being set to `status` by an older
 *  status-only path (won / lost proposal, restore, legacy actions). */
export function phaseForStatus(status: string, currentPhase: string): PhaseKey {
  const cur = isPhase(currentPhase) ? currentPhase : 'LEAD'
  if (status === 'LEAD')   return 'LEAD'
  if (status === 'ACTIVE') return cur === 'LEAD' ? 'PRE_PROD' : cur
  return cur // WRAPPED / ARCHIVED keep their last phase
}

/** {status, phase} for a Stage chosen in the Edit modal. */
export function applyStage(stage: StageKey, current: { status: string; phase: string }): { status: ProjectStatusKey; phase: PhaseKey } {
  if (stage === 'WRAPPED' || stage === 'ARCHIVED') {
    return { status: stage, phase: isPhase(current.phase) ? current.phase : 'LEAD' }
  }
  return { status: stage === 'LEAD' ? 'LEAD' : 'ACTIVE', phase: stage }
}

/** Status a restored (unarchived) project returns to. */
export function restoredStatus(phase: string): ProjectStatusKey {
  return phase === 'LEAD' ? 'LEAD' : 'ACTIVE'
}

// ─── Deriving a phase from what has happened ────────────────────────────────

export interface PhaseFacts {
  status: string
  /** "YYYY-MM-DD" (UTC) or null. */
  shootStart: string | null
  shootEnd:   string | null
  proposals:  { status: string }[]
  invoices:   { kind?: string | null; status: string; totalCents: number; amountPaidCents: number; issueDate: string }[]
  /** Expected gross (primary budget + added scope); 0 when unknown. */
  expectedCents: number
}

const OPEN_INVOICE = ['SENT', 'VIEWED', 'OVERDUE']

/** Collected everything that's owed: payments cover the expected total, or —
 *  with no budget to compare against — every non-void invoice is paid. */
export function isPaidInFull(f: Pick<PhaseFacts, 'invoices' | 'expectedCents'>): boolean {
  const live = f.invoices.filter(i => i.status !== 'VOID' && i.status !== 'DRAFT')
  if (live.length === 0) return false
  const collected = live.reduce((s, i) => s + i.amountPaidCents, 0)
  if (f.expectedCents > 0) return collected >= f.expectedCents
  return live.every(i => i.status === 'PAID')
}

/**
 * Where the project probably is, from its dates and money. Used once to fill
 * in existing projects, and afterwards only to *suggest* a later phase.
 */
export function derivePhase(f: PhaseFacts, todayKey: string): PhaseKey {
  if (f.status === 'LEAD') return 'LEAD'
  if (f.status === 'WRAPPED') return 'OFFBOARDING'
  const start = f.shootStart
  const end   = f.shootEnd ?? f.shootStart
  if (!start || todayKey < start) {
    // No shoot dates: a project that's already being billed past its
    // deposit is further on than pre-production.
    if (!start && isPaidInFull(f)) return 'OFFBOARDING'
    return 'PRE_PROD'
  }
  if (end && todayKey <= end) return 'PRODUCTION'
  if (isPaidInFull(f)) return 'OFFBOARDING'
  const billedAfterShoot = f.invoices.some(i =>
    (OPEN_INVOICE.includes(i.status) || i.status === 'PAID') &&
    (i.kind === 'FINAL' || (end != null && i.issueDate.slice(0, 10) > end)))
  return billedAfterShoot ? 'INVOICING' : 'POST'
}

/** A later phase worth suggesting, or null. Never suggests going backwards,
 *  and nothing for leads, wrapped or archived projects. */
export function suggestedPhase(current: string, f: PhaseFacts, todayKey: string): PhaseKey | null {
  if (f.status !== 'ACTIVE') return null
  const d = derivePhase(f, todayKey)
  return phaseIndex(d) > phaseIndex(current) ? d : null
}
