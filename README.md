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
| File storage | Vercel Blob                          |
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
`Client`, `Project`, `RateCard`, `BudgetTemplate`, `Budget`, `Proposal`, `Invoice`, `CallSheet`, `Contact`

Non-scoped (shared or workspace-metadata): `Workspace`, `User`, `Phase`, `Account`, `LineItem`, `ProposalView`, `InvoiceView`, `ProjectMember`

> **Note:** `ProjectMember` does have a `workspaceId` column (backfilled via `scripts/backfill-workspace-ids.ts`) used for IDOR protection, but the model is not fully scoped through `getScopedDb()`. Scoping is enforced by joining through the `project` relation.

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
  ├── Users (you + producers, via Clerk org membership)
  ├── RateCards (workspace-owned copies, seeded from global library)
  ├── BudgetTemplates (workspace-owned copies, seeded from global library)
  ├── Contacts (Rolodex — persistent across projects)
  │     └── ProjectMembers (crew on a project — Contact ↔ Project with role/rate override)
  │           ├── mismatchFlag Boolean  — true when a newly-won proposal no longer lists this role
  ├── Clients
  │     └── Projects
  │           ├── status   LEAD | ACTIVE | WRAPPED | ARCHIVED
  │           ├── Budgets
  │           │     ├── markupPct  (agency fee %)
  │           │     ├── taxPct     (global tax %)
  │           │     └── Phases (v1, v2, Approved, …)
  │           │           ├── description   (shown on proposal cover / "The Project" section)
  │           │           ├── deliverables  (JSON array — shown in proposal scope section)
  │           │           └── Accounts (nested tree)
  │           │                 └── LineItems
  │           │                       ├── rateCents        (snapshot at insert)
  │           │                       ├── lineItemCategory (CREW | LOCATION | EQUIPMENT | SERVICE | DELIVERABLE)
  │           │                       ├── hasMarkup        (opt-out of agency fee)
  │           │                       ├── taxRate          (per-item tax override)
  │           │                       └── quantityFormula  (A×B multiplier, e.g. "3x2" = 3 people × 2 days)
  │           ├── Proposals (public /p/[token] page + PDF)
  │           ├── Invoices  (public /i/[token] page + PDF)
  │           └── CallSheets (public /cs/[token] page)
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
| `/projects` | Operational dashboard — metrics strip (pipeline, open projects, outstanding invoices, won this quarter), status filter pills, rich project cards, attention sidebar |
| `/projects?archived=1` | Archived project grid with one-click restore |
| `/projects/[id]` | Project hub — budgets, proposals, invoices, call sheets, proposal overview |
| `/projects/[id]/team` | Per-project crew list. Seed from proposal/budget with one click. |
| `/projects/[id]/actuals` | Actuals tracker — per-line-item spend, ad-hoc entries, status (Pending/Approved), date, vendor |
| `/projects/[id]/actuals/wrap` | Wrap report — budgeted vs. actual by account, margin, top overages, PDF download |
| `/projects/[id]/call-sheets/[csId]` | Call sheet editor |
| `/proposals` | All proposals — Kanban view + full list table |
| `/invoices` | Invoice list with metrics |
| `/invoices/[id]/edit` | Invoice editor |
| `/rates` | Workspace rate card list |
| `/templates` | Budget templates — full templates & add-on packages |
| `/templates/[id]` | Template detail + structure editor |
| `/library` | Global library catalog — browse + add to workspace |
| `/rolodex` | Contact directory — grid + list view, role filter, archive |
| `/rolodex/[id]` | Contact detail — info, project history, call sheet appearances |
| `/team` | Workspace team members + invite by email |
| `/settings` | Branding, payment instructions, production preferences (call time format), workspace data, danger zone |
| `/onboarding` | First-time setup wizard (redirected automatically for new users) |

### Public (no auth, tokenized)
| Route | Description |
|-------|-------------|
| `/p/[token]` | Branded proposal — approve, download PDF, request changes. DRAFT status renders a preview banner instead of 404. |
| `/i/[token]` | Branded invoice — wire/ACH details, download PDF |
| `/cs/[token]` | Call sheet for crew — desktop 2-col layout, mobile single-column. DRAFT shows a preview banner. `?print=1` auto-triggers `window.print()`. |
| `/invite/[token]` | Team invitation acceptance page |

## The Five Core Features

### 1. Budget editor (`/projects/[id]/budgets/[budgetId]`)

A table-based editor with account groups (collapsible) and line items. Supports multiple phases (tabs) within a single budget.

