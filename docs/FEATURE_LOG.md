# SlateSuite feature log

What shipped, the decisions behind it, and what's still open. Newest first.
Append an entry after every feature or notable fix (see `/feature`, step 9).

**Last health check:** 2026-09-30 (initial run of `scripts/health-data-checks.ts`,
2 findings — both listed under follow-ups).

---

## Open follow-ups

Bugs and gaps noticed but deliberately left out of scope. Pick these up in a
`/health-check` or when working nearby.

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
- **Roles Phase 2 is converting area by area.**
  - Done: budget and overview; crew and deal memos; schedule, call sheets
    and delivery; money (proposals, invoices, actuals, contract, and the
    /proposals and /invoices lists).
  - Workspace pages (clients, rolodex, rates/templates/library, settings,
    projects) shipped in 2b.
  - Team & roles and the last UI flags shipped in 2c. The legacy role was
    removed from the code in the cleanup (`20261005000003_drop_legacy_roles`
    drops the columns once that deploy is live). **Roles are done.**
- **Actuals sync runs for view-only users too.** `syncActualSheetEntries`
  runs on every Actuals page load. It adds $0 entries for new budget lines
  (now validated against the sheet's phase) and refreshes deal-memo
  prefills, so a View user's page load writes. The writes are idempotent and
  only use server data, but moving the sync into `src/lib` and running it on
  edit would be cleaner.
- **Call-sheet "Sync to Rolodex?" fails silently without Rolodex Edit.**
  `CrewEditor` and `TalentEditor` ignore `patchContactField`'s result. This
  was already true before 2b. Hide the prompt, or show the error.
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
  1. ~~Money~~ (shipped 2026-10-05, roles 2a).
  2. ~~Workspace pages~~ (shipped 2026-10-05, roles 2b).
  3. ~~Team & roles~~ (shipped 2026-10-05, roles 2c).
  ~~Then cleanup~~ (shipped 2026-10-05). The drop SQL runs after that
  deploy.
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

### 2026-10-07 — Mobile: project overview fits a phone
- **Reported:** on a phone, the overview's five money figures ran into each
  other and the proposals table was squeezed.
- **Money figures:** below md, Project total spans the full width, then
  Billed / Spent and Profit / Margin sit two to a row. They're five across
  from md as before.
- **Header:** the action buttons wrap, and the title is smaller on phones.
- **Proposals:** below md the table keeps Title, Status and actions. Created,
  Valid through and Signed by are hidden.
- **Invoices:** below md the table keeps Invoice, Status, Total and actions.
  The due date moves under the title, and Paid is hidden. The invoice number
  no longer breaks across lines.
- **`BudgetReadOnly`** (overview breakdown and public proposal):
  - Long account names wrap instead of pushing totals past the card edge.
  - The expanded line-item table scrolls sideways inside its own box.
- **Verified:**
  - tsc, jest, lint, and build up to the known Resend step.
  - A throwaway copy of the overview page, with stubbed access and deleted
    afterwards, rendered Daadi's real data at 375×812. Nothing overflows
    the screen, apart from the closed off-screen notes drawer.
- **Follow-up:** the overview passes Prisma `Decimal` line quantities to
  `BudgetBreakdown` (a client component). Dev logs "Only plain objects…"
  for each line. This was already the case and works in production;
  serialize the quantities to numbers to silence it.

### 2026-10-07 — Mobile, phase 2: project tab bar, and fixes from the first phone test
- **Reported** (screenshots from a phone):
  - KPI numbers overflowed their cards on the dashboard and on Projects.
  - Inside a project, the side menu still took half the screen.
  - The deal memo editor was still unusable.
- **Stat cards:**
  - Dashboard KPIs are 2-up on phones, with smaller numbers.
  - The Recent projects table becomes cards: name with client and type,
    value and status.
  - The Projects metrics hide their icon below sm, and labels wrap instead
    of truncating.
- **Project tab bar (Option B)** (`ProjectMobileNav.tsx`):
  - Below md the project side column is hidden.
  - A dark header strip shows "‹ Projects" with the client and project
    name.
  - A bottom bar has Overview · Pre-prod · + · Money · Delivery.
    - Each group opens a sheet with its sections.
    - "+" creates a deal memo, call sheet or receipt on this project,
      offering only what this person can edit.
  - The app's own tab bar steps aside on `/projects/[id]/*`.
  - `projectNavSections` / `isProjectNavActive` are shared with the desktop
    `ProjectSubNav`, so permission filtering is identical.
- **Deal memos on phones:**
  - **Board:** one card per bid (rate · expected · vs budget, status,
    actions) instead of the table. The role headers stack.
  - **Editor:** the base grid is `grid-cols-1`. Before, a long "Actuals"
    option widened the page to 503px on a 375px phone.
  - **Editor layout:**
    - The memo comes before the internal panel on phones.
    - Dates sit two to a row.
    - Fee rows are two-column.
    - Section headers wrap.
    - Remove-fee is always visible on touch screens, unless read-only.
- **Desktop:** unchanged at md and wider.
- **Verified:**
  - tsc, jest, lint, and build up to the known Resend step.
  - A throwaway public preview route, deleted afterwards, rendered the real
    Daadi deal memo board and editor (read-only) at 375×812. Scroll width
    went from 503px to 375px.
  - The editor was also checked at 1280px.
  - pitfall-reviewer: 3 low findings, all fixed. Desktop row gap, the
    internal panel reordering only below md, and no remove-fee for
    read-only viewers.
- **Next (phase 3):**
  - The phone draft flow for deal memos.
  - Phone layouts for the remaining project pages: overview, schedule,
    call sheets, budget.

### 2026-10-07 — Mobile, phase 1: the shell (no sidebar on phones)
- **Before:** on a phone the 200px sidebar took about half the screen on
  every page.
- **Below md (768px)** (`src/components/layout/MobileNav.tsx`):
  - The sidebar and the desktop top bar are hidden.
  - **Top bar:** a slim dark bar with the workspace switcher.
  - **Bottom tab bar:** Home · Projects · **+** · Money · More.
    - Money opens Invoices, or Proposals for a role with only Proposals.
    - The Money tab is hidden for roles with neither.
  - **"+" sheet:** create a deal memo, call sheet or receipt on the project
    you last opened. It's remembered per workspace in localStorage by
    `RememberProject`, together with the Edit rights there, and only those
    rows are offered. Also:
    - Invoice → `/invoices?new=1`, which opens the invoice-first modal.
    - Project → `/projects?new=1`, which opens the new-project modal.
  - **More:** slides up from the bar with the rest of the sidebar links,
    filtered by the shared `visibleNavGroups`, plus the user and sign-out.
- **Layout details:**
  - The auth layout exports `viewport` (`viewport-fit=cover`) for
    safe-area padding.
  - Height is `100dvh`.
  - Padding is `p-4` on phones with room for the tab bar, and `p-6` from md.
  - The project layout and schedule editor margins were updated to match.
- **Fixed-position bars moved above the tab bar on phones:** the budget
  totals bar (it was offset 200px for the sidebar) and the call sheet's
  "Save changes" button.
- **Desktop is unchanged,** apart from the top bar's "New project", which
  now opens the modal instead of only going to /projects.
- **Decisions:**
  - Option B for project pages, a project-level tab bar, comes in phase 2.
  - The desktop deal memo editor stays as it is; phase 3 adds a phone draft
    flow.
  - The mockups are in `docs/mockups/mobile.html`.
- **Verified:**
  - tsc, jest, lint, and build up to the known Resend step.
  - A throwaway public preview route of the shell at 375×812, deleted
    afterwards: tab bar, "+" sheet with and without a remembered project,
    More sheet.
  - pitfall-reviewer: 4 findings, all fixed. Rows hidden without
    permission, sheets close on same-page links, Invoice shown only to
    those who can create one, fixed bars offset.
- **Follow-ups:**
  - If the remembered project is deleted or access is lost, the "+" rows
    404 until another project is opened.
  - The project sub-nav still shows as a side column on phones until
    phase 2.

### 2026-10-06 — Invoice-first billing: new project from an invoice, or bill added scope
- **Before:** an invoice needed a project, a budget and a proposal first. A
  last-minute job already done took five steps, and there was no way to bill
  extra scope on a won project.
- **New invoice** (on /invoices and on a project's Invoices page),
  `NewStandaloneInvoiceModal` → `createInvoiceFirst`
  (`src/server/actions/invoice-first.ts`):
  - **New project:** in one transaction, creates the client (if new), an
    ACTIVE project, a budget built from the invoice lines, an APPROVED
    proposal at the invoice total (dated the invoice date, one 100% "Full
    payment" milestone), and the invoice. Then the usual won effects.
    - The budget has a 0% fee and the invoice's tax and flat discount, so
      the project's value equals the invoice. The action refuses to commit
      if the two totals differ.
    - New-project tax allows at most 2 decimals (the budget stores tax to
      4 decimals as a fraction).
    - Needs Projects edit plus Budget costs, Proposals and Invoices edit on
      a new project (`canCreateProjectFromInvoice`). Owners always qualify.
  - **Existing project:** any project you can invoice, including ones
    without a proposal. On a won project the invoice is **added scope**
    (`Invoice.isScopeAddition`). There's an opt-out checkbox for re-issuing
    part of the agreed total.
  - **Create & send** opens the usual send dialog.
- **Added scope counts toward the project's value:**
  - `src/lib/project-value.ts`.
  - Where: project cards ("Total"), outstanding, Won this/last quarter, the
    dashboard value, the project's "Approved Amount" and the project
    invoices header.
  - It's tagged "Added scope" in the three invoice lists.
  - Milestone amounts and the actuals burn stay on the budget alone.
- **Exact tax rounding at half cents:**
  - `calcBudgetTotals` and `calcInvoiceTotals` now round tax in integer
    basis points.
  - Before, $30.00 at 7.25% came to 217¢ in the budget but 218¢ on the
    invoice, a float error (found in review).
  - No existing budget or invoice has tax, so no stored or displayed number
    changed.
- **Also:**
  - A single-milestone payment schedule now matches its invoice; before, a
    100% milestone never matched because its kind is FINAL.
  - Shared builders: `buildBudgetSnapshot` / `buildProposalContent`
    (`proposal-snapshot.ts`), `buildInvoiceCreateData`
    (`invoice-create.ts`), and the invoice line editor (`InvoiceLineRows`).
    `generateInvoiceNumber` takes a transaction client, so a rolled-back
    create doesn't burn a number.
- **Migration:** `20261006000001_invoice_scope_addition` (one boolean,
  default false).
- **Verified:**
  - jest: value math, budget equals invoice across rates and amounts, and
    the permission rule.
  - A real-DB run on temporary workspaces, all cleaned up, covering:
    - the new-project golden path
    - added scope and voiding it
    - a project that isn't won
    - another workspace's client or project returning Not found with
      nothing created
    - rollback mid-transaction
    - an assigned-only creator
    - the re-issue opt-out
  - pitfall-reviewer: 4 findings, all fixed.
- **Follow-ups:**
  - Editing an invoice-first invoice's amount doesn't update the budget or
    the approved total. That matches how other invoices relate to their
    budget, but here the value was meant to equal the invoice.
  - `createInvoice` (from a proposal) doesn't check that `clientId` belongs
    to the project. The client always passes the project's own client
    today.

### 2026-10-06 — Removing a member who's already gone from Clerk
- **Bug (user report):** removing "Ashish TEST" (darkustigrus@gmail.com)
  failed with "Failed to remove member from workspace."
  - The account had already been removed from the Clerk org in the
    dashboard, so `deleteOrganizationMembership` threw and the removal
    stopped before deleting the SlateSuite membership.
- **Fix:** when the Clerk removal fails, re-check real org membership
  (`stillInClerkOrg`). If they're already out, finish the removal.
- **Related, open:** Anjali is now in the Clerk org but has no DB user and
  her invite is unaccepted. Neither her `user.created` nor her
  `organizationMembership.created` webhook created her, so Clerk webhooks
  may not be reaching the app. Check the Clerk → Webhooks message attempts
  and Railway logs. Re-opening the invite link now completes the join (the
  accept upserts the user).

### 2026-10-06 — Invites: clear "member limit" errors; accepting works without the sign-up webhook
- **Bug (user report):** Anjali's invite to The Third Place said "Failed to
  accept invitation".
  - **Root cause:** the Clerk org has `maxAllowedMemberships = 5` and
    already had 5 members, so `createOrganizationMembership` was refused
    and the generic error was shown.
  - **A second gap:** she had no DB `User`. Her `user.created` webhook
    hadn't created one (no personal org exists in Clerk either), so the
    accept's `user.update` would have failed next.
- **Fix:**
  - Invite and accept check the org's member cap first (`clerkOrgIsFull`)
    and say "has reached its member limit" plainly.
  - Accept upserts the DB user (from Clerk) straight into the invited
    workspace when missing, then writes the membership. The membership
    write now throws instead of swallowing errors.
- **Open:** raising the org's member limit is a Clerk setting (the user's
  call). The reason her `user.created` webhook didn't run needs the Railway
  logs or Clerk webhook attempts.

### 2026-10-05 — Roles cleanup: the legacy fixed role is gone
- **Removed from the code and `schema.prisma`:** `User.role`,
  `WorkspaceInvitation.role`, `ProjectTeamMember.role` (the old team slot)
  and the `UserRole` / `ProjectTeamRole` enums.
  - Helpers deleted: `requireRole`, `getCurrentRole`,
    `requireProducerPageAccess`, `stripBudgetForRole`, `canSeeFinancials`,
    `legacyRoleFor`, `legacyRoleForInvite`, `legacySlotGrant`,
    `LEGACY_TEAM_SLOT_KEY`, `ENFORCED_*`, plus the Roles screen's "Not
    enforced yet" labels and legacy preview.
  - `SystemRoleKey` replaces `UserRole`.
  - Membership helpers take `fallback` (a built-in role key) plus an
    optional `roleId`.
- **One source of truth:** WorkspaceMember → WorkspaceRole, and
  ProjectTeamMember → ProjectRole.
  - With no membership, `getAccess` gives no access. The legacy-role
    fallback is gone.
  - The Clerk org role follows the role's `systemKey`: Owner is
    `org:admin`.
  - The Team page and project team screens show workspace role names.
- **Sign-up made atomic:** the Owner membership is written in the same
  transaction as the new workspace and user (Clerk webhook and the lazy
  path in `auth.ts`), because it's now the only thing that grants access.
  The invite-join webhook's membership write throws, so Clerk retries.
- **Join role is consistent:** an invite whose role was deleted joins as
  Collaborator in both the webhook and `acceptInvitation`, matching the
  invite page. Dashboard-added members with no invite still join as
  Producer, as before.
- **Tests:** a new jest **access matrix** (`access-matrix.test.ts`):
  - Owner/Producer/Collaborator × every workspace and project area
  - project roles on a Collaborator
  - the custom-role rules (view the budget plus edit deal memos and
    actuals; dependency caps; actuals needs costs)
  - Legacy tests were deleted, and budget-visibility tests moved to
    `stripBudgetForAccess`.
- **Verified:**
  - An access snapshot before vs after, 1,732 cells (every member ×
    workspace and project area): **0 differences**.
  - A read-only Clerk audit: all 7 org memberships across the 3 linked
    workspaces have a membership row.
  - DB checks (sign-up, invite, join, deleted-role join, re-role, team row,
    atomic sign-up rollback) against today's columns.
  - tsc, jest 321, lint, `next build` compile.
- **Obsolete one-off scripts deleted:** `backfill-roles`,
  `fix-invited-user`, `fix-sara-workspace`.
- **pitfall-reviewer:** deploy safety confirmed. Its 4 findings (Clerk-only
  members, non-atomic sign-up membership, inconsistent deleted-role join,
  stale scripts) are all addressed.
- **Migration** `20261005000003_drop_legacy_roles` (destructive) drops the
  three columns and two enums. Run it only after this deploy is live.

### 2026-10-05 — Roles Phase 2c: Team & roles on permissions (Phase 2 complete)
- **Team & roles now follows the `team` permission on the ACTIVE
  workspace.** Before, `requireTeamAdmin` also required the legacy
  home-workspace Owner role.
  - View (`requireTeamViewer`) lists members, invites and roles. Edit
    manages them.
  - `/team` and Settings → Roles are read-only for View. The sidebar Team
    link and the Roles tab follow the permission, and Settings opens on
    Roles for someone with Team but no Settings.
- **"Only Owners touch Owners"** (user decision, `src/lib/owner-rules.ts`).
  A non-Owner team admin can't do any of these:
  - invite as Owner, or revoke an Owner invite
  - assign into or out of Owner, or remove an Owner
  - copy the Owner role
  - edit or delete a role they hold
- **A non-Owner can only grant what they have** (pitfall-reviewer, high:
  the second-account self-promotion). Creating, editing, assigning or
  inviting with a role bigger than their own is refused (`roleWithin`,
  `projectPermsWithin`).
  - Accepting an invite never changes an existing member's role, so it
    can't promote anyone or demote an Owner.
- **Membership-based lookups:** members are listed, re-roled and removed by
  `WorkspaceMember` in the active workspace (not `User.workspaceId`), so
  people who joined from another home workspace are manageable.
  - Revoke and remove moved off `requireRole(['OWNER'])`.
- **UI flags off the legacy role:**
  - /projects "Edit team" follows Project team Edit for each project.
  - The project notes team controls follow Project team Edit, and "Edit
    client" follows Clients Edit.
  - Budget "insert package" needs Costs Edit and Rates & templates.
- `team` is added to `ENFORCED_WORKSPACE_AREAS`. No saved non-Owner role
  granted it, so nothing changed for anyone.
- **Access diff:** 12 members, 0 team-access changes.
- **Verified:**
  - jest 250, including owner rules, the grant cap and team page guards.
  - A DB script on a throwaway workspace (12 checks): Owner-touching
    changes refused, a bigger role refused, raising a role above your own
    refused, held-role edits refused, members from another home workspace
    re-roled, Owners uncapped.

### 2026-10-05 — Roles Phase 2b: workspace pages enforce permissions
- **Converted:** clients, rolodex management, rates/templates/library
  (including global library copy and import-to-template), settings
  (company, branding, defaults, production, contract blocks, deal memo
  defaults), and the new **Projects** area.
  - Replaced `requireRole`, `requireProducerPageAccess`, the Owner-only
    settings layout and the sidebar's `PRODUCER_HREFS`.
  - Pages use `requireWorkspaceArea`. Settings tabs follow the permission
    (Roles stays team-admin). The sidebar and the top-bar New project
    follow per-area flags.
- **User decisions:**
  - A new workspace area, **Projects** (create / archive / restore).
    Editing details and status is project Overview, and moving into or out
    of Archived by any path needs Projects (`archiveChangeAllowed`).
  - The **danger zone** stays Owner-only via `requireOwner()`
    (`getAccess().isOwner`, the ACTIVE workspace): delete workspace, reset
    demo data, Stripe connect/disconnect. Payments shows non-owners a note
    instead of the cards.
  - **Contract blocks and deal memo defaults → Settings.**
- **Data (user-approved):** added `projects` to all 34 saved
  WorkspaceRoles. Owner/Producer got EDIT (22) and Collaborator/custom got
  NONE (12), with a guarded update and an AuditEvent per row
  (`role.permissions_backfill`). Verified afterwards: no role missing the
  key, no unexpected values.
- **`legacyRoleFor` ignores `projects`,** so turning it off never demotes
  a role's members to Collaborator (pitfall-reviewer, high).
- **View-only:** `ViewOnly` (a disabled fieldset plus a note) on clients,
  rolodex, rates, templates, library, and the settings general/contracts
  pages.
- **Also fixed:**
  - `listContractBlocks` and the contract picker were ungated. The picker
    now takes `proposalId` and needs Contract Edit.
  - `completeOnboarding` let any member rename and rebrand their workspace.
    It's now Owner-only.
  - An ASSIGNED-scope creator is put on the project they create.
  - Contact deal-memo history is limited to projects the viewer can open.
- **Access diff (12 members × 5 areas, saved data):** 1 intended change.
  Skolastika Lupitawina (Producer in The Third Place, Owner of her own
  workspace) loses The Third Place's Settings. The old check used her
  home-workspace role, which was a bug.
- **Verified:**
  - jest 239, including the projects-area tests and section guard coverage
    for every workspace page.
  - tsc, lint, and `next build` compile.
- **pitfall-reviewer:** 3 issues plus 1 pre-existing and 1 low, all fixed.
- **Correction:** the "duplicate roles" seen in the preview are separate
  workspaces with the same name (roles are unique per workspace).

### 2026-10-05 — Roles Phase 2a: money areas enforce permissions
- **Goal (user):** someone can **view the budget without editing it** and
  still **work on deal memos and actuals**. Budget lines, costs and margin
  and deal memos were already enforced. Proposals, invoices and payments,
  actuals and receipts, and contract now are too, plus the /proposals and
  /invoices lists.
- **The rule (user decision):** Actuals needs Budget costs at View or above.
  - `PROJECT_VIEW_REQUIREMENTS` in `permissions.ts` sets actuals to NONE
    when budget.costs is NONE; otherwise it keeps its level, so View budget
    plus Edit actuals works.
  - It's applied to the person's combined access
    (`resolveProjectPermissions`), so a project role can rely on the
    workspace role for budget visibility.
  - The Roles screen shows an amber warning on the Actuals row.
- **Proposals, Invoices and Contract are independent areas** (user
  decision); they show client prices.
- **Guardrail:** on Actuals, billed, profit and margin %, the revenue
  override and the wrap report (page, action and PDF route) need Budget
  margin View.
  - Without it, budget lines reach the client net of markup.
  - The summary shows Budgeted (line costs) and Spent only.
- **Gates:** the new `src/lib/money-access.ts`:
  - `requireMoneyPermission` resolves a proposal, invoice, budget, actual
    sheet or entry, receipt or contract-section id to its project in the
    active workspace; other workspaces get "not found".
  - About 55 legacy checks were converted across proposals, invoices,
    payments, public-tokens, actuals, receipts and proposal-contracts.
  - Proposal creates check that the budget belongs to the projectId.
  - The /invoices and /proposals lists filter rows to projects with the
    area, using `projectsWithArea`. Row actions follow Edit for each
    project.
- **Controls:** view-only Actuals (via context), Receipts, all three invoice
  lists, proposals (overview list, kanban, table), and the contract tab (no
  auto-attach). The proposal modal's Contract tab follows the Contract
  permission. The sidebar's Proposals and Invoices links follow the
  workspace permission.
- **Security fixes found on the way:**
  - `linkReceiptToEntry` rewrote any entry's `actualCents` by id (cross
    workspace). The entry must now be on the same project.
  - `updateReceiptDetails` and `updateActualSheet` wrote client objects
    straight to the database (they could re-point the entry, project or
    budget). Both are now whitelisted.
  - Actuals sync trusted the client's line list. It's now validated against
    the sheet's phase.
  - Two contract reads (`listContractSections`,
    `evaluateProposalContractTriggers`) were ungated.
- **Access diff:** 12 memberships × every project × 4 areas, plus the 2
  workspace lists, run with the real resolver: **0 changes**.
- **Verified:**
  - jest 233, including the view-requirement rules and the updated page
    guard coverage test.
  - A DB script checked every money target type (its own project; another
    workspace refused; empty or undefined ids refused) and the sync filter.
- **pitfall-reviewer:** 5 findings, all fixed:
  - markup on the actuals payload
  - a stripped total feeding the invoice and proposal modals (they now get
    the client total)
  - the receipt patch
  - the sheet data
  - the sync trust
  - Also a low one: Send-button precedence.

### 2026-10-05 — Deal memo terms: checkbox picker, reorder, blue "review" blocks
- **Choose terms** replaces "Add from library…".
  - A popover checklist of the crew & vendor library: title, category, and
    "Default" where it applies.
  - Ticked means the memo already has a section from that block.
  - Ticking adds it (`addDealMemoSection`, which is now a no-op if the block
    is already there).
  - Unticking removes every copy of that block. It asks first if any copy
    was edited or if there's more than one.
- **Reorder:** ↑/↓ on each section run `moveDealMemoSection`, which:
  - reindexes the memo's sections to 0..n-1 (healing ties) in a scoped
    transaction
  - guards every write with `dealMemo: { signedAt: null }`, so a signed memo
    is refused and rolled back
  - uses the pure `moveInOrder` in `deal-memo-core` (jest-tested)
  - Reordering a sent memo marks it Outdated, because order is part of the
    terms key.
- **Blue for SOW, Custom and blank sections:** these are templates to
  tailor, so they get a blue border, blue inputs and a "Scope of work /
  Custom — review" chip. Other sections are lavender. Settings → Contracts
  cards for SOW and Custom are blue too.
  - The section category is looked up from `sourceBlockId`
    (`loadDealMemoEditor` → `sectionCategories`), inactive blocks included.
  - The shared labels and rule live in `src/lib/contract-categories.ts`.
- **Section ordering everywhere** (editor, vendor view, terms key) now
  breaks ties by `createdAt`, so order is deterministic.
- **Verified:**
  - Jest for `moveInOrder`.
  - A DB script checked tie healing and swap, end no-ops, signed refusal
    with the order unchanged, the inactive-block category lookup, and the
    library carrying categories.
- **pitfall-reviewer:** 2 low findings, both fixed: duplicate block copies
  in the picker, and a misleading "Signed" error when a section changed
  elsewhere.

### 2026-10-05 — Vendor merge tags in the contract block Tags menu
- **Before:** the Tags menu in `SmartTextEditor` offered one hard-coded
  client/proposal list everywhere. The crew & vendor terms dialog had no
  way to insert `{{vendor.name}}`, and it offered `{{client.name}}` and
  proposal tags, which don't resolve on a deal memo.
- **Now:** a `mergeTagSet` prop (`'client'` | `'vendor'`).
  `ContractBlockDialog` passes `'vendor'` for VENDOR blocks.
- **The vendor list:**
  - Vendor name
  - Role (`dealMemo.position`)
  - start and end dates
  - work-day hours, OT and double-time terms, production zone
  - company and legal name
  - project name

  It matches `dealMemoReplacements` in `src/lib/merge-tags.ts`. All 12 tags
  were checked against `resolveMergeTagsPlain`.

### 2026-10-05 — Deal memos: signed PDF emailed to the vendor and the sender
- **On signing,** `renderSignedDealMemoPdf` (`src/lib/deal-memo-pdf.ts`)
  renders `DealMemoPDF` (react-pdf) from the frozen `sentSnapshot` plus the
  signature:
  - name and email, date and time, signer IP
  - the workspace logo (png/jpeg via data URI) or name
  - Name/Role header, fees, terms
  - a "cancelled" banner if it applies
- The PDF is attached to both post-sign emails (Resend `attachments`). A
  render failure only drops the attachment; the signature and emails still
  go through.
- **The team email now goes to the person who sent it:**
  `loadDealMemoSender` takes the latest `dealMemo.sent` audit actor, then
  the creator. They must still have a `WorkspaceMember` row, so a removed
  producer gets nothing. The last fallback is the workspace contact email.
  Previously the email went to the creator.
- **Download any time:** `GET /api/pdf/deal-memo/[token]` (public,
  `publicPdf` rate limit) serves signed memos only. Links:
  - "Download PDF" on `/dm/[token]`
  - the editor's Signed banner
  - The header uses an ASCII `filename` plus a UTF-8 `filename*` (curly
    apostrophes would otherwise throw).
- **Fixed:** `sendDealMemoSignedEmails` ignored Resend's `{ error }`
  results; it now uses `checkSend`.
  - Found locally: the from domain isn't verified in local `.env`, so
    signed emails never actually sent from dev. Production is unaffected.
- `parsePdfLines` is now exported from `ProposalPDF` for reuse.
- **Verified:**
  - The PDF rendered and was inspected visually.
  - Sender resolution: audit actor beats creator; contact fallback;
    non-members rejected.
  - Sign E2E: PDF route 404 before signing, 200 `application/pdf` after.
  - Resend accepted a send with the PDF attached (test sender to
    `delivered@resend.dev`).
- **pitfall-reviewer:** the sender lookup was missing a membership check
  (ex-member leak), and non-Latin-1 filenames returned 500. Both fixed.
- **Follow-up:** `loadLogo` adds up to 4s to the sign request when the logo
  host is slow.

### 2026-10-05 — Deal memos: Role shown under the vendor's name
- The vendor document (`DealMemoDocument`, used by `/dm/[token]` and
  "Preview as vendor") now shows **Name** with **Role** beneath it, instead
  of a single "Crew member" field.
- Role is the existing `DealMemo.position`. It defaults from the budget
  line's `roleLabel` (e.g. "1AC"), and the editor field is relabelled
  "Role (shown to the vendor)", e.g. "1st Assistant Camera".
- Editing the role after sending already marks the memo Outdated (position
  is in the terms key), so the vendor gets the new role on re-send.
- No migration.

### 2026-10-05 — Invoices: archive + delete at any status
- **Before:** only DRAFT invoices could be deleted, and PAID ones couldn't
  even be voided. 13 test invoices (9 VOID, 4 PAID) were stuck in the lists
  and in the "Collected" totals.
- **Delete** (`deleteInvoice`) works at any status.
  - A never-sent, unpaid draft deletes on a plain confirm.
  - Anything else needs the invoice number typed. This is checked on the
    server (`matchesInvoiceNumber`, `src/lib/invoice-delete.ts`).
  - The dialog warns that the client link stops working and that collected
    money drops out of the totals.
  - Views cascade. `PaymentAttempt` rows are kept (no FK) for Helcim
    reconciliation.
  - Audit `invoice.deleted`, with number, status, totals and sentAt.
- **Payment guard:** delete is refused while an INITIATED attempt is under
  2h old.
  - Payments initiate reuses an attempt for 55 min after its `createdAt` and
    re-tokens it without moving that timestamp. `settlePayment`'s
    `invoice.update` would then throw on a deleted invoice: the card is
    charged with no record.
  - A millisecond race remains (a checkout opened between the check and the
    delete).
- **Archive** (`setInvoiceArchived`, `archivedAt`/`archivedById`) is
  list-only.
  - The three lists (`InvoicesTable`, `ProjectInvoices`,
    `ProjectInvoicesPage`) hide archived rows behind "Show archived (n)",
    and show them dimmed with an Archived tag.
  - The dashboard, the `/invoices` metrics and the project totals still
    count archived invoices.
  - Audit `invoice.archived` / `invoice.unarchived`.
  - Permission: `requireRole(['OWNER','PRODUCER'])`, the same as void.
- **Migration:** `20261005000002_invoice_archive`, two nullable columns.
  The user ran it.
- **Verified:**
  - Jest covers the matcher, the typed-confirm rule and the payment window.
  - A DB script on a throwaway workspace checked: archive round-trip;
    cross-workspace delete refused; draft deletes untyped; wrong or missing
    number refused; the right number deletes; views cascade; a fresh
    INITIATED attempt blocks while a stale one doesn't; attempts kept.
- **pitfall-reviewer:** the payment window was too short (30 min). Fixed to
  2h. The all-archived list showed an empty table; it now shows a message.

### 2026-10-05 — Deal memos: sent-but-unsigned memos go "Outdated" when terms change
- If the producer edits a sent, unsigned memo's terms, the vendor's link
  shows an amber "This deal memo is out of date" notice.
  - It names the studio and asks them to send the updated memo.
  - The sign form is replaced, and the sign route returns 409.
  - The editor shows an "Outdated — re-send" chip and banner. Re-sending
    clears it.
- **What counts as a change:** a `termsKey` fingerprint of the raw terms
  (merge tags unresolved) is stored in `sentSnapshot` at send:
  - position, dates, days
  - work-day/OT/DT/zone terms
  - visible fees (label, rate, unit, qty, terms)
  - sections
  Renaming the project, vendor or studio does not count.
  - Snapshots without a key fall back to comparing vendor views.
- **Verified:**
  - Jest: key stability (Decimal vs number), rate, section and OT changes,
    zero-rate fees ignored.
  - E2E on a throwaway workspace: fresh → signable; project and contact
    renamed → still signable; rate edited → outdated + 409; re-sent →
    signable and signed.
- **pitfall-reviewer:**
  - A medium false positive from merge-resolved comparison. Fixed with the
    raw-terms key.
  - The public page no longer 500s if the check throws.
  - Known: a millisecond race between the outdated check and the sign
    compare-and-set. The editor's "differs from what they signed" note
    covers it.

### 2026-10-05 — Deal memos Phase 2: vendor link, e-signature, email, guarded cancel
- **Before:** Award only flipped an internal status. Nothing reached the
  vendor.
- **Flow:**
  - Award (internal pick, unchanged), then **Send to vendor**. A dialog
    prefills the contact email, which can be edited.
  - Sending emails a `/dm/[token]` link (60 days, renewed on re-send, same
    token) and freezes the vendor DTO into `sentSnapshot`.
  - Status reads Awarded → Sent → Viewed → Signed in the editor, the board
    and the crew pill.
- **Vendor page `/dm/[token]`:**
  - Public and rate-limited (`publicDoc`). It renders only the frozen
    snapshot.
  - Records views only while sent and unsigned.
  - Signing needs a name, the email it was sent to, and an "I agree" box.
    `POST /api/deal-memos/[id]/sign` is rate-limited (`approve`), does a
    compare-and-set, writes an AuditEvent with `actorId: 'public'`, then
    sends non-fatal confirmation emails to the vendor and the sender (or the
    workspace contact).
  - Signing is pinned to the version on screen: the page posts `sentAt`, and
    a re-send since then gets a 409 "reload".
- **Signed memos are locked:**
  - Memo, fee and section writes are refused and re-check `signedAt: null`
    at write time.
  - The board's expected cost uses the signed snapshot's total.
  - The editor flags working terms that drifted from what was signed.
- **Cancel:**
  - Type CANCEL (checked on the server).
  - When the memo was sent, an "email the vendor" box starts ticked.
  - A cancelled link shows a notice and returns 410 on sign.
  - `setDealMemoStatus` no longer accepts CANCELLED. Reopen (CANCELLED → BID)
    clears the link, snapshot and signature.
- **Migration:** `20261005000001_deal_memo_signing`, all additive nullable
  columns plus a unique `publicToken`. The user ran it in Neon.
- **Data:** the Daadi Associate Producer memo was reset to BID for the
  user's test, with an AuditEvent `dealMemo.reset_to_bid`.
- **Verified:**
  - Browser on a throwaway workspace: view, wrong email → 403, sign, signed
    state.
  - Re-sign → 409; cancelled → notice and 410.
  - Stale version → 409; signed-memo writes refused.
- **pitfall-reviewer** found 1 high (sign against a re-sent version),
  1 medium (live vs signed terms) and 2 low (write race; no audit on email
  failure). All fixed.
- **Follow-ups:**
  - No PDF of the signed memo yet; the page prints.
  - New fees/sections created during the sign race aren't guarded (creates
    can't filter on the parent), but the drift banner shows them.

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
- **Phase 2:** shipped 2026-10-05 (vendor link, e-signature, email, cancel) — see above.

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
