import {
  applyStage, derivePhase, effectivePhase, isPaidInFull, phaseForStatus, restoredStatus, stageLabel,
  statusForPhase, suggestedPhase, type PhaseFacts,
} from '@/lib/project-phase'
import { nextStep, needsAttention, type NextStepFacts } from '@/lib/project-next-step'

const facts = (o: Partial<PhaseFacts> = {}): PhaseFacts => ({
  status: 'ACTIVE', shootStart: null, shootEnd: null, proposals: [{ status: 'APPROVED' }], invoices: [], expectedCents: 10_000, ...o,
})
const inv = (o: Partial<PhaseFacts['invoices'][number]> = {}) => ({ kind: 'PROGRESS', status: 'SENT', totalCents: 5_000, amountPaidCents: 0, issueDate: '2026-11-01T00:00:00.000Z', ...o })

describe('status ⇄ phase sync', () => {
  it('statusForPhase', () => {
    expect(statusForPhase('LEAD', 'ACTIVE')).toBe('LEAD')
    expect(statusForPhase('POST', 'LEAD')).toBe('ACTIVE')
    expect(statusForPhase('POST', 'WRAPPED')).toBe('ACTIVE')     // reopens
    expect(statusForPhase('POST', 'ARCHIVED')).toBe('ARCHIVED')  // archived stays
  })
  it('phaseForStatus', () => {
    expect(phaseForStatus('ACTIVE', 'LEAD')).toBe('PRE_PROD')    // won
    expect(phaseForStatus('ACTIVE', 'POST')).toBe('POST')
    expect(phaseForStatus('LEAD', 'POST')).toBe('LEAD')          // lost
    expect(phaseForStatus('WRAPPED', 'INVOICING')).toBe('INVOICING')
    expect(phaseForStatus('ARCHIVED', 'junk')).toBe('LEAD')
  })
  it('applyStage', () => {
    expect(applyStage('PRODUCTION', { status: 'LEAD', phase: 'LEAD' })).toEqual({ status: 'ACTIVE', phase: 'PRODUCTION' })
    expect(applyStage('LEAD', { status: 'ACTIVE', phase: 'POST' })).toEqual({ status: 'LEAD', phase: 'LEAD' })
    expect(applyStage('WRAPPED', { status: 'ACTIVE', phase: 'POST' })).toEqual({ status: 'WRAPPED', phase: 'POST' })
    expect(applyStage('ARCHIVED', { status: 'ACTIVE', phase: 'POST' })).toEqual({ status: 'ARCHIVED', phase: 'POST' })
  })
  it('effectivePhase: an ACTIVE project still at LEAD reads as Pre-prod', () => {
    expect(effectivePhase('ACTIVE', 'LEAD')).toBe('PRE_PROD')
    expect(effectivePhase('LEAD', 'LEAD')).toBe('LEAD')
    expect(effectivePhase('ACTIVE', 'POST')).toBe('POST')
    expect(stageLabel('ACTIVE', 'LEAD')).toBe('Pre-prod')
  })
  it('restoredStatus and stageLabel', () => {
    expect(restoredStatus('LEAD')).toBe('LEAD')
    expect(restoredStatus('POST')).toBe('ACTIVE')
    expect(stageLabel('WRAPPED', 'POST')).toBe('Wrapped')
    expect(stageLabel('ACTIVE', 'PRE_PROD')).toBe('Pre-prod')
  })
})

describe('derivePhase', () => {
  const today = '2026-11-04'
  it('lead and wrapped', () => {
    expect(derivePhase(facts({ status: 'LEAD' }), today)).toBe('LEAD')
    expect(derivePhase(facts({ status: 'WRAPPED' }), today)).toBe('OFFBOARDING')
  })
  it('follows the shoot dates', () => {
    expect(derivePhase(facts(), today)).toBe('PRE_PROD')
    expect(derivePhase(facts({ shootStart: '2026-11-10', shootEnd: '2026-11-11' }), today)).toBe('PRE_PROD')
    expect(derivePhase(facts({ shootStart: '2026-11-03', shootEnd: '2026-11-05' }), today)).toBe('PRODUCTION')
    expect(derivePhase(facts({ shootStart: '2026-11-04', shootEnd: null }), today)).toBe('PRODUCTION')
    expect(derivePhase(facts({ shootStart: '2026-10-01', shootEnd: '2026-10-02' }), today)).toBe('POST')
  })
  it('after the shoot: billed → Invoicing, paid → Offboarding', () => {
    const shot = { shootStart: '2026-10-01', shootEnd: '2026-10-02' }
    expect(derivePhase(facts({ ...shot, invoices: [inv({ issueDate: '2026-09-01T00:00:00Z' })] }), today)).toBe('POST') // deposit before
    expect(derivePhase(facts({ ...shot, invoices: [inv({ issueDate: '2026-10-20T00:00:00Z' })] }), today)).toBe('INVOICING')
    expect(derivePhase(facts({ ...shot, invoices: [inv({ kind: 'FINAL', issueDate: '2026-09-01T00:00:00Z' })] }), today)).toBe('INVOICING')
    expect(derivePhase(facts({ ...shot, invoices: [inv({ status: 'PAID', totalCents: 10_000, amountPaidCents: 10_000 })] }), today)).toBe('OFFBOARDING')
  })
  it('isPaidInFull needs the whole expected amount', () => {
    expect(isPaidInFull({ invoices: [inv({ status: 'PAID', amountPaidCents: 5_000 })], expectedCents: 10_000 })).toBe(false)
    expect(isPaidInFull({ invoices: [inv({ status: 'PAID', amountPaidCents: 5_000 })], expectedCents: 0 })).toBe(true)
    expect(isPaidInFull({ invoices: [inv({ status: 'VOID' })], expectedCents: 0 })).toBe(false)
  })
  it('suggests only later phases, only for active projects', () => {
    const f = facts({ shootStart: '2026-10-01', shootEnd: '2026-10-02' })
    expect(suggestedPhase('PRE_PROD', f, today)).toBe('POST')
    expect(suggestedPhase('POST', f, today)).toBeNull()
    expect(suggestedPhase('OFFBOARDING', f, today)).toBeNull() // never backwards
    expect(suggestedPhase('LEAD', facts({ status: 'LEAD' }), today)).toBeNull()
    expect(suggestedPhase('PRE_PROD', { ...f, status: 'WRAPPED' }, today)).toBeNull()
  })
})

