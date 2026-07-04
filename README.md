# SLATESUITE — Production Management Platform

Internal tool for The Third Place Creative. Builds production budgets, sends sleek proposals to clients, tracks invoices, distributes call sheets to crew, and manages the Rolodex of contacts.

Inspired by Saturation.io but stripped down to the parts that matter for an agency: **budgets → proposals → invoices → call sheets → teams**. No banking, no expense cards, no QuickBooks. Just the core production artifacts done extremely well.

## Stack

| Layer        | Choice                               |
|--------------|--------------------------------------|
| Framework    | Next.js 15 (App Router) + TypeScript |
| UI           | Tailwind + shadcn/ui                 |
| Database     | Postgres (Neon)                      |
| ORM          | Prisma (manual migration SQL in `prisma/migrations/`) |
| Auth         | Clerk                                |
| Email        | Resend                               |
| File storage | Cloudflare R2 (presigned URL upload) |
| PDF          | @react-pdf/renderer                  |
| Hosting      | Railway                              |

## Multi-tenant Architecture

The app is fully multi-tenant. Every user signs up into their own **workspace**, backed by a **Clerk Organization**. The workspace owns all data — rate cards, templates, clients, projects, budgets, proposals, invoices, call sheets, contacts.

- `auth().orgId` → `Workspace.clerkOrgId` is the source of truth for which workspace is active
- All server actions use `getScopedDb()` — a Prisma `$extends()` wrapper that auto-injects `workspaceId` into every query on scoped models. A query cannot return data from another workspace.
- Users can create additional workspaces and switch between them via the sidebar dropdown. Switching does a hard navigation (`window.location.href`) to guarantee a fresh auth context.
- **Onboarding gate** — new users go through a one-time setup wizard before reaching the app. `user.onboarded` is set on completion.
- **Danger zone** (Settings) — workspace owner can permanently delete the workspace with name confirmation. Non-owner members can leave.

### Row-level security scoped models
Auto-scoped through `getScopedDb()` (see `SCOPED_MODELS` in `src/lib/db-scoped.ts`):
`Client`, `Project`, `RateCard`, `BudgetTemplate`, `Budget`, `Proposal`, `Invoice`, `CallSheet`, `Contact`, `Phase`, `BudgetSection`, `Account`, `LineItem`, `ProjectMember`, `ProjectComment`, `ProjectAssignment`, `ProjectTeamMember`, `AuditEvent`, `WorkspacePaymentConfig`, `PaymentAttempt`, `Receipt`, `DeliveryPage`, `DeliverableAsset`, `DeliverableVersion`, `DeliverableView`, `ActualSheet`, `ActualEntry`

Non-scoped (shared or workspace-metadata): `Workspace`, `User`, `WorkspaceInvitation`, `ProposalView`, `InvoiceView`, `WebhookEvent`

> **Note:** child models (`Phase`, `BudgetSection`, `Account`, `LineItem`, `ProjectMember`, `ProjectComment`, `ProjectAssignment`) carry a denormalized `workspaceId` column (backfilled via `scripts/backfill-workspace-ids.ts`) so they can be scoped directly — a crafted foreign `phaseId` / `lineItemId` / `commentId` returns not-found rather than data.

## Roles & Permissions (RBAC — Feature F9)

Three workspace roles, stored on `User.role` (`UserRole` enum). **The DB is the source of truth** — Clerk Organizations only carry the coarse `org:admin` / `org:member` distinction; the finer role lives in our database.

| Role | Access |
|------|--------|
| **OWNER** | Full access — workspace settings, billing, danger zone, member management |
| **PRODUCER** | Full CRUD on projects/budgets; no workspace settings or member management |
| **COLLABORATOR** | Only projects they're explicitly assigned to; budgets are **margin-blind**; can edit call sheets |

Enforced at three layers:

- **Server actions** — `requireRole(allowedRoles)` from `src/lib/auth.ts` gates mutations and returns a typed `{ success: false, error: 'UNAUTHORIZED_ROLE' }` (never fails silently). All budget mutations + invite/revoke/role-change are gated. Returns a single nullable-`error` object rather than a discriminated union, because the repo compiles with `strict: false` (which disables discriminated-union narrowing on a boolean discriminant).
- **Database / payload** — the "blind budget": for a Collaborator, `stripBudgetForRole()` (`src/lib/budget-visibility.ts`) removes the budget markup (agency fee) and every per-line markup **on the server, before serialization**, so margin data never enters the RSC payload. The `/projects` dashboard financial KPIs are likewise zeroed for Collaborators.
- **UI** — `BudgetEditor` renders read-only and hides the rates row, agency fee, and grand-total blocks for Collaborators. `settings/layout.tsx` and the `/team` page redirect non-Owners server-side.

**Project assignment** — Collaborators only see projects linked to them via the `ProjectAssignment` join table (`projectId` + `userId`). Owners/Producers assign them via the **Assign** dialog (`AssignCollaborators`) on the project header. Projects list and detail page both filter/guard on this.

**Project Team roles (PL / AM / PM)** — assigning a workspace user as Project Lead, Account Manager, or Project Manager via the Project Notes panel (or the "Edit Team" card kebab menu) **auto-creates a `ProjectAssignment` row** in the same transaction, so the assigned user immediately gains project visibility. The project-team role governs *presence* only — the user's workspace role (OWNER/PRODUCER/COLLABORATOR) still governs what they can *do*. A Collaborator assigned as Project Lead sees the project but remains margin-blind.

**Role persistence** — invites carry the chosen role; the `organizationMembership.created` webhook reads the invitation's role so `COLLABORATOR` / `PRODUCER` persist correctly (Clerk membership is `org:member` for both). `getCurrentRole()` resolves the active role; the `/team` page lets Owners reassign roles via `changeMemberRole`.

## Global Library

Every new workspace is seeded with a **global library** of rate cards and budget templates so users have useful defaults on day one.

- **`GlobalRateCard`** and **`GlobalTemplate`** tables hold the master catalog. These are never workspace-scoped.
- On workspace creation (both `user.created` webhook and the "New workspace" sidebar button), `seedWorkspaceFromGlobals()` copies all `isFeatured` globals into the new workspace atomically.
- Seeded copies are **fully owned by the workspace** — editing or deleting them never touches the globals, and future global updates do not propagate to existing workspaces.
- **`/library` page** — read-only catalog where users can browse the full global library at any time and selectively pull individual rate cards or templates into their workspace. Shows "✓ In workspace" with a link to where it landed; never creates duplicates.
- **Reset library** (Settings → Workspace data) — additive re-seed that adds any missing featured items without modifying existing rows. Useful after deletions or when new globals are added.
- **`scripts/seed-existing-workspaces.ts`** — one-time backfill script for empty test workspaces. Dry-run by default (`--seed` to apply). Skips workspaces that already have rate cards.

## Data Model — at a glance

```
GlobalRateCard  ─┐
GlobalTemplate  ─┘  (global catalog; seeded into new workspaces on creation)

Workspace (1)
  ├── callTimeFormat   "12H" | "24H"  (workspace-level display preference for call times)
  ├── primaryColor / accentColor / logoUrl / logoDarkUrl  (per-workspace branding; defaults #5D00A4 / #04FFCC)
  ├── Users (OWNER | PRODUCER | COLLABORATOR — User.role; see Roles & Permissions)
  ├── RateCards (workspace-owned copies, seeded from global library)
  ├── BudgetTemplates (workspace-owned copies, seeded from global library)
  ├── Contacts (Rolodex — persistent across projects)
  │     ├── hasKit        Boolean  — crew member brings their own equipment package
  │     ├── kitRateCents  Int?     — day-rate for the kit (cents)
  │     ├── kitName       String?  — e.g. "Sony FX3 Package"; shown on ContactCard badge
  │     └── ProjectMembers (crew on a project — Contact ↔ Project with role/rate override)
  │           └── mismatchFlag Boolean  — true when a newly-won proposal no longer lists this role
  ├── Clients
  │     └── Projects
  │           ├── status   LEAD | ACTIVE | WRAPPED | ARCHIVED
  │           ├── ProjectTeamMembers  (internal workspace team — PL / AM / PM)
  │           │     ├── role              PROJECT_LEAD | ACCOUNT_MANAGER | PROJECT_MANAGER
  │           │     ├── userId            → workspace User
  │           │     ├── assignedAt        DateTime
  │           │     ├── unassignedAt      DateTime? — null = active; set on replace/remove/workspace-exit
  │           │     └── unassignReason    String? — 'REPLACED' | 'REMOVED' | 'USER_LEFT_WORKSPACE'
  │           │     (partial unique index enforces one active holder per role per project)
  │           ├── Budgets
  │           │     ├── markupPct  (agency fee %)
  │           │     ├── taxPct     (global tax %)
  │           │     └── Phases (v1, v2, Approved, …)
  │           │           ├── description                  (shown on proposal cover / "The Project" section)
  │           │           ├── deliverables                 (JSON array — shown in proposal scope section)
  │           │           ├── pageBreakBetweenAccounts     Boolean — PDF inserts a page break before each Account
  │           │           ├── sectionsNudgeDismissedAt     Timestamp — suppress the "split into sections" nudge
  │           │           └── BudgetSections (≥ 1 per phase; default section title is "Main")
  │           │                 ├── title / description / orderIndex
  │           │                 └── Accounts (nested tree; each Account carries a sectionId FK)
  │           │                       └── LineItems
  │           │                             ├── rateCents        (snapshot at insert)
  │           │                             ├── lineItemCategory (CREW | LOCATION | EQUIPMENT | SERVICE | DELIVERABLE)
  │           │                             ├── contactId        (Rolodex contact fulfilling this line item — CREW only)
  │           │                             ├── hasMarkup        (opt-out of agency fee)
  │           │                             ├── taxRate          (per-item tax override)
  │           │                             └── quantityFormula  (A×B multiplier, e.g. "3x2" = 3 people × 2 days)
  │           ├── Proposals (public /p/[token] page + PDF)
  │           ├── Invoices  (public /i/[token] page + PDF)
  │           ├── ProjectComments  (activity feed — see Project hub)
  │           ├── ProjectAssignments (Collaborator visibility — see Roles & Permissions)
  │           ├── CallSheets (public /cs/[token] page)
  │           └── DeliveryPage (public /d/[token] portal)
  │                 ├── status            DRAFT | PUBLISHED
  │                 ├── publicToken       UUID v4
  │                 └── DeliverableSection[]
  │                       ├── title / orderIndex
  │                       └── DeliverableAsset[]
  │                             ├── title / description / type / status / orderIndex
  │                             ├── publicToken       UUID v4 (used in /d/[token]/[assetToken])
  │                             ├── currentVersionId  FK → DeliverableVersion
  │                             └── DeliverableVersion[]
  │                                   ├── versionNumber
  │                                   ├── url             canonical embed/player URL
  │                                   ├── provider        FRAME_IO | SHADE | VIMEO | YOUTUBE | …
  │                                   ├── renderMode      IFRAME | NATIVE_MEDIA | EXTERNAL_ONLY
  │                                   ├── isVertical      Boolean — portrait/9:16; switches embed container to 85vh
  │                                   ├── thumbnailUrl    String? — auto-set for Vimeo/YouTube; manual R2 upload otherwise
  │                                   ├── note            String? — version note shown on client page
  │                                   └── firstClientViewAt DateTime? — null = unseen badge active
  │                 ├── crew          JSON — [{ dept, members: [{ name, role, callTime, phone, email, contactId? }] }]
  │                 ├── talent        JSON — [{ name, role/character, callTime, phone, email, contactId? }]
  │                 ├── schedule      JSON — [{ startTime, endTime, label, whoNeeded, notes }]
  │                 ├── pointOfContact JSON — { name, title, phone, email }
  │                 ├── weather       JSON — fetched from Open-Meteo
  │                 └── hospitalInfo  JSON — nearest hospital fetched via geocoding
```

