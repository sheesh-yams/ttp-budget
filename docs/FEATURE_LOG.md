# SlateSuite feature log

What shipped, the decisions behind it, and what's still open. Newest first.
Append an entry after every feature or notable fix (see `/feature`, step 9).

**Last health check:** 2026-09-30 (initial run of `scripts/health-data-checks.ts`,
2 findings — both listed under follow-ups).

---

## Open follow-ups

Bugs and gaps noticed but deliberately left out of scope. Pick these up in a
`/health-check` or when working nearby.

- **Role is per user, not per workspace.** `User.role` follows the user's
  current home workspace (invites move it), but the active workspace comes
  from the Clerk org and there's a `WorkspaceSwitcher`. A user in two
  workspaces gets the same role in both. Fixed by roles Phase 1
  (`WorkspaceMember`).

- **Invoice first view counted twice.** `recordInvoiceView`
  (`src/server/actions/invoices.ts`) flips SENT/OVERDUE → VIEWED with one
  `updateMany`, then a second `updateMany` on `status notIn [SENT, OVERDUE]`
  matches the same row and increments again. Fix the same way
  `recordProposalView` was fixed in fe6d9e2.
- **View recorders are public RPC endpoints.** `recordProposalView` and
  `recordInvoiceView` are exported from `'use server'` files and take a raw id
  with no token check, so anyone can inflate view counts or move SENT → VIEWED.
  Move them to `src/lib` and call them only from the token pages. (Low —
  found by pitfall-reviewer.)
- **Concurrent won-effects can duplicate team placeholders.** A client
  e-signing while a producer marks Won manually runs two reconciles that both
  read the team before either writes. `updateProposalStatus` also re-runs the
  effects when a proposal is already APPROVED. (Low — found by pitfall-reviewer.)
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
- **Deal memo Phase 1 unclicked in a browser:** board, bid dialog, memo
  editor, vendor preview, Settings → Contracts vendor tab + defaults panel,
  crew pills, rolodex history, Actuals "Deal memo" tags + Unbudgeted group.
- **Budget lines without a formula count quantity as headcount** (`2` = 2
  people × 1 day), the same as the team reconcile and the PDF. A 2-day solo
  line should be entered as `1x2` for deal memo days to prefill correctly.
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

### 2026-10-01 — Roles Phase 0: close Collaborator read leaks
- First step of configurable roles (plan: Phase 1 data model + resolver,
  Phase 2 permission enforcement, Phase 3 Settings → Roles UI). No migration.
- Writes were already gated (179 Owner/Producer, 17 Owner). Reads weren't. A
  Collaborator could see:
  - the dashboard money, every invoice and proposal, clients, actuals,
    receipts, the wrap-report PDF and rate cards
  - any project's tabs by URL
- **Fix:**
  - `src/lib/project-access.ts` — `requireProjectAccess` (assignment-aware)
    on every `projects/[id]` page, with a jest coverage test so a new tab
    can't skip it.
  - `requireFinancialPageAccess` on the money pages and tabs.
  - Read actions gated: actuals, wrap, receipts, invoice send data, payment
    config (now `select`ed), merge-tag context, packages, rate-card search,
    project activity, crew list.
  - The dashboard and project grid stop *fetching* money for Collaborators.
  - The overview stops sending proposals, invoices and client contact info.
  - Crew rates and rolodex project history are filtered to assigned
    projects, with rates stripped. Contact default/kit rates are stripped
    from every rolodex read.
  - Nav hides dead links.
- **Also fixed:** the call-sheet page rendered another project's sheet if
  given its id, and its `generateMetadata` read titles by id across
  workspaces.
- pitfall-reviewer found 7 further leaks after the first pass, and 1 more
  (contact rates) on re-check; all closed.
- **Needs a manual pass:** log in as a Collaborator — the sidebar and project
  tabs should hide money pages, an unassigned project URL should 404, and the
  dashboard should show assigned projects with no Value column.

### 2026-09-30 — Deal memos, Phase 1 (bids → confirmed memos → crew + actuals)
- Migrations `20260930000001_deal_memos` and `20260930000002_actual_entry_ownership`.
- **Model:** a bid *is* a draft deal memo. Several BIDs per budget crew line
  are compared on `/projects/[id]/deal-memos`. Awarding flips one to CONFIRMED
  (compare-and-set, headcount-capped, other bids closed when the line fills)
  and fills the crew slot: same person + role → else the "Unassigned"
  placeholder → else a new member (`src/lib/deal-memo-effects.ts`).
- **Internal vs external:** vendors only ever see `toVendorDealMemo`
  (`src/lib/deal-memo-vendor-view.ts`), a whitelisted DTO. Role label, budget
  links, internal notes and client rates can't leak by construction.
  Owner/Producer only.
- **Terms:** Settings → Contracts has Client / Crew & vendor tabs
  (`ContractBlock.audience`). Every proposal-side read filters CLIENT. Memo
  defaults (10/12-hour day, OT rules, zone, per diem, mileage, the 5 standard
  fee rows) live in `Workspace.dealMemoDefaults`.
- **Actuals:** the pure planner `src/lib/deal-memo-actuals.ts` runs on sheet
  create and on every Actuals load. Day rate/OT land on the role line, kit on
  the person's kit line, and anything else — or any fee — on a budget line
  chosen per fee (e.g. stylist kit → Wardrobe). Unmapped fees become
  unbudgeted rows under the role's account. Amounts the user typed or
  receipts set (`amountUserOwned`) are never overwritten, including a $0.
- **Prefill rule:** a bid's day rate starts from the budget line rate — that's
  the planned cost; the agency fee/markup sits on top. Falls back to the
  person's rolodex rate when unbudgeted. Fee terms are stored as merge-tag
  templates but shown filled in (editing replaces the template).
- **Also fixed:** `updateActualEntry` / `deleteAdHocEntry` wrote by entry id with
  no workspace check; the Actuals editor silently hid unbudgeted rows with no
  account (now an "Unbudgeted" group).
- pitfall-reviewer found 7 issues pre-ship (user $0 overwritten, receipts
  overwritten, FLAT quantity inflation, stale-line writes, duplicate race,
  cross-role crew clobber, over-award) — all fixed and DB-verified.
- **Phase 2 (not built):** vendor e-signature via a public `/dm/[token]`
  page, the approve-route pattern, a PDF and email.

### 2026-09-30 — Agent protocol + signing audit-trail hardening
- `CLAUDE.md`, `/feature`, `/health-check`, `pitfall-reviewer`, this log, and
  `scripts/health-data-checks.ts` (6fdd465).
- First pitfall-reviewer run (on fe6d9e2) found that a failure in the new
  post-approval side effects could skip the signature AuditEvent and owner
  email after the approval had committed. Those effects are now non-fatal.

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
