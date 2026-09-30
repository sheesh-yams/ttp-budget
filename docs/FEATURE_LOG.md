# SlateSuite feature log

What shipped, the decisions behind it, and what's still open. Newest first.
Append an entry after every feature or notable fix (see `/feature`, step 9).

**Last health check:** 2026-09-30 (initial run of `scripts/health-data-checks.ts`,
2 findings — both listed under follow-ups).

---

## Open follow-ups

Bugs and gaps noticed but deliberately left out of scope. Pick these up in a
`/health-check` or when working nearby.

- **Invoice first view counted twice.** `recordInvoiceView`
  (`src/server/actions/invoices.ts`) flips SENT/OVERDUE → VIEWED with one
  `updateMany`, then a second `updateMany` on `status notIn [SENT, OVERDUE]`
  matches the same row and increments again. Fix the same way
  `recordProposalView` was fixed in fe6d9e2.
- **"Sheeshyams Project Testing" is LEAD with an APPROVED proposal.** Same
  e-signature gap fixed in fe6d9e2. Test project — ask before changing.
- **Hulu Summer Sizzle proposal:** `approvedAt` set but status VIEWED. Ambiguous
  (last write wasn't a view; project archived). User chose to leave it.
- **Restored proposals skipped team reconciliation.** Daadi v2, Chopstx v2 and
  PMH were set back to APPROVED directly (fe6d9e2 backfill). Re-marking Won from
  the Status dropdown runs it if wanted.
- **Draft invoices can't be previewed.** `/i/[token]` 404s for DRAFT, so there's
  no way to see the client view before sending. The proposal overview's
  in-app `ProposalPublicView isDraft` preview is the pattern to copy.
- **Local `next build` never completes.** Resend is constructed at module load
  and throws without `RESEND_API_KEY`, so page-data collection fails locally.
  Lazy-initialising the client would make build a full verification step.
- **Toast system deferred.** Inline success feedback everywhere for now; a
  shared Sonner/Radix toast would standardise it.
- **Dead code:** `sendProposal` / `createProposal` in `proposals.ts` are
  unreferenced — delete.
- **Never clicked through in a browser** (agent sessions have no login):
  proposal option tabs + PDF sequential options, option-visibility switch,
  proposal overview version dropdown + full-screen preview, dashboard KPI links.

## Backlog (requested directions)

Run each through `/feature`. Check the overlap first:
- **Deal memos** — likely extends project members/crew (roles, rates, days, kit
  fees already exist) plus the e-signature + PDF patterns from proposals.
- **Vendor tracking** — check rolodex contacts and receipts/actuals before adding
  a model; vendors may be a contact type plus spend rollups.
- **Contracts** — proposal contract sections + contract library already exist
  (`ContractTab`, frozen `contractSnapshot` on signing). Standalone contracts
  should reuse that, not fork it.

---

## Shipped

### 2026-09-30 · fe6d9e2 — Signed proposals no longer revert on re-open
- Root cause: `recordProposalView` set `status: 'VIEWED'` on every public view,
  downgrading APPROVED/DECLINED/LOST/CHANGES_NEEDED. Now only SENT → VIEWED.
- E-signature now runs the same won effects as manual "Won" (Lead → Active, team
  reconcile) via `src/lib/proposal-won.ts`; public route uses `scopedDbFor()`.
- Backfill: 3 proposals restored to APPROVED with AuditEvents; Daadi project → Active.

### 2026-09-29 · 588d9cb — Money shows real cents
- `formatMoney` shows two decimals when cents are non-zero, none otherwise.
  Local whole-dollar formatters removed. Display only — stored cents were always right.

### 2026-09-18 · 23664ff — Dashboard QoL
- Recent projects Value column wired to primary-phase gross total (was a literal "—").
- Proposals-sent and Outstanding-invoices KPI cards link to their pages.

### 2026-09-18 · 14da093 — "Mark as sent" confirm said Delete
- `useConfirm` defaults `confirmLabel` to "Delete"; passed "Confirm". Only offender.

### 2026-09-18 · b80e24f — Active project cards show Budget / Paid
- Active-status branch never looked at payments. Now Budget (gross) + Paid
  (sum of PAID invoices) with a checkmark when paid in full.

### 2026-09-17 · df200fb — Edit/preview any budget version's overview
- Version dropdown, "Make primary", full-screen `ProposalPublicView isDraft`
  preview on the Proposal Overview card. No new actions or queries.

### 2026-09-17 · cdfb7bf, 2adc9e8 — Client-facing proposal option tabs
- `Phase.showAsProposalOption` (migration `20260917000002`). Options are phases
  of one budget, frozen at send in `content.proposalOptions`; top-level content
  stays the primary for backward compatibility. Approving a non-primary option
  records its total and promotes it to primary. PDF renders options in sequence.
- Switch state is derived from persisted flags (2adc9e8) so it survives refresh.

### 2026-09-17 · 2bbc9cf, f88f6e9 — Clone budget from an existing budget
- `Budget.clonedFromBudgetId` (migration `20260917000001`), rate-refresh preview,
  single-transaction clone. Picker lives on the budget page, not NewProjectModal.

### 2026-08-20 · 4266deb — Invoice terms label matches the chosen due date
- `deriveInvoicePaymentTerms()`; backfilled 6 invoices.

### 2026-08-11 · 0cc0d88 — Mark invoice as sent without emailing
- Split send button (icon + chevron menu) on all three invoice tables; inline
  success state instead of a toast.

### 2026-07-31 · aefa018 — Proposal breakdown double-counted the agency fee
- `productionCents` in the snapshot is now pre-fee. The invoice-side version
  (e9af7de) was reverted (78a9ed1): invoices must not strip the fee.