Key behaviours:
- **Add line item** via modal — rate card search, description, qty, days, unit, rate, category, markup %, notes
- **Edit line item** — click any description text (dotted underline on hover) to open the full edit modal pre-filled. Pencil icon also opens it.
- **Line item categories** — each item carries a `lineItemCategory` (CREW, EQUIPMENT, LOCATION, SERVICE, DELIVERABLE). Set automatically from the linked rate card category, or override manually in the modal. Items tagged CREW feed directly into call sheet import. Category badge shown inline on the description.
- **QTY × Unit display** — headcount (QTY, dimmed if 1) and unit period ("2 Days", "Week", "Flat") as separate columns. Stored as `quantityFormula = "3x2"`. Consistent across editor, web proposal, and PDF.
- **Insert package** — pulls in a saved template package into any phase
- **Bulk import** — drag-and-drop `.csv` or `.json`; preview grouped line items before committing
- **Cross-account drag** — drag handles for reordering accounts and line items, including across account sections
- **Delete account** — removes account and all children; auto-renumbers codes
- **Per-item markup & tax** — each line item can override budget-level markup/tax, or opt out of the agency fee entirely
- **Sticky summary bar** — fixed at bottom: Net Subtotal, Markups & Taxes, Agency Fee & Tax, Grand Total

**Phase versioning** — each budget can have multiple phases (tabs):
- Rename, duplicate (copies all accounts + line items), make primary, delete
- The primary phase is used by default for proposals and invoices

### 2. Proposal builder + dual render (web + PDF)

**Proposal Overview** (on the project page) — fill in the project description and deliverables. These live on the `Phase` record, so they travel with the budget version you choose to send.

**Payment schedule** — flexible multi-payment terms set in the proposal modal:
- Default: 2 payments (50% on signing, 50% on delivery)
- Add/remove payments freely; each has a trigger (On signing, Shoot day, Delivery, Net 30/60/90, Custom date)
- Amount as percentage or fixed dollar amount (toggle per row)
- Running total indicator; save/send blocked if payments don't sum to 100%

**Proposal discounts** — add a named discount line (percentage or flat amount) in the proposal modal. Renders in the proposal total section on web, PDF, and the public page.

**Draft preview** — "Save Draft" stores the proposal. The public `/p/[token]` URL works for drafts with a sticky amber "Draft Preview" banner; sign-off section hidden.

**Status lifecycle:** `DRAFT → SENT → VIEWED → CHANGES_NEEDED → SENT → …` or `APPROVED` (Won) / `LOST` / `EXPIRED`.

**Won status** — set via dropdown on the project proposals table or by dragging the card to the WON column on the Kanban. The dropdown includes Won/Approved alongside the standard statuses. Terminal statuses (Won, Lost, Expired, Declined) show a static pill instead of the dropdown.

**Auto-advance project status** — when a proposal is marked Won (`APPROVED`), its project automatically advances from `LEAD → ACTIVE`. If the only approved proposal is later marked Lost, Declined, or Expired and no other approved proposal exists, the project reverts to `LEAD`. `WRAPPED` is intentionally manual.

**Teams page reconciliation on Win** — marking a proposal Won triggers `reconcileTeamFromWonProposal` (fire-and-forget):
- Unassigned placeholder whose role is **not** in the new proposal → deleted silently
- Assigned member whose role is **not** in the new proposal → `mismatchFlag = true` (red card with "Not in latest won proposal" warning + "Confirm position" button)
- Assigned member whose role **is** in the new proposal → `mismatchFlag = false` (cleared)
- Role in new proposal that needs more slots than currently exist → new unassigned placeholders added

**Version auto-increment** — each new proposal increments the `version` counter. The Kanban shows only the latest sent version per thread.

**Proposals Kanban** (`/proposals`): CRM-style drag-and-drop board — DRAFTS | SENT | VIEWED | CHANGES NEEDED | WON | LOST. Lost column hidden by default. All columns including WON and LOST are droppable.

**Approval flow:** client types their name → `signatureName`, `signatureIp`, `approvedAt`, `approvedTotalCents` recorded → Resend email fires → public page flips to approved state with typed signature in script font.

### 3. Invoice generation & status tracking

Invoices can be generated from a budget (choose percentage or flat amount) or created standalone (ad-hoc line items).

Numbering: `TTP-2026-001` — auto-incrementing per year, counter stored on `Workspace`.

