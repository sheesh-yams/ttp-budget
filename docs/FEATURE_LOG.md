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
  workspaces gets the same role in both. `WorkspaceMember` (roles Phase 1)
  records the right role per workspace; it takes effect when Phase 2
  enforces through `getAccess()`.
- **`requireRole` returns the *home* workspace id** (`user.workspaceId`), while
  `getScopedDb()` uses the *active* one. Gates that write with
  `gate.workspaceId` act on the home workspace when someone has switched.
  Phase 2's `requirePermission` uses the active workspace.
- **7 Clerk orgs have no linked workspace** (e.g. "The Third Place Creative",
  "Crossover Productions"). Found by the roles backfill and skipped.

- **View-only delivery / call sheets use a disabled fieldset,** which also
  disables "Copy link" and the analytics toggle. Drag-to-reorder still moves
  things on screen until a refresh (the server refuses). A proper read-only
  mode in DeliverablesManager / ClientPagePreview / CallSheetEditor would fix
  both. Only custom roles with View hit this; defaults are Edit or None.
- **`getShadeThumbnailUrl` is an open proxy:** an ungated 'use server' export
  that calls Shade with our API key for any asset id. Used by the
  authenticated and public delivery pages. **`recordDeliverableView`** is a
  'use server' export that takes a workspaceId argument; move it to `src/lib`
  (same pattern as the invoice/proposal view recorders).
- **Roles Phase 2 is converting area by area.** Done: budget + overview,
  crew + deal memos, schedule + call sheets + delivery. Still on the legacy role:
  proposals, invoices, actuals, contract, settings/team, and the workspace
  pages. Until an area is converted, a project role can't grant more than the
  legacy role there (tabs and blocks require both).
- **Start from a template needs browse-all.** The budget empty state's picker
  mixes templates and other projects' budgets, so someone with costs EDIT but
  not Producer-level browse can only create a blank budget.
- **Invoice numbers follow the creation year,** not a backdated invoice date
  (`invoice-numbering.ts` keeps one sequence per year). An invoice backdated
  into last year gets this year's number.
- **Editing an invoice during an online checkout:** `settle.ts` charges the
  balance captured when checkout started, then marks PAID. Editing the
  invoice mid-checkout could leave it PAID for a different amount.
- **Invited people get a throwaway personal workspace.** Every sign-up gets
  its own workspace (the `user.created` webhook, or a lazy create if a page
  loads first — "Ashish TEST's Workspace" has no Clerk org). Accepting an
  invite moves them, leaving the empty one behind.
- **Crew page shows edit controls to Collaborators.** Saving is refused by
  the server; roles Phase 2 hides the controls.

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