describe('nextStep', () => {
  const now = new Date('2026-11-04T15:00:00Z')
  const base = (o: Partial<NextStepFacts> = {}): NextStepFacts => ({
    status: 'ACTIVE', shootStart: null, proposals: [], invoices: [], callSheets: [], expectedCents: 0, ...o,
  })
  const prop = (o: Partial<NextStepFacts['proposals'][number]> = {}) => ({ status: 'SENT', viewCount: 0, lastViewedAt: null, sentAt: '2026-11-01T00:00:00Z', expiresAt: null, ...o })
  const invoice = (o: Partial<NextStepFacts['invoices'][number]> = {}) => ({ kind: 'PROGRESS', status: 'SENT', totalCents: 2_130_000, amountPaidCents: 0, dueDate: '2026-12-01T00:00:00Z', invoiceNumber: 'INV-0142', ...o })

  it('overdue wins, and money stays out for margin-blind roles', () => {
    const f = base({ invoices: [invoice({ dueDate: '2026-10-23T00:00:00Z' })], shootStart: '2026-11-05' })
    const s = nextStep(f, now, { showMoney: true })
    expect(s).toMatchObject({ tone: 'red', label: 'Invoice overdue 12 days' })
    expect(s.detail).toContain('$21,300')
    const blind = nextStep(f, now, { showMoney: false })
    expect(blind.detail).toBe('INV-0142')
    expect(JSON.stringify(blind)).not.toContain('$')
  })
  it('call sheet within 4 days, unless one is sent', () => {
    expect(nextStep(base({ shootStart: '2026-11-06' }), now, { showMoney: true })).toMatchObject({ tone: 'amber', label: 'Call sheet not sent', detail: 'Shoot in 2 days' })
    expect(nextStep(base({ shootStart: '2026-11-06', callSheets: [{ status: 'SENT' }] }), now, { showMoney: true }).label).toBe('On track')
    expect(nextStep(base({ shootStart: '2026-11-12' }), now, { showMoney: true }).label).toBe('On track')
  })
  it('lead proposal states', () => {
    expect(nextStep(base({ status: 'LEAD' }), now, { showMoney: true })).toMatchObject({ tone: 'grey', label: 'Draft the proposal' })
    expect(nextStep(base({ status: 'LEAD', invoices: [invoice({ status: 'VIEWED' })] }), now, { showMoney: true }).label).toBe('On track')
    expect(nextStep(base({ status: 'LEAD', proposals: [prop()] }), now, { showMoney: true })).toMatchObject({ tone: 'violet', label: 'Proposal sent' })
    expect(nextStep(base({ status: 'LEAD', proposals: [prop({ status: 'VIEWED', viewCount: 3, lastViewedAt: '2026-11-03T00:00:00Z' })] }), now, { showMoney: true }).label).toBe('Proposal viewed 3×')
    expect(nextStep(base({ status: 'LEAD', proposals: [prop({ status: 'VIEWED', viewCount: 4, lastViewedAt: '2026-10-29T00:00:00Z' })] }), now, { showMoney: true })).toMatchObject({ tone: 'amber', label: 'No reply in 6 days' })
    expect(nextStep(base({ status: 'LEAD', proposals: [prop({ status: 'VIEWED', viewCount: 9, lastViewedAt: '2026-10-20T00:00:00Z', expiresAt: '2026-11-06T00:00:00Z' })] }), now, { showMoney: true }).label).toBe('Proposal expires in 2 days')
  })
  it('awaiting deposit, paid in full, archived', () => {
    const won = [prop({ status: 'APPROVED' })]
    expect(nextStep(base({ proposals: won, invoices: [invoice({ kind: 'DEPOSIT' })] }), now, { showMoney: true }).label).toBe('Awaiting deposit')
    expect(nextStep(base({ proposals: won, expectedCents: 100, invoices: [invoice({ status: 'PAID', totalCents: 100, amountPaidCents: 100 })] }), now, { showMoney: true }).tone).toBe('green')
    expect(nextStep(base({ status: 'ARCHIVED', invoices: [invoice({ dueDate: '2026-10-01T00:00:00Z' })] }), now, { showMoney: true }).label).toBe('Archived')
  })
  it('needsAttention = red or amber', () => {
    expect(needsAttention({ tone: 'amber', label: '' })).toBe(true)
    expect(needsAttention({ tone: 'violet', label: '' })).toBe(false)
  })
})