**Status auto-flips:** `SENT → VIEWED` on first public page open. `PAID` is set manually. Overdue detection via `dueDate`.

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
- **Contact record** — name, primary role, secondary roles (tags), email, phone, Instagram, website, default rate + unit, avatar
- **Contact detail page** (`/rolodex/[id]`) — full info card, linked projects (via `ProjectMember`), and every call sheet the person appears on (scanned via `contactId` in crew/talent JSON). Edit button opens the existing `ContactModal`.
- **Archive** — soft-delete hides a contact from the Rolodex while preserving their project history
- **Import from call sheets** — scan all existing call sheets and bulk-import crew/talent into the Rolodex
- **Merge duplicates** — find and merge duplicate contacts (matching on name similarity)
- **Per-project team** (`/projects/[id]/team`) — assign Rolodex contacts to individual projects with optional role/rate overrides. Displayed as a responsive card grid grouped by department.
  - **Seed from proposal** — auto-populates on first load from CREW line items in the latest won or sent proposal (or workspace rate cards as a fallback). Attribution banner shows which proposal was used.
  - **Card states** — PlaceholderCard (Unassigned position, dashed border), MemberCard (filled, shows avatar initials, role, rate, call time, email, phone), EditCard (inline full-width form with Rolodex name search).
  - **Mismatch flag** (`mismatchFlag`) — when a new proposal is marked Won, any assigned member whose role is no longer in the proposal gets a red outline card with a "Not in latest won proposal" warning. Click **Confirm position** to dismiss (`dismissMismatch` action). Unassigned placeholders with orphaned roles are deleted automatically.
  - **Call time sync** — call times on member cards sync bi-directionally with call sheet crew/talent rows via `contactId`. Latest edit wins; sync is fire-and-forget so neither side can fail the other's save.

### 6. Actuals tracker (`/projects/[id]/actuals`)

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

## Budget Templates (`/templates`)

Two template kinds:
- **Full Template** — seeds an entire project budget (all accounts + line items)
- **Add-on Package** — a building block inserted into any existing budget phase via "Insert package"