Money is stored in **integer cents** everywhere. Percentages are `Decimal(6,4)` (0.2000 = 20%).

### Actuals

Each project can have one `ActualSheet` (created automatically when the actuals tab is first visited). The sheet holds `ActualEntry` rows — one per budget line item (linked via `lineItemId`) plus free-form ad-hoc entries.

```
ActualSheet
  ├── projectId  (one per project)
  └── ActualEntry[]
        ├── lineItemId?         (null for ad-hoc)
        ├── accountId           (for grouping in the wrap report)
        ├── actualCents
        ├── date?               (receipt/expense date)
        ├── vendorContactId?    (Rolodex contact link)
        ├── status              PENDING | APPROVED
        └── notes?
```

Rate cards are the **source of defaults** but never retroactively change historical line items — every line item snapshots `description`, `unit`, and `rateCents` at insert time.

## App Routes

### Internal (auth required)
| Route | Description |
|-------|-------------|
| `/dashboard` | Outstanding invoices, recent projects, draft proposals |
| `/clients` | Client list |
| `/clients/[id]` | Client detail + project history |
| `/projects` | Operational dashboard — 4-card KPI strip (Pipeline, Open Projects, Outstanding, Won This Quarter), status filter pills, rich project cards with client avatar, attention sidebar |
| `/projects?archived=1` | Archived project grid with one-click restore |
| `/projects/[id]` | Project hub — budgets, proposals, invoices, call sheets, proposal overview |
| `/projects/[id]/crew` | External crew list (Rolodex contacts assigned with role/rate). Seed from proposal/budget with one click. |
| `/projects/[id]/team` | Internal workspace team — three role slots (Project Lead, Account Manager, Project Manager) with assign/replace/remove history |
| `/projects/[id]/actuals` | Actuals tracker — per-line-item spend, ad-hoc entries, status (Pending/Approved), date, vendor |
| `/projects/[id]/actuals/wrap` | Wrap report — budgeted vs. actual by account, margin, top overages, PDF download |
| `/projects/[id]/call-sheets/[csId]` | Call sheet editor |
| `/projects/[id]/delivery/deliverables` | Deliverables manager — sections, asset cards, drag-and-drop, asset editor modal (Details / Versions / Thumbnail tabs) |
| `/projects/[id]/delivery/page` | Client page preview — shows what `/d/[token]` looks like; publish/unpublish |
| `/proposals` | All proposals — Kanban view + full list table |
| `/invoices` | Invoice list with metrics |
| `/invoices/[id]/edit` | Invoice editor |
| `/rates` | Workspace rate card list |
| `/templates` | **Document Hub** — tabbed: Budgets, Add-on Packages, Proposals (branded preview), Invoices (coming soon) |
| `/templates/[id]` | Template detail + structure editor |
| `/library` | Global library catalog — browse + add to workspace |
| `/rolodex` | Contact directory — grid + list view, role filter, archive |
| `/rolodex/[id]` | Contact detail — info, project history, call sheet appearances |
| `/team` | **(OWNER only)** Workspace team members + invite by email + role badges/picker + change roles |
| `/settings` | **(OWNER only)** Branding, payment instructions, production preferences (call time format), workspace data, danger zone |
| `/onboarding` | First-time setup wizard (redirected automatically for new users) |

### Public (no auth, tokenized)
| Route | Description |
|-------|-------------|
| `/p/[token]` | Proposal — approve, download PDF, request changes. Uses the **workspace's own brand color + logo** (see Per-workspace Branding). DRAFT renders a preview banner instead of 404. Multi-section budgets render section headings, subtotals, and clickable deliverable cards that scroll + highlight the linked section. |
| `/i/[token]` | Invoice — wire/ACH details, download PDF. Same per-workspace branding. |
| `/cs/[token]` | Call sheet for crew — desktop 2-col layout, mobile single-column. DRAFT shows a preview banner. `?print=1` auto-triggers `window.print()`. |
| `/invite/[token]` | Team invitation acceptance page |
| `/d/[token]` | Public delivery portal — asset listing with sections, thumbnails, provider badges, unseen indicators. Desktop UA → this route; mobile UA → auto-redirected to `/m/d/[token]`. |
| `/d/[token]/[assetToken]` | Public individual deliverable — iframe embed, native media, or external link depending on provider + render mode. Mobile UA → auto-redirected to `/m/d/[token]/[assetToken]`. |

### Mobile (no auth, UA-redirected from `/d/`)
| Route | Description |
|-------|-------------|
| `/m/sign-in` | Mobile-optimized Clerk sign-in page |
| `/m/sign-up` | Mobile-optimized Clerk sign-up page |
| `/m/d/[token]` | Mobile delivery portal — stacked single-column layout, optimized for phone screens |
| `/m/d/[token]/[assetToken]` | Mobile individual deliverable — fills viewport height using `.m-embed-wrap` CSS pattern (see below) |

**UA-based redirect** — `src/middleware.ts` detects mobile user-agents (`/Android|iPhone|iPad|iPod|Mobile/i`) for all `/d/` paths and issues a `307` redirect to the equivalent `/m/d/` path. Auth is not required for any `/m/` routes (all pre-registered as public in the Clerk middleware config). The mobile pages share the same token-authenticated data layer as their desktop equivalents.

**`.m-embed-wrap` iframe pattern** — Shade's `embedHtml` uses `padding-bottom: 56.25%` to derive height from width, which ignores an explicit container height. The mobile asset page wraps the embed in a `.m-embed-wrap` container and overrides the inner div and iframe with `position: absolute; inset: 0; padding: 0; width/height: 100%` via `!important` rules, forcing the iframe to fill the container. The container itself uses `height: max(56.25vw, 45vh)` for horizontal content and `height: 75vh` for portrait (`isVertical = true`) content.

## Core Features

### 1. Budget editor (`/projects/[id]/budget`)

A table-based editor with account groups (collapsible) and line items. Supports multiple phases (tabs) within a single budget. The budget lives at its own `/projects/[id]/budget` route (sidebar nav → **Budget**); the project Overview shows a read-only **Budget Breakdown** summary with an "Edit in Budget →" link.

Key behaviours:
- **Add line item** via modal — rate card search, description, qty, days, unit, rate, category, markup %, notes
- **Edit line item** — click any description text (dotted underline on hover) to open the full edit modal pre-filled. Pencil icon also opens it.
- **Duplicate line item** — Copy icon (hover-reveal) on each row duplicates it immediately below with a 1.5 s mint flash on the new row. Single `$transaction` shifts items below by one and inserts the copy.
- **Line item categories** — each item carries a `lineItemCategory` (CREW, EQUIPMENT, LOCATION, SERVICE, DELIVERABLE). Set automatically from the linked rate card category, or override manually in the modal. Items tagged CREW feed directly into call sheet import. Category badge shown inline on the description.
- **QTY × Unit display** — headcount (QTY, dimmed if 1) and unit period ("2 Days", "Week", "Flat") as separate columns. Stored as `quantityFormula = "3x2"`. Consistent across editor, web proposal, and PDF.
- **Insert package** — pulls in a saved template package into any phase
- **Bulk import** — drag-and-drop `.csv` or `.json`; preview grouped line items before committing
- **Drag to reorder** — grip handles on every row. Single-item drag uses the row itself as the ghost. **Multi-select drag**: when the dragged row is in the active selection, all selected items move together — a stacked purple card ghost shows the item count; items land at the drop position preserving their original top-to-bottom order; selection stays on the moved rows post-drop.
- **Delete account** — removes account and all children; auto-renumbers codes
- **Per-item markup & tax** — each line item can override budget-level markup/tax, or opt out of the agency fee entirely
- **Bulk actions** — hover-reveal checkboxes on every line item + per-section and whole-budget "select all" (indeterminate states). A floating action bar (slides up, brand-purple pill) offers **Mass edit** (inline Qty / Unit / Rate fields — blank leaves a field unchanged), **Duplicate** (copies all selected items each below their source; selection swaps to the new rows with a mint flash), **Group into account** (moves the selection into a new account), and **Delete**. Custom transparent checkboxes (`BulkCheckbox`) inherit the row background.
- **Sticky summary bar** — fixed at bottom: Net Subtotal, Markups & Taxes, Agency Fee & Tax, Grand Total. Collapses to a single Net Subtotal for margin-blind (Collaborator) views.

**Budget Sections** — an optional grouping layer between a Phase and its Accounts. Every phase starts with a single "Main" section (transparent — no section UI is shown when there is only one). When two or more sections exist the editor switches to multi-section mode:

- **Section dividers** — each section renders as a dark purple (`--primary`) header row with white text, clearly separating it from account rows. Accounts can be dragged across sections.
- **Inline rename** — click the section title to edit it in-place; confirm with Enter or by clicking outside.
- **Kebab menu** (`MoreHorizontal` icon) per section — Rename, Move Up, Move Down, Delete.
- **Add Section** (`+ Add Section`) — first time: prompts to rename the current "Main" section and name the new one. Subsequent additions: names the new section only. Both flows use `AddSectionModal`.
- **Delete Section** (`DeleteSectionModal`) — empty sections delete immediately. Sections with accounts prompt you to pick a target section to receive them. The last remaining section cannot be deleted (`CANNOT_DELETE_ONLY_SECTION` guard).
- **Heuristic nudge** — when a phase has > 40 line items and only one section (and hasn't been dismissed), a banner appears with a "Split into sections" button and a "Dismiss" button. Dismissal sets `sectionsNudgeDismissedAt` on the phase.
- **Page break between accounts** — a per-phase toggle that inserts a PDF page break before every account in the export (useful for long budgets).

**Phase versioning** — each budget can have multiple phases (tabs):
- Rename, duplicate (copies all accounts + line items), make primary, delete
- The primary phase is used by default for proposals and invoices

#### Magical Crew Workflow

When a CREW line item is saved with a Rolodex contact linked (via the **Rolodex typeahead** in the line item modal), two side effects fire automatically:

1. **Rate auto-fill** — the modal pre-fills the line item rate and unit from the contact's `defaultRateCents` / `defaultRateUnit`.
2. **ProjectMember upsert** — the contact is added to the project's Teams page (deduped by `contactId`; existing members are not overwritten).
3. **Auto-kit line item** — if the contact has `hasKit = true` and a `kitRateCents` set, an EQUIPMENT line item for their kit is automatically inserted directly below the CREW row. This is fire-and-forget: it never blocks or fails the core save.

The Rolodex typeahead in the line item modal (visible only for CREW category items) searches contacts by name/role and shows a **Kit badge** next to contacts that carry equipment. A selected contact with a kit shows a preview ("Kit $600/day will be auto-added") before you save.

All crew side effects use `sdb` (scoped Prisma client) so no explicit `workspaceId` lookup is needed. The project ID is resolved by traversing `lineItem → account → phase → budget → project`.

### 2. Proposal builder + dual render (web + PDF)

**Proposal Overview** (on the project page) — fill in the project overview, description, and deliverables. These live on the `Phase` record, so they travel with the budget version you choose to send.
- **Overview** — a short tagline shown on the proposal's cover hero (`Phase.overview`).
- **Description** — the full copy shown in the "The Project" section; preserves line breaks (`whitespace-pre-line` / `pre-line`) on both the web view and PDF.
- When the phase has more than one budget section, each deliverable row shows a **section link multi-select** — a checkbox dropdown that lets you tie a deliverable to one or more budget sections. Linked section names appear on the read-only view and are stored as `sectionIds` on the deliverable JSON.

**Payment schedule** — flexible multi-payment terms set in the proposal modal:
- Default: 2 payments (50% on signing, 50% on delivery)
- Add/remove payments freely; each has a trigger (On signing, Shoot day, Delivery, Net 30/60/90, Custom date)
- Amount as percentage or fixed dollar amount (toggle per row)
- Running total indicator; save/send blocked if payments don't sum to 100%

**Proposal discounts** — add a named discount line (percentage or flat amount) in the proposal modal. Renders in the proposal total section on web, PDF, and the public page.

**Draft preview** — "Save Draft" stores the proposal. The public `/p/[token]` URL works for drafts with a sticky amber "Draft Preview" banner; sign-off section hidden.

**Public proposal — budget sections** (when the sent phase has > 1 section):
- Each section renders with a labeled heading and a shaded **subtotal row** as the last row of its accordion table.
- Each section heading has an anchor (`id="section-{sectionId}"`) so section links are deep-linkable.
- Deliverables with linked sections render as clickable **"See in budget →" buttons**. Clicking one scrolls to the first linked section and triggers a 1.8 s CSS highlight pulse (`section-highlight-fade` keyframe) on all linked sections.

**Proposal PDF — budget sections** (when the sent phase has > 1 section):
- Each section starts on a new page (page break before every section after the first).
- Section heading row shows the section title and subtotal in the PDF's accent color.
- Deliverables with linked sections show a `See: §Section Title` reference line below the description.
- `pageBreakBetweenAccounts` (phase-level toggle) inserts an additional page break before each account within a section.

**Status lifecycle:** `DRAFT → SENT → VIEWED → CHANGES_NEEDED → SENT → …` or `APPROVED` (Won) / `LOST` / `EXPIRED`.

**Sending options** — the proposal modal footer offers three non-cancel actions:
- **Save Draft** — saves with `DRAFT` status; accessible via preview link with amber banner.
- **Mark as Sent** — marks the proposal `SENT` and sets `sentAt` without triggering any client email. Use when you've already shared the link manually, or want to record the send for testing. Success screen confirms "no email was sent."
- **Send Proposal** — actually emails the client via Resend (`sendProposalEmail` in `src/lib/email.ts`). The proposal is created as `DRAFT` and only flips to `SENT` once the email send succeeds — a Resend failure leaves it as a draft with the real error message returned, never a silently-broken "Sent" status. Requires the project's `Client.contactEmail` to be set; returns a clear error otherwise. Gated `requireRole(['OWNER', 'PRODUCER'])`.

**Email sending — actor identity & domain verification:** every outbound email (proposal send, invoice send, team invite) is sent through the workspace's single Resend-verified domain (`RESEND_FROM_EMAIL`) — Resend rejects `from` addresses on unverified domains, so you cannot literally send "from" a teammate's personal email address. Instead, `buildFrom()` in `src/lib/email.ts` sets the **display name** to the sending teammate (e.g. `"Roshni via The Third Place Creative <proposals@thethirdplace.co>"`) and sets **Reply-To** to that teammate's real email, so client replies land in their inbox while the envelope stays on a domain Resend will actually deliver. Every `resend.emails.send()` call result is checked via `checkSend()` — the Resend SDK does not throw on most API failures (invalid domain, rejected recipient, rate limit), it resolves `{ data: null, error: {...} }`, so callers must check `result.error` explicitly or failures pass silently. **Setup:** verify your sending domain in the Resend dashboard (Domains → Add Domain → add the DNS records) before `RESEND_FROM_EMAIL` will deliver anywhere.

**Won status** — set via dropdown on the project proposals table or by dragging the card to the WON column on the Kanban. The dropdown includes Won/Approved alongside the standard statuses. Terminal statuses (Won, Lost, Expired, Declined) show a static pill instead of the dropdown.

**Auto-advance project status** — when a proposal is marked Won (`APPROVED`), its project automatically advances from `LEAD → ACTIVE`. If the only approved proposal is later marked Lost, Declined, or Expired and no other approved proposal exists, the project reverts to `LEAD`. `WRAPPED` is intentionally manual.

**Teams page reconciliation on Win** — marking a proposal Won triggers `reconcileTeamFromWonProposal` (fire-and-forget):
- Unassigned placeholder whose role is **not** in the new proposal → deleted silently
- Assigned member whose role is **not** in the new proposal → `mismatchFlag = true` (red card with "Not in latest won proposal" warning + "Confirm position" button)
- Assigned member whose role **is** in the new proposal → `mismatchFlag = false` (cleared)
- Role in new proposal that needs more slots than currently exist → new unassigned placeholders added

**Version auto-increment** — each new proposal increments the `version` counter. The Kanban shows only the latest sent version per thread.

**Delete any proposal** — the trash icon appears on every proposal row regardless of status. Deleting a WON (APPROVED) proposal shows a stronger confirmation dialog: "This proposal is marked Won. Deleting it will permanently remove all approval data and cannot be undone." There is no soft-delete — the record is gone.

**Proposals Kanban** (`/proposals`): CRM-style drag-and-drop board — DRAFTS | SENT | VIEWED | CHANGES NEEDED | WON | LOST. Lost column hidden by default. All columns including WON and LOST are droppable.

**Approval flow:** client types their name → `signatureName`, `signatureIp`, `approvedAt`, `approvedTotalCents` recorded → Resend email fires → public page flips to approved state with typed signature in script font.

### 3. Invoice generation & status tracking

Invoices can be generated from a budget (choose percentage or flat amount) or created standalone (ad-hoc line items).

**Numbering:** `TTP-2026-001` — auto-incrementing per year, counter stored on `Workspace.invoiceNumberSeq`. Workspace-scoped (not per-client) — two different clients will never receive the same invoice number. A `@@unique([workspaceId, number])` constraint provides a safety backstop.

**Status auto-flips:** `SENT → VIEWED` on first public page open. `PAID` is set manually. Overdue detection via `dueDate`.

**Invoice header layout (FROM / BILL TO):**

Both the public invoice page (`InvoicePublicView`) and the PDF (`InvoicePDF`) render a two-column header block:

- **FROM** — workspace legal name (`Workspace.legalName`) or display name; address lines 1 + 2, city, region, postal code; contact email
- **BILL TO** — client legal entity name (`Client.legalName`) or display name; "Attn: [contactName]" when a contact is set; billing address (`Client.billingAddress`, preserves line breaks)

**Meta strip** — Issue date | Due date | Terms (`Invoice.paymentTerms`) | Project name | PO # (when set)

**Client fields for invoicing:**

| Field | Where set | Used on invoice |
|-------|-----------|----------------|
| `Client.legalName` | Client modal → "Legal / entity name" | BILL TO header (falls back to `name`) |
| `Client.billingAddress` | Client modal → "Billing address" textarea | BILL TO address block |
| `Client.contactName` | Client modal → "Primary contact" | "Attn: [contactName]" in BILL TO |

**Payment terms** — `Invoice.paymentTerms` is a short human-readable label (e.g. "Net 30", "Due on Receipt"). Auto-populated on invoice creation from `workspace.defaultPaymentTermsDays` (e.g. `30` → "Net 30"). Can be overridden per invoice. Distinct from `Invoice.terms` (the full text block shown at the bottom of the invoice). Migration: `20260703000002_client_legalname_invoice_paymentterms`.

### 4. Call sheets (`/projects/[id]/call-sheets/[csId]`)

Day-of documents distributed to crew and talent via a secret token URL.

**Editor sections:**
- **Shoot Info** — date, general call time, point of contact (name, title, phone, email)
- **Location** — name, address, parking, entry notes. "Fetch weather & hospital" auto-populates forecast (Open-Meteo) and nearest hospital (geocoding). If hospital info is already set, shows a confirm dialog before overwriting.
- **Schedule** — time blocks with start + end time, description, "who's needed", and notes. Drag handles to reorder.
- **Talent** — flat list (name, role/character, call time, phone, email)
- **Crew** — grouped by department. Collapsible dept sections.
  - **Seeded from Teams page** — new call sheets pre-populate crew rows from the project's Teams-page members (name, role, dept, call time, Rolodex link). If the Teams page is empty, crew starts blank.
  - **Import from budget** — pulls CREW-category line items from the primary budget phase; uses the A value from `quantityFormula` as headcount. Use this when you want to re-sync crew structure from the budget after the call sheet already exists.
- **Logistics** — catering/craft services info, additional notes

**Call time display format** — call times across crew cards (Teams page) and call sheet readonly views use `formatTime()` from `src/lib/time-format.ts`. The workspace setting **Settings → Production → Call time format** toggles between `12H` (7:00 AM) and `24H` (07:00). `type="time"` inputs are always HH:MM; only display labels are affected. Stored as `Workspace.callTimeFormat`.

**Bi-directional callTime sync** — when a call time is saved on either side, it propagates to the other via `contactId` match (fire-and-forget):
- Teams page edit → pushes to matching crew/talent rows in all call sheets for this project
- Call sheet save → pushes to matching `ProjectMember` row on the Teams page
- Sync is **contactId-based only**. Rows without a Rolodex link (`contactId` absent) are not synced.

**Call sheet → Teams page member upsert** — when a Rolodex-linked crew/talent row is saved with a name (`contactId` present), `syncSheetMembersToTeam` runs fire-and-forget:
- If the project's Teams page has an unassigned placeholder for that role → fills it in (name, phone, email, callTime)
- If no placeholder → creates a new `ProjectMember` row
- Already-assigned members (matching `contactId`) are left alone (callTime handled by the sync above)

**Rolodex linking** — crew and talent rows can be linked to Rolodex contacts:
- Typing a name in the name field shows a **Rolodex typeahead** (brand-purple dropdown) filtered by the existing contacts directory. Selecting a suggestion auto-fills phone/email and stores a `contactId` on the row.
- Linked rows show a green **chain icon** (instead of the "Add to Rolodex" button). Clicking the chain prompts to push the row's current phone/email back to the Rolodex contact (`patchContactField`).
- Free-text rows (no `contactId`) retain the **BookUser** "Add to Rolodex" one-click affordance.

**Address autocomplete** — location address fields use a Nominatim-backed autocomplete API (`/api/address-autocomplete`). Results show venue names when available ("Smashbox Studios — 1011 N Fuller Ave, ...") while inserting only the clean street address into the field.

**Geocoding two-pass fallback** — "Fetch weather & hospital" geocodes the address in two passes: first strips suite/unit/floor numbers, then falls back to city/state/zip only. This handles venues where the full address fails Nominatim lookup.

**Download PDF** — "Download PDF" button in the call sheet editor opens the public view with `?print=1`, which auto-triggers `window.print()` after an 800 ms paint delay (via `PrintTrigger` client component).

**Status lifecycle:** `DRAFT → SENT → FINAL`. Finalized call sheets are locked.

**Draft preview** — Preview button opens the public crew view with a "Draft Preview" banner. View analytics skipped for drafts.

**Public crew view (`/cs/[token]`):**
- Desktop: 2-column layout (weather, location, POC, hospital / schedule, talent, crew, catering, notes)
- Mobile: single-column stack
- Phone/email as tappable links throughout

### 5. Rolodex (`/rolodex`)

A persistent contact directory for the workspace — all crew, talent, and vendors across every project. The Rolodex is the **source of truth for call sheet people**: crew/talent rows link back to contacts via `contactId`.

- **Grid + list views** with search by name/role
- **Role filter** — dropdown built from the union of existing contact primary roles + workspace CREW rate card roles
- **Contact record** — name, primary role, secondary roles (tags), email, phone, Instagram, website, default rate + unit, avatar (uploaded to R2), equipment kit
- **Contact detail page** (`/rolodex/[id]`) — full info card, linked projects (via `ProjectMember`), and every call sheet the person appears on (scanned via `contactId` in crew/talent JSON). Edit button opens the existing `ContactModal`.
- **Archive** — soft-delete hides a contact from the Rolodex while preserving their project history
- **Import from call sheets** — scan all existing call sheets and bulk-import crew/talent into the Rolodex
- **Merge duplicates** — find and merge duplicate contacts (matching on name similarity)

#### Equipment Kit

Crew members can be marked as bringing their own equipment package:
- **`hasKit`** — toggle in `ContactModal` (checkbox labelled "Has Equipment Kit")
- **`kitName`** — e.g. "Sony FX3 Package" (optional label shown on the badge)
- **`kitRateCents`** — day-rate for the kit in cents; displayed as dollars in the form
- **ContactCard badge** — contacts with `hasKit = true` show an amber briefcase badge displaying the kit name and rate beneath their social links on the Rolodex grid
- **Auto-insert on budget** — when a contact with `hasKit = true` is assigned as a CREW line item, an EQUIPMENT line item for their kit is automatically inserted below (see Magical Crew Workflow above)

#### Per-project crew (`/projects/[id]/crew`)

Assign Rolodex contacts to individual projects with optional role/rate overrides. Displayed as a responsive card grid grouped by department.

- **Seed from proposal** — auto-populates on first load from CREW line items in the latest won or sent proposal (or workspace rate cards as a fallback). Attribution banner shows which proposal was used.
- **Card states** — PlaceholderCard (Unassigned position, dashed border), MemberCard (filled, shows avatar initials, role, rate, call time, email, phone), EditCard (inline full-width form with Rolodex name search).
- **Mismatch flag** (`mismatchFlag`) — when a new proposal is marked Won, any assigned member whose role is no longer in the proposal gets a red outline card with a "Not in latest won proposal" warning. Click **Confirm position** to dismiss (`dismissMismatch` action). Unassigned placeholders with orphaned roles are deleted automatically.
- **Call time sync** — call times on member cards sync bi-directionally with call sheet crew/talent rows via `contactId`. Latest edit wins; sync is fire-and-forget so neither side can fail the other's save.
- **Edit Rolodex contact from Crew page** — on any `MemberCard` that is linked to a Rolodex contact (`contactId` set), clicking the **BookUser icon** fetches the contact's full record (`getContactForModal`) and opens `ContactModal` pre-populated — including kit settings — without leaving the project workspace. On save, `revalidatePath` is called on both `/projects/[id]/crew` and `/rolodex` so both views update immediately.

### 6. Project Team (internal workspace members)

Two distinct team concepts live on every project:

- **Crew** (`/projects/[id]/crew`) — external Rolodex contacts (existing feature, renamed from `/team`)
- **Project Team** — internal workspace users assigned to one of three roles: **Project Lead (PL)**, **Account Manager (AM)**, **Project Manager (PM)**

**Assignment** is managed from two places:
- The **Project Notes** sidebar drawer (≥ PRODUCER role) — three role slots with assign/replace/remove
- The **"Edit Team"** item in the project card kebab menu on `/projects` — opens `EditTeamModal`
- Clicking a dashed `+` placeholder in the card's avatar row also opens the same modal

**Visibility grant** — assigning a user as PL/AM/PM automatically creates a `ProjectAssignment` row (same mechanism Collaborators use) in the same DB transaction. A user can never be "assigned as Project Lead but unable to see the project."

**Active-role uniqueness** — enforced by a Postgres partial unique index (`WHERE "unassignedAt" IS NULL`), not just app logic. Attempting to double-assign a role fails at the DB level.

**History** — `ProjectTeamMember` rows are soft-removed, never deleted. `unassignedAt` + `unassignReason` ('REPLACED' / 'REMOVED' / 'USER_LEFT_WORKSPACE') form an audit trail. A "View history" collapsible in the panel shows all past holders per role.

**Workspace member removal cascade** — when an OWNER removes a workspace member, all their active `ProjectTeamMember` rows are marked `USER_LEFT_WORKSPACE` atomically. A pre-confirmation dialog lists every project role the user currently holds before removal proceeds.

**Surface areas:**
- `/projects` card: shows a PL / AM / PM avatar row (22px each) with dashed placeholder circles for unassigned slots. Empty slots are clickable for editors.
- `/proposals` Kanban: shows the AM avatar next to the client name on each card.
- `/clients` detail: shows the AM avatar on each project row within a client card.
- All surfaces revalidate on assign/unassign so avatars update everywhere without a full reload.

**RBAC:**
- OWNER / PRODUCER: full assign / replace / remove
- COLLABORATOR: read-only view of who is assigned (no assign/replace buttons)

### 7. Delivery (`/projects/[id]/delivery`)

A client-facing deliverable portal for sharing video and creative assets from a project. Replaces the need to share raw Frame.io or Shade links directly — clients get a branded URL (`/d/[token]`) listing all deliverables organized into sections.

**Delivery Notes overview block** — `DeliveryPage.overview` is an optional Smart Text block displayed between the hero and the section list on the public `/d/[token]` page. Supports bold (`**text**`) and links (`[text](url)`). Rendered via `renderSmartText()`. Added in migration `20260703000001_delivery_overview`.

**Smart Text** — a lightweight markup subset used in delivery notes and section descriptions, implemented in `src/lib/smart-text.ts`:

| Syntax | Output |
|--------|--------|
| `**text**` | `<strong>text</strong>` |
| `[label](https://url)` | `<a href="…" target="_blank" …>label</a>` (http/https only) |
| newline | `<br>` |

Input is HTML-escaped before substitution — user content cannot inject arbitrary tags. `stripSmartText()` removes markers for plain-text contexts (truncated previews, etc.). The editor exposes a `SmartTextEditor` component with a Bold and Link toolbar.

**Admin side (`/projects/[id]/delivery/deliverables`):**

- **Sections** — group deliverables into named sections (e.g. "Social Cuts", "Hero Film"); drag to reorder sections and assets independently
- **Asset cards** — each asset shows title, provider badge, unseen indicator ("Unseen" in violet when no client has viewed it), and a thumbnail if available
- **Kebab menu per asset** — Edit, Move to another section (future), Delete
- **Drag-and-drop** — reorder assets within a section; drag a section header to reorder sections. Drag events are `stopPropagation()`-isolated so dragging an asset never accidentally moves its parent section
- **Add asset** — optimistic UI: a placeholder card appears immediately; rolls back on failure
- **Asset editor modal** — three tabs:
  - **Details** — title, description, type (`DELIVERABLE` | `RAW` | `REFERENCE`), status (`DRAFT` | `SHARED`)
  - **Versions** — full version history (loaded from server on open); add a new version by pasting a URL or `<iframe>` embed code; auto-detects provider + render mode; "Vertical video (9:16)" checkbox appears for Frame.io, Shade, and Vimeo; per-version camera icon for quick thumbnail replace
  - **Thumbnail** — drag-and-drop, click to browse, or paste (⌘V) to upload a thumbnail image. Shows current thumbnail preview with a "Current" badge. Uploads direct to R2 via presigned URL.

**Client page preview (`/projects/[id]/delivery/page`):**

- Preview of what the client will see at `/d/[token]`
- Shows published vs. draft status, section count, asset count

**Public delivery pages (no auth — `/d/[token]`):**

Fully public. Token-authenticated at the route level — not Clerk-auth-gated. Rate-limited via the existing middleware.

- **`/d/[token]`** — Asset listing page: workspace logo, sections, asset cards with thumbnail + provider badge. "Unseen" badge for assets the client hasn't opened yet.
- **`/d/[token]/[assetToken]`** — Individual asset view, specific to the current version. Renders one of:
  - **IFRAME** — embed player (Frame.io, Shade, Vimeo, YouTube, Google Drive, etc.)
  - **NATIVE_MEDIA** — `<video>` tag or `<img>` for direct file URLs
  - **EXTERNAL_ONLY** — a branded link card to open in the source app

**Embed provider support:**

| Provider | Detection | Render |
|---|---|---|
| Frame.io (`f.io`, `app.frame.io`, `next.frame.io`) | URL | IFRAME |
| Shade (`shade.inc`, `*.shade.inc`) | URL | IFRAME |
| Vimeo | URL or `<iframe>` embed code | IFRAME |
| YouTube / YouTube Nocookie | URL | IFRAME |
| Google Drive (file) | URL | IFRAME |
| Google Drive (folder) | URL | EXTERNAL_ONLY |
| Dropbox | URL | EXTERNAL_ONLY |
| Direct image (`.jpg`, `.png`, `.webp`, etc.) | URL extension | NATIVE_MEDIA |
| Direct video (`.mp4`, `.webm`, `.mov`) | URL extension | NATIVE_MEDIA |
| Unknown URL | URL | EXTERNAL_ONLY |

Embed code (`<iframe>` HTML snippets) are sanitized by `detectEmbed()` in `src/lib/embed-detection.ts` — scripts stripped, only known providers accepted, only safe attributes kept. The canonical URL (with all query params) is stored; raw `embedHtml` is not stored for VIMEO (the canonical URL covers it and renders with fill styles).

**Vertical video sizing:**

The `IframeViewer` on the public asset page uses `aspectRatio: 16/9` by default. When a version is flagged `isVertical = true`, it switches to `height: 85vh / min 560px` — wide enough for portrait content and review-tool UIs. The "Vertical video (9:16)" checkbox in the Versions tab sets this flag at version creation. Frame.io, Shade, and Vimeo all support it.

**View tracking:**

- Each public asset page view writes a `DeliverableView` row (IP hash, user agent, timestamp)
- `firstClientViewAt` on `DeliverableVersion` is set on the first real client view (clears the "Unseen" badge)
- Admin/workspace member views are skipped — `auth()` is called and a DB lookup checks workspace membership before recording

**Auto-thumbnails:**

- **Vimeo** — `tryFetchThumbnail()` in `delivery.ts` calls Vimeo's oEmbed API (`vimeo.com/api/oembed.json`) after version creation, stores the `thumbnail_url` before `revalidateDelivery` fires
- **YouTube** — constructs `img.youtube.com/vi/{id}/hqdefault.jpg` (no API call, always available for public videos)
- **Shade** — `getShadeThumbnailUrl(assetId, driveId)` server action calls `GET /assets/{id}/previews?drive_id={driveId}` (Shade API v1). Pre-signed S3 URLs expire, so thumbnails are fetched dynamically at render time via the `ShadeThumbImg` client component. Requires `SHADE_API_KEY` env var (raw `sk_...` — no "Bearer" prefix). Assets stored with `/publish/` URLs have no `drive_id` and will not produce thumbnails; use the full `/drive/{driveId}/assets/{assetId}` URL format when adding Shade assets.
- **Frame.io** — no public thumbnail API; thumbnail stays null until manually uploaded via the Thumbnail tab
- **Priority:** a manually uploaded `thumbnailUrl` always wins over a dynamic provider fetch

**`DeliveryVersion.isVertical`** — `Boolean @default(false)`. Added in migration `20260628000002_version_is_vertical`.

### 8. Projects dashboard metrics (`/projects`)  

The four KPI cards are computed server-side from the primary budget phase of each non-archived project using `calcBudgetTotals` (net subtotal + markup + tax = gross). All figures are **gross totals** — the same number a client sees on a proposal.

- **Pipeline** — sum of `budgetTotalCents` (gross) for projects with at least one SENT or VIEWED proposal. Deduped to one proposal per project (latest sent). Matches the "Proposed $X" label shown on each LEAD card exactly.
- **Open Projects** — count of LEAD + ACTIVE projects.
- **Outstanding** — money owed but not yet collected, split by project status:
  - *WON projects* (`APPROVED` proposal): `budgetTotalCents − sum(amountPaidCents across all invoices)`. This captures approved-but-not-yet-invoiced amounts so a producer sees the full uncollected balance, not just what's been billed.
  - *Non-WON projects*: `sum(max(0, invoice.totalCents − invoice.amountPaidCents))` for invoices with status not VOID or PAID. Correctly ignores invoices where payment has been recorded regardless of whether the status field was manually flipped to PAID.
- **Won This Quarter** — sum of `approvedTotalCents` for proposals marked APPROVED within the current calendar quarter.

**Project card amounts** — the card footer shows financial info in priority order: Paid → Approved → Invoiced → Proposed. For WON projects, "Approved $X" uses `budgetTotalCents` (live gross from `calcBudgetTotals`) rather than the `approvedTotalCents` snapshot, which may have been stored as a net value at approval time.

### 9. File uploads — Cloudflare R2 presigned URL pipeline

All image uploads bypass the Next.js server entirely. The browser never holds raw credentials.

**Upload flow:**
1. User picks a file in `ImageUploader`. Client validates MIME type (JPEG / PNG / WebP) and size (≤ 2 MB) immediately.
2. Browser calls `getPresignedUploadUrl()` (Server Action in `src/server/actions/upload.ts`). The server re-validates, generates a workspace-namespaced path (`folder/workspaceId-uuid.ext`), and issues a `PutObjectCommand` presigned URL that expires in **60 seconds**.
3. Browser `PUT`s the binary directly to R2. Next.js never touches the file bytes.
4. On success, `onUploadComplete(publicUrl)` fires with the permanent public URL for the caller to persist.

**Preview strategy:** `ImageUploader` keeps the local `blob:` URL as the visual preview for the session — it's already rendered and doesn't depend on the R2 public URL being immediately accessible. The R2 URL is only persisted to the database.

**Upload destinations:**

| Folder | Use case | DB column |
|--------|----------|-----------|
| `avatars/` | Rolodex contact photos, user profile avatar | `Contact.avatarUrl`, `User.avatarUrl` |
| `logos/` | Workspace branding | `Workspace.logoUrl`, `Workspace.logoDarkUrl` |
| `client-logos/` | Per-client logo | `Client.logoUrl` |
| `delivery-thumbnails/` | Deliverable version thumbnails (manual upload or replace) | `DeliverableVersion.thumbnailUrl` |
| `delivery-covers/` | Delivery page cover images | reserved |

**User avatar note:** `getCurrentUser()` in `src/lib/auth.ts` no longer overwrites `User.avatarUrl` with Clerk's `imageUrl` on every request — it only sets it during initial account creation. Once a custom R2 avatar is uploaded, it persists. Users can update their avatar in **Settings → My profile**.

### 10. Actuals tracker (`/projects/[id]/actuals`)

Post-production spend tracking per project.

- **Per-line-item actuals** — each budget line item gets an editable `actualCents` field. Amounts start at `null` (untouched) and are entered as the project wraps.
- **Ad-hoc entries** — add arbitrary spend not in the budget: description, amount, optional date, optional vendor contact (Rolodex link), status toggle (Pending / Approved).
- **Status** — each entry is `PENDING` (default) or `APPROVED`. The editor shows a green checkmark badge for approved entries.
- **Wrap Report** (`/projects/[id]/actuals/wrap`) — summary dashboard showing:
  - Four KPI cards: Billed (approved proposal), Budget, Actual cost, Margin
  - Account-level table with budgeted vs. actual vs. variance and a per-account burn bar
  - Top overages ranked list
  - **Download PDF** — `/api/pdf/wrap-report/[projectId]` generates a branded PDF via `@react-pdf/renderer`
- **Project card burn bar** — when actuals exist, each project card shows a small burn bar (`actual / budget`) coloured green (<80%), amber (80–100%), or red (>100%).

## Project Archiving

Projects can be archived from two places:
- **Project list** — hover any card to reveal an Archive button (top-right corner). Removed optimistically from the list immediately.
- **Project header** — Archive button next to Edit on the project detail page, with a confirmation dialog.

Archived projects are excluded from `/projects` by default. A subtle "View archived" link in the page subtitle opens `/projects?archived=1`. From that view, each card has a Restore button that returns the project to Active status.

## Confirmation Dialogs

All destructive actions use a custom in-app `useConfirm()` hook instead of `window.confirm()`. (Chrome's native dialog can be permanently suppressed per-origin via "Don't show again", which breaks all guarded actions.)

The hook renders a React dialog portalled to `document.body` — safe inside table rows, `overflow:hidden` containers, and everywhere else in the DOM.

Each dialog type has a stable `key`. When shown, a **"Don't show again"** checkbox lets you suppress that specific dialog type. Preferences are stored in `localStorage` under `ttp_confirm_skip:<key>`. Suppressing line item deletes never affects the archive contact dialog or any other type.

To reset a suppressed dialog: `localStorage.removeItem('ttp_confirm_skip:<key>')` in the browser console.

## Document Hub (`/templates`)

A tabbed hub (`TemplatesPageClient`) with four tabs:

- **Budgets** — Full Templates that seed an entire project budget (all accounts + line items). Tagged by shoot type; structure editor + bulk import on the detail page.
- **Add-on Packages** — building blocks inserted into any existing budget phase via "Insert package".
- **Proposals** — a live `ProposalTemplatePreview`: a polished client-facing proposal mockup (Overview / Scope / Estimate) that renders the workspace's R2 logo and applies its brand color dynamically to every accent. Links to Settings → Branding.
- **Invoices** — "Coming Soon" placeholder for branded invoice templates.

> Budgets and Add-on Packages are both `BudgetTemplate` rows distinguished by `kind` (`FULL` | `PACKAGE`).

## Project Activity Feed

The project's **Project Notes** drawer (`ProjectNotesPanel`) hosts a ClickUp-style activity thread (`ActivitySidebar` + `CommentInput`) backed by the `ProjectComment` model, replacing the old static project-notes textarea:

- **Client Notes callout** pinned at the top (read-only `Client.specialNotes`).
- **Scrollable comment thread** — bordered cards with author avatar, name, and `date-fns` timestamps ("Today at 2:15 PM", "Nov 17 at 3:01 PM"); only the thread scrolls.
- **Sticky composer** — auto-growing textarea, Enter to send / Shift+Enter for newline, `useActionState` pending state, clears on success.
- **Non-destructive legacy migration** — `getProjectActivity()` surfaces any pre-existing `Project.notes` text as the first **pinned** comment (authored by the project creator) rather than migrating it destructively. The `Project.notes` column is read-only now; the old `updateProjectNotes` action was removed.

## Per-workspace Branding

Client-facing documents render with each workspace's own `primaryColor` / `accentColor` / `logoUrl`, set in **Settings → Branding** (R2 logo upload + color picker). Defaults are the SlateSuite palette (`#5D00A4` purple, `#04FFCC` mint).

- **Web views** (`ProposalPublicView`, `InvoicePublicView`) — brand colors flow via CSS variables set on the document root (`--brand-v`, `--brand-mint`, `--gradient-cover`), each with the SlateSuite hex as the `var()` fallback. The logo prefers the workspace's dark-bg variant and falls back to the **workspace name** — never the TTP logo.
- **Invoice PDF** (`InvoicePDF`, `@react-pdf/renderer`) — can't use CSS variables, so its `StyleSheet` is a `makeStyles(V, MINT)` factory fed from invoice data; logo prefers the workspace R2 URL.
- **Invoice email** (`sendInvoiceEmail`) + its send-modal preview + the Helcim pay button — same per-workspace colors.
- Color math lives in `src/lib/color.ts` (`lighten` / `darken` / `safeHex`). A workspace that never customizes inherits the SlateSuite purple default.

## Bulk Import Format

Both budgets and templates accept `.csv` or `.json` import files.

**CSV columns:**

| Column | Required | Description |
|--------|----------|-------------|
| `accountName` | ✓ | Account group — created if it doesn't exist, extended if it does |
| `description` | — | Line item label. Falls back to `accountName` if blank |
| `qty` | — | Quantity, decimals allowed (default: 1) |
| `unit` | — | Hour / Half Day / Day / Week / Flat / Each / Mile (default: Flat) |
| `rate` | ✓* | Rate in **dollars** — `1500` for $1,500/day |
| `rateCents` | ✓* | Rate in cents (legacy) — `150000` for $1,500/day |
| `markupPct` | — | Per-item markup as decimal — 10% → `0.10` |
| `hasMarkup` | — | `true`/`false` — whether agency fee applies (default: true) |
| `taxRate` | — | Per-item tax as decimal — 8.75% → `0.0875` |
| `notes` | — | Internal note shown next to the description |

*Provide either `rate` (preferred) or `rateCents` — not both.

## File Structure

```
ttp-budget/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                              # Populates GlobalRateCard + GlobalTemplate; preserves TTP workspace data
│   └── migrations/                          # Manual SQL migration files (run in Neon SQL Editor)
│       ├── 20260614000001_add_call_time_format/migration.sql
│       ├── 20260614000002_add_mismatch_flag/migration.sql
│       ├── 20260614000003_secure_public_tokens/migration.sql
│       ├── 20260615000001_crew_workflow/migration.sql
│       │                                    #   Contact: hasKit, kitRateCents, kitName
│       │                                    #   LineItem: contactId → Contact (ON DELETE SET NULL)
│       ├── 20260627000001_budget_sections/migration.sql
│       │                                    #   BudgetSection table (workspaceId, phaseId, title, orderIndex)
│       │                                    #   Account.sectionId FK (NOT NULL after backfill)
│       │                                    #   Phase.pageBreakBetweenAccounts, Phase.sectionsNudgeDismissedAt
│       │                                    #   Backfills one "Main" section per existing phase
│       ├── 20260627000002_workspace_expiry_days/migration.sql
│       ├── 20260628000001_delivery_feature/migration.sql
│       │                                    #   DeliveryPage, DeliverableSection, DeliverableAsset,
│       │                                    #   DeliverableVersion (url, provider, renderMode, embedHtml,
│       │                                    #   thumbnailUrl, note, firstClientViewAt), DeliverableView
│       ├── 20260628000002_version_is_vertical/migration.sql
│       │                                    #   DeliverableVersion.isVertical Boolean @default(false)
│       ├── 20260701000001_project_team/migration.sql
│       │                                    #   ProjectTeamRole enum (PROJECT_LEAD, ACCOUNT_MANAGER, PROJECT_MANAGER)
│       │                                    #   ProjectTeamMember table + 4 indexes
│       │                                    #   Partial unique index: one active holder per role per project
│       ├── 20260703000001_delivery_overview/migration.sql
│       │                                    #   DeliveryPage.overview TEXT — Smart Text overview block above sections
│       └── 20260703000002_client_legalname_invoice_paymentterms/migration.sql
│                                            #   Client.legalName TEXT — legal entity name shown on invoice BILL TO
│                                            #   Invoice.paymentTerms TEXT — short label (e.g. "Net 30"); auto-set from workspace default
├── scripts/
│   ├── audit-scoped-models.ts              # Security: verify all workspaceId models are in SCOPED_MODELS; exits 1 on gaps
│   ├── report-token-formats.ts             # Security: report UUID v4 vs legacy token counts per public-token model
│   ├── verify-scoping.ts                   # Security: adversarial cross-workspace IDOR probe (5 models)
│   ├── backfill-callsheet-contacts.ts      # F6: link existing crew/talent rows to Rolodex contacts by name+email (--apply to write)
│   ├── backfill-workspace-ids.ts           # A1: fill workspaceId on Phase/Account/LineItem/ProjectMember rows
│   ├── backfill-deliverable-ids.ts         # Add stable UUIDs to existing deliverable JSON items (prerequisite for section linking)
│   ├── backfill-clerk-orgs.ts              # One-time: create Clerk orgs for workspaces that lack one
│   ├── dedupe-workspaces.ts                # Find + remove duplicate workspaces by name/owner
│   ├── fix-workspace-links.ts              # Audit + repair Clerk org ↔ DB workspace mapping
│   ├── rotate-public-tokens.ts             # Upgrade CUID1 publicTokens to UUID v4 (--dry-run default, --live to write, --all for non-drafts)
│   └── seed-existing-workspaces.ts         # Backfill empty workspaces with global library (--seed flag)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── dashboard/
│   │   │   ├── clients/[id]/
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx                 # Active projects grid (+ ?archived=1 view); pipeline/outstanding use gross calcBudgetTotals
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx             # Project hub
│   │   │   │       ├── layout.tsx           # Project sub-layout + secondary sidebar
│   │   │   │       ├── crew/                # External crew list (Rolodex contacts with role/rate)
│   │   │   │       ├── team/                # Internal workspace team (PL / AM / PM role slots)
│   │   │   │       ├── actuals/             # Actuals tracker (per-line spend, ad-hoc entries, status)
│   │   │   │       │   └── wrap/            # Wrap report — budgeted vs. actual, PDF download
│   │   │   │       ├── call-sheets/[csId]/  # Call sheet editor page
│   │   │   │       └── delivery/
│   │   │   │           ├── deliverables/    # Admin deliverables manager (sections, assets, drag-and-drop)
│   │   │   │           └── page/            # Client page preview + publish/unpublish
│   │   │   ├── proposals/
│   │   │   ├── invoices/
│   │   │   ├── rates/
│   │   │   ├── templates/[id]/
│   │   │   ├── library/                     # Global library catalog
│   │   │   ├── rolodex/
│   │   │   │   ├── page.tsx                 # Contact directory (grid + list + role filter)
│   │   │   │   └── [id]/page.tsx            # Contact detail — info, projects, call sheet history
│   │   │   ├── team/                        # Workspace team members + invite (page redirects non-OWNER)
│   │   │   ├── onboarding/                  # First-time setup wizard
│   │   │   └── settings/
│   │   │       └── layout.tsx               # RBAC gate — redirects non-OWNER to /
│   │   ├── m/                               # Mobile routes (UA-redirected from /d/; all Clerk-public)
│   │   │   ├── sign-in/                     # Mobile-optimized Clerk sign-in
│   │   │   ├── sign-up/                     # Mobile-optimized Clerk sign-up
│   │   │   └── d/[token]/
│   │   │       ├── page.tsx                 # Mobile delivery portal listing
│   │   │       └── [assetToken]/page.tsx    # Mobile asset viewer — .m-embed-wrap iframe fill pattern
│   │   ├── (public)/
│   │   │   ├── p/[token]/page.tsx           # Proposal public view (draft-aware; per-workspace branded)
│   │   │   ├── i/[token]/page.tsx           # Invoice public view (per-workspace branded)
│   │   │   ├── cs/[token]/page.tsx          # Call sheet public view (draft-aware)
│   │   │   ├── invite/[token]/page.tsx      # Team invitation acceptance
│   │   │   ├── d/[token]/page.tsx           # Public delivery listing — sections + asset cards + unseen badges
│   │   │   └── d/[token]/[assetToken]/page.tsx  # Public asset view — IframeViewer (16:9 or 85vh), NativeMediaViewer, ExternalLinkView
│   │   │                                    #   View tracking: records DeliverableView, sets firstClientViewAt
│   │   │                                    #   Skips tracking for workspace members (auth() check + DB lookup)
│   │   └── api/
│   │       ├── address-autocomplete/        # Nominatim-backed address search; venue names; server-side to avoid CORS
│   │       ├── pdf/proposal/[token]/         # Proposal PDF — token IS the credential (never accepts raw DB id)
│   │       ├── pdf/invoice/[token]/          # Invoice PDF — same token-keyed pattern
│   │       ├── pdf/wrap-report/[projectId]/  # Wrap report PDF — Clerk-auth-gated (NOT public); @react-pdf/renderer → binary stream
│   │       ├── proposals/[id]/approve/
│   │       └── webhooks/clerk/              # user.created, organization.created, organizationMembership.created
│   ├── components/
│   │   ├── ui/
│   │   │   ├── confirm-dialog.tsx           # useConfirm() hook — portal-based confirm with "Don't show again"
│   │   │   └── … (shadcn primitives)
│   │   ├── budget/
│   │   │   └── BulkImportModal.tsx
│   │   ├── call-sheets/
│   │   │   ├── CallSheetEditor.tsx          # Full call sheet editor with all sections
│   │   │   ├── CrewEditor.tsx               # Dept-grouped crew table; Rolodex typeahead; contactId linking
│   │   │   ├── TalentEditor.tsx             # Flat talent list; Rolodex typeahead; contactId linking
│   │   │   ├── RolodexNameInput.tsx         # Typeahead input: filters contacts by name, portal dropdown
│   │   │   ├── ScheduleEditor.tsx           # Time blocks with start/end/whoNeeded
│   │   │   └── ProjectCallSheets.tsx        # Call sheets section on project page
│   │   ├── library/
│   │   │   └── LibraryPageClient.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx                  # Workspace switcher, nav, user footer + sign-out
│   │   │   └── TopBar.tsx
│   │   ├── proposals/
│   │   │   ├── ProposalsKanban.tsx          # Drag-and-drop Kanban; WON + LOST columns droppable
│   │   │   ├── ProposalsTable.tsx           # All-proposals table with per-row delete
│   │   │   └── ProposalTemplatePreview.tsx  # Branded proposal mockup (Document Hub → Proposals tab)
│   │   ├── projects/
│   │   │   ├── projects-types.ts            # Shared types (ProjectForCard, ProjectInvoiceSnap incl. amountPaidCents, …)
│   │   │   ├── ProjectMetricsStrip.tsx      # 4 solid-color KPI cards; metrics exclude ARCHIVED projects
│   │   │   ├── ProjectStatusPills.tsx       # URL-param status filter pills with counts
│   │   │   ├── ProjectCard.tsx              # Rich project card; "Approved $X" uses live budgetTotalCents for WON projects
│   │   │   ├── ProjectsAttentionSidebar.tsx # Sticky right-rail — attention items, upcoming shoots, week stats
│   │   │   ├── BudgetEditor.tsx             # Click description → edit modal; category badges; passes contactId on edit open
│   │   │   ├── BudgetSummaryBar.tsx
│   │   │   ├── LineItemModal.tsx            # Add + Edit modal; CREW category shows Rolodex typeahead; kit auto-insert preview
│   │   │   ├── ProjectHeaderActions.tsx     # Edit + Archive/Restore buttons on project header
│   │   │   ├── ProjectsPageClient.tsx       # URL-param sort/filter/view; sidebar hidden below xl
│   │   │   ├── ProjectProposals.tsx         # Proposals table with status dropdown (incl. Won)
│   │   │   ├── ProjectTeam.tsx              # Per-project crew list; MemberCard BookUser button opens ContactModal inline
│   │   │   ├── ProposalModal.tsx            # Create/edit/send proposals + payment schedule + discounts
│   │   │   ├── ProjectInvoices.tsx
│   │   │   ├── FloatingBulkActionBar.tsx    # Budget bulk actions — mass edit / group / delete
│   │   │   ├── ProjectNotesPanel.tsx        # Slide-out drawer: Team section → activity feed → client contact info
│   │   │   ├── ProjectTeamSection.tsx       # 3 role slots (PL/AM/PM) with assign/replace/remove + history
│   │   │   ├── AssignTeamMemberModal.tsx    # Searchable workspace-user picker; "Already: [Role]" chips
│   │   │   ├── TeamHistoryList.tsx          # Collapsible; lazy-loads past role holders via getProjectTeamHistory
│   │   │   ├── EditTeamModal.tsx            # Fixed overlay wrapping ProjectTeamSection; opened from card kebab
│   │   │   ├── ActivitySidebar.tsx          # Project comment thread + client-notes callout + sticky composer
│   │   │   ├── CommentInput.tsx             # Auto-grow composer; useActionState; Enter to send
│   │   │   ├── AssignCollaborators.tsx      # OWNER/PRODUCER dialog — assign Collaborators to a project
│   │   │   └── ProposalOverview.tsx
│   │   ├── delivery/
│   │   │   ├── DeliverablesManager.tsx      # Admin manager: sections, asset cards, DnD, optimistic add/move
│   │   │   ├── AssetEditorModal.tsx         # 3-tab modal: Details, Versions (history + add + vertical toggle), Thumbnail (drag/drop/paste)
│   │   │   ├── SmartTextEditor.tsx          # Textarea + Bold/Link toolbar; renders Smart Text syntax
│   │   │   └── ClientPagePreview.tsx        # Read-only preview of the published client portal
│   │   ├── actuals/
│   │   │   └── WrapReportPDF.tsx            # @react-pdf/renderer Document for the wrap report PDF
│   │   ├── rolodex/
│   │   │   ├── RolodexClient.tsx            # Grid + list views, role filter, import, merge
│   │   │   ├── ContactCard.tsx              # Card + amber kit badge (Briefcase icon) when hasKit = true
│   │   │   ├── ContactDetailClient.tsx      # Edit button for /rolodex/[id] — opens ContactModal
│   │   │   ├── ContactModal.tsx             # Create/edit contact; avatar upload via ImageUploader; kit toggle → kitName + kitRateCents; accepts projectId for team-page revalidation
│   │   │   ├── ImportFromCallSheetsModal.tsx
│   │   │   └── MergeDuplicatesModal.tsx
│   │   ├── team/
│   │   │   ├── TeamPageClient.tsx           # Workspace members + invite form
│   │   │   └── InviteAcceptClient.tsx       # /invite/[token] acceptance UI
│   │   ├── proposal/
│   │   │   ├── ProposalPublicView.tsx       # Multi-section: section anchors, highlight animation, subtotal rows, clickable deliverable cards
│   │   │   └── ProposalPDF.tsx             # Multi-section: page breaks between sections, section headings + subtotals, §deliverable refs
│   │   ├── public/
│   │   │   └── PrintTrigger.tsx             # Client component: delays 800 ms then calls window.print() when ?print=1
│   │   ├── settings/
│   │   │   ├── DangerZone.tsx
│   │   │   ├── WorkspaceDataSection.tsx
│   │   │   └── SettingsForm.tsx              # Workspace tabs + "My profile" tab — avatar upload via ImageUploader
│   │   ├── ui/
│   │   │   └── ImageUploader.tsx            # Reusable circular avatar uploader; presigned PUT to R2; blob preview stays local
│   │   └── invoice/
│   ├── lib/
│   │   ├── db.ts
│   │   ├── db-scoped.ts                     # getScopedDb() — Prisma $extends() for row-level security
│   │   ├── auth.ts                          # getCurrentUser, getWorkspaceId, getActiveWorkspace
│   │   │                                    #   getCurrentRole() + requireRole(roles) → typed UNAUTHORIZED_ROLE (RBAC)
│   │   │                                    #   upsert no longer overwrites User.avatarUrl with Clerk imageUrl if already set
│   │   ├── budget-visibility.ts             # canSeeFinancials(role) + stripBudgetForRole() — server-side margin redaction
│   │   ├── color.ts                         # lighten / darken / safeHex — per-workspace document branding
│   │   ├── r2.ts                            # S3Client singleton for Cloudflare R2 (region: auto)
│   │   ├── workspace-seeder.ts              # seedWorkspaceFromGlobals + reseedWorkspaceFromGlobals
│   │   ├── money.ts                         # cents ↔ display, parseQtyFormula, fmtUnit
│   │   ├── totals.ts                        # calcBudgetTotals(accounts, markupPct, taxPct) → { subtotalCents, markupCents, taxCents, grandTotalCents }
│   │   ├── importSchema.ts
│   │   ├── invoice-numbering.ts
│   │   ├── json-safe.ts                     # toJsonSafe() — replaces JSON.parse(JSON.stringify()); handles Decimal
│   │   ├── secure-token.ts                  # generatePublicToken() — crypto.randomUUID() UUID v4
│   │   ├── time-format.ts                   # formatTime(hhmm, format) — "07:00" → "7:00 AM" or "07:00"; TimeFormat type
│   │   ├── embed-detection.ts               # detectEmbed(urlOrHtml) — classifies provider + renderMode + canonicalUrl
│   │   │                                    #   sanitizeIframe: strips scripts, validates src against provider allow-list,
│   │   │                                    #   rebuilds <iframe> with safe attrs only. Never stores VIMEO embedHtml —
│   │   │                                    #   canonicalUrl carries all query params and fills the container correctly.
│   │   ├── smart-text.ts                    # renderSmartText(raw) → safe HTML (**bold**, [link](url), newlines)
│   │   │                                    #   stripSmartText(raw) → plain text (for truncated previews)
│   │   └── email.ts
│   └── server/
│       └── actions/
│           ├── budgets.ts                   # upsertLineItem: CREW + contactId → runCrewWorkflow (member upsert + auto-kit line item)
│           ├── sections.ts                  # BudgetSection CRUD: create, rename, reorder, delete, moveAccountToSection
│           │                                #   setDeliverableSectionLinks — saves sectionIds on deliverable JSON items
│           │                                #   togglePageBreakBetweenAccounts — phase-level PDF setting
│           │                                #   dismissSectionsNudge — sets sectionsNudgeDismissedAt
│           ├── call-sheets.ts               # CRUD + importCrewFromBudget + fetchLocationData
│           │                                #   createCallSheet seeds crew from Teams page members (not rate cards)
│           │                                #   updateCallSheet: syncSheetCallTimesToMembers (callTime→Teams) +
│           │                                #                    syncSheetMembersToTeam (Rolodex-linked rows→Teams upsert)
│           ├── import.ts
│           ├── library.ts
│           ├── proposals.ts                 # updateProposalStatus → reconcileTeamFromWonProposal on APPROVED
│           │                                #   markProposalWon, markProposalLost
│           ├── invoices.ts
│           ├── rates.ts
│           ├── templates.ts
│           ├── clients.ts
│           ├── projects.ts                  # archiveProject, unarchiveProject
│           ├── project-members.ts           # seedTeamFromBudget (proposal-first), removeProjectMember
│           │                                #   updateProjectMember: syncMemberCallTimeToCallSheets (callTime→sheets)
│           │                                #   dismissMismatch — clears mismatchFlag on a team card
│           ├── actuals.ts                   # CRUD actuals, getWrapReportData, ActualStatus (PENDING | APPROVED)
│           ├── rolodex.ts                   # CRUD contacts; kit fields (hasKit, kitRateCents, kitName) in schema + selects
│           │                                #   updateContact: optional projectId → revalidates /projects/[id]/team
│           │                                #   getContactForModal: lightweight fetch for team-page modal pre-fill
│           │                                #   searchContacts: returns kit fields for LineItemModal typeahead
│           ├── team.ts                      # invite/revoke/accept + changeMemberRole (OWNER-gated); webhook honours invited role
│           │                                #   removeWorkspaceMember: atomically marks all active ProjectTeamMember rows
│           │                                #     USER_LEFT_WORKSPACE before revoking Clerk membership
│           ├── comments.ts                  # getProjectActivity (legacy notes → pinned comment) + addProjectComment
│           ├── project-team.ts              # getProjectTeam, getProjectTeamHistory, listEligibleUsersForProjectTeam
│           │                                #   assignProjectTeamRole: atomic tx — marks old holder REPLACED, creates new row,
│           │                                #     auto-creates ProjectAssignment for visibility in same transaction
│           │                                #   unassignProjectTeamRole: marks REMOVED; optionally deletes ProjectAssignment
│           │                                #   getActiveProjectRolesForUser: OWNER-only; powers workspace-member-removal confirm
│           │                                #   All mutating actions revalidate /projects, /proposals, /clients
│           ├── assignments.ts               # getProjectAssignees + setProjectAssignment (Collaborator visibility; OWNER/PRODUCER-gated)
│           ├── upload.ts                    # getPresignedUploadUrl() — issues 60 s PutObjectCommand ticket to R2; never touches file bytes
│           │                                #   Folders: avatars, logos, client-logos, delivery-covers, delivery-thumbnails
│           ├── delivery.ts                  # Full delivery CRUD: createDeliveryPage, createSection, createAsset, addVersion,
│           │                                #   updateVersion (thumbnailUrl, isVertical, note), deleteVersion, setCurrentVersion,
│           │                                #   getAssetVersions, recordDeliverableView, generateFromProposal
│           │                                #   tryFetchThumbnail: Vimeo oEmbed + YouTube hqdefault — runs before revalidateDelivery
│           └── workspace.ts                 # updateBrandingSettings (primaryColor/accentColor), getLogoUploadUrl/saveWorkspaceLogo
│                                            #   updateProductionSettings — saves callTimeFormat; updateUserAvatar(url)
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

## Environment Variables

```bash
DATABASE_URL="postgresql://..."

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

RESEND_API_KEY=
RESEND_FROM_EMAIL="proposals@thethirdplace.co"

# Cloudflare R2 — get from Cloudflare dashboard → R2 → Manage R2 API tokens
# Endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
CLOUDFLARE_R2_ENDPOINT=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=slatesuite
# Public read URL for the bucket (custom domain or r2.dev subdomain)
# Cloudflare dashboard → R2 → your bucket → Settings → Public access
NEXT_PUBLIC_R2_PUBLIC_URL="https://assets.slatesuite.io"

NEXT_PUBLIC_APP_URL="https://budget.thethirdplace.co"

# Shade — video review platform; raw sk_... key (no "Bearer" prefix)
SHADE_API_KEY=sk_...

# Upstash Redis — multi-instance-safe rate limiter (required for multi-replica deploys)
# Get from console.upstash.com → your database → REST API
# Omit both to fall back to in-process Map (single-instance only)
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

## Development

```bash
npm install
npm run dev          # localhost:3000

# After schema changes (see Engineering Conventions for full workflow):
# 1. Edit prisma/schema.prisma
# 2. Write migration SQL → prisma/migrations/<date>_<name>/migration.sql
# 3. Run the SQL in Neon SQL Editor (console.neon.tech)
# 4. Run npx prisma generate locally to regenerate the client types
# 5. Run npx tsc --noEmit to verify clean compile before pushing

# Populate global library (idempotent — safe to run multiple times):
npm run db:seed

# Maintenance scripts:
npx tsx scripts/fix-workspace-links.ts            # audit Clerk org ↔ DB workspace mapping
npx tsx scripts/fix-workspace-links.ts --fix      # repair orphan orgs + stale links
npx tsx scripts/seed-existing-workspaces.ts       # preview empty workspaces
npx tsx scripts/seed-existing-workspaces.ts --seed  # seed them

# F6: link existing call sheet crew/talent rows to Rolodex contacts by name+email:
npx tsx scripts/backfill-callsheet-contacts.ts         # dry-run (no writes)
npx tsx scripts/backfill-callsheet-contacts.ts --apply # apply changes

# BudgetSections: add stable UUIDs to existing deliverable JSON items (prerequisite for section linking):
npx tsx scripts/backfill-deliverable-ids.ts            # dry-run (shows what would change)
npx tsx scripts/backfill-deliverable-ids.ts --apply    # write UUIDs to DB

# Rotate public tokens — upgrades CUID1 tokens to UUID v4:
npx tsx scripts/rotate-public-tokens.ts                  # dry-run (preview what would change)
npx tsx scripts/rotate-public-tokens.ts --live           # rotate DRAFT records only (safe)
npx tsx scripts/rotate-public-tokens.ts --live --all     # rotate ALL records (invalidates live shared links)

# Security audits:
npm run audit:scoping    # verify all workspaceId models are in SCOPED_MODELS (exits 1 on gaps)
npm run audit:tokens     # report UUID v4 vs legacy token counts per public-token model
```

## Clerk Webhook Setup

The `/api/webhooks/clerk` endpoint must be registered in the Clerk dashboard. Required events:

| Event | Purpose |
|-------|---------|
| `user.created` | Creates the DB workspace + user, creates a Clerk org, seeds rate cards + templates |
| `organization.created` | Fallback linker for orgs created outside the app |
| `organizationMembership.created` | Attaches invited members to the org's workspace |

The webhook uses `svix` signature verification. Set `CLERK_WEBHOOK_SECRET` from the Clerk dashboard endpoint page.

## Payments (Helcim)

Online invoice payments use **HelcimPay.js** (the hosted iFrame). Flow:

1. `POST /api/payments/initiate` (public, authed by invoice `publicToken`) → `initializeCheckout()` returns `checkoutToken` + `secretToken`. A `PaymentAttempt` row is created/refreshed with a unique `checkoutRef` that's attached to the Helcim transaction (as `invoiceNumber`) so an async webhook can map back to it.
2. `HelcimPayButton` opens the iFrame; the customer pays.
3. The iFrame returns transaction data + a hash → browser `POST /api/payments/confirm` → hash validated, transaction re-fetched server-to-server, amount verified, invoice flipped to `PAID`.
4. On settlement (whether via browser confirm or webhook), a **payment receipt email** is sent to the client via Resend. The email includes the invoice number, amount paid, and a link back to the invoice. Sent deduped — only fires once per `PaymentAttempt`, even if both paths race.

### Webhooks — the async backstop (`/api/webhooks/payments`)

If the browser confirm never fires (closed tab, lost signal, or async ACH/EFT that settles later), the Helcim webhook settles the invoice instead. The payload is thin (`{ id, type }`), so the handler:

1. **Verifies the signature** — HMAC-SHA256 (Svix scheme) over `${webhook-id}.${webhook-timestamp}.${rawBody}` keyed by the base64-decoded **Verifier Token** (`HELCIM_WEBHOOK_VERIFIER_TOKEN`). Invalid → 401. Timestamp outside ±5 min → 400.
2. **Idempotency** — records `webhook-id` in `WebhookEvent` (`@@unique([provider, eventId])`); duplicates short-circuit.
3. **Maps to the attempt** — `getTransaction(id)` returns the `invoiceNumber` we set at init (= our `checkoutRef`) → finds the `PaymentAttempt`.
4. **Settles** — shared `settlePaymentAttempt()` (same path as confirm). The atomic `INITIATED → SUCCEEDED` compare-and-set + `@@unique([provider, providerRef])` mean confirm and webhook can never double-settle.

> The init call attaches the reference via Helcim's `invoiceRequest`. If that body shape is rejected, `initializeCheckout()` **transparently retries without it** so payments never break — that one payment just loses its webhook backstop. Watch logs for `retrying without invoiceRequest`.

**Setup:** in the Helcim dashboard (All Tools → Integrations → Webhooks), enable webhooks, set the deliver URL to `https://<your-app>/api/webhooks/payments`, subscribe to **Card Transaction** events, and copy the **Verifier Token** into `HELCIM_WEBHOOK_VERIFIER_TOKEN`. `HELCIM_API_TOKEN` (Integrations → API Access) must also be set.

## Security

Four hardening phases were applied to the production codebase:

| Phase | Scope |
|-------|-------|
| **Phase 1** | `SCOPED_MODELS` completeness audit — all workspaceId-carrying models verified in `src/lib/db-scoped.ts`; Receipt IDOR fixed (token-keyed lookup, never raw DB id) |
| **Phase 2** | PDF endpoint IDOR audit — `/api/pdf/proposal/[token]` and `/api/pdf/invoice/[token]` verified to use `publicToken` as the sole credential; middleware hardening |
| **Phase 3** | Upstash Redis rate limiter — replaced in-process Map with `@upstash/ratelimit` for multi-replica safety (see Rate limiting below) |
| **Phase 4** | Token format audit — all 106 public token records confirmed UUID v4; `scripts/report-token-formats.ts` added as an ongoing audit tool |

### Public token generation

`Proposal`, `Invoice`, and `CallSheet` each carry a `publicToken` used in their shareable URLs (`/p/`, `/i/`, `/cs/`). Tokens are **UUID v4** (122 bits of entropy, generated via `crypto.randomUUID()`), replacing the original CUID1 format which had only ~32 bits of randomness and embedded a timestamp fingerprint.

- Schema: `@default(dbgenerated("gen_random_uuid()::text"))` — real Postgres DEFAULT, not ORM-layer only.
- Application layer: `generatePublicToken()` from `src/lib/secure-token.ts` is called at every `.create()` call site (proposals, invoices, call sheets) as defense in depth.
- Migration: `prisma/migrations/20260614000003_secure_public_tokens/migration.sql`
- Rotation script: `scripts/rotate-public-tokens.ts` — upgrades existing CUID records to UUID v4. Dry-run by default; `--live` to write; `--all` to include SENT/APPROVED records (breaks live links — notify clients first).

### Rate limiting

`src/middleware.ts` calls `checkRateLimit(policy, ip)` from `src/lib/rate-limit.ts` before Clerk auth runs. All public-facing routes are rate-limited per IP:

| Policy | Route prefix(es) | Window | Max requests |
|---|---|---|---|
| `publicDoc` | `/p/`, `/i/`, `/cs/`, `/d/`, `/m/d/` | 60 s | 60 per IP |
| `publicPdf` | `/api/pdf/proposal/`, `/api/pdf/invoice/` | 60 s | 10 per IP |
| `payments` | `/api/payments/` | 60 s | 20 per IP |
| `geocode` | `/api/address-autocomplete` | 60 s | 30 per IP |

**Backend:** `@upstash/ratelimit` + `@upstash/redis` (multi-instance safe, survives deploys). When `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are not set, falls back to an in-process `Map` (single-instance only — fine for single-replica Railway). Returns `429 Too Many Requests` with `Retry-After` and `X-RateLimit-*` headers.

**Public route exemptions** (`src/middleware.ts` → `isPublicRoute`):

Routes that are public (Clerk auth skipped) — all are token-authenticated at the route level:

| Pattern | Purpose |
|---|---|
| `/p/(.*)` | Proposals |
| `/i/(.*)` | Invoices |
| `/cs/(.*)` | Call sheets |
| `/d/(.*)` | Delivery portals — clients have no Clerk account |
| `/m/(.*)` | Mobile delivery pages (sign-in, sign-up, /m/d/ asset views) — UA-redirected from /d/ |
| `/invite/(.*)` | Workspace invitations |
| `/api/webhooks/(.*)` | Clerk + Helcim webhooks |
| `/api/pdf/proposal/(.*)` | Proposal PDF stream (token-keyed) |
| `/api/pdf/invoice/(.*)` | Invoice PDF stream (token-keyed) |
| `/api/payments/(.*)` | Helcim payment initiation + confirmation |

> **Note:** `/api/pdf/wrap-report/` is NOT listed here — it is Clerk-auth-gated (internal only).

## Engineering Conventions

- **Money:** always integer cents. Never floats. `$1,500 → 150000`.
- **Percentages:** always decimals stored as `Decimal(6,4)`. Exception: `PaymentMilestone.percentPct` is stored as display percent (50 = 50%) in JSON.
- **Gross totals:** always use `calcBudgetTotals(accounts, markupPct, taxPct)` from `src/lib/totals.ts` when displaying a project's value. Never sum `qty × rateCents` directly for UI display — that produces a net total and will not match what the client saw on the proposal.
- **Row-level security:** all server actions use `getScopedDb()` (from `src/lib/db-scoped.ts`), a Prisma `$extends()` wrapper that auto-injects `workspaceId` on every query for scoped models. Webhook handlers and the workspace seeder use raw `db` — those run without an active Clerk session.
- **Return type:** all actions return `ActionResult<T>` — `{ success: true; data: T } | { success: false; error: string }`. Narrow with `'error' in result` (not `!result.success`) inside `startTransition` callbacks.
- **Confirm dialogs:** never use `window.confirm()`. Use the `useConfirm()` hook from `src/components/ui/confirm-dialog.tsx`. Pass a stable `key` to enable per-dialog "Don't show again" suppression.
- **ESLint:** the project does not include `@typescript-eslint` plugin. **Never** add `// eslint-disable-next-line @typescript-eslint/...` comments — they cause Railway build failures. Use proper casts instead (`as unknown as T`).
- **JSON fields:** all Prisma JSON field writes must go through `toJsonSafe(value)` from `src/lib/json-safe.ts` to avoid Decimal serialization issues. Never use raw `JSON.parse(JSON.stringify())` — `toJsonSafe` handles it and is searchable.
- **Workspace switching:** use `window.location.href = '/dashboard'` after `setActive()` — not `router.refresh()`. `router.refresh()` can hit the Next.js route cache and serve stale auth context from the previous org.
- **`router.refresh()`** syncs server-rendered data after mutations. For client state that needs to update immediately, update React state directly from the action's return value.
- **Schema changes:** we cannot run `prisma migrate dev` in Railway's build environment (binary download blocked). Workflow:
  1. Edit `prisma/schema.prisma`.
  2. Write the SQL by hand into `prisma/migrations/<date>_<name>/migration.sql`.
  3. Run the SQL manually in **Neon's SQL Editor** (console.neon.tech → project → SQL Editor).
  4. Run `npx prisma generate` locally to regenerate the Prisma client types.
  5. Run `npx tsc --noEmit` to verify a clean compile before committing.
  6. Commit both `schema.prisma` and the migration file so the history is preserved.
- **Fire-and-forget side effects:** crew workflow helpers (`runCrewWorkflow`, team reconciliation, call-time sync) are called with `void fn()` so they never block or fail the primary save. If a kit line item fails to insert, the CREW line item is still saved successfully.
- **Security audit scripts:** `npm run audit:scoping` exits 1 if any Prisma model with a `workspaceId` column is missing from `SCOPED_MODELS` in `src/lib/db-scoped.ts`. `npm run audit:tokens` reports UUID v4 vs legacy token counts per public-token model. Run both after adding new models or new public-token fields.
- **Quantity formula:** `quantityFormula = "AxB"` encodes headcount (A) × days (B). Use `parseQtyFormula()` from `money.ts` everywhere it's displayed. `fmtUnit(days, unit)` formats the unit column.
- **Line item categories:** `lineItemCategory` is auto-derived from the linked rate card's category on insert. Users can override it in the line item modal. CREW-tagged items are importable to call sheets and trigger the Magical Crew Workflow when a `contactId` is present.
- **Call sheet draft preview:** public `/cs/[token]` and `/p/[token]` both render for DRAFT status with a sticky amber banner. View analytics are skipped for drafts.
- **Global library isolation:** `GlobalRateCard` and `GlobalTemplate` are seeded once by the app. Workspace copies are independent — never update globals from workspace data, and never propagate global changes to existing workspaces.
- **Brand-safe badge contrast:** use `color-mix(in srgb, var(--brand-accent) 18%, white)` for tinted badge backgrounds instead of hardcoded colours. This adapts at browser render time to whatever brand colour the workspace sets.
- **RBAC:** gate every mutating server action behind `requireRole([...])` from `src/lib/auth.ts` and early-return `gate.error` (the typed `UNAUTHORIZED_ROLE`) — never let a Collaborator fail silently. For financial data, redact on the **server** via `stripBudgetForRole()` / zeroed KPIs before serialization; do **not** rely on CSS or conditional rendering to hide margins from a Collaborator (the data must not exist in the network payload). `requireRole` returns a single nullable-`error` object, not a `Success | Failure` union, because the repo's `strict: false` config disables discriminated-union narrowing.
- **Per-workspace document branding:** never hardcode `#5D00A4` / `#04FFCC` / `/logo.png` in client-facing documents. Thread the workspace `primaryColor` / `accentColor` / `logoUrl` through. For HTML views set CSS variables on the document root (`--brand-v`, `--brand-mint`) with the SlateSuite hex as the `var()` fallback; for `@react-pdf/renderer` (no CSS vars) use a `makeStyles(V, MINT)` factory. Derive tints/shades with `lighten` / `darken` from `src/lib/color.ts`. Logo fallback is the **workspace name**, never another workspace's logo.
- **Project archiving:** `status = 'ARCHIVED'` + `archivedAt` timestamp. The projects list filters `status: { not: 'ARCHIVED' }` by default. Archived projects are accessible at `?archived=1`.
- **Radix Select:** never pass `value=""` to `<SelectItem>`. Use a sentinel string like `"__none__"` and convert back to empty/null on `onValueChange`.
- **File uploads:** always use the presigned URL pattern — call `getPresignedUploadUrl()` from `src/server/actions/upload.ts` to get a short-lived PUT ticket, then `fetch(uploadUrl, { method: 'PUT', body: file })` from the browser. Never stream file bytes through the Next.js server. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`. Max 2 MB. Paths are workspace-namespaced (`folder/workspaceId-uuid.ext`) — never use user-supplied filenames directly as R2 keys.
- **Public tokens:** `publicToken` on Proposal, Invoice, and CallSheet must be UUID v4. Always call `generatePublicToken()` from `src/lib/secure-token.ts` at every `.create()` call site. Never use `cuid()`, `nanoid()`, or sequential IDs for public-facing tokens — the DB default is `gen_random_uuid()::text` but the app layer must also generate correctly in case the ORM layer is invoked without the DB default (e.g. raw `prisma.create` with explicit data).