- **Roles — finish Phase 2 (parked 2026-10-05, user's call):** convert the
  remaining areas, which still say "Not enforced yet" and follow the closest
  built-in role:
  1. Money: proposals, invoices + payments, actuals + receipts, contract
     (~42 legacy checks).
  2. Workspace pages: clients, rolodex, rates/templates/library, contract
     blocks, settings, Stripe, public links, project create/archive (~45).
  3. Team & settings access (Owner-only today) and deal-memo defaults.
  Then cleanup: drop `User.role` and the `ProjectTeamMember.role` slot column
  (small migration), remove the "Not enforced yet" labels, and add a jest
  access matrix.
  Process per slice: access diff → convert → hide controls → review → ship.

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

### 2026-10-05 — Roles Phase 2 (3/n): schedule, call sheets, delivery enforce permissions
- New `src/lib/production-access.ts` (`requireProductionPermission`). It
  resolves a shoot day, scene, schedule, entry, delivery page/section/asset/
  version or call sheet id to its project in the active workspace, then checks
  `schedule` / `callSheets` / `delivery` there.
- **Schedule:** 25 actions. Multi-id actions require one project; shoot-day
  reorder is project-scoped (it was raw by id, across workspaces). Locations
  are workspace-wide but managed through a project (schedule EDIT there). The
  page passes canEdit, and "Create Call Sheet" needs callSheets EDIT.
- **Call sheets:** every action needs `callSheets` EDIT (it was project
  access only). Crew import requires the call sheet's own project's budget.
  Link regeneration moved off the legacy role. View-only gets a read-only
  editor, and the list hides new/delete.
- **Delivery:** 22 actions (EDIT for writes, VIEW for reads). Pages use
  `requireProjectArea(delivery)` instead of the legacy gate; viewers don't
  auto-create a delivery page. Same-page checks were added for section/asset
  moves and reorders (previously ids from other pages were accepted). The
  Delivery tab follows the permission.
- Access diff: 0 member×project changes. All target kinds verified against
  real rows; empty/foreign ids refused.
- pitfall-reviewer found 3 medium cross-project gaps (scene on an entry,
  shoot-day reorder, crew import budget) and 4 low; all fixed except the
  read-only-UI and Shade/view-recorder follow-ups.

### 2026-10-02 — % milestone invoices prefill at the net amount; full invoices include the agency fee
- **Reported:** a 50% milestone still defaulted to a discount row ($37,440 −
  $1,872), even though the approved total ($71,136) already includes the
  discount. A % milestone (and any single-line invoice) is now prefilled at the
  net amount — 50% of $71,136 = $35,568 — with no discount row. Only a full
  invoice itemised from the budget carries the discount: its lines are the
  budget's pre-discount rates.
- **Found while checking:** an itemised "Full invoice" listed the budget's
  lines but not the budget-level agency fee. Daadi would have invoiced $58,656
  instead of $71,136. It now adds an "Agency fee (20%)" line ("Agency fee &
  tax" when the budget has tax) for the gap, so it totals the approved amount.
  Confirmed against the Daadi snapshot (lines $62,400 + fee $12,480 − discount
  $3,744).

### 2026-10-01 — Invoice date (backdating) + double-discount fix
- **Invoice date:** both the new and edit invoice modals have an "Invoice
  date" (Invoice.issueDate already existed, always "now"). The due date keeps
  the usual window from it unless set by hand, and can't be earlier. Payment
  terms are re-derived. Calendar dates are stored at midday UTC
  (`calendarDateToStored`), so the public page no longer shows the day before
  in US timezones (this already affected due dates). The edit modal only
  sends the invoice date when it was changed.
- **Double discount (reported):** a milestone invoice always subtracted its
  share of the budget discount, even when the amount typed was already the
  discounted figure (50% of the post-discount total). Now
  `autoInvoiceDiscount` skips it on an exact match and says so. The discount
  row is visible, editable and removable in both modals.
- **Also fixed:** editing an invoice dropped its discount from the total and
  taxed the pre-discount subtotal. Create, edit and both previews now share
  `calcInvoiceTotals` (tax on subtotal − discount). Create recomputes totals
  server-side instead of trusting the client. An edit can't take the total
  below what's been paid. A rejected create no longer burns an invoice number.
- Data: a read-only check found 0 of 20 invoices with a discount or a
  mismatched total, so nothing to repair.
- pitfall-reviewer found 2 medium (timezone display, total below paid) and
  4 low; fixed except the two logged follow-ups.
- **Needs a manual pass:**
  - The Daadi 50% milestone: type $37,440 and the total stays $37,440, with
    the "already includes the discount" note.
  - Backdate an invoice and check the PDF and the public page.

### 2026-10-01 — Roles Phase 3b: per-person project roles in the Team panel
- The project Team panel is one list. Everyone on a project holds a project
  role, any role can have several people, and a person may hold more than
  one. Each row has a role picker and remove. "+ Add person" picks a role and
  a person. Team member is the default; it adds nothing on top of another
  role and is superseded by one.
- Changes need `projectTeam` EDIT. You can only give, change or take away a
  role that grants nothing beyond your own access on that project (a Project
  Manager can't make someone, or themselves, Account Manager).
- The legacy `role` column is no longer written; its old one-per-slot unique
  index would block a second Account Manager. Chips and the Clients/Proposals
  Account Manager columns now read the project role (earliest holder when
  several), the same rows on today's data.
- Add, change and remove for one person on one project are serialised (a
  transaction advisory lock) and guarded on still-active rows, so "assignment
  iff an active row" holds under concurrent clicks.
- Removed: getProjectTeam, assignProjectTeamRole, unassignProjectTeamRole,
  getProjectOthers, and the team-side add/removeProjectMember. History shows
  role names.
- pitfall-reviewer found 1 high (the unique index), 1 medium (granting beyond
  your own access), then 1 medium + 2 low on re-check (concurrent removes,
  add vs remove, custom roles hidden from history); all fixed. The lock was
  verified against Neon.
- **Needs a manual pass:** open a project's Team panel → + Add person as
  "Vendor coordinator"; change a role; remove. Then sign in as that person.

### 2026-10-01 — Roles Phase 3a: Settings → Roles, role assignment, invites with a role
- **Settings → Roles** (Owner) has two lists, up to 7 each:
  - Workspace roles: project scope, workspace pages, and a baseline for
    inside projects.
  - Project roles.
  Create from any role, rename, edit, and delete if unused. The Owner role is
  locked; built-in roles can't be deleted. Areas not yet converted are
  labelled "Not enforced yet". Logic lives in `src/lib/role-admin.ts`, with
  thin `'use server'` wrappers in `roles.ts`.
- **Safety for unconverted checks:** a member's legacy `User.role` =
  `legacyRoleFor(role)`. That's Owner only for the Owner role, Producer only
  if at least Producer-open, else Collaborator, so a custom role never gets
  more than it grants anywhere. Editing a role re-syncs its members.
  Accepting an invite uses the role as it is then. The editor warns when an
  edit to a built-in role would lower that.
- **Team page:** per-member dropdowns of workspace roles, and invites pick
  one (the email shows its name). You can't change your own role. The last
  Owner can't be demoted, with Owner rows locked FOR UPDATE so concurrent
  demotions serialise. `changeMemberRole` is removed. Team listings are now
  gated (they were callable by anyone).
- **Project scope is enforced:** `requireProjectAccess` / `checkProjectAccess`
  use the workspace role's ALL/ASSIGNED scope. The overview's leftover legacy
  assignment check is gone.
- The webhook's same-workspace branch is create-only, so it can't clobber an
  accepted invite's custom role.
- Managing roles needs Team & roles EDIT and the legacy Owner role while
  Settings, Team and the nav are still Owner-gated.
- pitfall-reviewer found 1 medium (an invite keeping a stale legacy role) and
  2 low (the concurrent last-Owner race, Producer edits demoting); all fixed
  and DB-verified, including a real concurrent demotion.
- **Needs a manual pass:**
  - Settings → Roles: create "Vendor coordinator" from Collaborator; set
    Crew + Deal memos to Edit under project areas.
  - Team: switch a member's role. Invite with a custom role.
  - Project roles per person arrive in 3b.

### 2026-10-01 — Roles Phase 2 (2/n): crew + deal memos enforce permissions
- The vendor-coordinator case: a project role with crew and deal memos Edit
  manages vendors on that project without seeing the budget's money.
- **Deal memos:**
  - Every memo action resolves the memo to its project, then needs
    `dealMemos` EDIT; creating a bid needs it too.
  - Without `budget.costs` the bid's day rate prefills from the person's own
    rate, not the budget line.
  - The board and editor need `dealMemos` VIEW. Budget comparisons (line rate,
    budgeted, vs budget, "Use the budget rate") are stripped server-side
    without `budget.costs`, and edit controls hide without EDIT.
  - Workspace deal-memo defaults stay on the legacy role until the settings
    slice.
- **Crew:**
  - Reads need `crew` VIEW. Add and seed need `crew` EDIT. Update, remove and
    dismiss verify that the member belongs to the project the client named,
    which nothing checked before.
  - What crew are paid follows `dealMemos`: rates are stripped on read, kept on
    save when hidden, and their inputs hidden. Budget-seeded "Unassigned"
    placeholder rates also need `budget.costs`.
  - Viewers no longer trigger auto-seeding.
- **People search for project staffing** (user decision): without Rolodex,
  crew or deal memos Edit on a project allows searching names and roles only,
  with no email match. Email, phone and rate are filled in server-side when
  someone is added, and only for those names-only callers. Rolodex users are
  unchanged.
- pitfall-reviewer found 4 issues, then 4 more on re-check (an Owner
  email/phone refill regression, email probing, a placeholder rate wipe, the
  add-then-read route). All fixed except add-then-read, which is by design:
  people on your project show their details.

### 2026-10-01 — Roles Phase 2 (1/n): budget + overview enforce permissions
- Asked for: a Collaborator on a project saw the budget down to rates and
  line totals. Now the default Collaborator sees lines, quantities and units
  with no money. Project roles can grant costs or margin per project.
- **Writes:** every budget/section action (`budgets.ts`, `sections.ts`,
  `importToBudget`) now goes through `requireBudgetPermission`
  (`src/lib/budget-access.ts`). It resolves any line, account, phase, section
  or budget id to its project in the ACTIVE workspace and checks:
  - `budget.lines` for structure
  - `budget.costs` for rates, packages, imports and template starts
  - `budget.margin` for fee, tax and discount
  - `overview` for the proposal overview text
  - `proposals` for the primary version and option tabs

  `upsertLineItem` keeps stored rate and markup when the caller can't edit
  them. Cloning another project's budget needs Producer-level browse
  (`canBrowseAllBudgets`). Empty ids are refused.
- **Reads:** `stripBudgetForAccess` zeroes rates and rate cards, and drops
  tax, without costs; without margin it strips fee and discount. It's applied
  on the budget page and the overview. The overview's priced preview, money
  blocks, the editor's columns and inputs, the line modal and the bulk bar
  each follow their own area. Project tabs follow permissions; crew,
  schedule and call-sheet pages check their area. Grid and dashboard money
  follow `dashboardMoney`; ASSIGNED scope filters the lists.
- **Access diff before shipping:** only darkustigrus × Sheeshyams changed
  (costs View → None). The user kept Collaborator call sheets on Edit, and
  the 11 stored Collaborator roles were updated with AuditEvents.
- pitfall-reviewer found 2 medium + 4 low issues, then 3 low on re-check:
  - clone scope
  - actuals summary
  - empty-id gate
  - multi-project moves
  - dead buttons
  - clone margin

  All fixed except the template-start follow-up.
- **Needs a manual pass:** as the test Collaborator on Sheeshyams, the budget
  and overview should show lines without $. As an Owner, nothing changes.

### 2026-10-01 — Call sheets and comments check project access
- All 8 call-sheet actions (via `getOwnedSheet`, `importCrewFromBudget`,
  `createCallSheet`) and `addProjectComment` only checked the workspace. A
  Collaborator could edit, send, finalize or delete call sheets — or comment —
  on projects they aren't assigned to. Now `checkProjectAccess` is required,
  with the same "not found" message. Collaborators still work on their
  assigned projects' sheets; roles Phase 2 applies the `callSheets` level.

### 2026-10-01 — Roles Phase 1: workspace roles + project roles (data model, no behaviour change)
- Migration `20261001000001_workspace_and_project_roles`: `WorkspaceRole`,
  `WorkspaceMember`, `ProjectRole`; `ProjectTeamMember.projectRoleId` (legacy
  `role` slot now nullable); `WorkspaceInvitation.roleId`.
- **Model** (decided with the user): workspace role = workspace pages +
  project scope (all / assigned) + a baseline for inside projects; project
  role = per person per project. Effective = max(baseline, project roles),
  then caps (costs ≤ lines, margin ≤ costs). Owner always full.
- `src/lib/permissions.ts`: catalog, presets, rules (jest). The Collaborator
  preset is lines without money — the one intended change from today, applied
  when Phase 2 enforces.
- `src/lib/access.ts`: `getAccess` / `getProjectAccess` /
  `requirePermission` / `requireProjectPermission`. Nothing enforces through it
  yet. It falls back to `User.role` presets without a membership.
- `src/lib/roles.ts`: system role seeding, plus a membership mirror on every
  join, role change, removal, leave, create and lazy sign-up.
- Everyone on a project now has a project role. "Also on this project"
  people are "Team member" rows, and a replaced or unassigned holder who
  keeps access becomes one.
- Removing a workspace member now also drops their project access.
- The workspace purge cron clears team rows first: their User FK has no
  cascade, so purging any workspace with a team failed.
- Backfill `scripts/backfill-roles.ts` **applied 2026-10-01** (user-approved):
  - roles seeded in 11 workspaces
  - 12 memberships (including the Owner one in "A NEW SPACE" from Clerk admin)
  - 11 team slots mapped
  - 1 Team member row
  - 35 AuditEvents
  The parity script confirmed memberships match `User.role`, the resolver
  equals today's `requireRole` outcomes, and every assignment has an active
  team row.
- pitfall-reviewer found 5 issues (replaced-holder access, removed members'
  leftover assignments, backfill timeout, purge FK order, history noise); all
  fixed and DB-verified.

### 2026-10-01 — Invite fixes, rolodex hidden from Collaborators, more people per project
- **Invite flow:**
  - The invite page labelled every non-Owner as "Producer"; it now shows the real role.
  - A new account was asked to create its own org: Clerk's choose-organization step
    took over before the invite redirect. `ClerkProvider taskUrls` now routes that
    step to `/join`, which sends anyone with a pending invite to it. Accepting
    makes the joined workspace active (`setActive`).
  - Accepting now requires a verified email matching the invite. Before, anyone
    with the link could join with the invited role.
  - The mobile sign-in redirect keeps the return URL.
- **Rolodex is Owner/Producer only:** nav, both pages (jest-guarded with the
  other Owner/Producer sections), every rolodex read action, and the call-sheet
  editor's contact picker.
- **Project team:** an "Also on this project" list under the 3 named roles, with
  + Add person (any workspace member) and remove. It's backed by
  `ProjectAssignment`, which is what gives a Collaborator access. This replaces
  the overview's separate "Assign" button. Team reads now check project access.
- No migration. pitfall-reviewer found 2 issues (call-sheet contacts leak,
  mobile redirect query); both fixed.
- **Needs a manual pass:**
  - Invite a fresh email. Sign-up should land on the invite (not "create
    organization"), then on Accept go to the dashboard in that workspace.
  - Signing in with another email should show the mismatch message.
  - Collaborator: no Rolodex. Team modal: + Add person.

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