Templates are tagged by shoot type. The template detail page has a structure editor plus bulk import support.

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
│       └── 20260614000002_add_mismatch_flag/migration.sql
├── scripts/
│   ├── backfill-callsheet-contacts.ts      # F6: link existing crew/talent rows to Rolodex contacts by name+email (--apply to write)
│   ├── backfill-workspace-ids.ts           # A1: fill workspaceId on Phase/Account/LineItem/ProjectMember rows
│   ├── backfill-clerk-orgs.ts              # One-time: create Clerk orgs for workspaces that lack one
│   ├── dedupe-workspaces.ts                # Find + remove duplicate workspaces by name/owner
│   ├── fix-workspace-links.ts              # Audit + repair Clerk org ↔ DB workspace mapping
│   └── seed-existing-workspaces.ts         # Backfill empty workspaces with global library (--seed flag)
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── dashboard/
│   │   │   ├── clients/[id]/
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx                 # Active projects grid (+ ?archived=1 view)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx             # Project hub
│   │   │   │       ├── layout.tsx           # Project sub-layout + secondary sidebar
│   │   │   │       ├── team/                # Per-project crew list
│   │   │   │       ├── actuals/             # Actuals tracker (per-line spend, ad-hoc entries, status)
│   │   │   │       │   └── wrap/            # Wrap report — budgeted vs. actual, PDF download
│   │   │   │       └── call-sheets/[csId]/  # Call sheet editor page
│   │   │   ├── proposals/
│   │   │   ├── invoices/
│   │   │   ├── rates/
│   │   │   ├── templates/[id]/
│   │   │   ├── library/                     # Global library catalog
│   │   │   ├── rolodex/
│   │   │   │   ├── page.tsx                 # Contact directory (grid + list + role filter)
│   │   │   │   └── [id]/page.tsx            # Contact detail — info, projects, call sheet history
│   │   │   ├── team/                        # Workspace team members + invite
│   │   │   ├── onboarding/                  # First-time setup wizard
│   │   │   └── settings/
│   │   ├── (public)/
│   │   │   ├── p/[token]/page.tsx           # Proposal public view (draft-aware)
│   │   │   ├── i/[token]/page.tsx           # Invoice public view
│   │   │   ├── cs/[token]/page.tsx          # Call sheet public view (draft-aware)
│   │   │   └── invite/[token]/page.tsx      # Team invitation acceptance
│   │   └── api/
│   │       ├── address-autocomplete/        # Nominatim-backed address search; venue names; server-side to avoid CORS
│   │       ├── pdf/proposal/[id]/
│   │       ├── pdf/invoice/[id]/
│   │       ├── pdf/wrap-report/[projectId]/  # Wrap report PDF — @react-pdf/renderer → binary stream
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
│   │   │   └── ProposalsKanban.tsx          # Drag-and-drop Kanban; WON + LOST columns droppable
│   │   ├── projects/
│   │   │   ├── projects-types.ts            # Shared types + helpers (ProjectForCard, statusBadgeStyle, computeProgress, …)
│   │   │   ├── ProjectMetricsStrip.tsx      # 4-card KPI strip on brand gradient (pipeline, open, invoices, won)
│   │   │   ├── ProjectStatusPills.tsx       # URL-param status filter pills with counts
│   │   │   ├── ProjectCard.tsx              # Rich project card — grid + list views, progress bar, 3-dot menu
│   │   │   ├── ProjectsAttentionSidebar.tsx # Sticky right-rail — attention items, upcoming shoots, week stats
│   │   │   ├── BudgetEditor.tsx             # Click description → edit modal; category badges
│   │   │   ├── BudgetSummaryBar.tsx
│   │   │   ├── LineItemModal.tsx            # Add + Edit line item modal (category field included)
│   │   │   ├── ProjectHeaderActions.tsx     # Edit + Archive/Restore buttons on project header
│   │   │   ├── ProjectsPageClient.tsx       # URL-param sort/filter/view; sidebar hidden below xl
│   │   │   ├── ProjectProposals.tsx         # Proposals table with status dropdown (incl. Won)
│   │   │   ├── ProjectTeam.tsx              # Per-project crew list; seed from proposal
│   │   │   ├── ProposalModal.tsx            # Create/edit/send proposals + payment schedule + discounts
│   │   │   ├── ProjectInvoices.tsx
│   │   │   └── ProposalOverview.tsx
│   │   ├── actuals/
│   │   │   └── WrapReportPDF.tsx            # @react-pdf/renderer Document for the wrap report PDF
│   │   ├── rolodex/
│   │   │   ├── RolodexClient.tsx            # Grid + list views, role filter, import, merge
│   │   │   ├── ContactCard.tsx              # Card view with hover actions (view detail / edit / archive)
│   │   │   ├── ContactDetailClient.tsx      # Edit button for /rolodex/[id] — opens ContactModal
│   │   │   ├── ContactModal.tsx             # Create/edit contact
│   │   │   ├── ImportFromCallSheetsModal.tsx
│   │   │   └── MergeDuplicatesModal.tsx
│   │   ├── team/
│   │   │   ├── TeamPageClient.tsx           # Workspace members + invite form
│   │   │   └── InviteAcceptClient.tsx       # /invite/[token] acceptance UI
│   │   ├── proposal/
│   │   │   ├── ProposalPublicView.tsx
│   │   │   └── ProposalPDF.tsx
│   │   ├── public/
│   │   │   └── PrintTrigger.tsx             # Client component: delays 800 ms then calls window.print() when ?print=1
│   │   ├── settings/
│   │   │   ├── DangerZone.tsx
│   │   │   └── WorkspaceDataSection.tsx
│   │   └── invoice/
│   ├── lib/
│   │   ├── db.ts
│   │   ├── db-scoped.ts                     # getScopedDb() — Prisma $extends() for row-level security
│   │   ├── auth.ts                          # getCurrentUser, getWorkspaceId, getActiveWorkspace
│   │   ├── workspace-seeder.ts              # seedWorkspaceFromGlobals + reseedWorkspaceFromGlobals
│   │   ├── money.ts                         # cents ↔ display, parseQtyFormula, fmtUnit
│   │   ├── totals.ts
│   │   ├── importSchema.ts
│   │   ├── invoice-numbering.ts
│   │   ├── json-safe.ts                     # toJsonSafe() — replaces JSON.parse(JSON.stringify()); handles Decimal
│   │   ├── time-format.ts                   # formatTime(hhmm, format) — "07:00" → "7:00 AM" or "07:00"; TimeFormat type
│   │   └── email.ts
│   └── server/
│       └── actions/
│           ├── budgets.ts                   # upsertLineItem accepts lineItemCategory override
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
│           ├── rolodex.ts                   # CRUD contacts, patchContactField, getContactById, getContactCallSheets, mergeContacts
│           ├── team.ts                      # sendInvitation, acceptInvitation, removeMember
│           └── workspace.ts                 # updateProductionSettings — saves callTimeFormat
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

BLOB_READ_WRITE_TOKEN=

NEXT_PUBLIC_APP_URL="https://budget.thethirdplace.co"
```

## Development

```bash
npm install
npm run dev          # localhost:3000

# After schema changes (see Engineering Conventions above for full workflow):
# 1. Edit prisma/schema.prisma
# 2. Write migration SQL → prisma/migrations/<date>_<name>/migration.sql
# 3. Run the SQL in Neon SQL Editor (console.neon.tech)
# 4. Patch node_modules/.prisma/client/index.d.ts for TypeScript types

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
```

## Clerk Webhook Setup

The `/api/webhooks/clerk` endpoint must be registered in the Clerk dashboard. Required events:

| Event | Purpose |
|-------|---------|
| `user.created` | Creates the DB workspace + user, creates a Clerk org, seeds rate cards + templates |
| `organization.created` | Fallback linker for orgs created outside the app |
| `organizationMembership.created` | Attaches invited members to the org's workspace |

The webhook uses `svix` signature verification. Set `CLERK_WEBHOOK_SECRET` from the Clerk dashboard endpoint page.

## Engineering Conventions

- **Money:** always integer cents. Never floats. `$1,500 → 150000`.
- **Percentages:** always decimals stored as `Decimal(6,4)`. Exception: `PaymentMilestone.percentPct` is stored as display percent (50 = 50%) in JSON.
- **Row-level security:** all server actions use `getScopedDb()` (from `src/lib/db-scoped.ts`), a Prisma `$extends()` wrapper that auto-injects `workspaceId` on every query for scoped models. Webhook handlers and the workspace seeder use raw `db` — those run without an active Clerk session.
- **Return type:** all actions return `ActionResult<T>` — `{ success: true; data: T } | { success: false; error: string }`. Narrow with `'error' in result` (not `!result.success`) inside `startTransition` callbacks.
- **Confirm dialogs:** never use `window.confirm()`. Use the `useConfirm()` hook from `src/components/ui/confirm-dialog.tsx`. Pass a stable `key` to enable per-dialog "Don't show again" suppression.
- **ESLint:** the project does not include `@typescript-eslint` plugin. **Never** add `// eslint-disable-next-line @typescript-eslint/...` comments — they cause Vercel build failures. Use proper casts instead (`as unknown as T`).
- **JSON fields:** all Prisma JSON field writes must go through `toJsonSafe(value)` from `src/lib/json-safe.ts` to avoid Decimal serialization issues. Never use raw `JSON.parse(JSON.stringify())` — `toJsonSafe` handles it and is searchable.
- **Workspace switching:** use `window.location.href = '/dashboard'` after `setActive()` — not `router.refresh()`. `router.refresh()` can hit the Next.js route cache and serve stale auth context from the previous org.
- **`router.refresh()`** syncs server-rendered data after mutations. For client state that needs to update immediately, update React state directly from the action's return value.
- **Schema changes:** we cannot run `prisma migrate dev` or `prisma generate` in Railway's build environment (binary download blocked). Workflow:
  1. Edit `prisma/schema.prisma`.
  2. Write the SQL by hand into `prisma/migrations/<date>_<name>/migration.sql`.
  3. Run the SQL manually in **Neon's SQL Editor** (console.neon.tech → project → SQL Editor).
  4. Patch `node_modules/.prisma/client/index.d.ts` with targeted `sed`/Python edits to add the new field to all relevant type interfaces (output types, select types, create/update input types). This keeps TypeScript happy without a full `prisma generate`.
  5. Commit both `schema.prisma` and the migration file so the history is preserved.
- **Quantity formula:** `quantityFormula = "AxB"` encodes headcount (A) × days (B). Use `parseQtyFormula()` from `money.ts` everywhere it's displayed. `fmtUnit(days, unit)` formats the unit column.
- **Line item categories:** `lineItemCategory` is auto-derived from the linked rate card's category on insert. Users can override it in the line item modal. CREW-tagged items are importable to call sheets.
- **Call sheet draft preview:** public `/cs/[token]` and `/p/[token]` both render for DRAFT status with a sticky amber banner. View analytics are skipped for drafts.
- **Global library isolation:** `GlobalRateCard` and `GlobalTemplate` are seeded once by the app. Workspace copies are independent — never update globals from workspace data, and never propagate global changes to existing workspaces.
- **Brand-safe badge contrast:** use `color-mix(in srgb, var(--brand-accent) 18%, white)` for tinted badge backgrounds instead of hardcoded colours. This adapts at browser render time to whatever brand colour the workspace sets.
- **Project archiving:** `status = 'ARCHIVED'` + `archivedAt` timestamp. The projects list filters `status: { not: 'ARCHIVED' }` by default. Archived projects are accessible at `?archived=1`.
- **Radix Select:** never pass `value=""` to `<SelectItem>`. Use a sentinel string like `"__none__"` and convert back to empty/null on `onValueChange`.
